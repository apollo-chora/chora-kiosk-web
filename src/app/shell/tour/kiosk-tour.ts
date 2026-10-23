import { Injectable, computed, inject, linkedSignal, signal } from '@angular/core';

import { KioskStore, type SceneId } from '../kiosk.store';

/** The hall's five exhibits, in its cards' order (K173). */
export type TourExhibit = 'maps' | 'comp' | 'dash' | 'grade' | 'engine';
export type BeatId = 'M1' | 'M2' | 'C1' | 'C2' | 'C3' | 'C4' | 'C5' | 'C6' | 'D1' | 'D2' | 'G1' | 'G2' | 'G3' | 'E1' | 'E2' | 'E3' | 'E4' | 'E5';
/** How a beat is reached: by Next (its action runs), by a hall card (an exhibit's first beat), or by Back (it only shows). */
export type Arrival = 'next' | 'card' | 'back';

/** What a beat does when the tour reaches it: set its exhibit's view (the tour has already shown its scene). */
export interface TourBeat {
  show(by: Arrival): void | Promise<void>;
  /** Whether its exhibit still shows the beat's own view (ruling a: Back returns to it first); the scene alone when absent. */
  shows?(): boolean;
  /**
   * W100: arriving by Next still has something to do though `shows` holds (G3: the release), so Next stops
   * here. A beat whose scene and `shows` already hold, and that is not pending, would show nothing new.
   */
  pending?(): boolean;
}

interface Stop {
  readonly exhibit: TourExhibit;
  readonly titleKey: string;
  readonly beats: readonly { readonly id: BeatId; readonly scene: SceneId }[];
}

/**
 * The tour's beats (K173, web's beat table as ruled 21 Oct): maps, the atlas then Singapore's water;
 * Companions, Pingu's intro then its four abilities, then how it read its marked test (W52, K182);
 * the assessment, the dashboard then the water bank's questions; grading, the strong sample, its
 * prepared review, its release; the Engine Room's five pages.
 */
const STOPS: readonly Stop[] = [
  { exhibit: 'maps', titleKey: 'ex.maps.title', beats: [{ id: 'M1', scene: 'maps' }, { id: 'M2', scene: 'maps' }] },
  {
    exhibit: 'comp',
    titleKey: 'ex.comp.title',
    beats: (['C1', 'C2', 'C3', 'C4', 'C5', 'C6'] as const).map((id) => ({ id, scene: 'comp' as const })),
  },
  { exhibit: 'dash', titleKey: 'ex.dash.title', beats: [{ id: 'D1', scene: 'dash' }, { id: 'D2', scene: 'dash' }] },
  { exhibit: 'grade', titleKey: 'ex.grade.title', beats: (['G1', 'G2', 'G3'] as const).map((id) => ({ id, scene: 'grade' as const })) },
  {
    exhibit: 'engine',
    titleKey: 'ex.engine.title',
    beats: [
      { id: 'E1', scene: 'engine' },
      { id: 'E2', scene: 'crews' },
      { id: 'E3', scene: 'safety' },
      { id: 'E4', scene: 'gov' },
      { id: 'E5', scene: 'local' },
    ],
  },
];

const BEATS = STOPS.flatMap((s) => s.beats.map((b, i) => ({ ...b, exhibit: s.exhibit, titleKey: s.titleKey, n: i + 1, m: s.beats.length })));
export const BEAT_IDS: readonly BeatId[] = BEATS.map((b) => b.id);

/** A scene's exhibit, and the beat a scene reached outside the tour stands for (an exhibit's first; an Engine Room page its own). */
const EXHIBIT_OF: Partial<Record<SceneId, TourExhibit>> = Object.fromEntries(BEATS.map((b) => [b.scene, b.exhibit]));
const ENTRY_OF: Partial<Record<SceneId, number>> = Object.fromEntries(
  BEATS.map((b, i) => [b.scene, i] as const).filter(([scene], i, all) => all.findIndex(([s]) => s === scene) === i),
);

export type TourMarker = { readonly key: 'tour.start'; readonly titleKey: string } | { readonly key: 'tour.marker'; readonly titleKey: string; readonly n: number; readonly m: number };

/**
 * The guided tour through the hall's exhibits by Next and Back (K173). The hall is the hub: from it
 * Next starts at card 1; a card opened directly continues from it; after the Engine Room's last page
 * Next ends the tour (W55: a dialog over the page offers Done or the hall, see `ended`). Next does the
 * beat it arrives at (it may write: the dose open, the release; it never calls a model); Back only
 * shows, never writes and never undoes (K42). A free click inside an exhibit keeps the tour's place; a
 * scene reached outside the tour (a presenter jump, a link from one exhibit into another) puts it on
 * that exhibit's first beat. Next and a card count a visit, Back never does. W100: a beat that would
 * show nothing new (its view already on screen) is not a stop, so every press of Next or Back changes
 * the screen. Each exhibit's beats are registered from the root (provideTourBeats).
 */
@Injectable({ providedIn: 'root' })
export class KioskTour {
  private readonly store = inject(KioskStore);
  private readonly beats = new Map<BeatId, TourBeat>();
  /** The beat the tour last showed; null at the hall. */
  private readonly placeSig = signal<number | null>(null);
  private readonly busySig = signal(false);
  /** The beat Back last showed again in place: a second Back moves on, so a view that cannot come back never traps it. */
  private reshown: number | null = null;

  /**
   * W55: true from Next on the last beat until a choice: Done (the store's end of the demo session),
   * Stay in the hall or Esc (toHall), or the scene changing under it (a presenter jump), which resets it
   * so it never shows over another page nor comes back with this one.
   */
  private readonly endedSig = linkedSignal<SceneId, boolean>({ source: this.store.scene, computation: () => false });

  /** True while a beat is being shown (a read, or G3's release): Next and Back wait. */
  readonly busy = this.busySig.asReadonly();
  /** The end of the tour shows (W55): Next and Back wait for its choice. */
  readonly ended = this.endedSig.asReadonly();

  /** Where the tour stands, as the scene on screen confirms it (see the class comment). */
  private readonly at = computed<number | null>(() => {
    const scene = this.store.scene();
    const exhibit = EXHIBIT_OF[scene];
    if (!exhibit) return null;
    const i = this.placeSig();
    return i !== null && BEATS[i].exhibit === exhibit ? i : (ENTRY_OF[scene] as number);
  });

  readonly beat = computed<BeatId | null>(() => {
    const i = this.at();
    return i === null ? null : BEATS[i].id;
  });

  readonly marker = computed<TourMarker>(() => {
    const i = this.at();
    if (i === null) return { key: 'tour.start', titleKey: STOPS[0].titleKey };
    const b = BEATS[i];
    return { key: 'tour.marker', titleKey: b.titleKey, n: b.n, m: b.m };
  });

  constructor() {
    this.store.onEndSession(() => {
      this.placeSig.set(null);
      this.endedSig.set(false);
    });
  }

  /** An exhibit registers what each of its beats shows. Returns the function that removes it. */
  register(id: BeatId, beat: TourBeat): () => void {
    this.beats.set(id, beat);
    return () => {
      if (this.beats.get(id) === beat) this.beats.delete(id);
    };
  }

  /**
   * The next beat that would show something new (W100); past the last one the end of the tour (W55), which
   * a second Next leaves as it is.
   */
  next(): Promise<void> {
    if (this.busySig()) return Promise.resolve();
    const i = this.at();
    if (i === null) return this.show(0, 'next');
    let j = i + 1;
    while (j < BEATS.length && this.nothingNew(j, 'next')) j++;
    if (j < BEATS.length) return this.show(j, 'next');
    this.endedSig.set(true);
    return Promise.resolve();
  }

  /**
   * Back (ruling a, 21 Oct): first the current beat's own view when a free click moved off it (an Engine
   * Room page opened by its tile, an atlas region, another Companion or ability, another bank), then
   * the previous beat that would show something new (W100: none left, the hall), landing on the first beat
   * that shows its view (the released grade is G1's as much as G3's: the orchestrator's ruling, 22 Oct).
   * Either way it only shows. While the end of the tour shows it waits (W55).
   */
  back(): Promise<void> {
    if (this.busySig() || this.endedSig()) return Promise.resolve();
    const i = this.at();
    if (i === null) return Promise.resolve();
    if (this.reshown !== i && this.offView(i)) return this.reshow(i);
    let j = i - 1;
    while (j >= 0 && this.nothingNew(j, 'back')) j--;
    return j >= 0 ? this.backTo(j) : this.home();
  }

  /** Back shows beat j, then stands on the first beat before it that shows the same view, as Next would arrive. */
  private async backTo(j: number): Promise<void> {
    await this.show(j, 'back');
    while (j > 0 && this.nothingNew(j - 1, 'back')) j--;
    this.placeSig.set(j);
  }

  /** A free click moved the screen off beat i's own view (another scene, or the exhibit's own view gone). */
  private offView(i: number): boolean {
    const here = BEATS[i];
    const own = this.beats.get(here.id)?.shows;
    return this.store.scene() !== here.scene || (!!own && !own());
  }

  /**
   * W100: arriving at beat j would change nothing on screen: its scene shows, its exhibit says its view does
   * too, and by Next it has nothing pending. A beat that cannot say (no `shows`) is always a stop.
   */
  private nothingNew(j: number, by: 'next' | 'back'): boolean {
    const b = BEATS[j];
    const beat = this.beats.get(b.id);
    if (this.store.scene() !== b.scene || !beat?.shows?.()) return false;
    return by === 'back' || !beat.pending?.();
  }

  /**
   * Back shows beat i's own view again. Once it is back, a later free click is a new move off it (D8's walk:
   * two tiles in a row from E1); a view that did not come back keeps the mark, so the next Back moves on.
   */
  private async reshow(i: number): Promise<void> {
    await this.show(i, 'back');
    this.reshown = this.offView(i) ? i : null;
  }

  /** A hall card: that exhibit's first beat. */
  openCard(exhibit: TourExhibit): Promise<void> {
    if (this.busySig()) return Promise.resolve();
    return this.show(BEATS.findIndex((b) => b.exhibit === exhibit), 'card');
  }

  /** Esc, "Back to Explore", and the end of the tour's Stay in the hall: the hall (the scene's change closes the end). */
  toHall(): void {
    this.placeSig.set(null);
    this.store.go('hall');
  }

  private home(): Promise<void> {
    this.toHall();
    return Promise.resolve();
  }

  private async show(i: number, by: Arrival): Promise<void> {
    this.reshown = null;
    const b = BEATS[i];
    const beat = this.beats.get(b.id);
    if (!beat) throw new Error(`[kiosk] the tour has no beat ${b.id}`);
    this.busySig.set(true);
    try {
      this.placeSig.set(i);
      if (this.store.scene() !== b.scene) {
        if (by === 'back') this.store.go(b.scene);
        else this.store.openScene(b.scene, { tour: true });
      }
      await beat.show(by);
    } catch (err: unknown) {
      console.error(`[kiosk] the tour's beat ${b.id} could not be shown: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      this.busySig.set(false);
    }
  }
}
