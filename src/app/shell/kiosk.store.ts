import { DestroyRef, Injectable, computed, inject, signal } from '@angular/core';

import { KioskLang, KioskLanguage } from '../i18n/i18n';
import { ReadinessService } from '../kiosk-api/readiness.service';
import { StartCheck } from './start-check';
import { ResetService } from '../kiosk-api/reset.service';
import { SessionService } from '../kiosk-api/session.service';
import { VisitEvent, VisitsService } from '../kiosk-api/visits.service';
import { LiveService } from '../live/live.service';
import { IdleMinutes, isIdleMinutes, readIdleMinutes, rememberIdleMinutes } from './idle-wait';
import { KIOSK_TIMING } from './kiosk-timing';

/**
 * The shell's state: which scene shows, what lies over it, the idle clock, the credits,
 * the presenter panel, the keys, and the end of a demo session (the approved mockup's
 * state, go(), openScene(), resetAll(), the input handlers and the 250 ms idle tick).
 * Each scene registers its own Next, Back and Esc handlers while it shows (setNav).
 */
export type SceneId = 'idle' | 'hook' | 'hall' | 'maps' | 'comp' | 'dash' | 'grade' | 'engine' | 'crews' | 'safety' | 'gov' | 'local' | 'own';
/** W52: 'paper' is the Companions scene's paper popup, drawn inside the scene; as an overlay, Esc and a scene change close it. */
export type OverlayId = 'xray' | 'disclosure' | 'companion' | 'idle' | 'fresh' | 'paper';
export type PresenterTab = 'run' | 'talk' | 'ready' | 'visits';

export interface SceneNav {
  next?(): void;
  back?(): void;
  escape?(): void;
}

/** Entering these counts a visit to them (the presenter's Sessions tab). */
const COUNTED: Partial<Record<SceneId, VisitEvent>> = { hall: 'hall', maps: 'maps', comp: 'comp', dash: 'dash', grade: 'grade' };

@Injectable({ providedIn: 'root' })
export class KioskStore {
  private readonly visits = inject(VisitsService);
  private readonly session = inject(SessionService);
  private readonly live = inject(LiveService);
  private readonly language = inject(KioskLanguage);
  private readonly resets = inject(ResetService);
  private readonly readiness = inject(ReadinessService);
  private readonly startCheck = inject(StartCheck);

  private readonly sceneSig = signal<SceneId>('idle');
  private readonly overlaySig = signal<OverlayId | null>(null);
  private readonly presenterSig = signal(false);
  private readonly presenterTabSig = signal<PresenterTab>('run');
  private readonly pausedSig = signal(false);
  private readonly idlePausedSig = signal(false);
  private readonly idleMinutesSig = signal<IdleMinutes>(readIdleMinutes());
  /** K151: "Continue" was chosen on a changed stack; the question does not return until a reset. */
  private readonly keptSig = signal(false);
  /** K164: the start button waiting on K151's answer (its language, or 'any' for a click anywhere). */
  private readonly checkingSig = signal<KioskLang | 'any' | null>(null);
  readonly checking = this.checkingSig.asReadonly();
  private starting = false;
  private readonly creditsSig = signal(false);
  private readonly resetCardSig = signal(false);
  private readonly warnUntil = signal(0);
  private readonly now = signal(Date.now());
  private readonly talkOverride = signal<string | null>(null);
  private readonly jumpsSig = signal<ReadonlyMap<string, () => void>>(new Map([['idle', () => void this.endSession()]]));

  readonly scene = this.sceneSig.asReadonly();
  readonly overlay = this.overlaySig.asReadonly();
  readonly presenterOpen = this.presenterSig.asReadonly();
  readonly presenterTab = this.presenterTabSig.asReadonly();
  readonly paused = this.pausedSig.asReadonly();
  readonly idlePaused = this.idlePausedSig.asReadonly();
  /** K143: minutes without input before "Still there?" (8 unless the presenter picked another). */
  readonly idleMinutes = this.idleMinutesSig.asReadonly();
  readonly creditsShown = this.creditsSig.asReadonly();
  readonly resetCardShown = this.resetCardSig.asReadonly();
  /** The presenter's talking point for what shows now (the mockup's review key). */
  readonly talkKey = computed(() => this.talkOverride() ?? this.sceneSig());
  /** Seconds left on "Still there?", 0 when it is not showing. */
  readonly idleSecondsLeft = computed(() => {
    const until = this.warnUntil();
    return until ? Math.max(0, Math.ceil((until - this.now()) / 1000)) : 0;
  });

  private nav: SceneNav | null = null;
  /** The idle-return clock: real input moves it, and so does any quiet that does not count. */
  private idleClock = Date.now();
  /** The last real input (the start screen's own quiet time is measured from it). */
  private lastTouch = 0;
  private sceneEnteredAt = Date.now();
  private creditsRolledAt = 0;
  private creditsTimer: ReturnType<typeof setTimeout> | null = null;
  private brandClicks: number[] = [];
  private ending: Promise<void> | null = null;
  private readonly forgetters = new Set<() => void>();

  constructor() {
    const tick = setInterval(() => this.tick(), KIOSK_TIMING.tickMs);
    const credits = setInterval(() => this.checkIdleCredits(), KIOSK_TIMING.creditsCheckMs);
    inject(DestroyRef).onDestroy(() => {
      clearInterval(tick);
      clearInterval(credits);
      if (this.creditsTimer) clearTimeout(this.creditsTimer);
    });
  }

  // ----- scenes -----

  /** Shows a scene. Back to Explore keeps the demo session's changes (K42). */
  go(scene: SceneId): void {
    this.closeOverlays();
    this.hideCredits();
    this.sceneSig.set(scene);
    this.talkOverride.set(null);
    this.sceneEnteredAt = Date.now();
  }

  /** A scene names its step for the talking points (h1 to h5, dashTake). */
  setTalkKey(key: string): void {
    this.talkOverride.set(key);
  }

  /** The presenter's Jump to: a scene registers its targets once it is built. */
  registerJump(target: string, jump: () => void): () => void {
    this.jumpsSig.update((m) => new Map(m).set(target, jump));
    return () =>
      this.jumpsSig.update((m) => {
        if (m.get(target) !== jump) return m;
        const next = new Map(m);
        next.delete(target);
        return next;
      });
  }

  canJump(target: string): boolean {
    return this.jumpsSig().has(target);
  }

  jumpTo(target: string): void {
    const jump = this.jumpsSig().get(target);
    if (!jump) throw new Error(`[kiosk] no jump to ${target} yet`);
    jump();
  }

  /**
   * Opens an exhibit or the hall, counting it for the presenter. The Engine Room counts from the hall,
   * and (K173) when the tour's Next enters it from Grading; never on the way back from its own pages.
   */
  openScene(to: SceneId, opts: { readonly tour?: boolean } = {}): void {
    const from = this.sceneSig();
    const counted = to === 'engine' ? (from === 'hall' || opts.tour ? 'engine' : undefined) : COUNTED[to];
    if (counted) void this.visits.record(counted);
    this.go(to);
  }

  /**
   * Start (en or zh). K151: on a stack a previous demo session changed since its last reset, the
   * visitor is asked first whether to start fresh; the conductor is read BEFORE this visit's own
   * "started" is recorded, so its answer describes earlier sessions only. K164: the start screen
   * keeps that answer fresh, so a click acts at once; with none fresh, the pressed button says it is
   * checking until the answer lands, and a second press meanwhile does nothing.
   */
  async startStory(lang?: KioskLang): Promise<void> {
    if (this.starting) return;
    this.starting = true;
    if (!this.keptSig() && !this.startCheck.fresh()) this.checkingSig.set(lang ?? 'any');
    try {
      if (lang) await this.language.setLang(lang);
      if (!this.keptSig() && (await this.stackChanged())) {
        this.openOverlay('fresh');
        return;
      }
      this.begin();
    } finally {
      this.starting = false;
      this.checkingSig.set(null);
    }
  }

  /**
   * K151 "Start fresh": the reset with its card, then the story. The kiosk has just reset the stack
   * itself, so nothing is left to ask, and the card stays up until the story is on screen (K138 W16:
   * the start screen showed for about 4 s while the conductor was asked again).
   */
  async startFresh(): Promise<void> {
    this.closeOverlays();
    await this.end('story');
  }

  /** K151 "Continue": the story on the stack as it is; the question does not return until a reset. */
  keepSession(): void {
    this.closeOverlays();
    this.keptSig.set(true);
    this.begin();
  }

  private begin(): void {
    // K164: this tab's own start changes the answer, so the start screen's cached one is void.
    this.startCheck.invalidate();
    this.go('hook');
    void this.visits.record('started');
    this.session.ensure().catch((err: unknown) => console.error(err instanceof Error ? err.message : String(err)));
  }

  /** A stack that cannot say whether it was reset is asked about: a fresh start is always safe. */
  private async stackChanged(): Promise<boolean> {
    try {
      return await this.startCheck.ask();
    } catch (err: unknown) {
      console.error(`[kiosk] could not tell whether the last demo session was reset: ${err instanceof Error ? err.message : String(err)}; asking`);
      return true;
    }
  }

  /** The active scene's Next, Back and Esc. Returns the function that removes them. */
  setNav(nav: SceneNav): () => void {
    this.nav = nav;
    return () => {
      if (this.nav === nav) this.nav = null;
    };
  }

  next(): void {
    if (this.sceneSig() === 'idle') {
      void this.startStory();
      return;
    }
    this.nav?.next?.();
  }

  back(): void {
    this.nav?.back?.();
  }

  escapeUp(): void {
    if (this.overlaySig()) return this.closeOverlays();
    if (this.presenterSig()) return this.presenterSig.set(false);
    this.nav?.escape?.();
  }

  // ----- the end of a demo session (K42, K63, K70) -----

  /** A per-visit store registers how it forgets the visit. Returns the unregister function. */
  onEndSession(forget: () => void): () => void {
    this.forgetters.add(forget);
    return () => this.forgetters.delete(forget);
  }

  /** Done, the idle return, or the presenter's reset: stop, restore, start, then the start screen. */
  endSession(): Promise<void> {
    return this.end('idle');
  }

  /** F5 and "Start over": end the demo session, then the story again, straight from the reset card (W16). */
  startOver(): Promise<void> {
    return this.end('story');
  }

  /**
   * One end at a time: a second press joins the running one. Where it lands is the first press's,
   * so a story press that joined an end bound for the start screen starts the story after it.
   */
  private async end(then: 'idle' | 'story'): Promise<void> {
    if (!this.ending) {
      this.ending = this.runEnd(then).finally(() => {
        this.ending = null;
      });
      return this.ending;
    }
    await this.ending;
    if (then === 'story' && this.sceneSig() === 'idle' && !this.resetCardSig() && !this.overlaySig()) await this.startStory();
  }

  private async runEnd(then: 'idle' | 'story'): Promise<void> {
    this.closeOverlays();
    this.keptSig.set(false);
    this.hideCredits();
    this.live.endSession();
    this.session.drop();
    for (const forget of this.forgetters) forget();
    this.resetCardSig.set(true);
    const result = await this.resets.start();
    // A failed reset keeps the card up with its failure line: no visit starts on a partial restore.
    if (result.state !== 'done') return;
    // The story goes up under the card, then the card comes down (W16).
    if (then === 'story') this.begin();
    else this.go('idle');
    this.resetCardSig.set(false);
    this.idleClock = Date.now();
    // The reset restarts the stack: read what the opening check now says about LIVE.
    void this.readiness.load();
  }

  // ----- overlays, pause, presenter -----

  openOverlay(id: OverlayId): void {
    this.closeOverlays();
    this.overlaySig.set(id);
  }

  closeOverlays(): void {
    this.overlaySig.set(null);
    this.warnUntil.set(0);
  }

  togglePause(): void {
    this.pausedSig.update((p) => !p);
  }

  toggleIdlePaused(): void {
    this.idlePausedSig.update((p) => !p);
  }

  /** K143: the presenter's Run tab picks the idle wait; this laptop's browser remembers it. */
  setIdleMinutes(minutes: IdleMinutes): void {
    if (!isIdleMinutes(minutes)) throw new Error(`[kiosk] an idle wait of ${String(minutes)} minutes is not offered`);
    this.idleMinutesSig.set(minutes);
    rememberIdleMinutes(minutes);
  }

  togglePresenter(): void {
    this.presenterSig.update((p) => !p);
  }

  setPresenterTab(tab: PresenterTab): void {
    this.presenterTabSig.set(tab);
  }

  brandClick(): void {
    const now = Date.now();
    this.brandClicks = this.brandClicks.filter((t) => now - t < KIOSK_TIMING.brandClicksMs);
    this.brandClicks.push(now);
    if (this.brandClicks.length >= 3) {
      this.brandClicks = [];
      this.togglePresenter();
    }
  }

  // ----- credits (K16, K32, K76) -----

  /** The header's Credits button: show for a minute, or hide if showing. */
  toggleCredits(): void {
    if (this.creditsSig()) this.hideCredits();
    else this.playCredits(KIOSK_TIMING.creditsManualMs);
  }

  playCredits(holdMs: number): void {
    this.creditsSig.set(true);
    if (this.creditsTimer) clearTimeout(this.creditsTimer);
    this.creditsTimer = setTimeout(() => this.hideCredits(), holdMs);
  }

  hideCredits(): void {
    if (this.creditsTimer) clearTimeout(this.creditsTimer);
    this.creditsTimer = null;
    this.creditsSig.set(false);
  }

  // ----- input -----

  /** Any click, key, wheel or pointer move. */
  markInput(): void {
    const now = Date.now();
    this.idleClock = now;
    this.lastTouch = now;
    if (this.warnUntil()) this.closeOverlays();
  }

  /** The kiosk's keys (D3). `active` is the focused element, to let text fields keep their keys. */
  onKey(e: KeyboardEvent, active: Element | null): void {
    this.markInput();
    if (this.resetCardSig()) {
      e.preventDefault();
      return;
    }
    if (this.creditsSig() && e.key !== '`') {
      this.hideCredits();
      return;
    }
    const inField = !!active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA');
    if (inField && e.key !== 'Escape') return;
    if (e.key === '`') {
      e.preventDefault();
      this.togglePresenter();
      return;
    }
    if (e.key === 'F5') {
      e.preventDefault();
      void this.startOver();
      return;
    }
    if (this.pausedSig() && !['b', 'B', '.'].includes(e.key)) return;
    switch (e.key) {
      case 'ArrowRight':
      case 'PageDown':
      case ' ':
        e.preventDefault();
        this.next();
        break;
      case 'ArrowLeft':
      case 'PageUp':
        e.preventDefault();
        this.back();
        break;
      case 'Escape':
        if (inField) (active as HTMLElement).blur();
        this.escapeUp();
        break;
      case 'b':
      case 'B':
      case '.':
        this.togglePause();
        break;
      case 'Enter':
        if (this.sceneSig() === 'idle') void this.startStory();
        break;
    }
  }

  // ----- the clocks -----

  private tick(): void {
    const now = Date.now();
    this.now.set(now);
    // K143: a LIVE call can take a minute; nobody is idle while it runs. K151: on the start screen the
    // clock runs only while "start fresh?" waits, so an unanswered question ends in the reset.
    const exempt =
      (this.sceneSig() === 'idle' && this.overlaySig() !== 'fresh' && !this.warnUntil()) ||
      this.pausedSig() ||
      this.idlePausedSig() ||
      this.presenterSig() ||
      this.resetCardSig() ||
      this.live.busy() !== null;
    if (exempt) {
      this.idleClock = Math.max(this.idleClock, now - 1000);
      return;
    }
    const until = this.warnUntil();
    if (!until && now - this.idleClock > this.idleMinutesSig() * 60_000) {
      this.openOverlay('idle');
      this.warnUntil.set(now + KIOSK_TIMING.idleCountdownS * 1000);
      return;
    }
    if (until && now >= until) {
      this.closeOverlays();
      void this.endSession();
    }
  }

  private checkIdleCredits(): void {
    if (this.sceneSig() !== 'idle' || this.creditsSig() || this.overlaySig() === 'fresh') return;
    const quiet = Date.now() - Math.max(this.sceneEnteredAt, this.lastTouch, this.creditsRolledAt);
    if (quiet >= KIOSK_TIMING.idleCreditsAfterMs) {
      this.creditsRolledAt = Date.now();
      this.playCredits(KIOSK_TIMING.idleCreditsHoldMs);
    }
  }
}
