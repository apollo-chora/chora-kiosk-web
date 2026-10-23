import { inject } from '@angular/core';

import { KioskStore } from '../../shell/kiosk.store';
import { CompanionsExhibit } from './companions-exhibit';

/**
 * For the root component: the presenter's Jump to Companions (mockup jumpTo 'comp'), and the
 * exhibit's reads forgotten when the demo session ends (a new visitor reads afresh).
 */
export function provideCompanionsJumps(): void {
  const store = inject(KioskStore);
  const exhibit = inject(CompanionsExhibit);
  store.onEndSession(() => exhibit.forget());
  store.registerJump('comp', () => store.go('comp'));
}
