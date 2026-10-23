import { inject } from '@angular/core';

import { KioskStore } from '../../shell/kiosk.store';
import { GradeExhibit } from './grade-exhibit';

/**
 * For the root component: the presenter's Jump to the grading exhibit (mockup jumpTo 'grade'), and
 * the exhibit's reads and this visit's review forgotten when the demo session ends.
 */
export function provideGradeJumps(): void {
  const store = inject(KioskStore);
  const exhibit = inject(GradeExhibit);
  store.onEndSession(() => exhibit.forget());
  store.registerJump('grade', () => store.go('grade'));
}
