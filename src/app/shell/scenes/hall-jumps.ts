import { inject } from '@angular/core';

import { KioskStore } from '../kiosk.store';

/** For the root component: the presenter's Jump to the hall (mockup jumpTo 'hall'). */
export function provideHallJumps(): void {
  const store = inject(KioskStore);
  store.registerJump('hall', () => store.go('hall'));
}
