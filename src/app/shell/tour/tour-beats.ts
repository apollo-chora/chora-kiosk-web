import { inject } from '@angular/core';

import { CompanionsExhibit } from '../../exhibits/companions/companions-exhibit';
import { DashboardExhibit } from '../../exhibits/dashboard/dashboard-exhibit';
import { GradeExhibit } from '../../exhibits/grade/grade-exhibit';
import { MapsExhibit } from '../../exhibits/maps/maps-exhibit';
import { KioskTour } from './kiosk-tour';

/** The atlas's hero map (K173: "within the atlas, next will bring user to just one hero KG"). */
const HERO_MAP = 'goal.water';
/** The assessment the tour shows: the water bank's (it holds story step 4's question). */
const HERO_BANK = 'bank.water';

/**
 * For the root component: what each of the tour's beats shows (K173; web's beat table, ruled 21 Oct).
 * Maps: the atlas, then Singapore's water. Companions: Pingu's intro, then Suggest, Quiz, Today's dose
 * and Read my marked test, then how it read the paper (W52, the popup). Take an assessment: the
 * dashboard, then the water bank's questions. Get an answer graded: the strong sample, its prepared
 * review, its release. The Engine Room's five pages need nothing beyond their scenes. Each beat also says whether its exhibit still shows its view, which Back
 * reads first (ruling a), and which lets Next and Back pass a beat that would show nothing new (W100): an Engine
 * Room page's view is its scene; C4 stays a stop for Next until the dose shows, G3 until the strong sample is released.
 */
export function provideTourBeats(): void {
  const tour = inject(KioskTour);
  const maps = inject(MapsExhibit);
  const comp = inject(CompanionsExhibit);
  const dash = inject(DashboardExhibit);
  const grade = inject(GradeExhibit);

  tour.register('M1', { show: () => maps.want('atlas'), shows: () => maps.viewing() === 'atlas' });
  tour.register('M2', { show: () => maps.want(HERO_MAP), shows: () => maps.viewing() === HERO_MAP });
  tour.register('C1', { show: (by) => comp.tourShow(null, by), shows: () => comp.tourShows(null) });
  tour.register('C2', { show: (by) => comp.tourShow('suggest', by), shows: () => comp.tourShows('suggest') });
  tour.register('C3', { show: (by) => comp.tourShow('quiz', by), shows: () => comp.tourShows('quiz') });
  tour.register('C4', { show: (by) => comp.tourShow('dose', by), shows: () => comp.tourShows('dose'), pending: () => !comp.tourDoseOpen() });
  tour.register('C5', { show: (by) => comp.tourShow('weak', by), shows: () => comp.tourShows('weak') });
  tour.register('C6', { show: (by) => comp.tourShow('paper', by), shows: () => comp.tourShows('paper') });
  tour.register('D1', { show: () => dash.tourShow(null), shows: () => dash.tourShows(null) });
  tour.register('D2', { show: () => dash.tourShow(HERO_BANK), shows: () => dash.tourShows(HERO_BANK) });
  tour.register('G1', { show: (by) => grade.tourShow('answer', by), shows: () => grade.tourShows('answer') });
  tour.register('G2', { show: (by) => grade.tourShow('review', by), shows: () => grade.tourShows('review') });
  tour.register('G3', { show: (by) => grade.tourShow('release', by), shows: () => grade.tourShows('release'), pending: () => !grade.tourReleased() });
  for (const id of ['E1', 'E2', 'E3', 'E4', 'E5'] as const) tour.register(id, { show: () => undefined, shows: () => true });
}
