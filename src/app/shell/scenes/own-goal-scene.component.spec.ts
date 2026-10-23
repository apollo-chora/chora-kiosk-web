import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Component, inject } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NgTemplateOutlet } from '@angular/common';

import { KioskLanguage, provideKioskI18n } from '../../i18n/i18n';
import { provideLive } from '../../live/live.providers';
import { FooterSlot } from '../footer-slot';
import { KioskStore } from '../kiosk.store';
import { OwnGoalSceneComponent } from './own-goal-scene.component';

/** The scene and the frame's footer, as the root shows them. */
@Component({
  imports: [OwnGoalSceneComponent, NgTemplateOutlet],
  template: `<main id="scene"><kiosk-own-goal-scene /></main>
    <footer id="bottom">
      @if (footer(); as tpl) {
        <ng-container [ngTemplateOutlet]="tpl" />
      }
    </footer>`,
})
class HostComponent {
  protected readonly footer = inject(FooterSlot).template;
}

// W91 (K207; round3-design.html section 6): a still, five-step storyboard of the full product in its own words,
// opened from the hall's "Your own goal" tile: add a goal, buy a Pod through Stripe, send it to the map, awaken
// it, and it works the map as Pingu, Nova and Ember do here. No calls and no payment; Back returns to the hall.
describe('OwnGoalSceneComponent (Your own goal)', () => {
  let http: HttpTestingController;
  let fixture: ComponentFixture<HostComponent>;
  let el: HTMLElement;
  let store: KioskStore;

  beforeEach(async () => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting(), ...provideKioskI18n(), ...provideLive()] });
    http = TestBed.inject(HttpTestingController);
    store = TestBed.inject(KioskStore);
    await TestBed.inject(KioskLanguage).ready();
  });

  function shown(): void {
    fixture = TestBed.createComponent(HostComponent);
    el = fixture.nativeElement as HTMLElement;
    fixture.detectChanges();
  }

  const text = (n: Element | null) => n?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
  const steps = () => [...el.querySelectorAll('.own .own-steps > .own-step')];
  const mock = (i: number) => [...steps()[i].querySelectorAll('.own-mock > *')].map((n) => text(n));

  it('shows its head and K207’s line, then the five steps in order, each with its caption', () => {
    shown();
    expect(text(el.querySelector('.own .kicker'))).toBe('Explore · Your own goal');
    expect(text(el.querySelector('.own h1'))).toBe('Your own goal, and a Companion for it');
    expect(text(el.querySelector('.own .lede'))).toBe(
      'How it works at home: add your own goal, and a Companion hatches to learn it with you. This is a picture of the full Chora app; the kiosk shows it without taking a payment.',
    );
    expect(steps().map((s) => text(s.querySelector('.own-sn')))).toEqual([
      '1 · Add a goal',
      '2 · Buy a Pod',
      '3 · Send it to the map',
      '4 · Awaken it',
      '5 · It works your map',
    ]);
    expect(steps().map((s) => text(s.querySelector('.own-cap')))).toEqual([
      'Your goal becomes a new map, rooted at its main idea.',
      'Companions arrive as Pods, bought securely through Stripe.',
      'The Pod warms as you learn on its map.',
      'You name it and choose how it talks with you.',
      'Like Pingu, Nova and Ember here: one Companion per map.',
    ]);
  });

  it('draws each step in the product’s own words (K207), step 5 in this kiosk’s own Companions labels', () => {
    shown();
    expect(mock(0)).toEqual(['New learning goal', 'Name your learning goal · e.g. Scrum, Photosynthesis', 'Create']);
    expect(mock(1)).toEqual(['Companion Marketplace', 'Show the chances', 'Choose this Pod', 'Stripe checkout · Payment received! · Meet your Pod']);
    expect(mock(2)).toEqual(['Your Pod', 'Send it to a map to start warming', 'Warming on Photosynthesis']);
    expect(mock(3)).toEqual(["It's stirring, ready to awaken!", 'Open the Pod', 'Give them a name · Voice tone · Your learner persona', 'Awaken your companion']);
    expect(mock(4)).toEqual(['Companions at work', 'Suggest ideas to march into', 'Quiz me on this map', 'Today’s dose', 'Read my marked test']);
    // the product's buttons look like buttons, its fields like fields, and nothing on the storyboard can be pressed
    expect(steps().map((s) => s.querySelectorAll('.own-b').length)).toEqual([2, 1, 1, 2, 0]);
    expect(el.querySelectorAll('.own button, .own a, .own input').length).toBe(0);
  });

  it('makes no call: a still picture, no payment', () => {
    shown();
    http.verify();
  });

  it('Back, and Esc or the Back key, return to the hall; Done ends the demo session', () => {
    store.go('own');
    shown();
    const footer = el.querySelector('#bottom') as HTMLElement;
    expect([...footer.querySelectorAll('button')].map((b) => b.dataset['act'])).toEqual(['resetAll', 'back']);
    (footer.querySelector('[data-act="back"]') as HTMLButtonElement).click();
    expect(store.scene()).toBe('hall');

    store.go('own');
    store.escapeUp();
    expect(store.scene()).toBe('hall');

    store.go('own');
    store.back();
    expect(store.scene()).toBe('hall');

    const end = vi.spyOn(store, 'endSession').mockResolvedValue();
    (footer.querySelector('[data-act="resetAll"]') as HTMLButtonElement).click();
    expect(end).toHaveBeenCalledTimes(1);
  });

  it('speaks Chinese when the visitor chose it: K207’s line as ruled, Stripe and the example goals untranslated', async () => {
    await TestBed.inject(KioskLanguage).setLang('zh');
    shown();
    expect(text(el.querySelector('.own .lede'))).toBe(
      '在家里怎么用：加入你自己的学习目标，一只学习伙伴就会孵化出来陪你学。这是完整 Chora 应用的示意图；展台只作展示，不会收费。',
    );
    expect(mock(4)[0]).toBe('工作中的学习伙伴');
    expect(mock(1)[3]).toContain('Stripe');
    expect(mock(0)[1]).toContain('Scrum、Photosynthesis');
  });
});
