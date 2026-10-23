import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { App } from './app';
import { KioskLanguage, provideKioskI18n } from './i18n/i18n';
import { provideLive } from './live/live.providers';
import { KioskStore } from './shell/kiosk.store';
import { VisitOrder } from './shared/visit-order';
import { keepServedOrder } from './shared/visit-order.testing';

function setWindow(width: number, height: number): void {
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: width });
  Object.defineProperty(window, 'innerHeight', { configurable: true, value: height });
}

async function setup(width = 1366, height = 768) {
  setWindow(width, height);
  TestBed.configureTestingModule({ providers: [...keepServedOrder(), provideHttpClient(), provideHttpClientTesting(), ...provideKioskI18n(), ...provideLive()] });
  await TestBed.inject(KioskLanguage).ready();
  const fixture = TestBed.createComponent(App);
  await fixture.whenStable();
  return {
    fixture,
    el: fixture.nativeElement as HTMLElement,
    store: TestBed.inject(KioskStore),
    backend: TestBed.inject(HttpTestingController),
  };
}

describe('App: the stage that fills the window', () => {
  afterEach(() => setWindow(1024, 768));

  it('scales the stage to the window at start', async () => {
    const { el } = await setup(1366, 768);
    const stage = el.querySelector('#stage') as HTMLElement;
    const s = Math.min(1366 / 1600, 768 / 900);
    expect(stage.style.transform).toBe(`scale(${s})`);
    expect(parseFloat(stage.style.width)).toBeCloseTo(1366 / s, 3);
    expect(parseFloat(stage.style.height)).toBeCloseTo(768 / s, 3);
  });

  it('re-fits when the window is resized', async () => {
    const { fixture, el } = await setup(1600, 900);
    setWindow(2400, 900);
    window.dispatchEvent(new Event('resize'));
    await fixture.whenStable();
    const scene = el.querySelector('#scene') as HTMLElement;
    expect(scene.style.left).toBe('400px');
    expect(scene.style.top).toBe('67px');
  });

  it('stops listening for resizes once destroyed', async () => {
    const { fixture, el } = await setup(1600, 900);
    const stage = el.querySelector('#stage') as HTMLElement;
    fixture.destroy();
    setWindow(800, 450);
    window.dispatchEvent(new Event('resize'));
    expect(stage.style.transform).toBe('scale(1)');
  });
});

describe('App: the shell (K22, K1, D3)', () => {
  afterEach(() => setWindow(1024, 768));

  it('opens on the start screen in the NUS design, the footer hidden', async () => {
    const { el } = await setup();
    const stage = el.querySelector('#stage')!;
    expect(stage.classList.contains('t-nus')).toBe(true);
    expect(stage.classList.contains('t-chora')).toBe(false);
    expect(el.querySelector('header.frame-top .wordmark')).not.toBeNull();
    expect(el.querySelector('#scene .idle h1')).not.toBeNull();
    expect(el.querySelector('#bottom')!.classList.contains('hidden')).toBe(true);
  });

  it('every other scene wears Chora’s light design', async () => {
    const { fixture, el, store } = await setup();
    store.go('hall');
    await fixture.whenStable();
    const stage = el.querySelector('#stage')!;
    expect(stage.classList.contains('t-chora')).toBe(true);
    expect(stage.classList.contains('t-nus')).toBe(false);
    expect(el.querySelector('#bottom')!.classList.contains('hidden')).toBe(false);
  });

  it('shows the credits, the About sheet, "Still there?" and the pause as the store says', async () => {
    const { fixture, el, store } = await setup();
    store.toggleCredits();
    await fixture.whenStable();
    expect(el.querySelector('#credits')!.classList.contains('show')).toBe(true);
    expect(el.querySelector('#credits')!.textContent).toContain('Darryl Ng');
    (el.querySelector('#credits') as HTMLElement).click();
    await fixture.whenStable();
    expect(el.querySelector('#credits')!.classList.contains('show')).toBe(false);

    store.openOverlay('disclosure');
    await fixture.whenStable();
    expect(el.querySelector('#ov-disclosure')!.classList.contains('show')).toBe(true);
    expect(el.querySelector('#ov-disclosure table.disclose')).not.toBeNull();

    store.togglePause();
    await fixture.whenStable();
    expect(el.querySelector('#ov-paused')!.classList.contains('show')).toBe(true);
    expect(el.querySelector('#ov-paused p')!.textContent).toBe('Paused by the presenter');
  });

  it('reads the readiness at start, so LIVE knows what the opening check found; the start screen reads it too (K164)', async () => {
    const { backend } = await setup();
    // The board's read, and the start screen's K151 pre-check (StartCheck.watch).
    expect(backend.match((r) => r.method === 'GET' && r.url === '/api/v1/kiosk/readiness')).toHaveLength(2);
  });

  it('opens the presenter panel with the backtick, and shows the reset card while a reset runs', async () => {
    const { fixture, el, store } = await setup();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: '`' }));
    await fixture.whenStable();
    expect(el.querySelector('#presenter')!.classList.contains('open')).toBe(true);
    expect(el.querySelector('#presenter .p-head')).not.toBeNull();
    void store.endSession();
    await fixture.whenStable();
    expect(el.querySelector('#resetcard')!.classList.contains('show')).toBe(true);
    expect(el.querySelector('#resetcard h2')!.textContent).toBe('Getting ready for the next visitor');
  });

  it('the end of a demo session forgets every option order, so the next visitor gets a fresh draw (K149)', async () => {
    const { store } = await setup();
    const forget = vi.spyOn(TestBed.inject(VisitOrder), 'forget');
    void store.endSession();
    expect(forget).toHaveBeenCalledTimes(1);
  });

  it('K151: "start fresh?" shows over the start screen when the store asks it', async () => {
    const { fixture, el, store } = await setup();
    expect(el.querySelector('#ov-fresh')!.classList.contains('show')).toBe(false);
    store.openOverlay('fresh');
    await fixture.whenStable();
    expect(el.querySelector('#ov-fresh')!.classList.contains('show')).toBe(true);
    expect(el.querySelector('#ov-fresh [data-act="freshStart"]')).not.toBeNull();
  });

  it('hands the keys to the store, with the focused element', async () => {
    const { store } = await setup();
    const onKey = vi.spyOn(store, 'onKey');
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'b' }));
    expect(onKey).toHaveBeenCalledTimes(1);
    expect(onKey.mock.calls[0][0].key).toBe('b');
  });

  it('counts a click, a wheel or a pointer move as input', async () => {
    const { store } = await setup();
    const mark = vi.spyOn(store, 'markInput');
    document.dispatchEvent(new MouseEvent('mousemove'));
    document.dispatchEvent(new MouseEvent('click'));
    document.dispatchEvent(new WheelEvent('wheel'));
    expect(mark).toHaveBeenCalledTimes(3);
  });
});

// Every "Back to Explore" lands in the hall (mockup toHall, K63). K173 (the tour, ruling 1): each
// exhibit's footer holds "How was this made?", "Back to Explore", Done, Back, and Next right-most; the
// hall holds Done and Next.
describe('App: the hall and the way back to it (K39, K63)', () => {
  afterEach(() => setWindow(1024, 768));

  const texts = (el: HTMLElement, sel: string) => [...el.querySelectorAll(sel)].map((b) => b.textContent?.replace(/\s+/g, ' ').trim());

  for (const exhibit of ['comp', 'dash', 'grade'] as const) {
    it(`${exhibit}: the tour's footer, Next right-most; "Back to Explore" shows the hall`, async () => {
      const { fixture, el, store } = await setup();
      store.go(exhibit);
      await fixture.whenStable();
      expect(texts(el, '#bottom .fb-right button')).toEqual(['How was this made?', 'Back to Explore', 'Done, end the demo session', 'Back', 'Next']);
      (el.querySelector('#bottom .fb-right [data-act="toHall"]') as HTMLButtonElement).click();
      await fixture.whenStable();
      expect(store.scene()).toBe('hall');
      expect(el.querySelector('#scene .hall h1')?.textContent).toBe('Explore Chora');
      expect(el.querySelectorAll('#scene .hall .cards > .ex-card').length).toBe(6); // W91: "Your own goal" is the sixth
      expect(texts(el, '#bottom .fb-right button')).toEqual(['Done, end the demo session', 'Next']);
    });
  }

  it('W91: the shell shows "Your own goal" from the hall, with its own footer, and Back shows the hall again', async () => {
    const { fixture, el, store } = await setup();
    store.go('hall');
    await fixture.whenStable();
    (el.querySelector('#scene [data-act="openOwn"]') as HTMLButtonElement).click();
    await fixture.whenStable();
    expect(store.scene()).toBe('own');
    expect(el.querySelectorAll('#scene .own .own-steps > .own-step').length).toBe(5);
    expect(texts(el, '#bottom .fb-right button')).toEqual(['Done, end the demo session', 'Back']);
    (el.querySelector('#bottom [data-act="back"]') as HTMLButtonElement).click();
    await fixture.whenStable();
    expect(el.querySelector('#scene .hall h1')?.textContent).toBe('Explore Chora');
  });

  it('the hall’s maps card opens the atlas (the tour’s first beat), whose “Back to Explore” returns to the hall', async () => {
    const { fixture, el, store } = await setup();
    store.go('hall');
    await fixture.whenStable();
    (el.querySelector('#scene .ex-card[data-to="maps"]') as HTMLButtonElement).click();
    await fixture.whenStable();
    expect(store.scene()).toBe('maps');
    expect(el.querySelector('#scene .ex-head h2')?.textContent).toBe('A learner’s atlas');
    expect(texts(el, '#bottom .fb-left .tour-marker')).toEqual(['Wander the maps, 1 of 2']);
    expect(texts(el, '#bottom .fb-right button')).toEqual(['How was this made?', 'Back to Explore', 'Done, end the demo session', 'Back', 'Next']);
    (el.querySelector('#bottom .fb-right [data-act="toHall"]') as HTMLButtonElement).click();
    await fixture.whenStable();
    expect(store.scene()).toBe('hall');
    expect(store.canJump('maps')).toBe(true);
  });

  it('each exhibit’s footer offers “How was this made?”, opening its own Behind the scenes (K75); the Engine Room has none', async () => {
    const { fixture, el, store } = await setup();
    const cases = [
      ['hook', 'How a learner’s map works'],
      ['maps', 'How a learner’s map works'],
      ['comp', 'How a Companion works'],
      ['dash', 'How your dashboard works'],
      ['grade', 'How a grade is made'],
    ] as const;
    for (const [scene, title] of cases) {
      store.go(scene);
      fixture.detectChanges();
      await fixture.whenStable();
      fixture.detectChanges();
      const button = el.querySelector('#bottom [data-act="xray"]') as HTMLButtonElement;
      expect(button?.textContent?.trim(), scene).toBe('How was this made?');
      button.click();
      fixture.detectChanges();
      expect(store.overlay(), scene).toBe('xray');
      expect(el.querySelector('#ov-xray')?.classList.contains('show')).toBe(true);
      expect(el.querySelector('#xray-sheet h2')?.textContent?.trim(), scene).toBe(title);
      store.closeOverlays();
    }
    store.go('engine');
    fixture.detectChanges();
    expect(el.querySelector('#bottom [data-act="xray"]')).toBeNull();
  });

  it('the presenter can jump to the hall from any scene', async () => {
    const { fixture, el, store } = await setup();
    expect(store.canJump('hall')).toBe(true);
    store.go('grade');
    store.jumpTo('hall');
    await fixture.whenStable();
    expect(store.scene()).toBe('hall');
    expect(el.querySelector('#scene .hall')).not.toBeNull();
  });
});
