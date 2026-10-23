import { inject } from '@angular/core';

import { KioskStore } from '../shell/kiosk.store';
import { HookStory } from './hook-story';

const BEATS = [1, 2, 3, 4, 5] as const;

/**
 * For the root component: the presenter's Jump to h1 to h5 (mockup jumpTo), from any scene, and
 * the story forgotten at the end of each demo session so the next visitor starts at step 1.
 * A jump shows the hook, reads the story if it is unread, then reaches the beat by the story's own
 * prepared moves.
 */
export function provideHookJumps(): void {
  const store = inject(KioskStore);
  const story = inject(HookStory);
  store.onEndSession(() => story.forget());
  for (const beat of BEATS) {
    store.registerJump(`h${beat}`, () => {
      store.go('hook');
      void (async () => {
        if (story.status() !== 'ready') await story.load();
        await story.advanceToBeat(beat);
      })();
    });
  }
}
