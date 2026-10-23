import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { KioskLanguage } from '../i18n/i18n';
import { ReadinessService } from '../kiosk-api/readiness.service';
import { StartCheck } from './start-check';
import { ResetService, ResetStatus } from '../kiosk-api/reset.service';
import { SessionService } from '../kiosk-api/session.service';
import { VisitEvent, VisitsService } from '../kiosk-api/visits.service';
import { LiveService } from '../live/live.service';
import { IDLE_WAIT_KEY } from './idle-wait';
import { KIOSK_TIMING } from './kiosk-timing';
import { KioskStore } from './kiosk.store';

/** K143: the idle reset's default wait, 8 minutes. */
const IDLE_MS = KIOSK_TIMING.idleWait.defaultMinutes * 60_000;

// Doubles for the conductor clients and the LIVE service; their own specs test them.
function setup() {
  const visits: VisitEvent[] = [];
  let resolveReset!: (s: ResetStatus) => void;
  const resetRunning = signal(false);
  const calls = { ensure: 0, drop: 0, endLive: 0, resets: 0, asked: 0, langs: [] as string[] };
  const busy = signal<string | null>(null);
  // K151: what the conductor says about the stack when a visitor presses Start.
  const stack = { changed: false as boolean | Error };
  TestBed.configureTestingModule({
    providers: [
      { provide: VisitsService, useValue: { record: (e: VisitEvent) => (visits.push(e), Promise.resolve(true)) } },
      { provide: SessionService, useValue: { ensure: () => (calls.ensure++, Promise.resolve('t')), drop: () => void calls.drop++ } },
      { provide: LiveService, useValue: { endSession: () => void calls.endLive++, busy: busy.asReadonly() } },
      { provide: KioskLanguage, useValue: { setLang: (l: string) => (calls.langs.push(l), Promise.resolve()) } },
      {
        provide: ReadinessService,
        useValue: {
          load: () => Promise.resolve(),
          sessionStartedSinceReset: () => (calls.asked++, stack.changed instanceof Error ? Promise.reject(stack.changed) : Promise.resolve(stack.changed)),
        },
      },
      {
        provide: ResetService,
        useValue: {
          running: resetRunning.asReadonly(),
          start: () => {
            calls.resets++;
            resetRunning.set(true);
            return new Promise<ResetStatus>((r) => (resolveReset = (s) => (resetRunning.set(false), r(s))));
          },
        },
      },
    ],
  });
  const store = TestBed.inject(KioskStore);
  const finishReset = async (state: 'done' | 'failed') => {
    resolveReset({ state } as ResetStatus);
    await vi.advanceTimersByTimeAsync(0);
  };
  return { store, visits, calls, finishReset, busy, stack };
}

describe('KioskStore: the shell’s state (K1, K18, K42, K63, K76, D3)', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('opens on the start screen, nothing over it', () => {
    const { store } = setup();
    expect(store.scene()).toBe('idle');
    expect(store.overlay()).toBeNull();
    expect(store.presenterOpen()).toBe(false);
    expect(store.paused()).toBe(false);
  });

  it('Start begins the story in the chosen language, counts it, and readies a session', async () => {
    const { store, visits, calls } = setup();
    await store.startStory('zh');
    expect(calls.langs).toEqual(['zh']);
    expect(store.scene()).toBe('hook');
    expect(visits).toEqual(['started']);
    expect(calls.ensure).toBe(1);
  });

  describe('K164 W31: the start acts on the start screen’s pre-check', () => {
    it('with a fresh answer the start acts at once, with no read of its own: the story, or the K151 prompt', async () => {
      const { store, calls, stack } = setup();
      const check = TestBed.inject(StartCheck);
      const stop = check.watch();
      await Promise.resolve();
      await Promise.resolve();
      expect([calls.asked, check.fresh()]).toEqual([1, true]);
      const started = store.startStory('en');
      expect(store.checking()).toBeNull();
      await started;
      expect(calls.asked).toBe(1);
      expect(store.scene()).toBe('hook');
      stop();
      // The story start voided the answer: the next start reads again (and here is asked, K151).
      expect(check.fresh()).toBe(false);
      store.go('idle');
      stack.changed = true;
      await store.startStory();
      expect(calls.asked).toBe(2);
      expect(store.overlay()).toBe('fresh');
    });

    it('with no fresh answer the pressed button says it is checking until the answer lands; a second press does nothing', async () => {
      const { store, calls } = setup();
      let land!: (v: boolean) => void;
      vi.spyOn(TestBed.inject(StartCheck), 'ask').mockReturnValue(new Promise<boolean>((r) => (land = r)));
      const started = store.startStory('zh');
      expect(store.checking()).toBe('zh');
      await store.startStory('en');
      expect(calls.langs).toEqual(['zh']);
      land(false);
      await started;
      expect(store.checking()).toBeNull();
      expect(store.scene()).toBe('hook');
    });

    it('a click anywhere (no language) checks under the language shown', async () => {
      const { store } = setup();
      let land!: (v: boolean) => void;
      vi.spyOn(TestBed.inject(StartCheck), 'ask').mockReturnValue(new Promise<boolean>((r) => (land = r)));
      const started = store.startStory();
      expect(store.checking()).toBe('any');
      land(true);
      await started;
      expect([store.checking(), store.overlay()]).toEqual([null, 'fresh']);
    });
  });

  describe('K151: a start on a stack a previous demo session changed', () => {
    it('asks first: nothing is recorded, no session is readied, the start screen stays', async () => {
      const { store, visits, calls, stack } = setup();
      stack.changed = true;
      await store.startStory('zh');
      expect(calls.langs).toEqual(['zh']);
      expect(store.overlay()).toBe('fresh');
      expect(store.scene()).toBe('idle');
      expect(visits).toEqual([]);
      expect(calls.ensure).toBe(0);
    });

    it('"Start fresh" runs the reset with its card, then the story', async () => {
      const { store, visits, calls, stack, finishReset } = setup();
      stack.changed = true;
      await store.startStory();
      const fresh = store.startFresh();
      expect(store.overlay()).toBeNull();
      expect(calls.resets).toBe(1);
      expect(store.resetCardShown()).toBe(true);
      stack.changed = false;
      await finishReset('done');
      await fresh;
      expect(store.scene()).toBe('hook');
      expect(visits).toEqual(['started']);
    });

    it('W16: "Start fresh" goes from the reset card straight into the story, with no start screen and no second question', async () => {
      const { store, visits, calls, stack, finishReset } = setup();
      stack.changed = true;
      await store.startStory();
      expect(calls.asked).toBe(1);
      const go = vi.spyOn(store, 'go');
      const fresh = store.startFresh();
      await finishReset('done');
      await fresh;
      // The stack was reset this moment, so nothing is left to ask; the walk saw the start screen for 4 s.
      expect(go.mock.calls.map((c) => c[0])).toEqual(['hook']);
      expect(calls.asked).toBe(1);
      expect(store.resetCardShown()).toBe(false);
      expect(store.scene()).toBe('hook');
      expect(visits).toEqual(['started']);
      expect(calls.ensure).toBe(1);
    });

    it('W16: the reset card stays up until the story is on screen', async () => {
      const { store, stack, finishReset } = setup();
      stack.changed = true;
      await store.startStory();
      const seen: [string, boolean][] = [];
      const go = store.go.bind(store);
      vi.spyOn(store, 'go').mockImplementation((s) => (seen.push([s, store.resetCardShown()]), go(s)));
      const fresh = store.startFresh();
      await finishReset('done');
      await fresh;
      expect(seen).toEqual([['hook', true]]);
    });

    it('"Continue" starts at once, and the prompt does not come back until a reset', async () => {
      const { store, visits, calls, stack, finishReset } = setup();
      stack.changed = true;
      await store.startStory();
      store.keepSession();
      expect(store.overlay()).toBeNull();
      expect(store.scene()).toBe('hook');
      expect(visits).toEqual(['started']);
      store.go('idle');
      await store.startStory();
      expect(store.overlay()).toBeNull();
      expect(visits).toEqual(['started', 'started']);
      const ended = store.endSession();
      await finishReset('failed');
      await ended;
      store.go('idle');
      await store.startStory();
      expect(store.overlay()).toBe('fresh');
      expect(calls.resets).toBe(1);
    });

    it('a stack that cannot say asks, and says why loudly', async () => {
      const err = vi.spyOn(console, 'error').mockImplementation(() => undefined);
      const { store, visits, stack } = setup();
      stack.changed = new Error('503 Service Unavailable');
      await store.startStory();
      expect(store.overlay()).toBe('fresh');
      expect(visits).toEqual([]);
      expect(err.mock.calls.flat().join(' ')).toMatch(/could not tell whether the last demo session was reset: 503 Service Unavailable/);
      err.mockRestore();
    });

    it('the idle timer still runs while the question waits: "Still there?", then the reset', async () => {
      const { store, calls, stack } = setup();
      stack.changed = true;
      await store.startStory();
      await vi.advanceTimersByTimeAsync(IDLE_MS + KIOSK_TIMING.tickMs);
      expect(store.overlay()).toBe('idle');
      await vi.advanceTimersByTimeAsync(KIOSK_TIMING.idleCountdownS * 1000 + KIOSK_TIMING.tickMs);
      expect(calls.resets).toBe(1);
    });
  });

  it('opening an exhibit counts it; the Engine Room only counts from the hall', () => {
    const { store, visits } = setup();
    store.openScene('hall');
    store.openScene('maps');
    store.openScene('hall');
    store.openScene('engine');
    store.openScene('crews');
    store.openScene('engine');
    expect(visits).toEqual(['hall', 'maps', 'hall', 'engine']);
  });

  it('K173: the tour counts the Engine Room when its Next enters it from Grading, never an Engine Room page', () => {
    const { store, visits } = setup();
    store.openScene('grade');
    store.openScene('engine', { tour: true });
    store.openScene('crews', { tour: true });
    store.openScene('engine');
    expect(visits).toEqual(['grade', 'engine']);
  });

  describe('the idle return (K18, K143)', () => {
    afterEach(() => localStorage.removeItem(IDLE_WAIT_KEY));

    it('after 8 minutes with no input (K143) a 15 s "Still there?" countdown opens', async () => {
      const { store } = setup();
      store.openScene('hall');
      await vi.advanceTimersByTimeAsync(IDLE_MS - 1);
      expect(store.overlay()).toBeNull();
      await vi.advanceTimersByTimeAsync(KIOSK_TIMING.tickMs + 1);
      expect(store.overlay()).toBe('idle');
      expect(store.idleSecondsLeft()).toBe(KIOSK_TIMING.idleCountdownS);
    });

    it('any input closes the countdown and restarts the clock', async () => {
      const { store } = setup();
      store.openScene('hall');
      await vi.advanceTimersByTimeAsync(IDLE_MS + KIOSK_TIMING.tickMs);
      store.markInput();
      expect(store.overlay()).toBeNull();
      await vi.advanceTimersByTimeAsync(IDLE_MS - KIOSK_TIMING.tickMs);
      expect(store.overlay()).toBeNull();
    });

    it('when the countdown runs out the demo session ends and the reset starts', async () => {
      const { store, calls, finishReset } = setup();
      store.openScene('hall');
      await vi.advanceTimersByTimeAsync(IDLE_MS + KIOSK_TIMING.tickMs);
      await vi.advanceTimersByTimeAsync(KIOSK_TIMING.idleCountdownS * 1000 + KIOSK_TIMING.tickMs);
      expect(calls.resets).toBe(1);
      expect(store.resetCardShown()).toBe(true);
      await finishReset('done');
      expect(store.scene()).toBe('idle');
      expect(store.resetCardShown()).toBe(false);
    });

    // Each case looks at the moment the countdown would open, and checks no reset started: a
    // countdown that opened and ran out closes itself again before a later look.
    const exemptions: [string, (s: KioskStore) => void][] = [
      ['on the start screen', () => undefined],
      ['while paused', (s) => s.togglePause()],
      ['with the idle timer paused', (s) => s.toggleIdlePaused()],
      ['with the presenter panel open', (s) => s.togglePresenter()],
    ];
    for (const [name, exempt] of [...exemptions, ['while a LIVE call runs (K143)', () => undefined] as [string, (s: KioskStore) => void]]) {
      it(`never fires ${name}`, async () => {
        const { store, calls, busy } = setup();
        if (name !== 'on the start screen') store.openScene('hall');
        exempt(store);
        if (name.startsWith('while a LIVE call')) busy.set('q:hook:c-ro');
        for (let i = 0; i < 3; i++) {
          await vi.advanceTimersByTimeAsync(IDLE_MS + KIOSK_TIMING.tickMs * 2);
          expect(store.overlay(), name).toBeNull();
        }
        expect(calls.resets, name).toBe(0);
      });
    }

    it('K143: the presenter sets 2, 5, 8 or 15 minutes, and this browser remembers the choice', async () => {
      const first = setup();
      expect(first.store.idleMinutes()).toBe(8);
      first.store.setIdleMinutes(2);
      expect(localStorage.getItem(IDLE_WAIT_KEY)).toBe('2');
      first.store.openScene('hall');
      await vi.advanceTimersByTimeAsync(2 * 60_000 + KIOSK_TIMING.tickMs);
      expect(first.store.overlay()).toBe('idle');
      TestBed.resetTestingModule();
      expect(setup().store.idleMinutes()).toBe(2);
    });

    it('offers only 2, 5, 8 and 15 minutes', () => {
      const { store } = setup();
      expect(KIOSK_TIMING.idleWait.choices).toEqual([2, 5, 8, 15]);
      expect(() => store.setIdleMinutes(3 as never)).toThrow(/idle wait of 3 minutes is not offered/);
      expect(store.idleMinutes()).toBe(8);
    });

    it('storage that cannot be read, or a stored wait not offered, reads 8 minutes and says so', () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
      localStorage.setItem(IDLE_WAIT_KEY, '7');
      expect(setup().store.idleMinutes()).toBe(8);
      expect(warn.mock.calls.flat().join(' ')).toMatch(/stored idle wait "7" is not offered/);
      TestBed.resetTestingModule();
      const read = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
        throw new Error('SecurityError');
      });
      expect(setup().store.idleMinutes()).toBe(8);
      expect(warn.mock.calls.flat().join(' ')).toMatch(/could not read the idle wait: SecurityError/);
      read.mockRestore();
      warn.mockRestore();
    });

    it('a choice the browser cannot store still holds for this page, and says so', () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
      const write = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
        throw new Error('QuotaExceededError');
      });
      const { store } = setup();
      store.setIdleMinutes(15);
      expect(store.idleMinutes()).toBe(15);
      expect(warn.mock.calls.flat().join(' ')).toMatch(/could not remember the idle wait: QuotaExceededError/);
      write.mockRestore();
      warn.mockRestore();
    });

    it('K143: the clock stops while a LIVE call runs, and counts from zero once it ends', async () => {
      const { store, busy } = setup();
      store.openScene('hall');
      busy.set('q:hook:c-ro');
      await vi.advanceTimersByTimeAsync(IDLE_MS * 2);
      expect(store.overlay()).toBeNull();
      busy.set(null);
      await vi.advanceTimersByTimeAsync(IDLE_MS - KIOSK_TIMING.tickMs * 8);
      expect(store.overlay()).toBeNull();
      await vi.advanceTimersByTimeAsync(KIOSK_TIMING.tickMs * 16);
      expect(store.overlay()).toBe('idle');
    });

    it('counts again from zero once an exemption ends', async () => {
      const { store } = setup();
      store.openScene('hall');
      store.togglePresenter();
      await vi.advanceTimersByTimeAsync(IDLE_MS * 2);
      store.togglePresenter();
      await vi.advanceTimersByTimeAsync(IDLE_MS - KIOSK_TIMING.tickMs * 8);
      expect(store.overlay()).toBeNull();
      await vi.advanceTimersByTimeAsync(KIOSK_TIMING.tickMs * 16);
      expect(store.overlay()).toBe('idle');
    });
  });

  describe('Done ends the demo session (K42, K63, K70)', () => {
    it('lets every LIVE call go, drops the session, shows the reset card, and returns to the start screen when done', async () => {
      const { store, calls, finishReset } = setup();
      store.openScene('hall');
      const p = store.endSession();
      expect(calls.endLive).toBe(1);
      expect(calls.drop).toBe(1);
      expect(store.resetCardShown()).toBe(true);
      expect(store.scene()).toBe('hall');
      await finishReset('done');
      await p;
      expect(store.scene()).toBe('idle');
      expect(store.resetCardShown()).toBe(false);
    });

    it('a failed reset keeps the card up: no visit starts on a partial restore', async () => {
      const { store, finishReset } = setup();
      store.openScene('hall');
      const p = store.endSession();
      await finishReset('failed');
      await p;
      expect(store.resetCardShown()).toBe(true);
      expect(store.scene()).toBe('hall');
    });

    it('tells every per-visit store to forget the visit', async () => {
      const { store, finishReset } = setup();
      const forgot: string[] = [];
      store.onEndSession(() => forgot.push('hook'));
      const off = store.onEndSession(() => forgot.push('maps'));
      off();
      const p = store.endSession();
      await finishReset('done');
      await p;
      expect(forgot).toEqual(['hook']);
    });

    it('a second Done while the reset runs joins it', async () => {
      const { store, calls, finishReset } = setup();
      const a = store.endSession();
      const b = store.endSession();
      expect(calls.resets).toBe(1);
      await finishReset('done');
      await Promise.all([a, b]);
    });

    it('"Start over" (F5) resets, then starts the story, straight from the card (W16)', async () => {
      const { store, finishReset, visits, calls } = setup();
      store.openScene('hall');
      const go = vi.spyOn(store, 'go');
      const p = store.startOver();
      await finishReset('done');
      await p;
      expect(store.scene()).toBe('hook');
      expect(visits.at(-1)).toBe('started');
      expect(go.mock.calls.map((c) => c[0])).toEqual(['hook']);
      expect(calls.asked).toBe(0);
    });

    it('a failed reset keeps its card up and starts nothing (Start fresh and Start over alike)', async () => {
      const { store, finishReset, visits, stack } = setup();
      stack.changed = true;
      await store.startStory();
      const fresh = store.startFresh();
      await finishReset('failed');
      await fresh;
      expect(store.resetCardShown()).toBe(true);
      expect(store.scene()).toBe('idle');
      expect(visits).toEqual([]);
    });
  });

  describe('the credits (K16, K32, K76)', () => {
    it('the Credits button holds the page for a minute, or until a click', async () => {
      const { store } = setup();
      store.toggleCredits();
      expect(store.creditsShown()).toBe(true);
      await vi.advanceTimersByTimeAsync(KIOSK_TIMING.creditsManualMs - 1);
      expect(store.creditsShown()).toBe(true);
      await vi.advanceTimersByTimeAsync(1);
      expect(store.creditsShown()).toBe(false);
      store.toggleCredits();
      store.toggleCredits();
      expect(store.creditsShown()).toBe(false);
    });

    it('the start screen rolls the credits after 10 quiet minutes, and again after each further quiet 10', async () => {
      const { store } = setup();
      await vi.advanceTimersByTimeAsync(KIOSK_TIMING.idleCreditsAfterMs - KIOSK_TIMING.creditsCheckMs);
      expect(store.creditsShown()).toBe(false);
      await vi.advanceTimersByTimeAsync(KIOSK_TIMING.creditsCheckMs);
      expect(store.creditsShown()).toBe(true);
      await vi.advanceTimersByTimeAsync(KIOSK_TIMING.idleCreditsHoldMs);
      expect(store.creditsShown()).toBe(false);
      await vi.advanceTimersByTimeAsync(KIOSK_TIMING.idleCreditsAfterMs - KIOSK_TIMING.idleCreditsHoldMs - KIOSK_TIMING.creditsCheckMs);
      expect(store.creditsShown()).toBe(false);
      await vi.advanceTimersByTimeAsync(KIOSK_TIMING.creditsCheckMs * 2);
      expect(store.creditsShown()).toBe(true);
    });

    it('input on the start screen restarts its quiet ten minutes', async () => {
      const { store } = setup();
      await vi.advanceTimersByTimeAsync(KIOSK_TIMING.idleCreditsAfterMs - 60_000);
      store.markInput();
      await vi.advanceTimersByTimeAsync(120_000);
      expect(store.creditsShown()).toBe(false);
    });

    it('the end credits play over the story’s last frame for 7 s', async () => {
      const { store } = setup();
      store.playCredits(KIOSK_TIMING.endCreditsMs);
      await vi.advanceTimersByTimeAsync(KIOSK_TIMING.endCreditsMs);
      expect(store.creditsShown()).toBe(false);
    });
  });

  describe('keys (D3)', () => {
    const key = (k: string) => new KeyboardEvent('keydown', { key: k, cancelable: true });

    it('Right, PageDown and Space go next; Left and PageUp go back; Esc goes up one level', () => {
      const { store } = setup();
      const nav = { next: vi.fn(), back: vi.fn(), escape: vi.fn() };
      store.openScene('hall');
      store.setNav(nav);
      for (const k of ['ArrowRight', 'PageDown', ' ']) store.onKey(key(k), null);
      for (const k of ['ArrowLeft', 'PageUp']) store.onKey(key(k), null);
      store.onKey(key('Escape'), null);
      expect(nav.next).toHaveBeenCalledTimes(3);
      expect(nav.back).toHaveBeenCalledTimes(2);
      expect(nav.escape).toHaveBeenCalledTimes(1);
    });

    it('Esc closes an overlay, then the presenter panel, before it moves the scene', () => {
      const { store } = setup();
      const nav = { escape: vi.fn() };
      store.openScene('hall');
      store.setNav(nav);
      store.openOverlay('disclosure');
      store.togglePresenter();
      store.onKey(key('Escape'), null);
      expect(store.overlay()).toBeNull();
      expect(store.presenterOpen()).toBe(true);
      store.onKey(key('Escape'), null);
      expect(store.presenterOpen()).toBe(false);
      expect(nav.escape).not.toHaveBeenCalled();
    });

    it('backtick toggles the presenter panel; B and . pause, and a paused kiosk ignores other keys', () => {
      const { store } = setup();
      const nav = { next: vi.fn() };
      store.openScene('hall');
      store.setNav(nav);
      store.onKey(key('`'), null);
      expect(store.presenterOpen()).toBe(true);
      store.onKey(key('`'), null);
      store.onKey(key('b'), null);
      expect(store.paused()).toBe(true);
      store.onKey(key('ArrowRight'), null);
      expect(nav.next).not.toHaveBeenCalled();
      store.onKey(key('.'), null);
      expect(store.paused()).toBe(false);
    });

    it('Enter, Right or Space on the start screen starts the story', async () => {
      const { store } = setup();
      store.onKey(key('Enter'), null);
      await vi.advanceTimersByTimeAsync(0);
      expect(store.scene()).toBe('hook');
    });

    it('while the credits show, any key but backtick only closes them', () => {
      const { store } = setup();
      const nav = { next: vi.fn() };
      store.openScene('hall');
      store.setNav(nav);
      store.toggleCredits();
      store.onKey(key('ArrowRight'), null);
      expect(store.creditsShown()).toBe(false);
      expect(nav.next).not.toHaveBeenCalled();
    });

    it('in a text field keys type; only Esc leaves the field', () => {
      const { store } = setup();
      const nav = { next: vi.fn(), escape: vi.fn() };
      store.openScene('hall');
      store.setNav(nav);
      const input = document.createElement('input');
      document.body.appendChild(input);
      input.focus();
      store.onKey(key(' '), input);
      store.onKey(key('`'), input);
      expect(nav.next).not.toHaveBeenCalled();
      expect(store.presenterOpen()).toBe(false);
      store.onKey(key('Escape'), input);
      expect(document.activeElement).not.toBe(input);
      expect(nav.escape).toHaveBeenCalledTimes(1);
      input.remove();
    });

    it('keys do nothing while the reset card is up', () => {
      const { store } = setup();
      const nav = { next: vi.fn() };
      store.openScene('hall');
      store.setNav(nav);
      void store.endSession();
      const e = key('ArrowRight');
      store.onKey(e, null);
      expect(nav.next).not.toHaveBeenCalled();
      expect(e.defaultPrevented).toBe(true);
    });

    it('F5 starts over instead of reloading the page', async () => {
      const { store, calls } = setup();
      store.openScene('hall');
      const e = key('F5');
      store.onKey(e, null);
      expect(e.defaultPrevented).toBe(true);
      expect(calls.resets).toBe(1);
    });
  });

  it('three clicks on the wordmark within 700 ms open the presenter panel', async () => {
    const { store } = setup();
    store.brandClick();
    await vi.advanceTimersByTimeAsync(300);
    store.brandClick();
    expect(store.presenterOpen()).toBe(false);
    store.brandClick();
    expect(store.presenterOpen()).toBe(true);
    store.togglePresenter();
    store.brandClick();
    await vi.advanceTimersByTimeAsync(800);
    store.brandClick();
    store.brandClick();
    expect(store.presenterOpen()).toBe(false);
  });

  describe('the presenter’s talking points and jumps (K19)', () => {
    it('talks about the scene showing, or the step the scene names, and resets on a new scene', () => {
      const { store } = setup();
      expect(store.talkKey()).toBe('idle');
      store.openScene('dash');
      expect(store.talkKey()).toBe('dash');
      store.setTalkKey('dashTake');
      expect(store.talkKey()).toBe('dashTake');
      store.openScene('hall');
      expect(store.talkKey()).toBe('hall');
    });

    it('jumps to the start screen by ending the demo session; other targets once their scene registers', async () => {
      const { store, calls, finishReset } = setup();
      expect(store.canJump('idle')).toBe(true);
      expect(store.canJump('h3')).toBe(false);
      expect(() => store.jumpTo('h3')).toThrow(/no jump to h3 yet/);
      const go = vi.fn();
      const off = store.registerJump('h3', go);
      expect(store.canJump('h3')).toBe(true);
      store.jumpTo('h3');
      expect(go).toHaveBeenCalledTimes(1);
      off();
      expect(store.canJump('h3')).toBe(false);
      store.openScene('hall');
      store.jumpTo('idle');
      expect(calls.resets).toBe(1);
      await finishReset('done');
    });
  });

  it('reloads the readiness after a reset, so LIVE follows the latest check', async () => {
    const { store, finishReset } = setup();
    const load = vi.spyOn(TestBed.inject(ReadinessService), 'load').mockResolvedValue();
    const p = store.endSession();
    await finishReset('done');
    await p;
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('a scene’s handlers are dropped when the scene goes', () => {
    const { store } = setup();
    const nav = { next: vi.fn() };
    store.openScene('hall');
    const off = store.setNav(nav);
    off();
    store.onKey(new KeyboardEvent('keydown', { key: 'ArrowRight' }), null);
    expect(nav.next).not.toHaveBeenCalled();
  });
});
