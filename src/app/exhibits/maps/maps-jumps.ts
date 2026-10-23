import { inject } from '@angular/core';

import { KioskStore } from '../../shell/kiosk.store';
import { VisitDecisions } from '../../shared/sugg/visit-decisions';
import { MapsExhibit } from './maps-exhibit';

/**
 * For the root component: the presenter's Jump to the atlas (mockup jumpTo 'maps'), and the atlas's
 * reads and every suggestion this visit decided (the hook's, Companions' and the atlas's own)
 * forgotten when the demo session ends.
 */
export function provideMapsJumps(): void {
  const store = inject(KioskStore);
  const exhibit = inject(MapsExhibit);
  const decisions = inject(VisitDecisions);
  store.onEndSession(() => {
    exhibit.forget();
    decisions.forget();
  });
  store.registerJump('maps', () => store.go('maps'));
}
