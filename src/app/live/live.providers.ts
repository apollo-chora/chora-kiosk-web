import { Provider, inject } from '@angular/core';

import { ReadinessService } from '../kiosk-api/readiness.service';
import { GradeLive } from './kinds/grade.live';
import { GreetLive } from './kinds/greet.live';
import { PictureLive } from './kinds/picture.live';
import { QLive } from './kinds/q.live';
import { SuggLive } from './kinds/sugg.live';
import { WeakLive } from './kinds/weak.live';
import { WordsLive } from './kinds/words.live';
import { LIVE_EXECUTORS, LiveAvailability, LiveExecutor } from './live.service';
import { LiveKind } from './live-kinds';

/**
 * The LIVE kinds that are built. A kind joins when its route is fixed and its executor is
 * tested; until then it reads "not wired" and its buttons are off (TRACKER phase 4: a kind
 * not ready ships off and labelled). All seven are built; picture since V2 (K113, T2.15), weak
 * since W20 (K158).
 * The model-call guard itself is installed with the HTTP client in app.config.ts.
 */
export function provideLive(): Provider[] {
  return [
    {
      provide: LIVE_EXECUTORS,
      useFactory: (): Partial<Record<LiveKind, LiveExecutor>> => ({
        q: inject(QLive),
        words: inject(WordsLive),
        picture: inject(PictureLive),
        sugg: inject(SuggLive),
        greet: inject(GreetLive),
        grade: inject(GradeLive),
        weak: inject(WeakLive),
      }),
    },
    { provide: LiveAvailability, useExisting: ReadinessService },
  ];
}
