import { inject } from '@angular/core';

import { KioskStore } from '../../shell/kiosk.store';
import { DashboardExhibit } from './dashboard-exhibit';

/**
 * For the root component: the presenter's Jump to the dashboard (mockup jumpTo 'dash'), and the
 * exhibit's reads forgotten when the demo session ends (a new visitor reads afresh).
 */
export function provideDashboardJumps(): void {
  const store = inject(KioskStore);
  const exhibit = inject(DashboardExhibit);
  store.onEndSession(() => exhibit.forget());
  store.registerJump('dash', () => store.go('dash'));
}
