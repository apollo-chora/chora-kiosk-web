import { TestBed } from '@angular/core/testing';

import { KioskStore } from '../../shell/kiosk.store';
import { CompanionsExhibit } from './companions-exhibit';
import { provideCompanionsJumps } from './companions-jumps';

describe('provideCompanionsJumps: the presenter opens Companions, and a visit is forgotten at its end', () => {
  it('registers the comp jump, which shows the exhibit; the end of a session forgets its reads', () => {
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
        { provide: CompanionsExhibit, useValue: { forget: () => calls.push('forget') } },
      ],
    });
    TestBed.runInInjectionContext(() => provideCompanionsJumps());
    expect([...jumps.keys()]).toEqual(['comp']);
    jumps.get('comp')?.();
    expect(calls).toEqual(['go comp']);
    for (const f of forgetters) f();
    expect(calls).toEqual(['go comp', 'forget']);
  });
});
