import { DestroyRef, inject } from '@angular/core';

import { KioskStore } from '../kiosk.store';
import { KioskTour } from './kiosk-tour';

/**
 * For a scene on the tour (the hall, the five exhibits and the Engine Room's pages): its Next, Back and
 * Esc are the tour's while it shows (K173: the arrow keys follow Next and Back; Esc always returns to
 * the hall, an open overlay or the presenter panel closing first, as the store does).
 */
export function provideTourNav(): void {
  const store = inject(KioskStore);
  const tour = inject(KioskTour);
  inject(DestroyRef).onDestroy(store.setNav({ next: () => void tour.next(), back: () => void tour.back(), escape: () => tour.toHall() }));
}
