import { TestBed } from '@angular/core/testing';

import { KioskStore } from '../../shell/kiosk.store';
import { GradeExhibit } from './grade-exhibit';
import { provideGradeJumps } from './grade-jumps';

describe('provideGradeJumps: the presenter opens the grading exhibit, and a visit is forgotten at its end', () => {
  it('registers the grade jump, which shows the exhibit; the end of a session forgets its reads', () => {
    const jumps = new Map<string, () => void>();
    const forgetters: (() => void)[] = [];
    const calls: string[] = [];
    TestBed.configureTestingModule({
      providers: [
        {
          provide: KioskStore,
          useValue: {
            registerJump: (t: string, j: () => void) => (jumps.set(t, j), () => jumps.delete(t)),
            onEndSession: (f: () => void) => (forgetters.push(f), () => undefined),
            go: (s: string) => calls.push(`go ${s}`),
          },
        },
        { provide: GradeExhibit, useValue: { forget: () => calls.push('forget') } },
      ],
    });
    TestBed.runInInjectionContext(() => provideGradeJumps());
    expect([...jumps.keys()]).toEqual(['grade']);
    jumps.get('grade')?.();
    expect(calls).toEqual(['go grade']);
    for (const f of forgetters) f();
    expect(calls).toEqual(['go grade', 'forget']);
  });
});
