import { TestBed } from '@angular/core/testing';

import { BEAT_IDS, KioskTour, type Arrival, type BeatId } from './kiosk-tour';

/** Registers every beat as a no-op that records how it was reached, for specs that drive the tour without the exhibits. */
export function quietBeats(): string[] {
  const shown: string[] = [];
  const tour = TestBed.inject(KioskTour);
  for (const id of BEAT_IDS) tour.register(id as BeatId, { show: (by: Arrival) => void shown.push(`${id} ${by}`) });
  return shown;
}
