import { inject } from '@angular/core';

import { VisitTally } from '../../shared/visit-tally';
import { KioskStore } from '../../shell/kiosk.store';

/**
 * For the root component: the presenter's Jumps to the Engine Room and its pages (mockup jumpTo), and the
 * crews timeline's answer count forgotten when the demo session ends.
 */
export function provideEngineJumps(): void {
  const store = inject(KioskStore);
  const tally = inject(VisitTally);
  for (const to of ['engine', 'crews', 'safety', 'gov', 'local'] as const) store.registerJump(to, () => store.go(to));
  store.onEndSession(() => tally.forget());
}
