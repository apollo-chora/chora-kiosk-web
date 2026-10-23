import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { Type, WritableSignal } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { DashboardExhibit } from '../exhibits/dashboard/dashboard-exhibit';
import { DashboardSceneComponent } from '../exhibits/dashboard/dashboard-scene.component';
import { GradeExhibit } from '../exhibits/grade/grade-exhibit';
import { GradeSceneComponent } from '../exhibits/grade/grade-scene.component';
import { provideKioskI18n } from '../i18n/i18n';
import { provideLive } from '../live/live.providers';
import { HookSceneComponent } from '../story/hook-scene.component';
import { HookStory } from '../story/hook-story';
import { StudioAComponent } from '../story/studio-a.component';
import { TeacherStudio } from '../story/teacher-studio';
import { keepServedOrder } from '../shared/visit-order.testing';

// Lead 6b (19 Oct): an exhibit whose first read failed (Companions got a 502 while another browser's
// reset ran) stayed on "This step could not reach Chora" until a page reload. Opening it again reads
// again. (Companions has its own end-to-end case in companions-scene.component.spec.ts.)
interface Loads {
  load(): Promise<void>;
}
const CASES: [string, Type<unknown>, Type<Loads>][] = [
  ['the dashboard', DashboardSceneComponent, DashboardExhibit],
  ['grading', GradeSceneComponent, GradeExhibit],
  ['the story', HookSceneComponent, HookStory],
  ['step 4a', StudioAComponent, TeacherStudio],
];

describe('a failed read is tried again when its scene opens again (lead 6b)', () => {
  for (const [name, scene, store] of CASES) {
    it(name, () => {
      TestBed.configureTestingModule({ providers: [...keepServedOrder(), provideHttpClient(), provideHttpClientTesting(), ...provideKioskI18n(), ...provideLive()] });
      const s = TestBed.inject(store);
      (s as unknown as { statusSig: WritableSignal<string> }).statusSig.set('failed');
      const load = vi.spyOn(s, 'load').mockResolvedValue();
      TestBed.createComponent(scene);
      expect(load).toHaveBeenCalledTimes(1);
    });
  }
});
