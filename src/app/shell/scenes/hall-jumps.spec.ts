import { TestBed } from '@angular/core/testing';

import { KioskStore } from '../kiosk.store';
import { provideHallJumps } from './hall-jumps';

describe('provideHallJumps: the presenter opens the hall', () => {
  it('registers the hall jump, which shows the hall', () => {
    const jumps = new Map<string, () => void>();
    const calls: string[] = [];
    TestBed.configureTestingModule({
      providers: [
        {
          provide: KioskStore,
          useValue: {
            registerJump: (t: string, j: () => void) => (jumps.set(t, j), () => jumps.delete(t)),
            go: (s: string) => calls.push(`go ${s}`),
          },
        },
      ],
    });
    TestBed.runInInjectionContext(() => provideHallJumps());
    expect([...jumps.keys()]).toEqual(['hall']);
    jumps.get('hall')?.();
    expect(calls).toEqual(['go hall']);
  });
});
