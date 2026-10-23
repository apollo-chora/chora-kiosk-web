import { NgTemplateOutlet } from '@angular/common';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { KioskLanguage, provideKioskI18n } from '../i18n/i18n';
import { provideLive } from '../live/live.providers';
import { FooterSlot } from '../shell/footer-slot';
import { KioskStore } from '../shell/kiosk.store';
import { HookSceneComponent } from './hook-scene.component';
import { HookStory } from './hook-story';
import { ALL_PENDING, GOAL, graph, manifest } from './hook-world.testing';
import { V1_STEM, jobRead, jobUrl, studioManifest } from './studio-world.testing';
import { TeacherStudio } from './teacher-studio';
import { keepServedOrder } from '../shared/visit-order.testing';

@Component({
  imports: [NgTemplateOutlet, HookSceneComponent],
  template: `
    <div id="scene"><kiosk-hook-scene /></div>
    <footer id="bottom">
      @if (footer(); as tpl) {
        <ng-container [ngTemplateOutlet]="tpl" />
      }
    </footer>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
class Frame {
  readonly footer = inject(FooterSlot).template;
}

// Steps 4b and 5 in the scene (mockup SCENES.hook, hookNextBtnHTML and closingHTML, lines 4403 to
// 4430 and 4626): the picture studio, the footer's "Keep and continue" with "Continue without
// keeping" once the picture has a change and nothing is kept (K56); then "That's Chora", the end
// credits 2.2 s later (K16), and Done or Explore more.
describe('HookSceneComponent (step 4b)', () => {
  let http: HttpTestingController;
  let fixture: ComponentFixture<Frame>;
  let el: HTMLElement;
  let story: HookStory;

  async function settle(): Promise<void> {
    for (let i = 0; i < 4; i++) {
      await Promise.resolve();
      fixture.detectChanges();
    }
  }

  beforeEach(async () => {
    TestBed.configureTestingModule({ providers: [...keepServedOrder(), provideHttpClient(), provideHttpClientTesting(), ...provideKioskI18n(), ...provideLive()] });
    http = TestBed.inject(HttpTestingController);
    await TestBed.inject(KioskLanguage).ready();
    TestBed.inject(KioskStore).go('hook');
    story = TestBed.inject(HookStory);
    fixture = TestBed.createComponent(Frame);
    el = fixture.nativeElement as HTMLElement;
    fixture.detectChanges();
    const m = manifest();
    const s = studioManifest();
    http.expectOne('/api/v1/kiosk/prewarm/manifest').flush({ ...m, world: { ...m.world, ...s.world }, templates: s.templates, choices: { ...m.choices, ...s.choices } });
    await vi.waitFor(() => http.expectOne(`/api/v1/me/maps/${GOAL}/graph`).flush(graph()));
    await vi.waitFor(() => http.expectOne((r) => r.url === '/api/v1/me/concept-graph/suggestions').flush({ suggestions: ALL_PENDING }));
    await vi.waitFor(() => expect(story.status()).toBe('ready'));
    story.toTeacher();
    await vi.waitFor(() => http.expectOne(jobUrl('j-v1')).flush(jobRead('j-v1', V1_STEM)));
    await vi.waitFor(() => expect(TestBed.inject(TeacherStudio).status()).toBe('ready'));
    await story.next();
    const chip = story.next();
    await vi.waitFor(() => http.expectOne(jobUrl('j-r')).flush(jobRead('j-r', 'Which stage?')));
    await chip;
    await story.next();
    await settle();
  });

  afterEach(() => story.forget());

  const text = (sel: string) => el.querySelector(sel)?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
  const click = (sel: string) => (el.querySelector(sel) as HTMLElement).dispatchEvent(new MouseEvent('click', { bubbles: true }));

  it('shows the picture studio; Next reads plain Next until the picture has a change', async () => {
    expect(el.querySelector('#scene kiosk-studio-b')).not.toBeNull();
    expect(el.querySelector('#scene kiosk-studio-a')).toBeNull();
    expect(text('#bottom [data-act="next"]')).toBe('Next');
    expect(el.querySelector('#bottom [data-act="continueNoKeep"]')).toBeNull();
  });

  it('after a change: “Keep and continue” beside “Continue without keeping”, which ends the story keeping nothing', async () => {
    await story.next();
    await settle();
    expect(text('#bottom [data-act="next"]')).toBe('Keep and continue');
    expect(text('#bottom [data-act="continueNoKeep"]')).toBe('Continue without keeping');
    click('#bottom [data-act="continueNoKeep"]');
    await settle();
    expect(story.beat()).toBe(5);
    http.expectOne('/api/v1/kiosk/visits').flush({});
    expect(text('.closing .keep-ack')).toBe('You moved on without keeping, so learners still see the prepared version.');
  });

  it('step 5 after Keep: the line, the kept version, the recap, and Done or Explore more', async () => {
    await story.next();
    const keep = story.next();
    await vi.waitFor(() => http.expectOne(`${jobUrl('j-r')}/accept`).flush({ persisted: [] }));
    await keep;
    http.expectOne('/api/v1/kiosk/visits').flush({});
    await settle();
    expect(el.querySelector('kiosk-studio-b')).toBeNull();
    expect(text('.closing .kicker')).toBe('That’s Chora');
    expect(text('.closing h1')).toBe('Learn by curiosity. Teach with AI.');
    expect(el.querySelector('.closing .keep-ack')?.classList.contains('kept')).toBe(true);
    expect(text('.closing .keep-ack')).toBe('You kept version 3 as the teacher.');
    expect([...el.querySelectorAll('.closing .recap span')].map((n) => n.textContent?.trim())).toEqual([
      'A map of your own',
      'A question written for you',
      'AI drafts, teachers direct',
    ]);
    expect(text('#bottom [data-act="done"]')).toBe('Done, end the demo session');
    expect(text('#bottom [data-act="next"]')).toBe('Explore more');
    expect(el.querySelector('#bottom [data-act="back"]')).toBeNull();
    const store = TestBed.inject(KioskStore);
    click('#bottom [data-act="next"]');
    expect(store.scene()).toBe('hall');
    http.expectOne('/api/v1/kiosk/visits').flush({});
  });

  it('step 5 rolls the end credits 2.2 s after it shows (K16), and Done ends the demo session', async () => {
    const store = TestBed.inject(KioskStore);
    const credits = vi.spyOn(store, 'playCredits');
    const end = vi.spyOn(store, 'endSession').mockResolvedValue(undefined);
    await story.next();
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      story.continueNoKeep();
      await settle();
      vi.advanceTimersByTime(2_100);
      expect(credits).not.toHaveBeenCalled();
      vi.advanceTimersByTime(200);
      expect(credits).toHaveBeenCalledWith(7_000);
    } finally {
      vi.useRealTimers();
    }
    http.expectOne('/api/v1/kiosk/visits').flush({});
    click('#bottom [data-act="done"]');
    expect(end).toHaveBeenCalled();
  });
});
