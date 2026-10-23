import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { KioskLanguage, provideKioskI18n } from '../../i18n/i18n';
import { provideLive } from '../../live/live.providers';
import { LIVE_EXECUTORS, LiveAvailability, LiveService, type LiveExecutor } from '../../live/live.service';
import { CompanionsExhibit } from './companions-exhibit';
import { CompanionsSceneComponent } from './companions-scene.component';
import { FOCAL, GROWTH, IDS, MAPS, MARCH, PENDING, pending, suggestManifest, waterWithFocal } from './companions-world.testing';
import { VisitDecisions } from '../../shared/sugg/visit-decisions';
import { formatWhen } from '../../shared/when';
import { keepServedOrder } from '../../shared/visit-order.testing';

// The Suggest ability (mockup compAbility('suggest'), compDrawerHTML and suggListHTML, lines 4871 and
// 4738): production's drawer on the first won idea whose suggestions still wait, each with Add and
// Dismiss (real calls; the map is read again). K189 (2): one list of waiting ideas, the prepared ones
// and a press's fresh ones at its top; an added or dismissed idea leaves it, and it shows ideas only.
// The hidden fresh batches stay out until a LIVE press misses (K64).
describe('CompanionsSceneComponent (the Suggest ability)', () => {
  let http: HttpTestingController;
  let fixture: ComponentFixture<CompanionsSceneComponent>;
  let el: HTMLElement;
  let failSugg: (() => void) | undefined;
  let answerSugg: ((result: unknown) => void) | undefined;

  async function settle(): Promise<void> {
    for (let i = 0; i < 4; i++) {
      await Promise.resolve();
      fixture.detectChanges();
    }
  }

  beforeEach(async () => {
    failSugg = undefined;
    answerSugg = undefined;
    const sugg: LiveExecutor = {
      run: () =>
        new Promise((resolve, reject) => {
          failSugg = () => reject(new Error('explorer failed'));
          answerSugg = resolve;
        }),
    };
    TestBed.configureTestingModule({
      providers: [...keepServedOrder(),
        provideHttpClient(),
        provideHttpClientTesting(),
        ...provideKioskI18n(),
        ...provideLive(),
        { provide: LIVE_EXECUTORS, useValue: { sugg } },
        { provide: LiveAvailability, useValue: { text: signal(true).asReadonly(), picture: signal(true).asReadonly() } },
      ],
    });
    http = TestBed.inject(HttpTestingController);
    await TestBed.inject(KioskLanguage).ready();
  });

  /** The scene read with `manifest` and the water map `water`, then Suggest opened on a pending read with `waiting`. */
  async function open(manifest = suggestManifest(), water: object = waterWithFocal(), waiting: object[] = PENDING): Promise<void> {
    fixture = TestBed.createComponent(CompanionsSceneComponent);
    el = fixture.nativeElement as HTMLElement;
    fixture.detectChanges();
    http.expectOne('/api/v1/kiosk/prewarm/manifest').flush(manifest);
    await read(water);
    await openSuggest(waiting);
  }

  /** The exhibit's reads answered: the three maps and the three growths (the manifest is read once a run). */
  async function read(water: object = waterWithFocal()): Promise<void> {
    const maps = { ...MAPS, [IDS.water]: water };
    for (const goal of [IDS.water, IDS.nature, IDS.hawker]) await vi.waitFor(() => http.expectOne(`/api/v1/me/maps/${goal}/graph`).flush(maps[goal]));
    for (const c of [IDS.pingu, IDS.nova, IDS.ember]) await vi.waitFor(() => http.expectOne(`/api/v1/me/companions/${c}/growth`).flush(GROWTH[c]));
    await vi.waitFor(() => expect(TestBed.inject(CompanionsExhibit).status()).toBe('ready'));
    await settle();
  }

  async function openSuggest(waiting: object[] = PENDING): Promise<void> {
    (el.querySelector('[data-act="ability"][data-ab="suggest"]') as HTMLElement).click();
    await vi.waitFor(() => http.expectOne((r) => r.url === '/api/v1/me/concept-graph/suggestions' && r.params.get('goalId') === IDS.water).flush({ suggestions: waiting }));
    await vi.waitFor(() => expect(TestBed.inject(CompanionsExhibit).view()).toBe('suggest'));
    await settle();
  }

  afterEach(() => {
    TestBed.inject(CompanionsExhibit).forget();
    TestBed.inject(LiveService).endSession();
  });

  const clean = (s: string | null | undefined) => s?.replace(/\s+/g, ' ').trim() ?? '';
  const text = (sel: string) => clean(el.querySelector(sel)?.textContent);
  const list = () => [...el.querySelectorAll('#panel .tier.t2 .sugg-row')] as HTMLElement[];
  const rows = () => list().map((r) => r.querySelector('b > bdi')?.textContent?.trim());
  const row = (title: string) => list().find((r) => r.querySelector('b > bdi')?.textContent?.trim() === title) as HTMLElement;
  /** The LIVE row's stamp line: the prepared stamp while a prepared idea is left, then the live one. */
  const stamps = () => [...el.querySelectorAll('#panel kiosk-live-row .stamp')].map((s) => clean(s.textContent));

  /** The next press's executor is a new run: forget the last one's handles. */
  function nextRun(): void {
    answerSugg = undefined;
    failSugg = undefined;
  }

  /** The LIVE press in the drawer (or its Try again), answered with `result`. */
  async function press(result: unknown): Promise<void> {
    nextRun();
    (el.querySelector('#panel [data-act="live"]') as HTMLElement).click();
    await vi.waitFor(() => expect(answerSugg).toBeTypeOf('function'));
    answerSugg?.(result);
    await vi.waitFor(() => expect(TestBed.inject(CompanionsExhibit).fresh()[0]?.source).toBe('live'));
    await settle();
  }

  /** The goal's suggestions read again, as a miss reads them for its hidden batch (K64; gap (a): the drawer's read may be gone). */
  async function readAfterMiss(waiting: object[] = PENDING): Promise<void> {
    await vi.waitFor(() => http.expectOne((r) => r.url === '/api/v1/me/concept-graph/suggestions' && r.params.get('goalId') === IDS.water).flush({ suggestions: waiting }));
  }

  /** The LIVE press in the drawer (or its Try again), failed: the call is a miss (K45); the first lists its hidden batch, read anew. */
  async function miss(first = true): Promise<void> {
    nextRun();
    (el.querySelector('#panel [data-act="live"]') as HTMLElement).click();
    await vi.waitFor(() => expect(failSugg).toBeTypeOf('function'));
    failSugg?.();
    await vi.waitFor(() => expect(TestBed.inject(LiveService).state(`sugg:comp:${FOCAL}`)()?.status).toBe('missed'));
    if (first) await readAfterMiss();
    await vi.waitFor(() => expect(TestBed.inject(CompanionsExhibit).fresh()[0]?.source).toBe('prepared'));
    await settle();
  }

  async function accept(id: string, title: string, mapAfter: object): Promise<void> {
    row(title).querySelector<HTMLElement>('[data-act$="Accept"]')?.click();
    await vi.waitFor(() => http.expectOne(`/api/v1/me/concept-graph/suggestions/${id}/accept`).flush({ ...pending(id, title), status: 'accepted' }));
    await vi.waitFor(() => http.expectOne(`/api/v1/me/maps/${IDS.water}/graph`).flush(mapAfter));
    await vi.waitFor(() => expect(TestBed.inject(CompanionsExhibit).busy()).toBe(false));
    await settle();
  }

  // K189 (2), the owner's example: "starts with 6 ideas. If i click add to one idea, then 5 is left. If I
  // trigger the 'live' button, and 2 are generated, then the total in the list should only see 7 concepts."
  it('K189 (2), the owner’s example: six ideas, Add one leaves five, a LIVE press of two shows seven, its two at the top with the LIVE tag', async () => {
    const six = [
      ['s-mf', 'Microfiltration'],
      ['s-uv', 'UV disinfection'],
      ['s-uf', 'Ultrafiltration'],
      ['s-fo', 'Membrane fouling'],
      ['s-uw', 'Used water'],
      ['s-rp', 'Reclamation plants'],
    ] as const;
    await open(suggestManifest(six), waterWithFocal(), six.map(([id, title]) => pending(id, title)));
    expect(rows()).toEqual(six.map(([, title]) => title));
    expect(list().map((r) => r.querySelector('[data-act="suggAccept"]') !== null)).toEqual(Array(6).fill(true));
    expect(stamps()).toEqual(['Prepared 20 Oct, 13:31']);

    await accept('s-uv', 'UV disinfection', waterWithFocal([{ id: 'c-uv', title: 'UV disinfection', under: FOCAL }]));
    expect(rows()).toEqual(['Microfiltration', 'Ultrafiltration', 'Membrane fouling', 'Used water', 'Reclamation plants']);
    expect(el.querySelector('#panel .sugg-state')).toBeNull();

    await press({ status: 'ready', requestId: 'r-live', suggestions: [pending('s-wf', 'Wafer fabs'), pending('s-ipu', 'Indirect potable use')] });
    expect(rows()).toEqual(['Wafer fabs', 'Indirect potable use', 'Microfiltration', 'Ultrafiltration', 'Membrane fouling', 'Used water', 'Reclamation plants']);
    expect(list().map((r) => r.querySelector('.sugg-live')?.textContent?.trim() ?? null)).toEqual(['LIVE', 'LIVE', null, null, null, null, null]);
    expect(list().map((r) => r.querySelector('[data-act$="Accept"]')?.getAttribute('data-act'))).toEqual(['freshAccept', 'freshAccept', 'suggAccept', 'suggAccept', 'suggAccept', 'suggAccept', 'suggAccept']);
    // R1: no group of its own; the prepared stamp stays while a prepared idea is left, beside the live one.
    expect(el.querySelector('#panel')?.textContent).not.toContain('Fresh ideas from');
    expect(stamps()).toEqual(['Prepared 20 Oct, 13:31', 'Live, just now']);
    // K186: the button has its live result, so it is gone for the demo session.
    expect(el.querySelector('#panel [data-act="live"]')).toBeNull();
  });

  it('K189 (2): a fresh idea added leaves the list too, and is kept for the visit', async () => {
    await open();
    await press({ status: 'ready', requestId: 'r-live', suggestions: [pending('s-new', 'Membrane cleaning')] });
    await accept('s-new', 'Membrane cleaning', waterWithFocal([{ id: 'c-new', title: 'Membrane cleaning', under: FOCAL }]));
    expect(rows()).toEqual(['Microfiltration', 'UV disinfection']);
    expect(TestBed.inject(VisitDecisions).all().get('s-new')?.state).toBe('added');
  });

  it('W62: a press’s links never show, on this map or off it; only its ideas join the list', async () => {
    await open();
    const onMap = { suggestionId: 's-link', kind: 'edge', status: 'pending', sourceConceptId: FOCAL, targetConceptId: MARCH, class: 'lateral', focalConceptId: FOCAL, rationale: 'why linked', createdAt: '2026-10-20T05:40:00Z' };
    const offMap = { suggestionId: 's-otters', kind: 'edge', status: 'pending', sourceConceptId: `${IDS.nature}-march`, targetConceptId: FOCAL, class: 'lateral', focalConceptId: FOCAL, rationale: 'why otters', createdAt: '2026-10-20T05:40:00Z' };
    const tree = { suggestionId: 's-tree', kind: 'edge', status: 'pending', sourceConceptId: MARCH, targetConceptId: FOCAL, class: 'hierarchy', focalConceptId: FOCAL, rationale: 'why under', createdAt: '2026-10-20T05:40:00Z' };
    await press({ status: 'ready', requestId: 'r-live', suggestions: [onMap, pending('s-new', 'Membrane cleaning'), offMap, tree] });
    expect(rows()).toEqual(['Membrane cleaning', 'Microfiltration', 'UV disinfection']);
    const panel = el.querySelector('#panel')?.textContent ?? '';
    for (const never of ['New link', '→', 'not on this map', 'Smooth-coated otters']) expect(panel).not.toContain(never);
  });

  it('opens production’s drawer on the won idea with suggestions waiting, the hidden batch kept out', async () => {
    await open();
    expect(el.querySelector('[data-act="ability"][data-ab="suggest"]')?.classList.contains('on')).toBe(true);
    expect(el.querySelector('#panel')?.classList.contains('open')).toBe(true);
    expect(text('#panel .kd-title')).toBe('NEWater');
    expect(text('#panel .comp-note')).toBe('Pingu suggests ideas that grow from one you have won. You choose: add the ones you want and dismiss the rest.');
    expect(rows()).toEqual(['Microfiltration', 'UV disinfection']);
    expect(TestBed.inject(CompanionsExhibit).lensFocusId()).toBe(FOCAL);
    expect(el.querySelector('.comp-pick')).toBeNull();
  });

  it('Add is the real call and the added idea leaves the list, read back from the map; then its ideas are all on the map', async () => {
    await open();
    await accept('s-mf', 'Microfiltration', waterWithFocal([{ id: 'c-mf', title: 'Microfiltration', under: FOCAL }]));
    expect(TestBed.inject(CompanionsExhibit).selected()?.map.concepts.length).toBe(4);
    expect(rows()).toEqual(['UV disinfection']);
    expect(el.querySelector('#panel .sugg-state')).toBeNull();
    await accept('s-uv', 'UV disinfection', waterWithFocal([{ id: 'c-mf', title: 'Microfiltration', under: FOCAL }, { id: 'c-uv', title: 'UV disinfection', under: FOCAL }]));
    expect(rows()).toEqual([]);
    expect(text('#panel .tier.t2 .gated.sugg-emptied')).toBe('Nothing waits here now: the ideas you added are on your map.');
    expect(stamps()).toEqual([]);
  });

  it('Dismiss is the real call and the dismissed idea leaves the list; with none added, it says none wait, under no stamp', async () => {
    await open();
    for (const [id, title] of [['s-mf', 'Microfiltration'], ['s-uv', 'UV disinfection']]) {
      row(title).querySelector<HTMLElement>('[data-act="suggDismiss"]')?.click();
      await vi.waitFor(() => http.expectOne(`/api/v1/me/concept-graph/suggestions/${id}/dismiss`).flush({ ...pending(id, title), status: 'dismissed' }));
      await vi.waitFor(() => expect(TestBed.inject(CompanionsExhibit).busy()).toBe(false));
      await settle();
    }
    http.expectNone(`/api/v1/me/maps/${IDS.water}/graph`);
    expect(rows()).toEqual([]);
    expect(el.querySelector('#panel .sugg-state')).toBeNull();
    expect(text('#panel .tier.t2 .gated.sugg-emptied')).toBe('Pingu has no suggestions waiting here.');
    expect(stamps()).toEqual([]);
    // Kept for the visit, so the atlas shows them too (K42).
    const decided = TestBed.inject(VisitDecisions).all();
    expect([decided.get('s-mf')?.state, decided.get('s-uv')?.state]).toEqual(['dropped', 'dropped']);
  });

  it('a LIVE press that misses puts the hidden fresh batch at the top, untagged, and offers Try again (K64, K189 (3))', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await open();
    await miss();
    expect(rows()).toEqual(['Deep Tunnel Sewerage System', 'Microfiltration', 'UV disinfection']);
    expect(row('Deep Tunnel Sewerage System').querySelector('.sugg-live')).toBeNull();
    expect(row('Deep Tunnel Sewerage System').querySelector('[data-act="freshAccept"]')).not.toBeNull();
    // Gap (b): the list's prepared stamp is its own batch's; the hidden batch shown for the miss carries its own time.
    expect(stamps()).toEqual(['Prepared 20 Oct, 13:31', 'Showing the prepared result: the live call failed', 'Prepared 20 Oct, 13:33']);
    expect(el.querySelectorAll('#panel kiosk-live-row kiosk-prepared-info').length).toBe(2);
    expect(text('#panel [data-act="live"] .live-label')).toBe('Try again');
    err.mockRestore();
  });

  // Gap (a): the press's outcome comes from the one LIVE door, not from the row that pressed, so a drawer
  // left mid-call (another Companion picked closes it) still gets that press's ideas for the demo session.
  it('gap (a): a press answered after its drawer has closed lists its ideas when Suggest opens again, saying when they came', async () => {
    await open();
    nextRun();
    (el.querySelector('#panel [data-act="live"]') as HTMLElement).click();
    await vi.waitFor(() => expect(answerSugg).toBeTypeOf('function'));
    TestBed.inject(CompanionsExhibit).select(IDS.nova);
    await settle();
    expect(el.querySelector('#panel kiosk-live-row')).toBeNull();
    answerSugg?.({ status: 'ready', requestId: 'r-live', suggestions: [pending('s-wf', 'Wafer fabs')] });
    const at = await vi.waitFor(() => {
      const spent = TestBed.inject(LiveService).spentAt(`sugg:comp:${FOCAL}`)();
      expect(spent).toBeInstanceOf(Date);
      return spent as Date;
    });
    await reopen([...PENDING, pending('s-wf', 'Wafer fabs')]);
    expect(rows()).toEqual(['Wafer fabs', 'Microfiltration', 'UV disinfection']);
    expect(row('Wafer fabs').querySelector('.sugg-live')?.textContent?.trim()).toBe('LIVE');
    expect(stamps()).toEqual(['Prepared 20 Oct, 13:31', `Live, ${formatWhen(at.toISOString(), 'en')}`]);
    expect(el.querySelector('#panel [data-act="live"]')).toBeNull();
  });

  it('gap (a): a press that misses after its drawer has closed lists its hidden batch, read anew, when Suggest opens again', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await open();
    nextRun();
    (el.querySelector('#panel [data-act="live"]') as HTMLElement).click();
    await vi.waitFor(() => expect(failSugg).toBeTypeOf('function'));
    TestBed.inject(CompanionsExhibit).select(IDS.nova);
    await settle();
    failSugg?.();
    await readAfterMiss();
    await vi.waitFor(() => expect(TestBed.inject(LiveService).state(`sugg:comp:${FOCAL}`)()?.status).toBe('missed'));
    await reopen(PENDING);
    expect(rows()).toEqual(['Deep Tunnel Sewerage System', 'Microfiltration', 'UV disinfection']);
    expect(stamps()).toEqual(['Prepared 20 Oct, 13:31', 'Showing the prepared result: the live call failed', 'Prepared 20 Oct, 13:33']);
    expect(text('#panel [data-act="live"] .live-label')).toBe('Try again');
    expect(err).not.toHaveBeenCalledWith(expect.stringContaining('not shown'));
    err.mockRestore();
  });

  /** Suggest opened again (Pingu picked anew closes it), on a pending read with `waiting`. */
  async function reopen(waiting: ReturnType<typeof pending>[]): Promise<void> {
    TestBed.inject(CompanionsExhibit).select(IDS.pingu);
    await settle();
    (el.querySelector('[data-act="ability"][data-ab="suggest"]') as HTMLElement).click();
    await vi.waitFor(() => http.expectOne((r) => r.url === '/api/v1/me/concept-graph/suggestions' && r.params.get('goalId') === IDS.water).flush({ suggestions: waiting }));
    await vi.waitFor(() => expect(TestBed.inject(CompanionsExhibit).view()).toBe('suggest'));
    await settle();
  }

  it('condition (a): ideas the story added this visit have left the list; it says they are on the map, with no prepared stamp (W25)', async () => {
    await open();
    // As the story records its decisions (K42), so they come back as added here.
    const decisions = TestBed.inject(VisitDecisions);
    decisions.record(pending('s-mf', 'Microfiltration') as never, 'accept');
    decisions.record(pending('s-uv', 'UV disinfection') as never, 'accept');
    await reopen([pending('s-dtss', 'Deep Tunnel Sewerage System')]);
    expect(list()).toEqual([]);
    expect(text('#panel .tier.t2 .gated.sugg-emptied')).toBe('Nothing waits here now: the ideas you added are on your map.');
    expect(el.querySelector('#panel kiosk-live-row .live-row')).not.toBeNull();
    expect(stamps()).toEqual([]);
  });

  it('W25: with nothing waiting and nothing decided this visit, it says none wait, and no prepared stamp stands over an empty list', async () => {
    await open();
    await reopen([pending('s-dtss', 'Deep Tunnel Sewerage System')]);
    expect(list()).toEqual([]);
    expect(text('#panel .tier.t2 .gated.sugg-emptied')).toBe('Pingu has no suggestions waiting here.');
    expect(el.querySelector('#panel kiosk-live-row .live-row')).not.toBeNull();
    expect(stamps()).toEqual([]);
  });

  it('K157 "empty": a LIVE press with nothing new says so plainly, never the hidden batch', async () => {
    await open();
    await press({ status: 'empty', requestId: 'r-empty' });
    expect(text('#panel .sugg-empty')).toBe('Nothing new this time: every idea it found is already on your map or was suggested before.');
    expect(rows()).toEqual(['Microfiltration', 'UV disinfection']);
    expect(el.querySelector('#panel')?.textContent).not.toContain('Deep Tunnel Sewerage System');
  });

  it('K157: a fresh idea already on the map reads "On your map", with no Add', async () => {
    await open();
    await press({ status: 'ready', requestId: 'r-live', suggestions: [pending('s-again', 'NEWater'), pending('s-new', 'Membrane cleaning')] });
    expect(list().slice(0, 2).map((r) => [r.classList.contains('dup'), r.querySelector('.sugg-kind')?.textContent?.trim(), r.querySelectorAll('button').length])).toEqual([
      [true, 'On your map', 0],
      [false, 'New concept', 2],
    ]);
  });

  it('K190: once an idea’s six places are taken, its remaining ideas are greyed out, with no Add', async () => {
    const five = ['Ultrafiltration', 'Membrane fouling', 'Used water', 'Reclamation plants', 'Wafer fabs'].map((title, i) => ({ id: `c-${i}`, title, under: FOCAL }));
    await open(suggestManifest(), waterWithFocal(five));
    expect(list().map((r) => r.querySelectorAll('[data-act="suggAccept"]').length)).toEqual([1, 1]);
    await accept('s-mf', 'Microfiltration', waterWithFocal([...five, { id: 'c-mf', title: 'Microfiltration', under: FOCAL }]));
    expect(rows()).toEqual(['UV disinfection']);
    expect(row('UV disinfection').querySelector('button')).toBeNull();
    expect(clean(row('UV disinfection').querySelector('.sugg-state')?.textContent)).toBe('No room: an idea holds six at most');
  });

  it('K186: a subject spent on another exhibit (the story’s press for NEWater) leaves no LIVE button here, and says when', async () => {
    await open();
    const live = TestBed.inject(LiveService);
    const pressed = live.press(`sugg:hook:${FOCAL}`, 'sugg', { focalConceptId: FOCAL, goalId: IDS.water });
    await vi.waitFor(() => expect(answerSugg).toBeTypeOf('function'));
    answerSugg?.({ status: 'ready', requestId: 'r-hook', suggestions: [pending('s-hook', 'Wafer fabs')] });
    expect((await pressed).status).toBe('done');
    await settle();
    expect(el.querySelector(`#panel [data-live="sugg:comp:${FOCAL}"]`)).not.toBeNull();
    expect(el.querySelector('#panel [data-act="live"]')).toBeNull();
    expect(stamps()[0]).toBe('Prepared 20 Oct, 13:31');
    expect(stamps()[1]).toMatch(/^Live, \d+ [A-Z][a-z]{2}, \d\d:\d\d$/);
  });

  // K186 with K189 (2): a press's ideas are this demo session's waiting ideas and its button is spent,
  // so they stay listed wherever the drawer opens on that idea again; only the session's end forgets them.
  it('a press’s ideas are still listed at the top, tagged LIVE, after leaving Suggest and coming back, and say when they came (W41)', async () => {
    await open();
    await press({ status: 'ready', requestId: 'r-live', suggestions: [pending('s-wf', 'Wafer fabs'), pending('s-ipu', 'Indirect potable use')] });
    await accept('s-wf', 'Wafer fabs', waterWithFocal([{ id: 'c-wf', title: 'Wafer fabs', under: FOCAL }]));
    const at = TestBed.inject(LiveService).spentAt(`sugg:comp:${FOCAL}`)() as Date;
    TestBed.inject(CompanionsExhibit).select(IDS.nova);
    await settle();
    await reopen([...PENDING, pending('s-ipu', 'Indirect potable use')]);
    expect(rows()).toEqual(['Indirect potable use', 'Microfiltration', 'UV disinfection']);
    expect(row('Indirect potable use').querySelector('.sugg-live')?.textContent?.trim()).toBe('LIVE');
    expect(row('Indirect potable use').querySelector('[data-act="freshAccept"]')).not.toBeNull();
    expect(stamps()).toEqual(['Prepared 20 Oct, 13:31', `Live, ${formatWhen(at.toISOString(), 'en')}`]);
    expect(el.querySelector('#panel [data-act="live"]')).toBeNull();
  });

  it('the demo session’s end forgets them: the next visitor’s drawer lists the prepared ideas and offers the press again', async () => {
    await open();
    await press({ status: 'ready', requestId: 'r-live', suggestions: [pending('s-wf', 'Wafer fabs')] });
    const exhibit = TestBed.inject(CompanionsExhibit);
    exhibit.forget();
    TestBed.inject(LiveService).endSession();
    void exhibit.load();
    await read();
    await openSuggest();
    expect(exhibit.fresh()).toEqual([]);
    expect(rows()).toEqual(['Microfiltration', 'UV disinfection']);
    expect(el.querySelector('#panel [data-act="live"]')).not.toBeNull();
  });

  it('K64’s batch after a miss is listed once, however often the press misses, and stays, untagged, under a later press’s ideas', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await open();
    await miss();
    await miss(false);
    http.expectNone((r) => r.url === '/api/v1/me/concept-graph/suggestions');
    expect(rows()).toEqual(['Deep Tunnel Sewerage System', 'Microfiltration', 'UV disinfection']);
    await press({ status: 'ready', requestId: 'r-live', suggestions: [pending('s-wf', 'Wafer fabs')] });
    expect(rows()).toEqual(['Wafer fabs', 'Deep Tunnel Sewerage System', 'Microfiltration', 'UV disinfection']);
    expect(list().map((r) => r.querySelector('.sugg-live')?.textContent?.trim() ?? null)).toEqual(['LIVE', null, null, null]);
    expect(row('Deep Tunnel Sewerage System').querySelector('[data-act="freshAccept"]')).not.toBeNull();
    expect(stamps()).toEqual(['Prepared 20 Oct, 13:31', 'Live, just now']);
    err.mockRestore();
  });
});
