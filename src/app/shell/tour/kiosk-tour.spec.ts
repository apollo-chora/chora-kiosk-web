import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { KioskStore, type SceneId } from '../kiosk.store';
import { BEAT_IDS, KioskTour, type Arrival, type BeatId } from './kiosk-tour';

/** The store as the tour uses it: the scene, go (Back's way in, never counted), openScene (Next's and a card's, counted). */
function fakeStore() {
  const scene = signal<SceneId>('hall');
  const moves: string[] = [];
  const forgetters: (() => void)[] = [];
  const store = {
    scene: scene.asReadonly(),
    go: (s: SceneId) => (moves.push(`go ${s}`), scene.set(s)),
    openScene: (s: SceneId, opts?: { tour?: boolean }) => (moves.push(`open ${s}${opts?.tour ? ' (tour)' : ''}`), scene.set(s)),
    onEndSession: (f: () => void) => (forgetters.push(f), () => undefined),
  };
  return { store, scene, moves, forgetters };
}

const ORDER: readonly BeatId[] = ['M1', 'M2', 'C1', 'C2', 'C3', 'C4', 'C5', 'C6', 'D1', 'D2', 'G1', 'G2', 'G3', 'E1', 'E2', 'E3', 'E4', 'E5'];

// K173 (web's beat table, ruled 21 Oct): the hall is the hub; from it Next starts at card 1; a card
// opened directly continues from it; after the Engine Room's last page Next ends the tour (W55). Next
// does the beat it ARRIVES at; Back only shows (from an exhibit's first beat, the previous exhibit's
// last; from card 1's first, the hall). Next and a card count a visit; Back never does.
describe('KioskTour (K173)', () => {
  let tour: KioskTour;
  let f: ReturnType<typeof fakeStore>;
  let shown: string[];

  beforeEach(() => {
    f = fakeStore();
    TestBed.configureTestingModule({ providers: [{ provide: KioskStore, useValue: f.store }] });
    tour = TestBed.inject(KioskTour);
    shown = [];
    for (const id of BEAT_IDS) tour.register(id, { show: (by: Arrival) => void shown.push(`${id} ${by}`) });
  });

  it('holds the five exhibits’ beats in K173’s order: 22 with the hall', () => {
    expect(BEAT_IDS).toEqual(ORDER);
  });

  it('from the hall, Next alone walks every beat in order; Next on the last opens the end of the tour over it (W55)', async () => {
    const scenes: string[] = [];
    for (let i = 0; i < ORDER.length; i++) {
      await tour.next();
      scenes.push(f.scene());
    }
    expect(shown).toEqual(ORDER.map((id) => `${id} next`));
    expect(scenes).toEqual(['maps', 'maps', 'comp', 'comp', 'comp', 'comp', 'comp', 'comp', 'dash', 'dash', 'grade', 'grade', 'grade', 'engine', 'crews', 'safety', 'gov', 'local']);
    expect(tour.ended()).toBe(false);
    await tour.next();
    expect(tour.ended()).toBe(true);
    expect(f.scene()).toBe('local');
    expect(tour.beat()).toBe('E5');
    expect(shown).toHaveLength(ORDER.length);
    // Each exhibit entered by Next is counted (the Engine Room too, from Grading); its pages are not visits.
    expect(f.moves).toEqual(['open maps (tour)', 'open comp (tour)', 'open dash (tour)', 'open grade (tour)', 'open engine (tour)', 'open crews (tour)', 'open safety (tour)', 'open gov (tour)', 'open local (tour)']);
  });

  // W55 (the owner: "after the last 'Engine room' tour is played (via 'Next'), it is basically the end of
  // the tour"): Next on E5 opens the end of the tour over the page. It stays until a choice: Done (the
  // store's end of the demo session, as the footer's), Stay in the hall (or Esc, the tour's toHall), the
  // end of the session, or the scene changing under it. Next and Back do nothing while it shows.
  describe('W55: the end of the tour', () => {
    async function atEnd(): Promise<void> {
      await tour.openCard('engine');
      while (tour.beat() !== 'E5') await tour.next();
      await tour.next();
      expect(tour.ended()).toBe(true);
    }

    it('Next and Back do nothing while it shows: it stays, over E5, and no beat shows again', async () => {
      await atEnd();
      const before = [...shown];
      const moves = [...f.moves];
      await tour.next();
      await tour.back();
      expect(tour.ended()).toBe(true);
      expect(f.scene()).toBe('local');
      expect(tour.beat()).toBe('E5');
      expect(shown).toEqual(before);
      expect(f.moves).toEqual(moves);
    });

    it('Stay in the hall (and Esc, which is the tour’s toHall) goes to the hall and closes it; Next there starts at card 1', async () => {
      await atEnd();
      tour.toHall();
      expect(tour.ended()).toBe(false);
      expect(f.scene()).toBe('hall');
      expect(tour.beat()).toBeNull();
      expect(f.moves.at(-1)).toBe('go hall');
      await tour.next();
      expect(tour.beat()).toBe('M1');
      expect(tour.ended()).toBe(false);
    });

    it('the end of a demo session (Done, the idle return, the presenter’s reset) closes it at once, before the scene moves', async () => {
      await atEnd();
      for (const forget of f.forgetters) forget();
      expect(f.scene()).toBe('local');
      expect(tour.ended()).toBe(false);
    });

    it('a scene changed under it (a presenter jump) closes it, and coming back to the page does not bring it back', async () => {
      await atEnd();
      f.scene.set('gov');
      expect(tour.ended()).toBe(false);
      f.scene.set('local');
      expect(tour.ended()).toBe(false);
      expect(tour.beat()).toBe('E5');
    });

    it('Next on E5 reached from its tile (a free click) ends the tour too', async () => {
      f.scene.set('local');
      expect(tour.beat()).toBe('E5');
      await tour.next();
      expect(tour.ended()).toBe(true);
      expect(f.scene()).toBe('local');
    });
  });

  it('a card opened from the hall starts at its first beat, and Next after card 3’s last beat goes to card 4', async () => {
    await tour.openCard('dash');
    expect(tour.beat()).toBe('D1');
    await tour.next();
    await tour.next();
    expect(tour.beat()).toBe('G1');
    expect(shown).toEqual(['D1 card', 'D2 next', 'G1 next']);
    expect(f.moves).toEqual(['open dash (tour)', 'open grade (tour)']);
  });

  it('Back goes to the previous beat, across exhibits to the previous exhibit’s last beat, by go (never counted)', async () => {
    await tour.openCard('dash');
    await tour.back();
    expect(tour.beat()).toBe('C6');
    await tour.back();
    expect(tour.beat()).toBe('C5');
    expect(shown).toEqual(['D1 card', 'C6 back', 'C5 back']);
    expect(f.moves).toEqual(['open dash (tour)', 'go comp']);
  });

  it('Back from card 1’s first beat returns to the hall; on the hall Back does nothing', async () => {
    await tour.next();
    await tour.back();
    expect(f.scene()).toBe('hall');
    expect(tour.beat()).toBeNull();
    await tour.back();
    expect(f.scene()).toBe('hall');
    expect(shown).toEqual(['M1 next']);
  });

  it('Back from the Engine Room’s door lands on Grading’s last beat, which only shows', async () => {
    await tour.openCard('engine');
    await tour.back();
    expect(tour.beat()).toBe('G3');
    expect(shown).toEqual(['E1 card', 'G3 back']);
  });

  it('Esc returns to the hall from any beat; the hall’s Next then starts at card 1 again', async () => {
    await tour.openCard('comp');
    await tour.next();
    tour.toHall();
    expect(f.scene()).toBe('hall');
    expect(tour.beat()).toBeNull();
    await tour.next();
    expect(tour.beat()).toBe('M1');
  });

  it('a scene reached outside the tour (a presenter jump, a link inside an exhibit) puts the tour on that exhibit’s first beat', async () => {
    f.scene.set('dash');
    expect(tour.beat()).toBe('D1');
    await tour.next();
    expect(tour.beat()).toBe('D2');
    f.scene.set('gov');
    expect(tour.beat()).toBe('E4');
    f.scene.set('hall');
    expect(tour.beat()).toBeNull();
  });

  it('a free click inside an exhibit keeps the tour’s place (an Engine Room tile)', async () => {
    await tour.openCard('engine');
    f.scene.set('gov');
    expect(tour.beat()).toBe('E1');
    await tour.next();
    expect(tour.beat()).toBe('E2');
  });

  describe('ruling (a): Back first returns to the beat’s own view when a free click moved off it', () => {
    it('an Engine Room page opened by its tile: Back returns to the door (E1), then to Grading', async () => {
      await tour.openCard('engine');
      f.scene.set('gov');
      await tour.back();
      expect(f.scene()).toBe('engine');
      expect(tour.beat()).toBe('E1');
      await tour.back();
      expect(tour.beat()).toBe('G3');
      expect(shown).toEqual(['E1 card', 'E1 back', 'G3 back']);
      expect(f.moves).toEqual(['open engine (tour)', 'go engine', 'go grade']);
    });

    it('two free views in a row from one beat: Back returns to the beat each time (D8’s fixture walk at 56f7ea869)', async () => {
      await tour.openCard('engine');
      f.scene.set('crews');
      await tour.back();
      expect([f.scene(), tour.beat()]).toEqual(['engine', 'E1']);
      f.scene.set('safety');
      await tour.back();
      expect([f.scene(), tour.beat()]).toEqual(['engine', 'E1']);
      await tour.back();
      expect(tour.beat()).toBe('G3');
      expect(shown).toEqual(['E1 card', 'E1 back', 'E1 back', 'G3 back']);
    });

    it('a view inside the scene (an atlas region): Back re-shows the beat, then goes on', async () => {
      let atlas = true;
      tour.register('M1', { show: (by) => void shown.push(`M1 ${by}`), shows: () => atlas });
      await tour.next();
      atlas = false;
      await tour.back();
      expect(tour.beat()).toBe('M1');
      expect(f.scene()).toBe('maps');
      atlas = true;
      await tour.back();
      expect(f.scene()).toBe('hall');
      expect(shown).toEqual(['M1 next', 'M1 back']);
    });

    it('a beat that cannot show its own view again (a read that failed) never traps Back: the second press moves on', async () => {
      tour.register('M2', { show: (by) => void shown.push(`M2 ${by}`), shows: () => false });
      await tour.next();
      await tour.next();
      await tour.back();
      expect(tour.beat()).toBe('M2');
      await tour.back();
      expect(tour.beat()).toBe('M1');
      expect(shown).toEqual(['M1 next', 'M2 next', 'M2 back', 'M1 back']);
    });

    it('Next does not re-show the beat it is on: it goes to the next planned beat whatever this one’s view', async () => {
      tour.register('C2', { show: (by) => void shown.push(`C2 ${by}`), shows: () => false });
      await tour.openCard('comp');
      await tour.next();
      await tour.next();
      expect(tour.beat()).toBe('C3');
    });
  });

  // W100 (the owner's English walk, 22 Oct 17:47 +08: "I need to click "Next" 3 times before it routes to engine
  // room"): a beat whose view is already on screen (its scene shows and its `shows` holds) would show nothing new,
  // so it is not a stop: Next and Back pass it. A beat `pending` (G3, its release still to do) stays a stop for Next.
  // Both ways the tour lands on the FIRST beat showing the view (the orchestrator's ruling, 22 Oct 18:2x +08: with
  // the sample released, one Back from E1 lands on G1, as one Next from G1 lands on E1).
  describe('W100: a beat that would show nothing new is not a stop', () => {
    /** The grading card as the fake beats leave it: a released sample shows released on every grading beat (K42). */
    let stage: 'answer' | 'review' | 'released';

    beforeEach(() => {
      stage = 'answer';
      const grading = (id: 'G1' | 'G2' | 'G3', view: 'answer' | 'review', pending?: () => boolean) =>
        tour.register(id, {
          show: (by) => {
            shown.push(`${id} ${by}`);
            if (stage === 'released') return;
            stage = id === 'G3' && by === 'next' ? 'released' : view;
          },
          shows: () => stage === 'released' || stage === view,
          ...(pending ? { pending } : {}),
        });
      grading('G1', 'answer');
      grading('G2', 'review');
      grading('G3', 'review', () => stage !== 'released');
    });

    it('with the sample released earlier, one Next from G1 opens the Engine Room; one Back lands on G1 again, and one more leaves Grading', async () => {
      stage = 'released';
      await tour.openCard('grade');
      await tour.next();
      expect(tour.beat()).toBe('E1');
      await tour.back();
      expect(tour.beat()).toBe('G1');
      await tour.back();
      expect(tour.beat()).toBe('D2');
      await tour.next();
      expect(tour.beat()).toBe('G1');
      await tour.next();
      expect(tour.beat()).toBe('E1');
      expect(shown).toEqual(['G1 card', 'E1 next', 'G3 back', 'D2 back', 'G1 next', 'E1 next']);
    });

    it('a fresh walk keeps all three: G2 shows the review, and G3 still has its release to do (pending), so Next stops there', async () => {
      await tour.openCard('grade');
      await tour.next();
      expect([tour.beat(), stage]).toEqual(['G2', 'review']);
      await tour.next();
      expect([tour.beat(), stage]).toEqual(['G3', 'released']);
      await tour.next();
      expect(tour.beat()).toBe('E1');
      expect(shown).toEqual(['G1 card', 'G2 next', 'G3 next', 'E1 next']);
    });

    it('right after G3’s release by Next, one Back leaves Grading: G2 and G1 would show the same released grade', async () => {
      await tour.openCard('grade');
      await tour.next();
      await tour.next();
      expect([tour.beat(), stage]).toEqual(['G3', 'released']);
      await tour.back();
      expect(tour.beat()).toBe('D2');
      expect(shown).toEqual(['G1 card', 'G2 next', 'G3 next', 'D2 back']);
    });

    it('Back lands on the first beat showing the view: from E1, G3 by Back shows the review, which is G2’s; then G1', async () => {
      await tour.openCard('engine');
      await tour.back();
      expect([tour.beat(), stage]).toEqual(['G2', 'review']);
      await tour.back();
      expect([tour.beat(), stage]).toEqual(['G1', 'answer']);
      expect(shown).toEqual(['E1 card', 'G3 back', 'G1 back']);
    });

    it('a free click that already shows the next beat’s view: Next passes it (an Engine Room page opened by its tile)', async () => {
      tour.register('E2', { show: (by) => void shown.push(`E2 ${by}`), shows: () => true });
      await tour.openCard('engine');
      f.scene.set('crews');
      await tour.next();
      expect([tour.beat(), f.scene()]).toEqual(['E3', 'safety']);
      expect(shown).toEqual(['E1 card', 'E3 next']);
    });

    it('when every beat left would show nothing new, Next ends the tour (W55)', async () => {
      tour.register('E5', { show: (by) => void shown.push(`E5 ${by}`), shows: () => true });
      await tour.openCard('engine');
      for (let i = 0; i < 3; i++) await tour.next();
      expect(tour.beat()).toBe('E4');
      f.scene.set('local');
      await tour.next();
      expect(tour.ended()).toBe(true);
      expect(f.scene()).toBe('local');
      expect(shown).not.toContain('E5 next');
    });

    it('only a beat of the scene on screen can be passed: from D1, Back stops at C6 whatever C6 reports', async () => {
      tour.register('C6', { show: (by) => void shown.push(`C6 ${by}`), shows: () => true });
      await tour.openCard('dash');
      await tour.back();
      expect(tour.beat()).toBe('C6');
      expect(shown).toEqual(['D1 card', 'C6 back']);
    });

    it('a beat that registers no view of its own is always a stop, as before', async () => {
      await tour.openCard('comp');
      await tour.next();
      expect(tour.beat()).toBe('C2');
    });
  });

  it('the marker names the exhibit and the beat; on the hall it names where Next starts', async () => {
    expect(tour.marker()).toEqual({ key: 'tour.start', titleKey: 'ex.maps.title' });
    await tour.openCard('comp');
    await tour.next();
    expect(tour.marker()).toEqual({ key: 'tour.marker', titleKey: 'ex.comp.title', n: 2, m: 6 });
    await tour.openCard('engine');
    expect(tour.marker()).toEqual({ key: 'tour.marker', titleKey: 'ex.engine.title', n: 1, m: 5 });
  });

  it('a second Next while a beat is still showing (G3’s release) is ignored, and the tour is busy meanwhile', async () => {
    let release!: () => void;
    tour.register('G3', { show: () => new Promise<void>((r) => (release = r)) });
    await tour.openCard('grade');
    await tour.next();
    const third = tour.next();
    expect(tour.busy()).toBe(true);
    await tour.next();
    expect(tour.beat()).toBe('G3');
    release();
    await third;
    expect(tour.busy()).toBe(false);
    await tour.next();
    expect(tour.beat()).toBe('E1');
  });

  it('a beat that fails to show says so loudly and leaves the tour on it, ready to go on', async () => {
    const errors: string[] = [];
    vi.spyOn(console, 'error').mockImplementation((...a: unknown[]) => void errors.push(a.join(' ')));
    tour.register('M1', { show: () => Promise.reject(new Error('the atlas read failed')) });
    await tour.next();
    expect(tour.beat()).toBe('M1');
    expect(tour.busy()).toBe(false);
    expect(errors.join('\n')).toContain("[kiosk] the tour's beat M1 could not be shown: the atlas read failed");
    vi.restoreAllMocks();
  });

  it('a beat nobody registered fails loudly instead of showing a stale screen', async () => {
    const fresh = TestBed.runInInjectionContext(() => new KioskTour());
    await expect(fresh.next()).rejects.toThrow('[kiosk] the tour has no beat M1');
  });

  it('the end of a demo session puts the tour back at the hall', async () => {
    await tour.openCard('grade');
    f.scene.set('idle');
    for (const forget of f.forgetters) forget();
    f.scene.set('hall');
    expect(tour.beat()).toBeNull();
    await tour.next();
    expect(tour.beat()).toBe('M1');
  });
});
