import { NgTemplateOutlet } from '@angular/common';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Component, inject, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';

import { ConceptLensMapComponent } from '../../aplus/my-knowledge/concept-lens-map/concept-lens-map.component';
import { KioskLanguage, provideKioskI18n } from '../../i18n/i18n';
import { provideLive } from '../../live/live.providers';
import { LIVE_EXECUTORS, LiveAvailability, LiveService, type LiveOutcome } from '../../live/live.service';
import { FooterSlot } from '../../shell/footer-slot';
import { KioskStore } from '../../shell/kiosk.store';
import { provideTourBeats } from '../../shell/tour/tour-beats';
import { CompanionsExhibit, type CompanionGrew } from '../companions/companions-exhibit';
import { MapsDrawer } from './maps-drawer';
import { MapsExhibit } from './maps-exhibit';
import { MAPS_ZOOM_MS, MapsSceneComponent } from './maps-scene.component';
import { C, G, GOALS, PENDING, atlasManifest, card, hawker, nature, water } from './maps-world.testing';
import { VisitTally } from '../../shared/visit-tally';
import { OrderSource } from '../../shared/visit-order.testing';

@Component({
  imports: [MapsSceneComponent, NgTemplateOutlet],
  template: `<main id="scene"><kiosk-maps-scene /></main>
    <footer id="bottom">
      @if (footer(); as tpl) {
        <ng-container [ngTemplateOutlet]="tpl" />
      }
    </footer>`,
})
class HostComponent {
  protected readonly footer = inject(FooterSlot).template;
}

const isSugg = (goal: string) => (r: { url: string; params: { get(k: string): string | null } }) =>
  r.url === '/api/v1/me/concept-graph/suggestions' && r.params.get('goalId') === goal;
const SERVED = {
  status: 'ready',
  concept_id: 'w-res',
  rung: 6,
  questions: { candidates: [{ question_type: 'mcq', stem: 'Design a way to keep a reservoir clean.', options: [{ option_id: 'o-a', label: 'Fence it' }, { option_id: 'o-b', label: 'Protect its catchment' }] }] },
};
const graded = (correct: boolean, won: boolean) => ({
  correct,
  rung: 6,
  is_refresher: false,
  counted: true,
  cleared_rung: won ? 6 : 0,
  won,
  paced_today: false,
  rungs_cleared: won ? 6 : 5,
  current_rung_correct: correct && !won ? 2 : 1,
  needed_correct: 2,
  retention_r: 1,
  correct_option_id: 'o-b',
  explainer: 'A protected catchment keeps the water clean at its source.',
});
const WON_RES = { 'w-res': { rungsCleared: 6, currentRungCorrect: 0, wonAt: '2026-10-20T03:00:00Z', cooling: false, advancedToday: true } };

// The region's concept drawer (mockup conceptDrawerHTML, overviewTabHTML, terrainHTML, campLine,
// practiceHTML and answerMap, lines 4706 to 4825; K36, K42, K50, K135): Overview shows the idea's
// terrain, its campaign line, its ladder and either a prepared practice question or why there is none;
// "Practise today's dose" opens its Companion's dose. Practice serves only a set the golden run
// prepared; a right answer on the last rung wins the hex, and the EXP comes from the ledger.
describe('MapsSceneComponent (the concept drawer: Overview and practice)', () => {
  let http: HttpTestingController;
  let fixture: ComponentFixture<HostComponent>;
  let el: HTMLElement;
  let store: KioskStore;
  let grew: (g: CompanionGrew | null) => void;
  const companions = {
    status: signal<'idle' | 'ready'>('ready'),
    load: vi.fn(async () => undefined),
    creditWin: vi.fn(() => new Promise<CompanionGrew | null>((resolve) => (grew = resolve))),
    openDoseFor: vi.fn(async () => undefined),
  };

  async function settle(): Promise<void> {
    for (let i = 0; i < 4; i++) {
      await Promise.resolve();
      fixture.detectChanges();
    }
  }

  async function reads(maps: Record<string, unknown> = { [G.water]: water(), [G.nature]: nature(), [G.hawker]: hawker() }): Promise<void> {
    (await vi.waitFor(() => http.expectOne('/api/v1/me/maps'))).flush({ items: GOALS.map(card) });
    for (const g of GOALS) {
      (await vi.waitFor(() => http.expectOne(`/api/v1/me/maps/${g}/graph`))).flush(maps[g] as object);
      (await vi.waitFor(() => http.expectOne(isSugg(g)))).flush({ suggestions: PENDING[g] });
    }
    await settle();
  }

  /** The atlas read and the water region open. */
  async function inWater(): Promise<void> {
    fixture = TestBed.createComponent(HostComponent);
    el = fixture.nativeElement as HTMLElement;
    fixture.detectChanges();
    http.expectOne('/api/v1/kiosk/prewarm/manifest').flush(atlasManifest());
    await reads();
    await vi.waitFor(() => expect(TestBed.inject(MapsExhibit).status()).toBe('ready'));
    store.go('maps');
    vi.useFakeTimers();
    el.querySelector('svg.atlas > g.region')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await vi.advanceTimersByTimeAsync(MAPS_ZOOM_MS);
    vi.useRealTimers();
    await settle();
  }

  const order = new OrderSource();

  beforeEach(async () => {
    order.keep();
    companions.status.set('ready');
    companions.load.mockClear();
    companions.creditWin.mockClear();
    companions.openDoseFor.mockClear();
    TestBed.configureTestingModule({
      providers: [...order.providers, provideHttpClient(), provideHttpClientTesting(), ...provideKioskI18n(), ...provideLive(), { provide: CompanionsExhibit, useValue: companions }],
    });
    http = TestBed.inject(HttpTestingController);
    store = TestBed.inject(KioskStore);
    await TestBed.inject(KioskLanguage).ready();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    TestBed.inject(MapsExhibit).forget();
  });

  const text = (n: Element | null | undefined) => n?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
  const q = (sel: string) => el.querySelector(sel);
  const lens = () => fixture.debugElement.query(By.directive(ConceptLensMapComponent))?.componentInstance as ConceptLensMapComponent;
  const drawer = () => fixture.debugElement.query(By.directive(MapsSceneComponent)).injector.get(MapsDrawer);
  async function select(id: string): Promise<void> {
    lens().select.emit(id);
    await settle();
  }

  it('a click on an idea opens the drawer on Overview, the lens resting on it in the strip the drawer leaves', async () => {
    await inWater();
    expect(q('#panel')?.classList.contains('open')).toBe(false);
    await select('w-res');
    expect(q('#panel')?.classList.contains('open')).toBe(true);
    expect(text(q('#panel .kd-bar span'))).toBe('Concept details');
    expect(text(q('#panel .kd-title'))).toBe('Reservoirs');
    expect(q('#panel .kd-title')?.getAttribute('lang')).toBe('en');
    expect([...el.querySelectorAll('#panel .kd-tabs button')].map((b) => [text(b), b.classList.contains('on')])).toEqual([
      ['Overview', true],
      ['Suggestions', false],
    ]);
    expect(lens().focusId()).toBe('w-res');
    // (MAP_DRAWER_EDGE - MAP_BOX.x - MAP_BOX.w) / 2 at the lens's scale of 1: the focus mid-strip.
    expect(lens().shiftX()).toBe(-264);
    // K202: the lens is told its box's real half-width (1528 / 2 at a scale of 1), so with the drawer open
    // its ring fit takes the 492 lens units the strip really has, not 228.
    expect(lens().frameHalfX()).toBe(764);
    // K204: and of the caption card over its frame's top-left corner, which the ring keeps clear of.
    expect(lens().frameHalfY()).toBe(292.5);
    expect(lens().chrome()).toEqual({ w: 550, h: 70 });
  });

  it('the close button closes the drawer; K173 ruling (a): Back returns to the beat’s own view first, Esc to the hall', async () => {
    TestBed.runInInjectionContext(() => provideTourBeats());
    await inWater();
    await select('w-res');
    (q('#panel .kd-x') as HTMLButtonElement).click();
    await settle();
    expect(q('#panel')?.classList.contains('open')).toBe(false);
    expect(lens().shiftX()).toBe(0);
    // The water map was a free click from the atlas (M1): Back closes the drawer and the region at once.
    await select('w-res');
    store.back();
    await vi.waitFor(async () => {
      await settle();
      expect(q('svg.atlas')).not.toBeNull();
    });
    // By Next the water map is M2: Back closes the drawer and stays on it; Back again shows the atlas.
    store.next();
    await vi.waitFor(async () => {
      await settle();
      expect(q('svg.atlas')).toBeNull();
    });
    await select('w-res');
    store.back();
    await settle();
    expect(q('#panel')?.classList.contains('open')).toBe(false);
    expect(q('svg.atlas')).toBeNull();
    store.back();
    await vi.waitFor(async () => {
      await settle();
      expect(q('svg.atlas')).not.toBeNull();
    });
    store.escapeUp();
    expect(store.scene()).toBe('hall');
  });

  it('Overview of a climbing idea: Due alone (answer 3), the climb with its count, the ladder, a prepared question waiting', async () => {
    await inWater();
    await select('w-res');
    expect([...el.querySelectorAll('#panel .terrain span')].map((s) => [s.className, text(s)])).toEqual([['due', 'Due for review']]);
    expect(text(q('#panel .camp-line'))).toBe('Climbing: 5 of 6 rungs · next: Create · 1 of 2 correct on this rung');
    expect([...el.querySelectorAll('#panel .ladder .rungpill')].map((p) => p.className)).toEqual(['rungpill on', 'rungpill on', 'rungpill on', 'rungpill on', 'rungpill on', 'rungpill now']);
    expect(text(q('#panel .badge.ok'))).toBe('A question is ready for this idea');
    expect(text(q('#panel [data-act="practise"]'))).toBe('Practise this idea');
    expect(text(q('#panel .tier.t3 .stamp'))).toBe('Prepared 20 Oct, 13:40');
    expect(q('#panel .tier.t3 .stamp kiosk-prepared-info button[data-act="preparedInfo"]')).not.toBeNull();
    http.expectNone((r) => r.url.includes('/campaign/questions'));
  });

  it('Overview of a won idea: its win and the gated line, every rung lit; of the root: claimed and no question', async () => {
    await inWater();
    await select('w-newater');
    expect(text(q('#panel .camp-line'))).toBe('Won on 11 Oct, 10:00');
    expect([...el.querySelectorAll('#panel .ladder .rungpill.on')].length).toBe(6);
    expect(text(q('#panel .tier.t3 .gated'))).toBe('Won: nothing left to climb here.');
    expect(q('#panel [data-act="practise"]')).toBeNull();
    await select(`${G.water}-root`);
    expect(text(q('#panel .camp-line'))).toBe('Claimed: no rungs climbed yet');
    expect(text(q('#panel .terrain'))).toBe('Explore');
    expect(text(q('#panel .tier.t3 .gated'))).toBe('No prepared question for this idea in the demo.');
  });

  it('“Practise today’s dose” opens this map’s Companion on its dose, counted as a Companions visit', async () => {
    await inWater();
    await select('w-res');
    (q('#panel [data-act="doseFromMap"]') as HTMLButtonElement).click();
    expect(companions.openDoseFor).toHaveBeenCalledWith(C.pingu);
    expect(store.scene()).toBe('comp');
    expect(http.match('/api/v1/kiosk/visits').map((r) => (r.request.body as { event: string }).event)).toEqual(['comp']);
  });

  it('K149: the atlas drawer shows the options in this visit’s drawn order, and answers by the option clicked', async () => {
    order.drawFrom(7);
    await inWater();
    await select('w-res');
    (q('#panel [data-act="practise"]') as HTMLButtonElement).click();
    (await vi.waitFor(() => http.expectOne((r) => r.url === `/api/v1/me/goals/${G.water}/campaign/questions`))).flush(SERVED);
    await vi.waitFor(() => expect(drawer().practice().state).toBe('ready'));
    await settle();
    expect([...el.querySelectorAll('#panel .opts .opt')].map((o) => text(o))).toEqual(['AProtect its catchment', 'BFence it']);
    (el.querySelectorAll('#panel [data-act="mapAnswer"]')[0] as HTMLButtonElement).click();
    const post = await vi.waitFor(() => http.expectOne(`/api/v1/me/goals/${G.water}/campaign/questions/answer`));
    expect(post.request.body).toMatchObject({ selected_option_id: 'o-b' });
  });

  it('Practise serves the prepared set at its rung and shows its question; a wrong answer says so and wins nothing', async () => {
    await inWater();
    await select('w-res');
    (q('#panel [data-act="practise"]') as HTMLButtonElement).click();
    (await vi.waitFor(() => http.expectOne((r) => r.url === `/api/v1/me/goals/${G.water}/campaign/questions` && r.params.get('concept_id') === 'w-res' && r.params.get('rung') === '6'))).flush(SERVED);
    await vi.waitFor(() => expect(drawer().practice().state).toBe('ready'));
    await settle();
    expect(text(q('#panel .q-stem'))).toBe('Design a way to keep a reservoir clean.');
    expect([...el.querySelectorAll('#panel .opts .opt')].map((o) => text(o))).toEqual(['AFence it', 'BProtect its catchment']);
    (el.querySelectorAll('#panel [data-act="mapAnswer"]')[0] as HTMLButtonElement).click();
    const post = await vi.waitFor(() => http.expectOne(`/api/v1/me/goals/${G.water}/campaign/questions/answer`));
    expect(post.request.body).toEqual({ concept_id: 'w-res', rung: 6, question_index: 0, selected_option_id: 'o-a' });
    post.flush(graded(false, false));
    await vi.waitFor(() => expect(drawer().answer().state).toBe('done'));
    await settle();
    // A wrong answer is still an answer the product graded: the crews timeline counts it.
    expect(TestBed.inject(VisitTally).answers()).toBe(1);
    expect(q('#panel .verdict.no')).not.toBeNull();
    expect(q('#panel .won-banner')).toBeNull();
    expect(companions.creditWin).not.toHaveBeenCalled();
  });

  const badges = () => [...el.querySelectorAll('#panel .badges .badge')].map((b) => text(b));

  it('W54: the story’s two badges say who wrote and who checked the practice question, after it and its verdict as in step 3', async () => {
    await inWater();
    await select('w-res');
    // Overview: no question on screen, so nothing to badge.
    expect(q('#panel .badges')).toBeNull();
    (q('#panel [data-act="practise"]') as HTMLButtonElement).click();
    (await vi.waitFor(() => http.expectOne((r) => r.url === `/api/v1/me/goals/${G.water}/campaign/questions`))).flush(SERVED);
    await vi.waitFor(() => expect(drawer().practice().state).toBe('ready'));
    await settle();
    expect(badges()).toEqual(['Written for you by the writer AI', 'Checked by a second AI']);
    expect([...el.querySelectorAll('#panel .badges .badge kiosk-icon')].map((i) => i.getAttribute('name'))).toEqual(['pen', 'check']);
    expect(q('#panel .badges .badge:last-child')?.classList.contains('ok')).toBe(true);
    const lastOption = [...el.querySelectorAll('#panel .opts .opt')].at(-1) as Element;
    expect(lastOption.compareDocumentPosition(q('#panel .badges') as Element) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    (el.querySelectorAll('#panel [data-act="mapAnswer"]')[0] as HTMLButtonElement).click();
    (await vi.waitFor(() => http.expectOne(`/api/v1/me/goals/${G.water}/campaign/questions/answer`))).flush(graded(false, false));
    await vi.waitFor(() => expect(drawer().answer().state).toBe('done'));
    await settle();
    expect(badges()).toEqual(['Written for you by the writer AI', 'Checked by a second AI']);
    expect((q('#panel .verdict') as Element).compareDocumentPosition(q('#panel .badges') as Element) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // A LIVE press's fresh question comes from the same two AIs.
    drawer().onQOutcome('w-res', { status: 'done', kind: 'q', ms: 900, at: new Date(), result: { freshSetId: 'fs-1', rung: 6, questions: [{ stem: 'A fresh one?', options: [{ optionId: 'x', text: 'Yes' }, { optionId: 'y', text: 'No' }], sourceIndex: 0 }] } });
    await settle();
    expect(text(q('#panel .q-stem'))).toBe('A fresh one?');
    expect(badges()).toEqual(['Written for you by the writer AI', 'Checked by a second AI']);
  });

  it('W54: in Chinese the two badges read from the same keys as step 3 and the Companions quiz', async () => {
    await TestBed.inject(KioskLanguage).setLang('zh');
    await inWater();
    await select('w-res');
    (q('#panel [data-act="practise"]') as HTMLButtonElement).click();
    (await vi.waitFor(() => http.expectOne((r) => r.url === `/api/v1/me/goals/${G.water}/campaign/questions`))).flush(SERVED);
    await vi.waitFor(() => expect(drawer().practice().state).toBe('ready'));
    await settle();
    expect(badges()).toEqual(['由出题 AI 为你编写', '已由第二个 AI 审核']);
  });

  it('W54: a won idea serves no question, so it shows no badges', async () => {
    await inWater();
    await select('w-newater');
    expect(q('#panel [data-act="practise"]')).toBeNull();
    expect(q('#panel .badges')).toBeNull();
  });

  it('W12: the climbing line follows the graded answer, as the record does (K138 pass 4)', async () => {
    await inWater();
    await select('w-used');
    expect(text(q('#panel .camp-line'))).toBe('Climbing: 2 of 6 rungs · next: Apply');
    (q('#panel [data-act="practise"]') as HTMLButtonElement).click();
    (await vi.waitFor(() => http.expectOne((r) => r.url === `/api/v1/me/goals/${G.water}/campaign/questions` && r.params.get('concept_id') === 'w-used'))).flush({
      ...SERVED,
      concept_id: 'w-used',
      rung: 3,
    });
    await vi.waitFor(() => expect(drawer().practice().state).toBe('ready'));
    await settle();
    (el.querySelectorAll('#panel [data-act="mapAnswer"]')[1] as HTMLButtonElement).click();
    const right = { ...graded(true, false), rung: 3, rungs_cleared: 2, current_rung_correct: 1 };
    (await vi.waitFor(() => http.expectOne(`/api/v1/me/goals/${G.water}/campaign/questions/answer`))).flush(right);
    await vi.waitFor(() => expect(drawer().answer().state).toBe('done'));
    await settle();
    expect(text(q('#panel .camp-line'))).toBe('Climbing: 2 of 6 rungs · next: Apply · 1 of 2 correct on this rung');
    // A LIVE question replaces the answered one (K103), and closing and reopening the idea starts its practice
    // again: the climb stays the graded one until the maps are read again.
    drawer().onQOutcome('w-used', { status: 'done', kind: 'q', ms: 900, at: new Date(), result: { freshSetId: 'fs-1', rung: 3, questions: [{ stem: 'A fresh one?', options: [{ optionId: 'x', text: 'Yes' }, { optionId: 'y', text: 'No' }], sourceIndex: 0 }] } });
    await settle();
    expect(drawer().answer().state).toBe('none');
    expect(text(q('#panel .camp-line'))).toBe('Climbing: 2 of 6 rungs · next: Apply · 1 of 2 correct on this rung');
    await select('w-res');
    await select('w-used');
    expect(text(q('#panel .camp-line'))).toBe('Climbing: 2 of 6 rungs · next: Apply · 1 of 2 correct on this rung');
  });

  it('W12: an answer that clears a rung lights it on the ladder and names the next', async () => {
    await inWater();
    await select('w-used');
    (q('#panel [data-act="practise"]') as HTMLButtonElement).click();
    (await vi.waitFor(() => http.expectOne((r) => r.url === `/api/v1/me/goals/${G.water}/campaign/questions` && r.params.get('concept_id') === 'w-used'))).flush({
      ...SERVED,
      concept_id: 'w-used',
      rung: 3,
    });
    await vi.waitFor(() => expect(drawer().practice().state).toBe('ready'));
    await settle();
    (el.querySelectorAll('#panel [data-act="mapAnswer"]')[1] as HTMLButtonElement).click();
    const cleared = { ...graded(true, false), rung: 3, cleared_rung: 3, rungs_cleared: 3, current_rung_correct: 0 };
    (await vi.waitFor(() => http.expectOne(`/api/v1/me/goals/${G.water}/campaign/questions/answer`))).flush(cleared);
    await vi.waitFor(() => expect(drawer().answer().state).toBe('done'));
    await settle();
    expect(text(q('#panel .camp-line'))).toBe('Climbing: 3 of 6 rungs · next: Analyze');
    expect([...el.querySelectorAll('#panel .ladder .rungpill.on')].length).toBe(3);
    // The next read of the maps is the record again (this world's record still says 2 rungs).
    void TestBed.inject(MapsExhibit).enter();
    await reads();
    await select('w-used');
    expect(text(q('#panel .camp-line'))).toBe('Climbing: 2 of 6 rungs · next: Apply');
  });

  it('a right answer on the last rung wins the hex: the maps read again, the HUD unassigned, the EXP from the ledger (K135)', async () => {
    await inWater();
    await select('w-res');
    (q('#panel [data-act="practise"]') as HTMLButtonElement).click();
    (await vi.waitFor(() => http.expectOne((r) => r.url === `/api/v1/me/goals/${G.water}/campaign/questions`))).flush(SERVED);
    await vi.waitFor(() => expect(drawer().practice().state).toBe('ready'));
    await settle();
    (el.querySelectorAll('#panel [data-act="mapAnswer"]')[1] as HTMLButtonElement).click();
    (await vi.waitFor(() => http.expectOne(`/api/v1/me/goals/${G.water}/campaign/questions/answer`))).flush(graded(true, true));
    await reads({ [G.water]: water([], WON_RES), [G.nature]: nature(), [G.hawker]: hawker() });
    await vi.waitFor(() => expect(companions.creditWin).toHaveBeenCalledWith(C.pingu, 'Reservoirs'));
    await settle();
    expect(text(q('#panel .won-banner'))).toBe('Hex won!');
    expect(text(q('.camp-hud'))).toContain('Your companion awaits its marching orders');
    // The won answer stays on screen (mockup: practice shows while the visitor practised); no LIVE q on a won hex.
    expect(q('#panel .verdict.ok')).not.toBeNull();
    // W22 (a sibling of the Companions quiz): "Correct." then a space before the explanation.
    expect(text(q('#panel .verdict'))).toMatch(/^Correct\. \S/);
    expect(q('#panel [data-live^="q:"]')).toBeNull();
    grew({ gained: 33 } as CompanionGrew);
    await settle();
    expect(text(q('#panel .won-banner'))).toBe('Hex won! Pingu earns 33 EXP for this hex.');
  });

  it('a right answer refreshes a due idea, so Due leaves its terrain (mockup terrainHTML)', async () => {
    await inWater();
    await select('w-res');
    (q('#panel [data-act="practise"]') as HTMLButtonElement).click();
    (await vi.waitFor(() => http.expectOne((r) => r.url === `/api/v1/me/goals/${G.water}/campaign/questions`))).flush(SERVED);
    await vi.waitFor(() => expect(drawer().practice().state).toBe('ready'));
    await settle();
    (el.querySelectorAll('#panel [data-act="mapAnswer"]')[1] as HTMLButtonElement).click();
    (await vi.waitFor(() => http.expectOne(`/api/v1/me/goals/${G.water}/campaign/questions/answer`))).flush(graded(true, false));
    await vi.waitFor(() => expect(drawer().answer().state).toBe('done'));
    await settle();
    expect(text(q('#panel .terrain'))).toBe('Explore');
  });

  it('practice first makes sure the Companions are read, so a win’s EXP can be told apart', async () => {
    companions.status.set('idle');
    await inWater();
    await select('w-res');
    (q('#panel [data-act="practise"]') as HTMLButtonElement).click();
    expect(companions.load).toHaveBeenCalled();
    (await vi.waitFor(() => http.expectOne((r) => r.url === `/api/v1/me/goals/${G.water}/campaign/questions`))).flush(SERVED);
    await vi.waitFor(() => expect(drawer().practice().state).toBe('ready'));
  });

  it('a serve that is not ready fails loud and shows no question (K50: it would have generated)', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await inWater();
    await select('w-res');
    (q('#panel [data-act="practise"]') as HTMLButtonElement).click();
    (await vi.waitFor(() => http.expectOne((r) => r.url === `/api/v1/me/goals/${G.water}/campaign/questions`))).flush({ status: 'requested' });
    await vi.waitFor(() => expect(drawer().practice().state).toBe('failed'));
    await settle();
    expect(text(q('#panel .msg-error'))).toBe('This step could not reach Chora. Please ask the presenter.');
    expect(String(err.mock.calls.at(-1)?.[0])).toContain('answered requested');
  });

  it('a LIVE q press replaces the question with its fresh set, answered against that set (K103)', async () => {
    await inWater();
    await select('w-res');
    (q('#panel [data-act="practise"]') as HTMLButtonElement).click();
    (await vi.waitFor(() => http.expectOne((r) => r.url === `/api/v1/me/goals/${G.water}/campaign/questions`))).flush(SERVED);
    await vi.waitFor(() => expect(drawer().practice().state).toBe('ready'));
    await settle();
    expect(q('#panel [data-live="q:water:w-res"]')).not.toBeNull();
    drawer().onQOutcome('w-res', { status: 'done', kind: 'q', ms: 900, at: new Date(), result: { freshSetId: 'fs-1', rung: 6, questions: [{ stem: 'A fresh one?', options: [{ optionId: 'x', text: 'Yes' }, { optionId: 'y', text: 'No' }], sourceIndex: 0 }] } });
    await settle();
    expect(text(q('#panel .q-stem'))).toBe('A fresh one?');
    (el.querySelectorAll('#panel [data-act="mapAnswer"]')[0] as HTMLButtonElement).click();
    const post = await vi.waitFor(() => http.expectOne(`/api/v1/me/goals/${G.water}/campaign/questions/answer`));
    expect(post.request.body).toEqual({ concept_id: 'w-res', rung: 6, question_index: 0, selected_option_id: 'x', fresh_set_id: 'fs-1' });
  });

  // K218 (W96): a hex won takes no more questions, so a LIVE question still being written when it is won is
  // dropped and never shown; one that ends while the answer is being graded waits for the grade.
  describe('K218: a LIVE question that ends after the win', () => {
    const LATE: LiveOutcome = { status: 'done', kind: 'q', ms: 900, at: new Date(), result: { freshSetId: 'fs-late', rung: 6, questions: [{ stem: 'A late one?', options: [{ optionId: 'x', text: 'Yes' }, { optionId: 'y', text: 'No' }], sourceIndex: 0 }] } };

    async function practiseRes(): Promise<string> {
      await inWater();
      await select('w-res');
      (q('#panel [data-act="practise"]') as HTMLButtonElement).click();
      (await vi.waitFor(() => http.expectOne((r) => r.url === `/api/v1/me/goals/${G.water}/campaign/questions`))).flush(SERVED);
      await vi.waitFor(() => expect(drawer().practice().state).toBe('ready'));
      await settle();
      return text(q('#panel .q-stem'));
    }

    it('is dropped once the hex is won: the won question and its verdict stay', async () => {
      const stem = await practiseRes();
      (el.querySelectorAll('#panel [data-act="mapAnswer"]')[1] as HTMLButtonElement).click();
      (await vi.waitFor(() => http.expectOne(`/api/v1/me/goals/${G.water}/campaign/questions/answer`))).flush(graded(true, true));
      await reads({ [G.water]: water([], WON_RES), [G.nature]: nature(), [G.hawker]: hawker() });
      await vi.waitFor(() => expect(companions.creditWin).toHaveBeenCalled());
      grew({ gained: 33 } as CompanionGrew);
      await settle();
      drawer().onQOutcome('w-res', LATE);
      await settle();
      expect(text(q('#panel .q-stem'))).toBe(stem);
      expect(q('#panel .verdict.ok')).not.toBeNull();
      expect(drawer().answer().state).toBe('done');
      expect(drawer().practice()).not.toHaveProperty('freshSetId');
    });

    it('ending while the answer is graded, it waits: a winning grade drops it', async () => {
      const stem = await practiseRes();
      (el.querySelectorAll('#panel [data-act="mapAnswer"]')[1] as HTMLButtonElement).click();
      const post = await vi.waitFor(() => http.expectOne(`/api/v1/me/goals/${G.water}/campaign/questions/answer`));
      drawer().onQOutcome('w-res', LATE);
      await settle();
      expect(drawer().answer().state).toBe('checking');
      expect(text(q('#panel .q-stem'))).toBe(stem);
      post.flush(graded(true, true));
      await reads({ [G.water]: water([], WON_RES), [G.nature]: nature(), [G.hawker]: hawker() });
      await vi.waitFor(() => expect(companions.creditWin).toHaveBeenCalled());
      grew({ gained: 33 } as CompanionGrew);
      await settle();
      expect(text(q('#panel .q-stem'))).toBe(stem);
      expect(q('#panel .verdict.ok')).not.toBeNull();
      expect(drawer().practice()).not.toHaveProperty('freshSetId');
    });

    it('ending while the answer is graded, it waits: a grade that wins nothing then shows it, as a press after a miss does (K103)', async () => {
      await practiseRes();
      (el.querySelectorAll('#panel [data-act="mapAnswer"]')[0] as HTMLButtonElement).click();
      const post = await vi.waitFor(() => http.expectOne(`/api/v1/me/goals/${G.water}/campaign/questions/answer`));
      drawer().onQOutcome('w-res', LATE);
      post.flush(graded(false, false));
      await vi.waitFor(() => expect(text(q('#panel .q-stem'))).toBe('A late one?'));
      expect(drawer().answer().state).toBe('none');
      expect(drawer().practice()).toMatchObject({ freshSetId: 'fs-late' });
    });
  });

  // W79: the outcome comes from the one LIVE door, so a question written after the drawer was closed (its
  // row destroyed with it) still shows when the idea is practised again, and is graded against its set.
  describe('W79: a LIVE question written after the drawer was closed', () => {
    let answer: ((r: unknown) => void) | undefined;
    beforeEach(async () => {
      TestBed.resetTestingModule();
      answer = undefined;
      TestBed.configureTestingModule({
        providers: [
          ...order.providers,
          provideHttpClient(),
          provideHttpClientTesting(),
          ...provideKioskI18n(),
          ...provideLive(),
          { provide: CompanionsExhibit, useValue: companions },
          { provide: LIVE_EXECUTORS, useValue: { q: { run: () => new Promise((resolve) => (answer = resolve)) } } },
          { provide: LiveAvailability, useValue: { text: signal(true).asReadonly(), picture: signal(true).asReadonly(), reader: signal(true).asReadonly() } },
        ],
      });
      http = TestBed.inject(HttpTestingController);
      store = TestBed.inject(KioskStore);
      await TestBed.inject(KioskLanguage).ready();
    });

    it('shows in place of the prepared one when the idea is practised again, and its answer names the fresh set', async () => {
      await inWater();
      await select('w-res');
      (q('#panel [data-act="practise"]') as HTMLButtonElement).click();
      (await vi.waitFor(() => http.expectOne((r) => r.url === `/api/v1/me/goals/${G.water}/campaign/questions`))).flush(SERVED);
      await vi.waitFor(() => expect(drawer().practice().state).toBe('ready'));
      await settle();
      (q('#panel kiosk-live-row [data-act="live"]') as HTMLButtonElement).click();
      await vi.waitFor(() => expect(answer).toBeTypeOf('function'));
      (q('#panel [data-act="closeConcept"]') as HTMLButtonElement).click();
      await settle();
      expect(q('#panel .q-stem')).toBeNull();
      const options = [{ optionId: 'x', text: 'Yes' }, { optionId: 'y', text: 'No' }];
      answer?.({ freshSetId: 'fs-1', conceptId: 'w-res', conceptKey: 'reservoirs', rung: 6, questions: [{ stem: 'A fresh one?', options, sourceIndex: 0 }], traceId: null, trace: null, critic: null });
      await vi.waitFor(() => expect(TestBed.inject(LiveService).state('q:water:w-res')()?.status).toBe('done'));
      await select('w-res');
      (q('#panel [data-act="practise"]') as HTMLButtonElement).click();
      await vi.waitFor(() => expect(drawer().practice().state).toBe('ready'));
      await settle();
      http.expectNone((r) => r.url === `/api/v1/me/goals/${G.water}/campaign/questions`);
      expect(text(q('#panel .q-stem'))).toBe('A fresh one?');
      (el.querySelectorAll('#panel [data-act="mapAnswer"]')[0] as HTMLButtonElement).click();
      const post = await vi.waitFor(() => http.expectOne(`/api/v1/me/goals/${G.water}/campaign/questions/answer`));
      expect(post.request.body).toMatchObject({ concept_id: 'w-res', rung: 6, selected_option_id: 'x', fresh_set_id: 'fs-1' });
    });
  });
});
