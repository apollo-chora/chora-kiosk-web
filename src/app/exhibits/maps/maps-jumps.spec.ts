import { TestBed } from '@angular/core/testing';

import { KioskStore } from '../../shell/kiosk.store';
import { VisitDecisions } from '../../shared/sugg/visit-decisions';
import { MapsExhibit } from './maps-exhibit';
import { provideMapsJumps } from './maps-jumps';

describe('provideMapsJumps: the presenter opens the atlas; its reads and the visit’s decisions are forgotten at its end', () => {
  it('registers the maps jump; the end of a session forgets the atlas and every suggestion decided this visit', () => {
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
        { provide: MapsExhibit, useValue: { forget: () => calls.push('atlas') } },
        { provide: VisitDecisions, useValue: { forget: () => calls.push('decisions') } },
      ],
    });
    TestBed.runInInjectionContext(() => provideMapsJumps());
    expect([...jumps.keys()]).toEqual(['maps']);
    jumps.get('maps')?.();
    expect(calls).toEqual(['go maps']);
    for (const f of forgetters) f();
    expect(calls).toEqual(['go maps', 'atlas', 'decisions']);
  });
});
