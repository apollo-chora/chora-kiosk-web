import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Component, inject } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NgTemplateOutlet } from '@angular/common';

import { CompanionsExhibit } from '../../exhibits/companions/companions-exhibit';
import { GROWTH, IDS, MAPS, PINGU_AFTER, companionsManifest } from '../../exhibits/companions/companions-world.testing';
import { KioskLanguage, provideKioskI18n } from '../../i18n/i18n';
import { provideLive } from '../../live/live.providers';
import { FooterSlot } from '../footer-slot';
import { KioskStore } from '../kiosk.store';
import { KioskTour } from '../tour/kiosk-tour';
import { quietBeats } from '../tour/tour.testing';
import { HallSceneComponent } from './hall-scene.component';

/** The scene and the frame's footer, as the root shows them. */
@Component({
  imports: [HallSceneComponent, NgTemplateOutlet],
  template: `<main id="scene"><kiosk-hall-scene /></main>
    <footer id="bottom">
      @if (footer(); as tpl) {
        <ng-container [ngTemplateOutlet]="tpl" />
      }
    </footer>`,
})
class HostComponent {
  protected readonly footer = inject(FooterSlot).template;
}

// The Explore hall (mockup SCENES.hall and exCard, lines 4644 to 4660; renderBottom 6182; next and
// back 6218, 6226; K3, K7, K10, K24, K39, K63): five cards, four learner exhibits and the Engine
// Room's door, each opening its scene and counting the visit; the Companions card draws the three
// Companions at the stages their growth reads give (orchestrator, 18 Oct, answer 6), read again each
// time the hall shows (K173 ruling 3). K173: the hall is the tour's hub: Next starts it at card 1, a
// card at that card; the footer holds Done and Next.
describe('HallSceneComponent (Explore)', () => {
  let http: HttpTestingController;
  let fixture: ComponentFixture<HostComponent>;
  let el: HTMLElement;
  let store: KioskStore;

  async function settle(): Promise<void> {
    for (let i = 0; i < 4; i++) {
      await Promise.resolve();
      fixture.detectChanges();
    }
  }

  beforeEach(async () => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting(), ...provideKioskI18n(), ...provideLive()] });
    http = TestBed.inject(HttpTestingController);
    store = TestBed.inject(KioskStore);
    await TestBed.inject(KioskLanguage).ready();
  });

  afterEach(() => {
    TestBed.inject(CompanionsExhibit).forget();
  });

  /** The hall shown, the Companions read with the given growth reads (they load from the hall). */
  async function shown(growth: Record<string, unknown> = GROWTH): Promise<void> {
    fixture = TestBed.createComponent(HostComponent);
    el = fixture.nativeElement as HTMLElement;
    fixture.detectChanges();
    http.expectOne('/api/v1/kiosk/prewarm/manifest').flush(companionsManifest());
    for (const goal of [IDS.water, IDS.nature, IDS.hawker]) {
      await vi.waitFor(() => http.expectOne(`/api/v1/me/maps/${goal}/graph`).flush(MAPS[goal]));
    }
    for (const c of [IDS.pingu, IDS.nova, IDS.ember]) {
      await vi.waitFor(() => http.expectOne(`/api/v1/me/companions/${c}/growth`).flush(growth[c] as object));
    }
    await vi.waitFor(() => expect(TestBed.inject(CompanionsExhibit).status()).toBe('ready'));
    await settle();
  }

  const text = (n: Element | null) => n?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
  const cards = () => [...el.querySelectorAll<HTMLButtonElement>('.hall .cards > .ex-card')];
  const counted = () => http.match('/api/v1/kiosk/visits').map((r) => (r.request.body as { event: string }).event);

  it('shows the hall’s head and its six cards: the mockup’s five, then "Your own goal" (W91, K207)', async () => {
    await shown();
    expect(text(el.querySelector('.hall .kicker'))).toBe('Explore');
    expect(text(el.querySelector('.hall h1'))).toBe('Explore Chora');
    expect(text(el.querySelector('.hall .lede'))).toContain('Done ends the demo session');
    expect(cards().map((c) => c.dataset['to'])).toEqual(['maps', 'comp', 'dash', 'grade', 'engine', 'own']);
    expect(cards().map((c) => text(c.querySelector('h3')))).toEqual([
      'Wander the maps',
      'Meet the Companions',
      'Take an assessment',
      'Get an answer graded',
      'The Engine Room',
      'Your own goal',
    ]);
    expect(cards().map((c) => text(c.querySelector('.foot .time')))).toEqual([
      'About 1 minute',
      'About 1 minute',
      'About 1 minute',
      'About 1 minute',
      'About 3 minutes',
      'About 1 minute',
    ]);
    expect(cards().every((c) => c.tagName === 'BUTTON' && !!c.querySelector('.foot .go svg'))).toBe(true);
  });

  it('wears the mockup’s classes: glass learner cards, the dark Engine Room card with its kicker', async () => {
    await shown();
    const [maps, , , , engine] = cards();
    expect(maps.classList.contains('glass')).toBe(true);
    expect(engine.classList.contains('engine-card')).toBe(true);
    expect(engine.classList.contains('glass')).toBe(false);
    expect(text(engine.querySelector('.kicker.on-blue'))).toBe('For engineers');
    expect(text(engine.querySelector('p'))).toContain('agent crews');
  });

  it('draws the mockup’s card art inline, and the Companions card from the growth reads', async () => {
    await shown();
    const [maps, comp, dash, grade, engine] = cards();
    for (const c of [maps, dash, grade, engine]) expect(c.querySelector('.art > kiosk-card-art > svg')).not.toBeNull();
    expect(comp.querySelector('.art svg')).toBeNull();
    const art = [...comp.querySelectorAll('.art .card-mates chora-breed-art img')].map((i) => [i.getAttribute('src'), i.getAttribute('alt')]);
    expect(art).toEqual([
      ['/assets/familiars/penguin/penguin-stage-1.png', 'Pingu'],
      ['/assets/familiars/owl/owl-stage-2.png', 'Nova'],
      ['/assets/familiars/fox/fox-stage-3.png', 'Ember'],
    ]);
  });

  it('a Companion that grew shows its new stage (K42: Pingu’s level-up holds)', async () => {
    await shown({ ...GROWTH, [IDS.pingu]: PINGU_AFTER });
    const first = cards()[1].querySelector('.card-mates chora-breed-art img');
    expect(first?.getAttribute('src')).toBe('/assets/familiars/penguin/penguin-stage-2.png');
  });

  it('reads the Companions whole only once a visit; each later showing reads their growth again (K173 ruling 3: Grading’s +30 shows)', async () => {
    await shown();
    fixture.destroy();
    fixture = TestBed.createComponent(HostComponent);
    el = fixture.nativeElement as HTMLElement;
    fixture.detectChanges();
    for (const c of [IDS.pingu, IDS.nova, IDS.ember]) await vi.waitFor(() => http.expectOne(`/api/v1/me/companions/${c}/growth`).flush((c === IDS.pingu ? PINGU_AFTER : GROWTH[c]) as object));
    await settle();
    http.expectNone('/api/v1/kiosk/prewarm/manifest');
    http.expectNone((r) => r.url.includes('/graph'));
    expect(cards()[1].querySelector('.card-mates chora-breed-art img')?.getAttribute('src')).toBe('/assets/familiars/penguin/penguin-stage-2.png');
  });

  it('a Companions read that fails leaves the card without art, and the card still opens Companions', async () => {
    fixture = TestBed.createComponent(HostComponent);
    el = fixture.nativeElement as HTMLElement;
    const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    fixture.detectChanges();
    http.expectOne('/api/v1/kiosk/prewarm/manifest').flush({}, { status: 503, statusText: 'Service Unavailable' });
    await vi.waitFor(() => expect(TestBed.inject(CompanionsExhibit).status()).toBe('failed'));
    await settle();
    expect(cards()[1].querySelectorAll('chora-breed-art').length).toBe(0);
    expect(errors).toHaveBeenCalled();
    quietBeats();
    cards()[1].click();
    expect(store.scene()).toBe('comp');
  });

  it('each card opens its scene at the tour’s first beat for it and counts the visit; the Engine Room counts from the hall', async () => {
    await shown();
    const beats = quietBeats();
    store.go('hall');
    const want: [string, string][] = [
      ['maps', 'maps'],
      ['comp', 'comp'],
      ['dash', 'dash'],
      ['grade', 'grade'],
      ['engine', 'engine'],
    ];
    for (const [to, event] of want) {
      store.go('hall');
      cards()
        .find((c) => c.dataset['to'] === to)
        ?.click();
      expect(store.scene()).toBe(to);
      expect(counted()).toEqual([event]);
      await vi.waitFor(() => expect(TestBed.inject(KioskTour).busy()).toBe(false));
    }
    expect(beats).toEqual(['M1 card', 'C1 card', 'D1 card', 'G1 card', 'E1 card']);
  });

  it('W91: "Your own goal" opens the storyboard, off the tour: no visit counted, no beat, the Pod drawn', async () => {
    await shown();
    const beats = quietBeats();
    store.go('hall');
    await settle();
    const own = cards()[5];
    expect(own.classList.contains('glass')).toBe(true);
    expect(own.dataset['act']).toBe('openOwn');
    expect(text(own.querySelector('p'))).toBe('See how a learner adds a goal at home, and how a Companion hatches to learn it.');
    expect(own.querySelector('.art chora-breed-art')).not.toBeNull();
    own.click();
    expect(store.scene()).toBe('own');
    expect(counted()).toEqual([]);
    expect(beats).toEqual([]);
    expect(TestBed.inject(KioskTour).beat()).toBeNull();
  });

  it('K173: Next starts the tour at card 1 (the atlas); Back on the hall does nothing', async () => {
    await shown();
    const beats = quietBeats();
    store.go('hall');
    await settle();
    store.back();
    expect(store.scene()).toBe('hall');
    store.next();
    await vi.waitFor(() => expect(store.scene()).toBe('maps'));
    expect(beats).toEqual(['M1 next']);
  });

  it('the footer is the tour’s on the hall: the marker says where Next starts; Done, then Next; Done ends the session', async () => {
    await shown();
    store.go('hall');
    await settle();
    const end = vi.spyOn(store, 'endSession').mockResolvedValue();
    expect(text(el.querySelector('#bottom .fb-left'))).toBe('Next starts the tour at Wander the maps');
    const buttons = [...el.querySelectorAll<HTMLButtonElement>('#bottom .fb-right button')];
    expect(buttons.map((b) => text(b))).toEqual(['Done, end the demo session', 'Next']);
    buttons[0].click();
    expect(end).toHaveBeenCalledTimes(1);
  });

  it('the replay link under the cards starts the story over', async () => {
    await shown();
    const over = vi.spyOn(store, 'startOver').mockResolvedValue();
    const link = el.querySelector<HTMLButtonElement>('.hall .replay button.link');
    expect(text(link)).toBe('Start over: end this demo session and replay the story');
    link?.click();
    expect(over).toHaveBeenCalledTimes(1);
  });

  it('speaks Chinese when the visitor chose it', async () => {
    await TestBed.inject(KioskLanguage).setLang('zh');
    await shown();
    expect(text(el.querySelector('.hall h1'))).toBe('探索 Chora');
    expect(text(cards()[4].querySelector('h3'))).toBe('引擎室');
    expect([...el.querySelectorAll('#bottom .fb-right button')].map((b) => text(b))).toEqual(['完成，结束这场演示', '下一步']);
  });
});
