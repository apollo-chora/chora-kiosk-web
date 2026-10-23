import { NgTemplateOutlet } from '@angular/common';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Component, inject, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';

import { ConceptLensMapComponent } from '../../aplus/my-knowledge/concept-lens-map/concept-lens-map.component';
import { KioskLanguage, provideKioskI18n } from '../../i18n/i18n';
import type { PrewarmManifestWire } from '../../kiosk-api/manifest.service';
import { provideLive } from '../../live/live.providers';
import { LIVE_EXECUTORS, LiveAvailability, LiveService, type LiveExecutor, type LiveOutcome } from '../../live/live.service';
import { ReadinessService } from '../../kiosk-api/readiness.service';
import { readinessExample } from '../../kiosk-api/readiness.testing';
import { VisitDecisions } from '../../shared/sugg/visit-decisions';
import { FooterSlot } from '../../shell/footer-slot';
import { CompanionsExhibit, type CompanionGrew } from '../companions/companions-exhibit';
import { MapsDrawer } from './maps-drawer';
import { MapsExhibit } from './maps-exhibit';
import { MAPS_ZOOM_MS, MapsSceneComponent } from './maps-scene.component';
import { G, GOALS, PENDING, atlasManifest, card, hawker, nature, pending, water } from './maps-world.testing';
import { keepServedOrder } from '../../shared/visit-order.testing';

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
const MISSED: LiveOutcome = { status: 'missed', kind: 'sugg', reason: 'late', ms: 20000 };
const WON_RES = { 'w-res': { rungsCleared: 6, currentRungCorrect: 0, wonAt: '2026-10-20T03:00:00Z', cooling: false, advancedToday: true } };
const ROOT = `${G.water}-root`;
/** A LIVE fresh-ideas press's answer: these ideas (K42), or an empty run (K157). */
const answered = (suggestions: readonly object[]) => async () => ({ status: 'ready', requestId: 'r', suggestions });

// The concept drawer's Suggestions tab (mockup suggTabHTML and suggListHTML, lines 4738 to 4755; K42,
// K64, K139; the orchestrator's answers of 18 Oct; K189 (2) and its reading R1; K186; K190): the
// root carries the LIVE fresh-ideas row and nothing else until it has ideas (ruled 18 Oct, 22:12,
// over the mockup's kd.sugg.root); an idea not won says suggestions grow only from won ideas; a won
// idea shows ONE list of its waiting ideas, the fresh ones at the top (a LIVE press's tagged LIVE),
// then its Companion's prepared batch, to Add or Dismiss, with the LIVE row under it; an added or
// dismissed idea leaves the list, and a link is never a row. An emptied list says so, never a
// prepared stamp over nothing. A LIVE press that misses lists the idea's own hidden batch (K64); one
// that lands spends the idea's button for the demo session, on every exhibit (K186).
describe('MapsSceneComponent (the concept drawer: Suggestions)', () => {
  let http: HttpTestingController;
  let fixture: ComponentFixture<HostComponent>;
  let el: HTMLElement;
  let suggRun: () => Promise<unknown>;
  const companions = {
    status: signal<'idle' | 'ready'>('ready'),
    load: vi.fn(async () => undefined),
    creditWin: vi.fn(async () => ({ gained: 33 }) as CompanionGrew),
    openDoseFor: vi.fn(async () => undefined),
  };

  async function settle(): Promise<void> {
    for (let i = 0; i < 4; i++) {
      await Promise.resolve();
      fixture.detectChanges();
    }
  }

  async function reads(maps: Record<string, unknown> = { [G.water]: water(), [G.nature]: nature(), [G.hawker]: hawker() }, waiting = PENDING): Promise<void> {
    (await vi.waitFor(() => http.expectOne('/api/v1/me/maps'))).flush({ items: GOALS.map(card) });
    for (const g of GOALS) {
      (await vi.waitFor(() => http.expectOne(`/api/v1/me/maps/${g}/graph`))).flush(maps[g] as object);
      (await vi.waitFor(() => http.expectOne(isSugg(g)))).flush({ suggestions: waiting[g] });
    }
    await settle();
  }

  /** The atlas read and the region `i` open (0 water, 2 hawker). */
  async function inRegion(i = 0, manifest: PrewarmManifestWire = atlasManifest(), maps?: Record<string, unknown>, waiting = PENDING): Promise<void> {
    fixture = TestBed.createComponent(HostComponent);
    el = fixture.nativeElement as HTMLElement;
    fixture.detectChanges();
    http.expectOne('/api/v1/kiosk/prewarm/manifest').flush(manifest);
    await reads(maps, waiting);
    await vi.waitFor(() => expect(TestBed.inject(MapsExhibit).status()).toBe('ready'));
    vi.useFakeTimers();
    el.querySelectorAll('svg.atlas > g.region')[i]?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await vi.advanceTimersByTimeAsync(MAPS_ZOOM_MS);
    vi.useRealTimers();
    await settle();
  }

  beforeEach(async () => {
    suggRun = () => Promise.reject(new Error('this test set no LIVE answer'));
    const sugg: LiveExecutor = { run: () => suggRun() };
    TestBed.configureTestingModule({
      providers: [
        ...keepServedOrder(),
        provideHttpClient(),
        provideHttpClientTesting(),
        ...provideKioskI18n(),
        ...provideLive(),
        { provide: LIVE_EXECUTORS, useValue: { sugg } },
        { provide: LiveAvailability, useValue: { text: signal(true).asReadonly(), picture: signal(true).asReadonly(), reader: signal(true).asReadonly() } },
        { provide: CompanionsExhibit, useValue: companions },
      ],
    });
    http = TestBed.inject(HttpTestingController);
    await TestBed.inject(KioskLanguage).ready();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    TestBed.inject(MapsExhibit).forget();
    TestBed.inject(VisitDecisions).forget();
  });

  const text = (n: Element | null | undefined) => n?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
  const q = (sel: string) => el.querySelector(sel);
  const all = (sel: string) => [...el.querySelectorAll(sel)];
  const lens = () => fixture.debugElement.query(By.directive(ConceptLensMapComponent))?.componentInstance as ConceptLensMapComponent;
  const drawer = () => fixture.debugElement.query(By.directive(MapsSceneComponent)).injector.get(MapsDrawer);
  const titles = (sel = '#panel') => all(`${sel} .sugg-row bdi`).map((b) => text(b));
  const stamps = () => all('#panel kiosk-live-row .stamp').map((s) => text(s));
  /** The rows as the visitor reads them: the title, the LIVE tag, and why it cannot be added (or nothing). */
  const rows = () => all('#panel .sugg-row').map((r) => [text(r.querySelector('bdi')), !!r.querySelector('.sugg-live'), text(r.querySelector('.sugg-state'))]);
  async function suggTab(id: string): Promise<void> {
    lens().select.emit(id);
    await settle();
    (q('#panel [data-act="kdtab"][data-tab="sugg"]') as HTMLButtonElement).click();
    await settle();
  }
  /** Presses the open idea's LIVE fresh-ideas button and waits for the press to end. */
  async function pressLive(scope = '#panel'): Promise<void> {
    (q(`${scope} kiosk-live-row [data-act="live"]`) as HTMLButtonElement).click();
    expect(TestBed.inject(LiveService).busy()).not.toBeNull();
    await vi.waitFor(() => expect(TestBed.inject(LiveService).busy()).toBeNull());
    await settle();
  }
  async function decideFirst(act: string, id: string, status: 'accepted' | 'dismissed', maps?: Record<string, unknown>, waiting = PENDING): Promise<void> {
    (q(`#panel [data-act="${act}"]`) as HTMLButtonElement).click();
    (await vi.waitFor(() => http.expectOne(`/api/v1/me/concept-graph/suggestions/${id}/${status === 'accepted' ? 'accept' : 'dismiss'}`))).flush({ suggestionId: id, status });
    await reads(maps, waiting);
    // The drawer holds every button off until its re-read is done.
    await vi.waitFor(() => expect(drawer().busy()).toBe(false));
    await settle();
  }
  const without = (...ids: string[]) => ({ ...PENDING, [G.water]: PENDING[G.water].filter((s) => !ids.includes(s.suggestionId)) });
  const waterWith = (...nodes: { id: string; title: string; under: string }[]) => ({ [G.water]: water(nodes), [G.nature]: nature(), [G.hawker]: hawker() });

  it('the root carries the LIVE fresh-ideas row and nothing else, no prepared stamp over nothing; a missed press lists its hidden batch under that batch’s own time, and Try again lands on top', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    // The root's hidden batch at its own time, apart from every other batch's (13:33).
    const manifest = atlasManifest();
    (manifest.choices['fresh.water.root'] as { prepared_at: string }).prepared_at = '2026-10-20T05:33:40Z';
    await inRegion(0, manifest);
    await suggTab(ROOT);
    expect(text(q('#panel .kd-tabs button.on'))).toBe('Suggestions');
    expect(q('#panel .gated')).toBeNull();
    expect(text(q('#panel .kd-body'))).not.toContain('The root is the goal itself');
    expect(q('#panel kiosk-live-row .live-row')?.getAttribute('data-live')).toBe(`sugg:water:${ROOT}`);
    expect(text(q('#panel .live-btn .live-label'))).toBe('Ask Pingu for fresh ideas');
    // Condition (a): no list stands above the row, so no prepared stamp stands over nothing (its hidden batch waits behind it, K64).
    expect(stamps()).toEqual([]);
    suggRun = () => Promise.reject(new Error('explorer failed'));
    await pressLive();
    // Gap (b): the batch shown in place of the live one carries its own prepared time.
    expect(stamps()).toEqual(['Showing the prepared result: the live call failed', 'Prepared 20 Oct, 13:33']);
    // R1: one list, no group head; the hidden batch's ideas are prepared, never tagged LIVE.
    expect(q('#panel .sugg-fresh')).toBeNull();
    expect(text(q('#panel .kd-sub'))).toBe('Pingu suggests');
    expect(rows()).toEqual([['Rainfall patterns', false, '']]);
    // K189: a missed call offers Try again until one lands; its ideas join the top. Only the hidden batch's ideas
    // are prepared now, so the done row's prepared stamp is that batch's time.
    expect(text(q('#panel .live-btn .live-label'))).toBe('Try again');
    suggRun = answered([pending('s-tide', 'Tidal reservoirs', ROOT)]);
    await pressLive();
    expect(rows()).toEqual([
      ['Tidal reservoirs', true, ''],
      ['Rainfall patterns', false, ''],
    ]);
    expect(stamps()).toEqual(['Prepared 20 Oct, 13:33', 'Live, just now']);
    expect(q('#panel kiosk-live-row [data-act="live"]')).toBeNull();
  });

  it('gap (b): a won idea’s missed press stamps its list (the shown batch, 13:31), the miss, then the hidden batch it shows (13:32); once a live result lands, the shown batch’s time while its ideas remain, else the hidden one’s', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await inRegion();
    await suggTab('w-desal');
    suggRun = () => Promise.reject(new Error('explorer failed'));
    await pressLive();
    expect(stamps()).toEqual(['Prepared 20 Oct, 13:31', 'Showing the prepared result: the live call failed', 'Prepared 20 Oct, 13:32']);
    expect(rows()).toEqual([
      ['Brine discharge', false, ''],
      ['Reverse osmosis', false, ''],
      ['Seawater intake', false, ''],
    ]);
    suggRun = answered([pending('s-new', 'Membrane cleaning', 'w-desal')]);
    await pressLive();
    expect(rows().map((r) => r[0])).toEqual(['Membrane cleaning', 'Brine discharge', 'Reverse osmosis', 'Seawater intake']);
    expect(stamps()).toEqual(['Prepared 20 Oct, 13:31', 'Live, just now']);
    await decideFirst('suggDismiss', 's-ro', 'dismissed', undefined, without('s-ro'));
    await decideFirst('suggDismiss', 's-intake', 'dismissed', undefined, without('s-ro', 's-intake'));
    expect(rows()).toEqual([
      ['Membrane cleaning', true, ''],
      ['Brine discharge', false, ''],
    ]);
    expect(stamps()).toEqual(['Prepared 20 Oct, 13:32', 'Live, just now']);
  });

  it('an idea not won yet: suggestions grow only from won ideas', async () => {
    await inRegion();
    await suggTab('w-res');
    expect(text(q('#panel .gated'))).toBe('Win this idea first: suggestions grow only from won ideas.');
    expect(q('#panel kiosk-live-row')).toBeNull();
  });

  it('a won idea lists its Companion’s prepared batch to Add or Dismiss, with the LIVE row; Add is real, re-reads the map, and the added idea leaves the list', async () => {
    await inRegion();
    await suggTab('w-desal');
    expect(text(q('#panel .kd-sub'))).toBe('Pingu suggests');
    expect(titles()).toEqual(['Reverse osmosis', 'Seawater intake']);
    expect(q('#panel kiosk-live-row .live-row')?.getAttribute('data-live')).toBe('sugg:water:w-desal');
    // K138 W13: the stamp under the batch is the batch's own (K101), never its hidden fallback's (13:32).
    expect(stamps()).toEqual(['Prepared 20 Oct, 13:31']);
    await decideFirst('suggAccept', 's-ro', 'accepted', waterWith({ id: 'w-ro', title: 'Reverse osmosis', under: 'w-desal' }), without('s-ro'));
    expect(rows()).toEqual([['Seawater intake', false, '']]);
    expect(text(q('#panel'))).not.toContain('Added');
    expect(TestBed.inject(VisitDecisions).all().get('s-ro')?.state).toBe('added');
    // A prepared idea is still in the list, so its stamp still tells the truth.
    expect(stamps()).toEqual(['Prepared 20 Oct, 13:31']);
  });

  it('K189 (2), the owner’s example on an atlas idea: six waiting, Add one leaves five, a LIVE press of two shows seven, the two fresh ones first and tagged LIVE', async () => {
    const more = ['Membrane fouling', 'Energy recovery', 'Brine reuse', 'Pre-treatment'].map((t, i) => pending(`s-p${i + 3}`, t, 'w-desal'));
    const manifest = atlasManifest();
    (manifest.choices['sugg.water.desal'].records as { suggestion_ids: string[] }).suggestion_ids = ['s-ro', 's-intake', ...more.map((s) => s.suggestionId)];
    const waiting = { ...PENDING, [G.water]: [...PENDING[G.water], ...more] };
    await inRegion(0, manifest, undefined, waiting);
    await suggTab('w-desal');
    expect(titles()).toEqual(['Reverse osmosis', 'Seawater intake', 'Membrane fouling', 'Energy recovery', 'Brine reuse', 'Pre-treatment']);
    await decideFirst('suggAccept', 's-ro', 'accepted', waterWith({ id: 'w-ro', title: 'Reverse osmosis', under: 'w-desal' }), { ...waiting, [G.water]: waiting[G.water].filter((s) => s.suggestionId !== 's-ro') });
    expect(titles()).toEqual(['Seawater intake', 'Membrane fouling', 'Energy recovery', 'Brine reuse', 'Pre-treatment']);
    suggRun = answered([pending('s-f1', 'Solar desalination', 'w-desal'), pending('s-f2', 'Brine mining', 'w-desal')]);
    await pressLive();
    expect(rows()).toEqual([
      ['Solar desalination', true, ''],
      ['Brine mining', true, ''],
      ['Seawater intake', false, ''],
      ['Membrane fouling', false, ''],
      ['Energy recovery', false, ''],
      ['Brine reuse', false, ''],
      ['Pre-treatment', false, ''],
    ]);
    // R1: one list: no "Fresh ideas from" head, no folded earlier ideas.
    expect(q('#panel .sugg-fresh')).toBeNull();
    expect(q('#panel .sugg-earlier')).toBeNull();
    expect(all('#panel .kd-sub').map((s) => text(s))).toEqual(['Pingu suggests']);
    expect(all('#panel .sugg-row')[0].querySelector('[data-act="freshAccept"]')).not.toBeNull();
    expect(all('#panel .sugg-row')[2].querySelector('[data-act="suggAccept"]')).not.toBeNull();
    // The stamp line: the prepared ideas left in the list, then the live ones; K186: no "Do it again".
    expect(stamps()).toEqual(['Prepared 20 Oct, 13:31', 'Live, just now']);
    expect(q('#panel kiosk-live-row [data-act="live"]')).toBeNull();
  });

  // Gap (a), as in Companions: the press's outcome comes from the one LIVE door, so a drawer closed mid-call
  // (its row destroyed with it) still gets that press's ideas, or its fallback, for the scene.
  describe('gap (a): a press answered after its drawer has closed', () => {
    async function pressThenClose(): Promise<(r: unknown) => void> {
      let settleCall!: (r: unknown) => void;
      let failCall!: (e: Error) => void;
      suggRun = () => new Promise((resolve, reject) => ((settleCall = resolve), (failCall = reject)));
      (q('#panel kiosk-live-row [data-act="live"]') as HTMLButtonElement).click();
      await vi.waitFor(() => expect(settleCall).toBeTypeOf('function'));
      (q('#panel [data-act="closeConcept"]') as HTMLButtonElement).click();
      await settle();
      expect(q('#panel kiosk-live-row')).toBeNull();
      return (r) => (r instanceof Error ? failCall(r) : settleCall(r));
    }

    it('lists its ideas at the top when the idea opens again', async () => {
      await inRegion();
      await suggTab('w-desal');
      const answer = await pressThenClose();
      answer({ status: 'ready', requestId: 'r', suggestions: [pending('s-new', 'Membrane cleaning', 'w-desal')] });
      await vi.waitFor(() => expect(TestBed.inject(LiveService).state('sugg:water:w-desal')()?.status).toBe('done'));
      await suggTab('w-desal');
      expect(rows()).toEqual([
        ['Membrane cleaning', true, ''],
        ['Reverse osmosis', false, ''],
        ['Seawater intake', false, ''],
      ]);
      expect(stamps()).toEqual(['Prepared 20 Oct, 13:31', 'Live, just now']);
    });

    it('a miss lists its hidden batch, under that batch’s own time, when the idea opens again', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => undefined);
      await inRegion();
      await suggTab('w-desal');
      const answer = await pressThenClose();
      answer(new Error('explorer failed'));
      await vi.waitFor(() => expect(TestBed.inject(LiveService).state('sugg:water:w-desal')()?.status).toBe('missed'));
      await suggTab('w-desal');
      expect(rows().map((r) => r[0])).toEqual(['Brine discharge', 'Reverse osmosis', 'Seawater intake']);
      expect(stamps()).toEqual(['Prepared 20 Oct, 13:31', 'Showing the prepared result: the live call failed', 'Prepared 20 Oct, 13:32']);
    });
  });

  it('a fresh idea Add takes from the top of the list is real, and it leaves the list', async () => {
    await inRegion();
    await suggTab('w-desal');
    suggRun = answered([pending('s-new', 'Membrane cleaning', 'w-desal')]);
    await pressLive();
    expect(titles()).toEqual(['Membrane cleaning', 'Reverse osmosis', 'Seawater intake']);
    (q('#panel [data-act="freshAccept"]') as HTMLButtonElement).click();
    (await vi.waitFor(() => http.expectOne('/api/v1/me/concept-graph/suggestions/s-new/accept'))).flush({ suggestionId: 's-new', status: 'accepted' });
    await reads(waterWith({ id: 'w-mc', title: 'Membrane cleaning', under: 'w-desal' }));
    expect(titles()).toEqual(['Reverse osmosis', 'Seawater intake']);
    expect(TestBed.inject(VisitDecisions).all().get('s-new')?.state).toBe('added');
  });

  it('Dismiss is real and the dismissed idea leaves the list, fresh or prepared; dismissed to empty, it says none wait, with no stamp over nothing', async () => {
    await inRegion();
    await suggTab('w-desal');
    suggRun = answered([pending('s-new', 'Membrane cleaning', 'w-desal')]);
    await pressLive();
    expect(text(q('#panel .sugg-row .sugg-live'))).toBe('LIVE');
    await decideFirst('freshDismiss', 's-new', 'dismissed');
    expect(titles()).toEqual(['Reverse osmosis', 'Seawater intake']);
    expect(text(q('#panel'))).not.toContain('Dismissed');
    expect(TestBed.inject(VisitDecisions).all().get('s-new')?.state).toBe('dropped');
    await decideFirst('suggDismiss', 's-ro', 'dismissed', undefined, without('s-ro'));
    await decideFirst('suggDismiss', 's-intake', 'dismissed', undefined, without('s-ro', 's-intake'));
    expect(q('#panel .sugg-row')).toBeNull();
    expect(q('#panel .kd-sub')).toBeNull();
    expect(text(q('#panel .gated.sugg-emptied'))).toBe('Pingu has no suggestions waiting here.');
    // Condition (a): no prepared stamp over an empty list; the live press keeps its own line.
    expect(stamps()).toEqual(['Live, just now']);
  });

  it('condition (a): a list emptied by Add says plainly its ideas are on the map, never a prepared stamp over nothing', async () => {
    await inRegion();
    await suggTab('w-desal');
    await decideFirst('suggAccept', 's-ro', 'accepted', waterWith({ id: 'w-ro', title: 'Reverse osmosis', under: 'w-desal' }), without('s-ro'));
    await decideFirst(
      'suggAccept',
      's-intake',
      'accepted',
      waterWith({ id: 'w-ro', title: 'Reverse osmosis', under: 'w-desal' }, { id: 'w-intake', title: 'Seawater intake', under: 'w-desal' }),
      without('s-ro', 's-intake'),
    );
    expect(q('#panel .sugg-row')).toBeNull();
    expect(text(q('#panel .gated.sugg-emptied'))).toBe('Nothing waits here now: the ideas you added are on your map.');
    expect(stamps()).toEqual([]);
    expect(q('#panel kiosk-live-row [data-act="live"]')).not.toBeNull();
  });

  it('W41, W46, K186: entered anew after this demo session’s press, the drawer lists that press’s ideas (made after the last reset) tagged LIVE, the row saying when, with no button; older pending rows and links stay hidden', async () => {
    const readiness = TestBed.inject(ReadinessService);
    void readiness.load();
    http.expectOne('/api/v1/kiosk/readiness').flush(readinessExample({ last_reset: { outcome: 'done', finished_at: '2026-10-21T03:30:00Z', took_s: 31, failed_phase: null, failed_step: null } }));
    // This session's press (after the reset) and, from the snapshot, a pending row no manifest batch names (W46).
    const live = { ...pending('s-live', 'Membrane cleaning', 'w-desal'), createdAt: '2026-10-21T03:42:10Z' };
    const old = { ...pending('s-old', 'Old golden idea', 'w-desal'), createdAt: '2026-10-19T16:06:00Z' };
    // A link from the same press, its far end off this map (W62: a list shows ideas only); the list's rows share one type.
    const unnamed = { ...pending('s-edge', '', 'w-desal'), kind: 'edge', sourceConceptId: 'w-desal', targetConceptId: 'not-on-this-map', createdAt: '2026-10-21T03:42:11Z' } as ReturnType<typeof pending>;
    // The earlier press on this idea, which the one LIVE service remembers for the demo session (K186).
    suggRun = answered([live, unnamed]);
    await TestBed.inject(LiveService).press('sugg:water:w-desal', 'sugg', { focalConceptId: 'w-desal', goalId: G.water });
    await inRegion(0, atlasManifest(), undefined, { ...PENDING, [G.water]: [...PENDING[G.water], live, old, unnamed] });
    await suggTab('w-desal');
    expect(rows()).toEqual([
      ['Membrane cleaning', true, ''],
      ['Reverse osmosis', false, ''],
      ['Seawater intake', false, ''],
    ]);
    expect(text(q('#panel'))).not.toContain('Old golden idea');
    expect(text(q('#panel'))).not.toContain('an idea not on this map');
    expect(stamps()).toEqual(['Prepared 20 Oct, 13:31', 'Live, 21 Oct, 11:42']);
    expect(q('#panel kiosk-live-row [data-act="live"]')).toBeNull();
    (q('#panel [data-act="freshAccept"]') as HTMLButtonElement).click();
    (await vi.waitFor(() => http.expectOne('/api/v1/me/concept-graph/suggestions/s-live/accept'))).flush({ ...live, status: 'accepted' });
    await reads(waterWith({ id: 'w-mc', title: 'Membrane cleaning', under: 'w-desal' }));
    expect(titles()).toEqual(['Reverse osmosis', 'Seawater intake']);
    expect(stamps()).toEqual(['Prepared 20 Oct, 13:31', 'Live, 21 Oct, 11:42']);
  });

  it('W46: with no reset time to go by, the drawer lists no product row it did not press itself', async () => {
    await inRegion(0, atlasManifest(), undefined, { ...PENDING, [G.water]: [...PENDING[G.water], { ...pending('s-live', 'Membrane cleaning', 'w-desal'), createdAt: '2026-10-21T03:42:10Z' }] });
    await suggTab('w-desal');
    expect(titles()).toEqual(['Reverse osmosis', 'Seawater intake']);
  });

  it('K189 (2), W62: a LIVE press’s links are no rows, one between two ideas on this map and one off it alike: the list shows ideas only', async () => {
    await inRegion();
    await suggTab('w-desal');
    const link = { suggestionId: 's-link', kind: 'edge', status: 'pending', sourceConceptId: 'w-newater', targetConceptId: 'w-used', class: 'lateral', focalConceptId: 'w-desal', rationale: 'why linked', createdAt: '2026-10-20T05:40:00Z' };
    const offMap = { ...link, suggestionId: 's-off', sourceConceptId: 'w-gone' };
    suggRun = answered([pending('s-new', 'Membrane cleaning', 'w-desal'), link, offMap]);
    await pressLive();
    expect(all('#panel .sugg-row').map((r) => [text(r.querySelector('.sugg-kind')), text(r.querySelector('b > bdi'))])).toEqual([
      ['New concept', 'Membrane cleaning'],
      ['New concept', 'Reverse osmosis'],
      ['New concept', 'Seawater intake'],
    ]);
    expect(text(q('#panel'))).not.toContain('New link');
    expect(text(q('#panel'))).not.toContain('an idea not on this map');
    expect(text(q('#panel'))).not.toContain('→');
  });

  it('K157: a fresh idea already on the map reads "On your map", with no Add', async () => {
    await inRegion();
    await suggTab('w-desal');
    suggRun = answered([pending('s-again', 'desalination', 'w-desal'), pending('s-new', 'Membrane cleaning', 'w-desal')]);
    await pressLive();
    expect(all('#panel .sugg-row').map((r) => [r.className, text(r.querySelector('.sugg-kind')), text(r.querySelector('b > bdi')), text(r.querySelector('.sugg-state')), r.querySelectorAll('button').length])).toEqual([
      ['sugg-row dup', 'On your map', 'desalination', 'Already on your map', 0],
      ['sugg-row', 'New concept', 'Membrane cleaning', '', 2],
      ['sugg-row', 'New concept', 'Reverse osmosis', '', 2],
      ['sugg-row', 'New concept', 'Seawater intake', '', 2],
    ]);
  });

  it('K157 "empty": a LIVE press with nothing new says so plainly, never the hidden batch, and the list stays', async () => {
    await inRegion();
    await suggTab('w-desal');
    suggRun = async () => ({ status: 'empty', requestId: 'r-empty' });
    await pressLive();
    expect(text(q('#panel .sugg-empty'))).toBe('Nothing new this time: every idea it found is already on your map or was suggested before.');
    expect(titles()).toEqual(['Reverse osmosis', 'Seawater intake']);
    expect(text(q('#panel')).includes('Brine discharge')).toBe(false);
    expect(q('#panel kiosk-live-row [data-act="live"]')).toBeNull();
  });

  it('K190: the cap counts the idea’s actual children; once its six places are taken, the ideas left are greyed out with no Add, prepared or fresh', async () => {
    const five = ['Multi-stage flash', 'Pre-treatment', 'Post-treatment', 'Intake screens', 'Remineralisation'].map((title, i) => ({ id: `w-d${i}`, title, under: 'w-desal' }));
    await inRegion(0, atlasManifest(), waterWith(...five));
    await suggTab('w-desal');
    suggRun = answered([pending('s-new', 'Membrane cleaning', 'w-desal')]);
    await pressLive();
    // Five children: one place left, so every idea may still take it (nothing is reserved, K189 (1)).
    expect(rows()).toEqual([
      ['Membrane cleaning', true, ''],
      ['Reverse osmosis', false, ''],
      ['Seawater intake', false, ''],
    ]);
    expect(all('#panel .sugg-row').map((r) => r.querySelectorAll('button').length)).toEqual([2, 2, 2]);
    await decideFirst('suggAccept', 's-ro', 'accepted', waterWith(...five, { id: 'w-ro', title: 'Reverse osmosis', under: 'w-desal' }), without('s-ro'));
    expect(rows()).toEqual([
      ['Membrane cleaning', true, 'No room: an idea holds six at most'],
      ['Seawater intake', false, 'No room: an idea holds six at most'],
    ]);
    expect(all('#panel .sugg-row').map((r) => r.querySelectorAll('button').length)).toEqual([0, 0]);
  });

  it('K186: the same idea’s fresh ideas pressed on another exhibit spend the atlas’s button for the demo session; the row says when, and another idea keeps its button', async () => {
    suggRun = answered([]);
    await TestBed.inject(LiveService).press('sugg:hook:w-desal', 'sugg', { focalConceptId: 'w-desal' });
    await inRegion();
    await suggTab('w-desal');
    expect(q('#panel kiosk-live-row .live-row')?.getAttribute('data-live')).toBe('sugg:water:w-desal');
    expect(q('#panel kiosk-live-row [data-act="live"]')).toBeNull();
    expect(stamps()[0]).toBe('Prepared 20 Oct, 13:31');
    expect(stamps()[1]).toMatch(/^Live, \d{1,2} \w+, \d{2}:\d{2}$/);
    await suggTab(ROOT);
    expect(q('#panel kiosk-live-row [data-act="live"]')).not.toBeNull();
  });

  it('a decision the product refuses says so and changes nothing', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await inRegion();
    await suggTab('w-desal');
    (q('#panel [data-act="suggAccept"]') as HTMLButtonElement).click();
    (await vi.waitFor(() => http.expectOne('/api/v1/me/concept-graph/suggestions/s-ro/accept'))).flush({ code: 'X' }, { status: 409, statusText: 'Conflict' });
    await vi.waitFor(() => expect(drawer().decideFailed()).toBe(true));
    await settle();
    expect(text(q('#panel .msg-error'))).toBe('This step could not reach Chora. Please ask the presenter.');
    expect(TestBed.inject(VisitDecisions).all().has('s-ro')).toBe(false);
    expect(titles()).toEqual(['Reverse osmosis', 'Seawater intake']);
    expect(String(err.mock.calls.at(-1)?.[0])).toContain('s-ro was not decided');
  });

  it('a missed press with no hidden batch behind it is said loudly and shows nothing', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await inRegion(2);
    await suggTab('h-centres');
    drawer().onSuggOutcome(TestBed.inject(MapsExhibit).regions()[2], 'h-centres', MISSED);
    await settle();
    expect(q('#panel .sugg-row')).toBeNull();
    expect(String(err.mock.calls.at(-1)?.[0])).toContain('no prepared fresh ideas around h-centres');
    drawer().onSuggOutcome(TestBed.inject(MapsExhibit).regions()[2], 'h-centres', { status: 'stopped' });
    expect(drawer().fresh().size).toBe(0);
  });

  it('a fog ghost opens Suggestions on the idea it waits around', async () => {
    await inRegion();
    lens().fogTap.emit('w-desal');
    await settle();
    expect(text(q('#panel .kd-title'))).toBe('Desalination');
    expect(text(q('#panel .kd-tabs button.on'))).toBe('Suggestions');
  });

  it('a won idea with only a hidden batch says none wait, with the LIVE row and no prepared stamp over nothing (condition a)', async () => {
    await inRegion();
    await suggTab('w-newater');
    expect(text(q('#panel .gated.sugg-emptied'))).toBe('Pingu has no suggestions waiting here.');
    expect(q('#panel kiosk-live-row .live-row')?.getAttribute('data-live')).toBe('sugg:water:w-newater');
    expect(stamps()).toEqual([]);
  });

  it('a won idea with no batch at all says only that none wait', async () => {
    await inRegion(2);
    await suggTab('h-centres');
    expect(text(q('#panel .gated.sugg-emptied'))).toBe('Ember has no suggestions waiting here.');
    expect(q('#panel kiosk-live-row')).toBeNull();
  });

  /** Wins Reservoirs in the drawer (its last rung answered right): the hex's Overview then offers fresh ideas, LIVE (K50). */
  async function winRes(): Promise<void> {
    await inRegion();
    lens().select.emit('w-res');
    await settle();
    (q('#panel [data-act="practise"]') as HTMLButtonElement).click();
    (await vi.waitFor(() => http.expectOne((r) => r.url === `/api/v1/me/goals/${G.water}/campaign/questions`))).flush({
      status: 'ready',
      concept_id: 'w-res',
      rung: 6,
      questions: { candidates: [{ question_type: 'mcq', stem: 'Keep it clean?', options: [{ option_id: 'o-a', label: 'No' }, { option_id: 'o-b', label: 'Yes' }] }] },
    });
    await vi.waitFor(() => expect(drawer().practice().state).toBe('ready'));
    await settle();
    (all('#panel [data-act="mapAnswer"]')[1] as HTMLButtonElement).click();
    (await vi.waitFor(() => http.expectOne(`/api/v1/me/goals/${G.water}/campaign/questions/answer`))).flush({
      correct: true, rung: 6, is_refresher: false, counted: true, cleared_rung: 6, won: true, paced_today: false, rungs_cleared: 6, current_rung_correct: 0, needed_correct: 2, retention_r: 1, correct_option_id: 'o-b', explainer: 'Yes.',
    });
    await reads({ [G.water]: water([], WON_RES), [G.nature]: nature(), [G.hawker]: hawker() });
    await vi.waitFor(() => expect(drawer().won()?.grew).not.toBe('waiting'));
    await settle();
  }
  /** K218: the box under the won banner that holds the fresh-ideas ask, and its heading. */
  const box = () => q('#panel .tier.t3 section.won-ask');
  const before = (a: Element | null, b: Element | null) => !!a && !!b && !!(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);

  it('K218 (W96): once the hex is won, "Write a new question" goes and a line says the idea takes no more questions; under the banner a box headed "{name} can suggest new ideas around {idea}" holds the LIVE ask, no stamp over nothing; a missed press lists its hidden batch (fresh.water.res) inside the box under its own time', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await winRes();
    expect(q('#panel [data-live^="q:"]')).toBeNull();
    expect(text(q('#panel .tier.t3 .won-done'))).toBe('Reservoirs is won: no more questions on it.');
    const head = box()?.querySelector('h4');
    expect(text(head)).toBe('Pingu can suggest new ideas around Reservoirs');
    expect(head?.id).toBeTruthy();
    expect(box()?.getAttribute('aria-labelledby')).toBe(head?.id);
    expect(before(q('#panel .won-banner'), q('#panel .won-done'))).toBe(true);
    expect(before(q('#panel .won-done'), box())).toBe(true);
    // K219: the old "Nothing waits here yet" line folds into the box's heading here.
    expect(q('#panel .sugg-ask')).toBeNull();
    expect(box()?.querySelector('kiosk-live-row .live-row')?.getAttribute('data-live')).toBe('sugg:water:w-res');
    expect(text(box()?.querySelector('.live-btn .live-label'))).toBe('Ask Pingu for fresh ideas around it');
    expect(all('#panel kiosk-live-row')).toHaveLength(1);
    expect(stamps()).toEqual([]);
    expect(q('#panel .sugg-row')).toBeNull();
    suggRun = () => Promise.reject(new Error('explorer failed'));
    await pressLive('#panel .won-ask');
    expect(q('#panel .won-ask .sugg-fresh')).toBeNull();
    expect(titles('#panel .won-ask')).toEqual(['Marina Barrage']);
    expect(all('#panel .sugg-row')).toHaveLength(1);
    expect(q('#panel .won-ask [data-act="freshAccept"]')).not.toBeNull();
    expect(stamps()).toEqual(['Showing the prepared result: the live call failed', 'Prepared 20 Oct, 13:31']);
  });

  it('K218 (W96): a press that lands lists its ideas inside the box, under its heading, with the live stamp alone', async () => {
    await winRes();
    suggRun = answered([pending('s-new', 'Water catchment', 'w-res')]);
    await pressLive('#panel .won-ask');
    expect(text(box()?.querySelector('h4'))).toBe('Pingu can suggest new ideas around Reservoirs');
    expect(all('#panel .won-ask .sugg-row')).toHaveLength(1);
    expect(rows()).toEqual([['Water catchment', true, '']]);
    expect(stamps()).toEqual(['Live, just now']);
  });

  it('K218 (W96): in Chinese the line and the heading read from their own keys, the idea’s English title kept', async () => {
    await winRes();
    await TestBed.inject(KioskLanguage).setLang('zh');
    await settle();
    expect(text(q('#panel .won-done'))).toBe('Reservoirs 已攻下：这个概念不再出题。');
    expect(text(box()?.querySelector('h4'))).toBe('Pingu 可以围绕 Reservoirs 推荐新的概念');
  });
});
