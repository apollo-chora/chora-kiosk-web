import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';

import { ConceptLensMapComponent } from '../../aplus/my-knowledge/concept-lens-map/concept-lens-map.component';
import { KioskLanguage, provideKioskI18n } from '../../i18n/i18n';
import { provideLive } from '../../live/live.providers';
import { FooterSlot } from '../../shell/footer-slot';
import { quietBeats } from '../../shell/tour/tour.testing';
import { KioskStore } from '../../shell/kiosk.store';
import { CompanionsExhibit } from './companions-exhibit';
import { CompanionsSceneComponent } from './companions-scene.component';
import { GROWTH, IDS, MAPS, companionMap, companionsManifest, growth } from './companions-world.testing';
import { keepServedOrder } from '../../shared/visit-order.testing';

// Companions at work (mockup SCENES.comp, lines 4879 to 4906; profileSheetHTML 2896): the roster
// of the three Companions, each bound to one map, and the profile sheet of the one picked, all from
// the product's reads: each goal's map (its Companion, its march) and each Companion's growth.
describe('CompanionsSceneComponent (the roster and the profile sheet)', () => {
  let http: HttpTestingController;
  let fixture: ComponentFixture<CompanionsSceneComponent>;
  let el: HTMLElement;

  async function settle(): Promise<void> {
    for (let i = 0; i < 4; i++) {
      await Promise.resolve();
      fixture.detectChanges();
    }
  }

  async function shown(maps: Record<string, unknown> = MAPS): Promise<void> {
    TestBed.configureTestingModule({ providers: [...keepServedOrder(), provideHttpClient(), provideHttpClientTesting(), ...provideKioskI18n(), ...provideLive()] });
    http = TestBed.inject(HttpTestingController);
    await TestBed.inject(KioskLanguage).ready();
    fixture = TestBed.createComponent(CompanionsSceneComponent);
    el = fixture.nativeElement as HTMLElement;
    fixture.detectChanges();
    http.expectOne('/api/v1/kiosk/prewarm/manifest').flush(companionsManifest());
    for (const goal of [IDS.water, IDS.nature, IDS.hawker]) {
      await vi.waitFor(() => http.expectOne(`/api/v1/me/maps/${goal}/graph`).flush(maps[goal] as object));
    }
    for (const c of [IDS.pingu, IDS.nova, IDS.ember]) {
      await vi.waitFor(() => http.expectOne(`/api/v1/me/companions/${c}/growth`).flush(GROWTH[c]));
    }
    await vi.waitFor(() => expect(TestBed.inject(CompanionsExhibit).status()).not.toBe('loading'));
    await settle();
  }

  afterEach(() => TestBed.inject(CompanionsExhibit).forget());

  const text = (sel: string) => el.querySelector(sel)?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
  /** Each match's child elements' texts, joined by a space (Angular keeps no whitespace between elements). */
  const parts = (sel: string) => [...el.querySelectorAll(sel)].map((n) => [...n.children].map((c) => c.textContent?.replace(/\s+/g, ' ').trim()).filter(Boolean).join(' '));

  it('K173: the keys are the tour’s: Back from the first beat goes to the previous exhibit’s last (the water map); Esc returns to the hall', async () => {
    await shown();
    const shownBeats = quietBeats();
    const store = TestBed.inject(KioskStore);
    store.go('comp');
    store.back();
    await vi.waitFor(() => expect(store.scene()).toBe('maps'));
    expect(shownBeats).toEqual(['M2 back']);
    store.go('comp');
    store.escapeUp();
    expect(store.scene()).toBe('hall');
  });

  it('W21 (K161): before an ability is picked, a static intro says what a Companion does and where the story met it', async () => {
    await shown();
    const intro = () => [...el.querySelectorAll('.comp-intro p')].map((p) => p.textContent?.replace(/\s+/g, ' ').trim());
    expect(intro()).toEqual([
      'In discover mode, each of your maps has a Companion. It remembers what you find hard, and uses that to choose your daily dose and the ideas to march into next.',
      'The ideas in step 2 and the question in step 3 came from Pingu, your water map’s Companion. Here you watch the Companions do that work, and more: each one’s weakness analyser reads a marked test paper for weak spots. Win a hex and a Companion grows.',
    ]);
    expect(el.querySelector('.comp-intro')?.textContent).not.toMatch(/repeat/i);
    await TestBed.inject(KioskLanguage).setLang('zh');
    fixture.detectChanges();
    expect(intro()[0]).toBe('在探索模式里，你的每张地图都有一位学习伙伴。它会记住你觉得难的地方，并据此挑选你的每日一练和接下来可以进军的概念。');
    expect(intro()[1]).toContain('弱点分析器');
    (el.querySelector('[data-act="ability"][data-ab="quiz"]') as HTMLElement).click();
    fixture.detectChanges();
    expect(el.querySelector('.comp-intro')).toBeNull();
  });

  it('the roster: each Companion with its breed art and its own map', async () => {
    await shown();
    expect(text('.ex-head .crumb')).toBe('Explore · Companions');
    expect(text('.ex-head h2')).toBe('Companions at work');
    expect(parts('.cx-roster .cx-mate > span')).toEqual(['Pingu Singapore’s water', 'Nova City in Nature', 'Ember Hawker culture']);
    expect(el.querySelector('.cx-roster .cx-mate.on')?.textContent).toContain('Pingu');
    const art = [...el.querySelectorAll('.cx-roster chora-breed-art img')].map((i) => i.getAttribute('src'));
    expect(art).toEqual(['/assets/familiars/penguin/penguin-stage-1.png', '/assets/familiars/owl/owl-stage-2.png', '/assets/familiars/fox/fox-stage-3.png']);
  });

  it('the sheet: name, stage name, goal, the four tiles, the EXP bar as production shows it, and the march', async () => {
    await shown();
    expect(text('.cx-sheet__name')).toBe('Pingu');
    expect(parts('.cx-sheet__epithet')).toEqual(['Chick · AI companion']);
    expect(parts('.cx-sheet__goal')).toEqual(['Goal Singapore’s water']);
    expect(parts('.cx-tiles .cx-tile')).toEqual(['Stage 1', 'Mind Quick thinker', 'Total EXP 32', 'Abilities 1']);
    expect(text('.cx-exp__num')).toBe('32 / 50 EXP');
    expect((el.querySelector('.cx-bar__fill') as HTMLElement).style.width).toBe('64%');
    expect(el.querySelector('.cx-bar')?.getAttribute('aria-valuenow')).toBe('64');
    expect(text('.cx-focus__name')).toBe('Reservoirs');
    expect(el.querySelector('.cx-sheet__portrait chora-breed-art img')?.getAttribute('src')).toBe('/assets/familiars/penguin/penguin-stage-1.png');
  });

  it('on the right: production’s lens on the picked Companion’s map, its march and hexes won, and the pick prompt', async () => {
    await shown();
    expect(el.querySelector('#complens chora-aplus-concept-lens-map')).not.toBeNull();
    expect([...el.querySelectorAll('#complens .lens-node')].map((n) => n.getAttribute('data-id')).sort()).toEqual([`${IDS.water}-march`, `${IDS.water}-root`]);
    expect(parts('.comp-hud')).toEqual(['Pingu marches on Reservoirs 0 of 2 hexes won']);
    expect(text('.comp-pick')).toBe('Pick one of the four above to watch it work');
    (el.querySelectorAll('.cx-roster .cx-mate')[1] as HTMLElement).click();
    await settle();
    expect([...el.querySelectorAll('#complens .lens-node')].map((n) => n.getAttribute('data-id')).sort()).toEqual([`${IDS.nature}-march`, `${IDS.nature}-root`]);
    expect(parts('.comp-hud')).toEqual(['Nova marches on Smooth-coated otters 0 of 2 hexes won']);
  });

  it('with a drawer open the lens centres its focus in the strip the drawer leaves (a height-bound lens)', async () => {
    await shown();
    const lens = () => fixture.debugElement.query(By.directive(ConceptLensMapComponent)).componentInstance as ConceptLensMapComponent;
    expect(lens().shiftX()).toBe(0);
    void TestBed.inject(CompanionsExhibit).openQuiz();
    await settle();
    // The lens fits its 1000 by 585 viewBox to the 1004 by 483 box by height (scale 483/585), so its
    // centre sits at stage x 560 + 502 = 1062. The strip left of the drawer is 560 to 1084, centre 822:
    // a shift of -240 stage px, -240 / (483/585) = -290.68 lens units. (The old formula gave -182.7,
    // which left the focus about 89 px right of the strip's centre.)
    expect(lens().shiftX()).toBeCloseTo(-290.68, 2);
    // K202: the lens is told its box's real half-width, 1004 / (483/585) / 2 = 608.01 lens units, so its ring fit
    // takes the strip it really has.
    expect(lens().frameHalfX()).toBeCloseTo(608.01, 2);
  });

  it('picking another Companion shows its sheet', async () => {
    await shown();
    (el.querySelectorAll('.cx-roster .cx-mate')[2] as HTMLElement).click();
    await settle();
    expect(el.querySelector('.cx-roster .cx-mate.on')?.textContent).toContain('Ember');
    expect(text('.cx-sheet__name')).toBe('Ember');
    expect(parts('.cx-sheet__epithet')).toEqual(['Awakened Fox · AI companion']);
    expect(parts('.cx-tiles .cx-tile')).toEqual(['Stage 3', 'Mind Deep thinker', 'Total EXP 264', 'Abilities 3']);
    expect(text('.cx-focus__name')).toBe('UNESCO listing');
  });

  it('a fully grown Companion shows no EXP bar; a tier production does not name reads as production’s default', async () => {
    const grown = { ...GROWTH, [IDS.nova]: growth(IDS.nova, 'Nova', 'owl', 6, 3200, 200, 0, 'some-new-tier', ['a']) };
    TestBed.configureTestingModule({ providers: [...keepServedOrder(), provideHttpClient(), provideHttpClientTesting(), ...provideKioskI18n(), ...provideLive()] });
    http = TestBed.inject(HttpTestingController);
    await TestBed.inject(KioskLanguage).ready();
    fixture = TestBed.createComponent(CompanionsSceneComponent);
    el = fixture.nativeElement as HTMLElement;
    fixture.detectChanges();
    http.expectOne('/api/v1/kiosk/prewarm/manifest').flush(companionsManifest());
    for (const goal of [IDS.water, IDS.nature, IDS.hawker]) await vi.waitFor(() => http.expectOne(`/api/v1/me/maps/${goal}/graph`).flush(MAPS[goal]));
    for (const c of [IDS.pingu, IDS.nova, IDS.ember]) await vi.waitFor(() => http.expectOne(`/api/v1/me/companions/${c}/growth`).flush(grown[c]));
    await vi.waitFor(() => expect(TestBed.inject(CompanionsExhibit).status()).toBe('ready'));
    TestBed.inject(CompanionsExhibit).select(IDS.nova);
    TestBed.inject(CompanionsExhibit).select('not-a-companion');
    await settle();
    expect(text('.cx-sheet__name')).toBe('Nova');
    expect(text('.cx-matured')).toBe('Fully grown');
    expect(el.querySelector('.cx-exp')).toBeNull();
    expect(parts('.cx-tiles .cx-tile')[1]).toBe('Mind Quick thinker');
  });

  it('a map without its march concept is a loud failure', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    TestBed.configureTestingModule({ providers: [...keepServedOrder(), provideHttpClient(), provideHttpClientTesting(), ...provideKioskI18n(), ...provideLive()] });
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(CompanionsSceneComponent);
    fixture.detectChanges();
    http.expectOne('/api/v1/kiosk/prewarm/manifest').flush(companionsManifest());
    const noMarch = { ...MAPS[IDS.water], campaign: { ...MAPS[IDS.water].campaign, focusConceptId: 'gone' } };
    await vi.waitFor(() => http.expectOne(`/api/v1/me/maps/${IDS.water}/graph`).flush(noMarch));
    await vi.waitFor(() => expect(TestBed.inject(CompanionsExhibit).status()).toBe('failed'));
    expect(String(err.mock.calls[0][0])).toContain('holds no march concept gone');
    err.mockRestore();
  });

  it('lead 6b: a load that failed (a 502 while another browser’s reset ran) is tried again when the exhibit is opened again', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    TestBed.configureTestingModule({ providers: [...keepServedOrder(), provideHttpClient(), provideHttpClientTesting(), ...provideKioskI18n(), ...provideLive()] });
    http = TestBed.inject(HttpTestingController);
    await TestBed.inject(KioskLanguage).ready();
    const first = TestBed.createComponent(CompanionsSceneComponent);
    first.detectChanges();
    http.expectOne('/api/v1/kiosk/prewarm/manifest').flush({ error: { code: 'GATEWAY_UPSTREAM_5XX' } }, { status: 502, statusText: 'Bad Gateway' });
    await vi.waitFor(() => expect(TestBed.inject(CompanionsExhibit).status()).toBe('failed'));
    first.destroy();
    // Back in the hall, then Companions again: a fresh scene reads again, and this time the stack answers.
    fixture = TestBed.createComponent(CompanionsSceneComponent);
    el = fixture.nativeElement as HTMLElement;
    fixture.detectChanges();
    (await vi.waitFor(() => http.expectOne('/api/v1/kiosk/prewarm/manifest'))).flush(companionsManifest());
    for (const goal of [IDS.water, IDS.nature, IDS.hawker]) await vi.waitFor(() => http.expectOne(`/api/v1/me/maps/${goal}/graph`).flush(MAPS[goal] as object));
    for (const c of [IDS.pingu, IDS.nova, IDS.ember]) await vi.waitFor(() => http.expectOne(`/api/v1/me/companions/${c}/growth`).flush(GROWTH[c]));
    await vi.waitFor(() => expect(TestBed.inject(CompanionsExhibit).status()).toBe('ready'));
    err.mockRestore();
  });

  it('its footer is the tour’s, and its "Back to Explore" leads to the hall (K63, K173)', async () => {
    await shown();
    TestBed.inject(KioskStore).go('comp');
    const tpl = TestBed.inject(FooterSlot).template();
    expect(tpl).not.toBeNull();
    const view = tpl!.createEmbeddedView(null);
    view.detectChanges();
    const button = view.rootNodes.flatMap((n: Node) => (n instanceof HTMLElement ? [n, ...n.querySelectorAll('*')] : [])).find((n: Element) => n.getAttribute?.('data-act') === 'toHall') as HTMLElement;
    expect(button.textContent?.trim()).toBe('Back to Explore');
    button.click();
    expect(TestBed.inject(KioskStore).scene()).toBe('hall');
  });

  it('a map that names no Companion is a loud failure, never a guessed pairing', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    TestBed.configureTestingModule({ providers: [...keepServedOrder(), provideHttpClient(), provideHttpClientTesting(), ...provideKioskI18n(), ...provideLive()] });
    http = TestBed.inject(HttpTestingController);
    await TestBed.inject(KioskLanguage).ready();
    fixture = TestBed.createComponent(CompanionsSceneComponent);
    el = fixture.nativeElement as HTMLElement;
    fixture.detectChanges();
    http.expectOne('/api/v1/kiosk/prewarm/manifest').flush(companionsManifest());
    await vi.waitFor(() => http.expectOne(`/api/v1/me/maps/${IDS.water}/graph`).flush({ ...companionMap(IDS.water, 'W', '', '', 'R'), attachedCompanionId: undefined }));
    await vi.waitFor(() => expect(TestBed.inject(CompanionsExhibit).status()).toBe('failed'));
    for (const r of http.match(() => true)) r.flush({});
    await settle();
    expect(text('.comp-left .msg-error')).toBe('This step could not reach Chora. Please ask the presenter.');
    expect(err).toHaveBeenCalled();
    err.mockRestore();
  });
});
