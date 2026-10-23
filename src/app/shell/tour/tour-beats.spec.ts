import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { CompanionsExhibit } from '../../exhibits/companions/companions-exhibit';
import { DashboardExhibit } from '../../exhibits/dashboard/dashboard-exhibit';
import { GradeExhibit } from '../../exhibits/grade/grade-exhibit';
import { MapsExhibit } from '../../exhibits/maps/maps-exhibit';
import { KioskStore, type SceneId } from '../kiosk.store';
import { BEAT_IDS, KioskTour, type BeatId } from './kiosk-tour';
import { provideTourBeats } from './tour-beats';

// K173, the beat table in code: each beat asks its exhibit for its view, and Next's arrival does the
// beat's own action (C4 opens the dose, G3 releases); a scene's own view decides Back (ruling a).
describe('provideTourBeats (K173)', () => {
  const calls: string[] = [];
  /** False: no exhibit shows its beat's view any more (an open drawer, another Companion picked). */
  let shows = true;
  /** The strong sample released (K42: it then shows released on every grading beat). */
  let released = false;
  /** Each exhibit's view as the last beat left it. */
  const at: Record<string, string | null> = {};
  const scene = signal<SceneId>('hall');
  const exhibits = {
    maps: { want: (v: string) => void (calls.push(`maps ${v}`), (at['maps'] = v)), viewing: () => (shows ? at['maps'] : 'drawer') },
    // As CompanionsExhibit.tourShows: before any dose is read, Pingu's intro is C4's own view (what Back shows there).
    comp: {
      tourShow: (v: string | null, by: string) => (calls.push(`comp ${v} ${by}`), (at['comp'] = v), Promise.resolve()),
      tourShows: (v: string | null) => shows && (at['comp'] === v || (v === 'dose' && at['comp'] === null)),
      tourDoseOpen: () => at['comp'] === 'dose',
    },
    dash: { tourShow: (b: string | null) => (calls.push(`dash ${b}`), (at['dash'] = b), Promise.resolve()), tourShows: (b: string | null) => shows && at['dash'] === b },
    // As GradeExhibit.tourShows: G3's own view (by Back) is the review; a released sample is every beat's view.
    grade: {
      tourShow: (s: string, by: string) => (calls.push(`grade ${s} ${by}`), (at['grade'] = s), Promise.resolve()),
      tourShows: (s: string) => shows && (released || at['grade'] === s || (s === 'release' && at['grade'] === 'review')),
      tourReleased: () => released,
    },
  };

  beforeEach(() => {
    calls.length = 0;
    shows = true;
    released = false;
    for (const k of Object.keys(at)) delete at[k];
    scene.set('hall');
    TestBed.configureTestingModule({
      providers: [
        {
          provide: KioskStore,
          useValue: { scene: scene.asReadonly(), go: (s: SceneId) => scene.set(s), openScene: (s: SceneId) => scene.set(s), onEndSession: () => () => undefined },
        },
        { provide: MapsExhibit, useValue: exhibits.maps },
        { provide: CompanionsExhibit, useValue: exhibits.comp },
        { provide: DashboardExhibit, useValue: exhibits.dash },
        { provide: GradeExhibit, useValue: exhibits.grade },
      ],
    });
    TestBed.runInInjectionContext(() => provideTourBeats());
  });

  it('Next from the hall asks each exhibit for each beat’s view, in K173’s order', async () => {
    const tour = TestBed.inject(KioskTour);
    for (let i = 0; i < BEAT_IDS.length; i++) await tour.next();
    expect(calls).toEqual([
      'maps atlas',
      'maps goal.water',
      'comp null next',
      'comp suggest next',
      'comp quiz next',
      'comp dose next',
      'comp weak next',
      'comp paper next',
      'dash null',
      'dash bank.water',
      'grade answer next',
      'grade review next',
      'grade release next',
    ]);
    expect(scene()).toBe('local');
  });

  it('Back carries its arrival to the exhibit, so G3 and C4 by Back write nothing', async () => {
    const tour = TestBed.inject(KioskTour);
    await tour.openCard('engine');
    await tour.back();
    await tour.openCard('dash');
    await tour.back();
    await tour.back();
    await tour.back();
    expect(calls).toEqual(['grade release back', 'dash null', 'comp paper back', 'comp weak back', 'comp dose back']);
  });

  it('Back first re-shows a beat whose exhibit no longer shows its view (an open drawer on the water map)', async () => {
    const tour = TestBed.inject(KioskTour);
    await tour.next();
    await tour.next();
    shows = false;
    await tour.back();
    expect(tour.beat() as BeatId).toBe('M2');
    expect(calls.at(-1)).toBe('maps goal.water');
  });

  // W100: a beat whose view is already on screen is not a stop. G3 says when its release is still to do
  // (pending until the strong sample is released); an Engine Room page's view is its scene.
  it('W100: with the strong sample released, one Next from G1 opens the Engine Room and one Back lands on G1', async () => {
    const tour = TestBed.inject(KioskTour);
    released = true;
    await tour.openCard('grade');
    await tour.next();
    expect(tour.beat() as BeatId).toBe('E1');
    await tour.back();
    expect(tour.beat() as BeatId).toBe('G1');
    expect(calls).toEqual(['grade answer card', 'grade release back']);
  });

  it('W100: on a fresh walk G3 is still pending on the review, so Next stops there and releases', async () => {
    const tour = TestBed.inject(KioskTour);
    await tour.openCard('grade');
    await tour.next();
    await tour.next();
    expect(tour.beat() as BeatId).toBe('G3');
    expect(calls).toEqual(['grade answer card', 'grade review next', 'grade release next']);
  });

  it('W100: C4 stays a stop for Next while the dose is not on screen, even on the intro that stands for it by Back', async () => {
    const tour = TestBed.inject(KioskTour);
    await tour.openCard('comp');
    await tour.next();
    await tour.next();
    at['comp'] = null;
    await tour.next();
    expect(tour.beat() as BeatId).toBe('C4');
    expect(calls.at(-1)).toBe('comp dose next');
  });

  it('W100: an Engine Room page opened by its tile is its beat’s view, so Next passes that beat', async () => {
    const tour = TestBed.inject(KioskTour);
    await tour.openCard('engine');
    scene.set('crews');
    await tour.next();
    expect(tour.beat() as BeatId).toBe('E3');
    expect(scene()).toBe('safety');
  });
});
