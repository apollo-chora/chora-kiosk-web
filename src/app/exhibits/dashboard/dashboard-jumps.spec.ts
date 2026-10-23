import { TestBed } from '@angular/core/testing';

import { KioskStore } from '../../shell/kiosk.store';
import { DashboardExhibit } from './dashboard-exhibit';
import { provideDashboardJumps } from './dashboard-jumps';

describe('provideDashboardJumps: the presenter opens the dashboard, and a visit is forgotten at its end', () => {
  it('registers the dash jump, which shows the exhibit; the end of a session forgets its reads', () => {
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
        { provide: DashboardExhibit, useValue: { forget: () => calls.push('forget') } },
      ],
    });
    TestBed.runInInjectionContext(() => provideDashboardJumps());
    expect([...jumps.keys()]).toEqual(['dash']);
    jumps.get('dash')?.();
    expect(calls).toEqual(['go dash']);
    for (const f of forgetters) f();
    expect(calls).toEqual(['go dash', 'forget']);
  });
});
