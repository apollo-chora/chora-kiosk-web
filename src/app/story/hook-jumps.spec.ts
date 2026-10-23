import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { KioskStore } from '../shell/kiosk.store';
import { HookStory } from './hook-story';
import { provideHookJumps } from './hook-jumps';

describe('provideHookJumps: the presenter reaches each beat, and a visit is forgotten at its end', () => {
  function setup(status: 'idle' | 'ready') {
    const jumps = new Map<string, () => void>();
    const forgetters: (() => void)[] = [];
    const calls: string[] = [];
    const st = signal(status);
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
        {
          provide: HookStory,
          useValue: {
            status: st.asReadonly(),
            load: () => (calls.push('load'), st.set('ready'), Promise.resolve()),
            advanceToBeat: (b: number) => (calls.push(`beat ${b}`), Promise.resolve()),
            forget: () => calls.push('forget'),
          },
        },
      ],
    });
    TestBed.runInInjectionContext(() => provideHookJumps());
    return { jumps, forgetters, calls };
  }

  it('registers h1 to h5; a jump shows the hook, reads it if unread, then reaches the beat', async () => {
    const { jumps, calls } = setup('idle');
    expect([...jumps.keys()]).toEqual(['h1', 'h2', 'h3', 'h4', 'h5']);
    jumps.get('h3')?.();
    await vi.waitFor(() => expect(calls).toEqual(['go hook', 'load', 'beat 3']));
  });

  it('a story already read is not read again', async () => {
    const { jumps, calls } = setup('ready');
    jumps.get('h1')?.();
    await vi.waitFor(() => expect(calls).toEqual(['go hook', 'beat 1']));
  });

  it('the end of a demo session forgets the story', () => {
    const { forgetters, calls } = setup('ready');
    forgetters.forEach((f) => f());
    expect(calls).toEqual(['forget']);
  });
});
