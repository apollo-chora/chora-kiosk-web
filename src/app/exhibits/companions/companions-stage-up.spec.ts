import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { parseCampaignQuestions } from '../../aplus/daily-dose/campaign-practice/campaign-practice.service';
import { breedStageLabel } from '../../core/familiar/familiar-growth.model';
import { KioskLanguage, provideKioskI18n } from '../../i18n/i18n';
import { provideLive } from '../../live/live.providers';
import { LIVE_EXECUTORS, LiveAvailability, LiveService, type LiveExecutor, type LiveOutcome } from '../../live/live.service';
import { CompanionsExhibit, GROWTH_POLL_MS, GROWTH_POLL_TRIES } from './companions-exhibit';
import { CompanionsSceneComponent } from './companions-scene.component';
import { ATOM_BODIES, DOSE_OPEN, DOSE_WIRE, GROWTH, IDS, MAPS, MARCH, PINGU_AFTER, PINGU_LOADOUT, SERVED_RES, WON_PENDING, atomRead, doseManifest, events, growth, growthEvent, loadout, waterOnLastRung, wonManifest } from './companions-world.testing';
import { keepServedOrder } from '../../shared/visit-order.testing';

// The stage-up moment after a won hex (mockup profileSheetHTML with stageUp and stageUpHTML, lines
// 2896 to 2960; production's familiar-stage-up-overlay). K135: the winning answer also clears the
// last rung, so consumption credits campaign_rung_cleared (8) and campaign_node_won (25) as two
// separate events through Pub/Sub. The moment waits until the growth events list both, in either
// order, then reads the growth once; every number comes from those reads, none is written here.
describe('CompanionsSceneComponent (the stage-up after a won hex, K135)', () => {
  let http: HttpTestingController;
  let fixture: ComponentFixture<CompanionsSceneComponent>;
  let el: HTMLElement;
  /** The won ask's LIVE press, answered or failed by the test. */
  let ask: { resolve: (r: unknown) => void; reject: (e: Error) => void } | null;
  const EVENTS = `/api/v1/me/companions/${IDS.pingu}/growth-events`;
  const GROWTH_URL = `/api/v1/me/companions/${IDS.pingu}/growth`;
  const LOADOUT = `/api/v1/me/companions/${IDS.pingu}/skills`;
  const RUNG = growthEvent('ev-rung', 'campaign_rung_cleared', 8, 40, 1, 1);
  const WON = growthEvent('ev-won', 'campaign_node_won', 25, 65, 1, 2);
  const exhibit = () => TestBed.inject(CompanionsExhibit);

  async function settle(): Promise<void> {
    for (let i = 0; i < 6; i++) {
      await Promise.resolve();
      fixture.detectChanges();
    }
  }

  /** The scene on the water map, its march one right answer from winning, the Quiz open and served. */
  async function onLastRung(pingu = GROWTH[IDS.pingu], manifest = wonManifest()): Promise<void> {
    ask = null;
    const sugg: LiveExecutor = { run: () => new Promise((resolve, reject) => (ask = { resolve, reject })) };
    TestBed.configureTestingModule({
      providers: [
        ...keepServedOrder(),
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
    fixture = TestBed.createComponent(CompanionsSceneComponent);
    el = fixture.nativeElement as HTMLElement;
    fixture.detectChanges();
    http.expectOne('/api/v1/kiosk/prewarm/manifest').flush(manifest);
    const maps = { ...MAPS, [IDS.water]: waterOnLastRung() };
    for (const goal of [IDS.water, IDS.nature, IDS.hawker]) await vi.waitFor(() => http.expectOne(`/api/v1/me/maps/${goal}/graph`).flush(maps[goal]));
    const reads = { ...GROWTH, [IDS.pingu]: pingu };
    for (const c of [IDS.pingu, IDS.nova, IDS.ember]) await vi.waitFor(() => http.expectOne(`/api/v1/me/companions/${c}/growth`).flush(reads[c]));
    await vi.waitFor(() => expect(exhibit().status()).toBe('ready'));
    await settle();
    (el.querySelector('[data-act="ability"][data-ab="quiz"]') as HTMLElement).click();
    await settle();
    await vi.waitFor(() => http.expectOne((r) => r.url === `/api/v1/me/goals/${IDS.water}/campaign/questions`)).then((r) => r.flush(SERVED_RES));
    await vi.waitFor(() => expect(exhibit().quiz().state).toBe('ready'));
    await settle();
  }

  /** The right answer, graded as the win, and the won map read back. */
  async function win(): Promise<void> {
    (el.querySelectorAll('#panel [data-act="answer"]')[1] as HTMLElement).click();
    const post = await vi.waitFor(() => http.expectOne(`/api/v1/me/goals/${IDS.water}/campaign/questions/answer`));
    post.flush({ correct: true, rung: 6, is_refresher: false, counted: true, cleared_rung: 6, won: true, paced_today: false, rungs_cleared: 6, current_rung_correct: 0, needed_correct: 2, retention_r: 1, correct_option_id: 'o-b', explainer: 'The catchment keeps the water clean.' });
    await vi.waitFor(() => http.expectOne(`/api/v1/me/maps/${IDS.water}/graph`).flush(waterOnLastRung(true)));
  }

  /** One read of the ledger, then the poll's pause before the next. */
  async function ledger(...rows: ReturnType<typeof growthEvent>[]): Promise<void> {
    (await vi.waitFor(() => http.expectOne(EVENTS))).flush(events(...rows));
    await settle();
  }

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    exhibit().forget();
    TestBed.inject(LiveService).endSession();
  });

  const text = (sel: string) => el.querySelector(sel)?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
  const texts = (sel: string) => Array.from(el.querySelectorAll(sel)).map((n) => n.textContent?.replace(/\s+/g, ' ').trim() ?? '');

  it('waits for both credits a second apart (the rung first), then shows the moment with +33 from the ledger', async () => {
    await onLastRung();
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    await win();
    await ledger(RUNG, DOSE_OPEN);
    // One credit has landed: no moment, no growth read, the sheet still as it was, and the next read only after the pause.
    expect(el.querySelector('.cx-up')).toBeNull();
    expect(el.querySelector('.comp-left')?.classList.contains('leveled')).toBe(false);
    http.expectNone(GROWTH_URL);
    http.expectNone(EVENTS);
    expect(texts('.cx-tiles .cx-tile dd')[2]).toBe('32');
    expect(text('#panel .won-banner')).toBe('Hex won!');
    await vi.advanceTimersByTimeAsync(GROWTH_POLL_MS);
    await ledger(WON, RUNG, DOSE_OPEN);
    (await vi.waitFor(() => http.expectOne(GROWTH_URL))).flush(PINGU_AFTER);
    (await vi.waitFor(() => http.expectOne(LOADOUT))).flush(PINGU_LOADOUT);
    await vi.waitFor(() => expect(exhibit().grew()?.gained).toBe(33));
    await settle();
    const from = breedStageLabel('penguin', 1);
    const to = breedStageLabel('penguin', 2);
    expect(text('.cx-up__eyebrow')).toBe('Your Companion grew');
    // K138 W6: the mockup sets the column leveled during the moment (line 4894), which hides the EXP hint
    // (mockup.css .comp-left.leveled .cx-hint), so the sheet's FOCUS row stays inside the sheet.
    expect(el.querySelector('.comp-left')?.classList.contains('leveled')).toBe(true);
    expect(text('.cx-up__heading')).toBe(`Pingu is now ${to}!`);
    expect(texts('.cx-up__line')).toEqual([`${from} → ${to} · +33 EXP for winning a hex`, 'Skill slots now: 3']);
    expect(texts('.cx-up__pills .cx-pill:not(.cx-pill--ability)')).toEqual(['Explain It Differently', 'Recap Scribe']);
    expect(text('.cx-up__pills .cx-pill--ability')).toContain('Search lessons');
    expect(text('.cx-up__pills .cx-pill--ability .cxp-tool__off')).toBe('not on yet');
    expect([el.querySelector('.cx-up__from img')?.getAttribute('alt'), el.querySelector('.cx-up__to img')?.getAttribute('alt')]).toEqual([from, to]);
    expect(texts('.cx-tiles .cx-tile.cx-changed dt')).toEqual(['Stage', 'Total EXP', 'Abilities']);
    expect(texts('.cx-tiles .cx-tile dd')).toEqual(['2', 'Quick thinker', '65', '2']);
    expect(text('.cx-exp__num')).toBe('15 / 200 EXP');
    expect(el.querySelector('.cx-bar__fill--grow')).not.toBeNull();
    expect(el.querySelector('.cx-sheet__portrait--new')).not.toBeNull();
    expect(text('.cx-sheet__epithet .cx-new')).toBe(to);
    expect(text('#panel .won-banner')).toBe('Hex won! Pingu earns 33 EXP for this hex.');
  });

  it('waits the same way when the hex credit lands first', async () => {
    await onLastRung();
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    await win();
    const wonFirst = growthEvent('ev-won', 'campaign_node_won', 25, 57, 1, 2);
    const rungSecond = growthEvent('ev-rung', 'campaign_rung_cleared', 8, 65, 2, 2);
    await ledger(wonFirst, DOSE_OPEN);
    expect(el.querySelector('.cx-up')).toBeNull();
    http.expectNone(GROWTH_URL);
    await vi.advanceTimersByTimeAsync(GROWTH_POLL_MS);
    await ledger(rungSecond, wonFirst, DOSE_OPEN);
    (await vi.waitFor(() => http.expectOne(GROWTH_URL))).flush(PINGU_AFTER);
    (await vi.waitFor(() => http.expectOne(LOADOUT))).flush(PINGU_LOADOUT);
    await vi.waitFor(() => expect(exhibit().grew()?.gained).toBe(33));
    await settle();
    expect(text('.cx-up__heading')).toBe(`Pingu is now ${breedStageLabel('penguin', 2)}!`);
    expect(texts('.cx-tiles .cx-tile dd')[2]).toBe('65');
  });

  it('when both credits never land, says so loudly and shows the growth as read, with no moment', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    await onLastRung();
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    await win();
    const wonOnly = growthEvent('ev-won', 'campaign_node_won', 25, 57, 1, 2);
    for (let i = 0; i < GROWTH_POLL_TRIES; i++) {
      await ledger(wonOnly, DOSE_OPEN);
      await vi.advanceTimersByTimeAsync(GROWTH_POLL_MS);
    }
    http.expectNone(EVENTS);
    (await vi.waitFor(() => http.expectOne(GROWTH_URL))).flush(growth(IDS.pingu, 'Pingu', 'penguin', 2, 57, 7, 200, 'flash-lite', ['atom_search', 'cite_atom']));
    await vi.waitFor(() => expect(exhibit().selected()?.growth.expCumulative).toBe(57));
    await settle();
    http.expectNone(LOADOUT);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('campaign_rung_cleared'));
    expect(exhibit().grew()).toBeNull();
    expect(el.querySelector('.cx-up')).toBeNull();
    expect(el.querySelector('.cx-changed')).toBeNull();
    expect(texts('.cx-tiles .cx-tile dd')[2]).toBe('57');
    expect(text('#panel .won-banner')).toBe('Hex won!');
  });

  it('a win that stays inside its stage lights the changed tiles without a stage-up or a loadout read', async () => {
    await onLastRung(growth(IDS.pingu, 'Pingu', 'penguin', 2, 60, 10, 200, 'flash-lite', ['atom_search', 'cite_atom']));
    await win();
    await ledger(growthEvent('ev-won', 'campaign_node_won', 25, 93, 2, 2), growthEvent('ev-rung', 'campaign_rung_cleared', 8, 68, 2, 2));
    (await vi.waitFor(() => http.expectOne(GROWTH_URL))).flush(growth(IDS.pingu, 'Pingu', 'penguin', 2, 93, 43, 200, 'flash-lite', ['atom_search', 'cite_atom']));
    await vi.waitFor(() => expect(exhibit().grew()?.gained).toBe(33));
    await settle();
    http.expectNone(LOADOUT);
    expect(el.querySelector('.cx-up')).toBeNull();
    expect(el.querySelector('.cx-sheet__portrait--new')).toBeNull();
    expect(texts('.cx-tiles .cx-tile.cx-changed dt')).toEqual(['Total EXP']);
    expect(text('#panel .won-banner')).toBe('Hex won! Pingu earns 33 EXP for this hex.');
  });

  // After the win the drawer asks the Companion for fresh ideas around the won concept (mockup
  // wonAskHTML, line 4727). The golden run prepared a hidden batch for exactly that concept
  // (prepared-choices.json fresh.water.res, K64): the row stands on it, so it shows only when the
  // manifest holds one; a ready answer's ideas make the list (K189 (2)), and a miss shows the hidden batch.
  async function won(manifest = wonManifest()): Promise<void> {
    await onLastRung(GROWTH[IDS.pingu], manifest);
    await win();
    await ledger(WON, RUNG);
    (await vi.waitFor(() => http.expectOne(GROWTH_URL))).flush(PINGU_AFTER);
    (await vi.waitFor(() => http.expectOne(LOADOUT))).flush(PINGU_LOADOUT);
    await vi.waitFor(() => expect(exhibit().grew()).not.toBeNull());
    await settle();
  }
  const ROW = `#panel [data-live="sugg:comp:${MARCH}"]`;
  const list = () => Array.from(el.querySelectorAll('#panel .tier.t3 .sugg-row')) as HTMLElement[];
  const rows = () => list().map((r) => r.querySelector('b > bdi')?.textContent?.trim());

  async function pressAsk(): Promise<void> {
    ask = null;
    (el.querySelector(`${ROW} [data-act="live"]`) as HTMLElement).click();
    await vi.waitFor(() => expect(ask).not.toBeNull());
  }

  it('K222 (K218): after the win, "Write a new question" goes and a line says the idea takes no more questions; under the banner a box headed "{name} can suggest new ideas around {idea}" holds the LIVE ask; its ideas make the list inside the box, tagged LIVE, and an added one leaves it', async () => {
    await won();
    expect(el.querySelector('#panel [data-live^="q:"]')).toBeNull();
    expect(text('#panel .tier.t3 .won-done')).toBe('Reservoirs is won: no more questions on it.');
    const head = el.querySelector('#panel section.won-ask h4');
    expect(head?.textContent?.trim()).toBe('Pingu can suggest new ideas around Reservoirs');
    expect(head?.id).toBeTruthy();
    expect(el.querySelector('#panel section.won-ask')?.getAttribute('aria-labelledby')).toBe(head?.id);
    const after = (a: Element | null, b: Element | null) => !!a && !!b && !!(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
    expect(after(el.querySelector('#panel .won-banner'), el.querySelector('#panel .won-done'))).toBe(true);
    expect(after(el.querySelector('#panel .won-done'), el.querySelector('#panel section.won-ask'))).toBe(true);
    expect(el.querySelector(`#panel .won-ask ${ROW.replace('#panel ', '')}`)).not.toBeNull();
    expect(text(`${ROW} .live-label`)).toBe('Ask Pingu for fresh ideas around it');
    // R1, condition (a): no prepared idea is listed here, so no prepared stamp stands over it; K219: gap (c)'s line folds into the heading.
    expect(texts(`${ROW} .stamp`)).toEqual([]);
    expect(el.querySelector('#panel .sugg-ask')).toBeNull();
    await pressAsk();
    ask?.resolve({ status: 'ready', requestId: 'r-won', suggestions: [{ ...WON_PENDING[0], suggestionId: 's-live', title: 'Lower Seletar Reservoir' }] });
    await vi.waitFor(() => expect(exhibit().fresh()[0]?.source).toBe('live'));
    await settle();
    expect(rows()).toEqual(['Lower Seletar Reservoir']);
    expect(el.querySelectorAll('#panel .won-ask .sugg-row')).toHaveLength(1);
    expect(text('#panel .won-ask h4')).toBe('Pingu can suggest new ideas around Reservoirs');
    expect(text('#panel .tier.t3 .sugg-row .sugg-live')).toBe('LIVE');
    expect(el.querySelector('#panel')?.textContent).not.toContain('Fresh ideas from');
    expect(texts(`${ROW} .stamp`)).toEqual(['Live, just now']);
    // K186: the ask has its live result, so its button is gone for the demo session.
    expect(el.querySelector(`${ROW} [data-act="live"]`)).toBeNull();
    (el.querySelector('#panel [data-act="freshAccept"]') as HTMLElement).click();
    (await vi.waitFor(() => http.expectOne((r) => r.url.endsWith('/suggestions/s-live/accept')))).flush({});
    (await vi.waitFor(() => http.expectOne(`/api/v1/me/maps/${IDS.water}/graph`))).flush(waterOnLastRung(true));
    await vi.waitFor(() => expect(exhibit().busy()).toBe(false));
    await settle();
    expect(rows()).toEqual([]);
    expect(el.querySelector('#panel .sugg-state')).toBeNull();
    expect(text('#panel .won-ask .gated.sugg-emptied')).toBe('Nothing waits here now: the ideas you added are on your map.');
  });

  it('a missed ask lists the hidden batch prepared for the won concept, untagged, and offers Try again (K64, K189 (3))', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await won();
    await pressAsk();
    ask?.reject(new Error('explorer failed'));
    (await vi.waitFor(() => http.expectOne((r) => r.url === '/api/v1/me/concept-graph/suggestions' && r.params.get('goalId') === IDS.water))).flush({ suggestions: WON_PENDING });
    await vi.waitFor(() => expect(exhibit().fresh()[0]?.source).toBe('prepared'));
    await settle();
    expect(rows()).toEqual(['Bedok Reservoir', 'Kranji Reservoir']);
    expect(el.querySelector('#panel .tier.t3 .sugg-live')).toBeNull();
    expect(el.querySelector('#panel .sugg-ask')).toBeNull();
    // Gap (b): the hidden batch shown for the miss carries its own time (fresh.water.res, 13:52).
    expect(texts(`${ROW} .stamp`)).toEqual(['Showing the prepared result: the live call failed', 'Prepared 20 Oct, 13:52']);
    expect(text(`${ROW} [data-act="live"] .live-label`)).toBe('Try again');
    // Point 2: a later press's ideas join above the hidden batch, which stays listed, untagged.
    await pressAsk();
    ask?.resolve({ status: 'ready', requestId: 'r-won', suggestions: [{ ...WON_PENDING[0], suggestionId: 's-live', title: 'Lower Seletar Reservoir' }] });
    await vi.waitFor(() => expect(exhibit().fresh()[0]?.source).toBe('live'));
    await settle();
    expect(rows()).toEqual(['Lower Seletar Reservoir', 'Bedok Reservoir', 'Kranji Reservoir']);
    expect(list().map((r) => r.querySelector('.sugg-live')?.textContent?.trim() ?? null)).toEqual(['LIVE', null, null]);
    // K101: the hidden batch's ideas stay listed, so the one prepared stamp is theirs.
    expect(texts(`${ROW} .stamp`)).toEqual(['Prepared 20 Oct, 13:52', 'Live, just now']);
  });

  it('K157: an "empty" answer (every idea a repeat) is an answer, not a miss: it says nothing new and reads no hidden batch', async () => {
    await won();
    await exhibit().onSuggOutcome(MARCH, { status: 'done', kind: 'sugg', ms: 9000, at: new Date(), result: { status: 'empty', requestId: 'r-empty' } });
    expect(exhibit().fresh()).toEqual([{ source: 'live', preparedAt: null, liveAt: null, rows: [] }]);
    http.expectNone((r) => r.url === '/api/v1/me/concept-graph/suggestions');
    await settle();
    expect(text('#panel .sugg-empty')).toBe('Nothing new this time: every idea it found is already on your map or was suggested before.');
    expect(list()).toEqual([]);
    expect(el.querySelector('#panel .sugg-ask')).toBeNull();
  });

  it('with no hidden batch for the won concept, the drawer shows no such row and no box (K64), and still says the idea takes no more questions (K222)', async () => {
    await won(doseManifest());
    expect(el.querySelector(ROW)).toBeNull();
    expect(el.querySelector('#panel .won-ask')).toBeNull();
    expect(text('#panel .won-banner')).toContain('Hex won!');
    expect(text('#panel .won-done')).toBe('Reservoirs is won: no more questions on it.');
    expect(el.querySelector('#panel [data-live^="q:"]')).toBeNull();
  });

  // K222 (K218): a won hex takes no more questions, so a LIVE question still being written when the quiz is
  // won is dropped and never shown; one ending while the answer is graded waits for the grade.
  describe('K222: a LIVE question that ends after the win', () => {
    const LATE: LiveOutcome = {
      status: 'done',
      kind: 'q',
      ms: 900,
      at: new Date(),
      result: { freshSetId: 'fs-late', conceptId: MARCH, conceptKey: 'reservoirs', rung: 6, questions: parseCampaignQuestions({ candidates: [{ question_type: 'mcq', stem: 'A late one?', options: [{ option_id: 'l-a', label: 'Yes' }, { option_id: 'l-b', label: 'No' }] }] }), traceId: null, trace: null, critic: null },
    };

    it('is dropped once the quiz is won, even before the won map is read back (the march still on its rung): the won question and its verdict stay', async () => {
      await onLastRung();
      const stem = text('#panel .q-stem');
      (el.querySelectorAll('#panel [data-act="answer"]')[1] as HTMLElement).click();
      (await vi.waitFor(() => http.expectOne(`/api/v1/me/goals/${IDS.water}/campaign/questions/answer`))).flush({ correct: true, rung: 6, is_refresher: false, counted: true, cleared_rung: 6, won: true, paced_today: false, rungs_cleared: 6, current_rung_correct: 0, needed_correct: 2, retention_r: 1, correct_option_id: 'o-b', explainer: 'The catchment keeps the water clean.' });
      await vi.waitFor(() => expect(exhibit().quizWon()).toBe(true));
      exhibit().onQOutcome(MARCH, LATE);
      await settle();
      expect(text('#panel .q-stem')).toBe(stem);
      expect(el.querySelector('#panel .verdict.ok')).not.toBeNull();
      expect(exhibit().quiz()).not.toHaveProperty('freshSetId');
      await vi.waitFor(() => http.expectOne(`/api/v1/me/maps/${IDS.water}/graph`).flush(waterOnLastRung(true)));
      await ledger(WON, RUNG);
      (await vi.waitFor(() => http.expectOne(GROWTH_URL))).flush(PINGU_AFTER);
      (await vi.waitFor(() => http.expectOne(LOADOUT))).flush(PINGU_LOADOUT);
      await vi.waitFor(() => expect(exhibit().grew()).not.toBeNull());
      await settle();
      expect(text('#panel .q-stem')).toBe(stem);
      expect(exhibit().quizAnswer().state).toBe('done');
    });

    it('ending while the answer is graded, it waits: a winning grade drops it', async () => {
      await onLastRung();
      const stem = text('#panel .q-stem');
      (el.querySelectorAll('#panel [data-act="answer"]')[1] as HTMLElement).click();
      const post = await vi.waitFor(() => http.expectOne(`/api/v1/me/goals/${IDS.water}/campaign/questions/answer`));
      exhibit().onQOutcome(MARCH, LATE);
      await settle();
      expect(exhibit().quizAnswer().state).toBe('checking');
      expect(text('#panel .q-stem')).toBe(stem);
      post.flush({ correct: true, rung: 6, is_refresher: false, counted: true, cleared_rung: 6, won: true, paced_today: false, rungs_cleared: 6, current_rung_correct: 0, needed_correct: 2, retention_r: 1, correct_option_id: 'o-b', explainer: 'The catchment keeps the water clean.' });
      await vi.waitFor(() => http.expectOne(`/api/v1/me/maps/${IDS.water}/graph`).flush(waterOnLastRung(true)));
      await ledger(WON, RUNG);
      (await vi.waitFor(() => http.expectOne(GROWTH_URL))).flush(PINGU_AFTER);
      (await vi.waitFor(() => http.expectOne(LOADOUT))).flush(PINGU_LOADOUT);
      await vi.waitFor(() => expect(exhibit().grew()).not.toBeNull());
      await settle();
      expect(text('#panel .q-stem')).toBe(stem);
      expect(el.querySelector('#panel .verdict.ok')).not.toBeNull();
      expect(exhibit().quiz()).not.toHaveProperty('freshSetId');
    });

    it('ending while the answer is graded, it waits: a grade that wins nothing then shows it, as a press after a miss does (K103)', async () => {
      await onLastRung();
      (el.querySelectorAll('#panel [data-act="answer"]')[0] as HTMLElement).click();
      const post = await vi.waitFor(() => http.expectOne(`/api/v1/me/goals/${IDS.water}/campaign/questions/answer`));
      exhibit().onQOutcome(MARCH, LATE);
      post.flush({ correct: false, rung: 6, is_refresher: false, counted: false, cleared_rung: null, won: false, paced_today: false, rungs_cleared: 5, current_rung_correct: 1, needed_correct: 2, retention_r: 1, correct_option_id: 'o-b', explainer: 'Not quite.' });
      await vi.waitFor(() => expect(text('#panel .q-stem')).toBe('A late one?'));
      expect(exhibit().quizAnswer().state).toBe('none');
      expect(exhibit().quiz()).toMatchObject({ freshSetId: 'fs-late' });
    });
  });

  it('after the win, the greeting prepared before it says so, and its time moves into that line', async () => {
    await onLastRung();
    await win();
    await ledger(WON, RUNG);
    (await vi.waitFor(() => http.expectOne(GROWTH_URL))).flush(PINGU_AFTER);
    (await vi.waitFor(() => http.expectOne(LOADOUT))).flush(PINGU_LOADOUT);
    await vi.waitFor(() => expect(exhibit().grew()).not.toBeNull());
    (el.querySelector('[data-act="ability"][data-ab="dose"]') as HTMLElement).click();
    await settle();
    (await vi.waitFor(() => http.expectOne((r) => r.url === '/api/companion/daily-dose'))).flush(DOSE_WIRE);
    for (const c of DOSE_WIRE.atoms) (await vi.waitFor(() => http.expectOne(`/api/atoms/${c.atomId}`))).flush(atomRead(c.atomId, c.title, ATOM_BODIES[c.atomId]));
    (await vi.waitFor(() => http.expectOne('/api/companion/greeting'))).flush({ companion_id: IDS.pingu, turn_id: 'turn-pingu', greeting: 'Good morning!', model: 'gpt-oss:120b', replayed: true });
    await vi.waitFor(() => expect(exhibit().dose()?.state).toBe('ready'));
    await settle();
    expect(text('.cx-rail__ai')).toBe('Prepared 20 Oct, 14:02, before you won Reservoirs');
    expect(el.querySelector('.cx-rail__ai kiosk-prepared-info button[data-act="preparedInfo"]')).not.toBeNull();
    expect(el.querySelector('.cx-rail [data-live] .stamp')).toBeNull();
    expect(text('.cx-rail__rank')).toBe('Stage 2');
  });

  it('a reset during the wait stops the poll and leaves no moment for the next visitor', async () => {
    await onLastRung();
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    await win();
    await ledger(RUNG, DOSE_OPEN);
    exhibit().forget();
    await vi.advanceTimersByTimeAsync(GROWTH_POLL_MS * 3);
    await settle();
    http.expectNone(EVENTS);
    http.expectNone(GROWTH_URL);
    expect(exhibit().grew()).toBeNull();
  });

  it('Pingu’s stage 2 as production seeds it names every woken skill in plain words, Reminder too (K138 W5)', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await onLastRung();
    await win();
    await ledger(WON, RUNG);
    (await vi.waitFor(() => http.expectOne(GROWTH_URL))).flush(PINGU_AFTER);
    (await vi.waitFor(() => http.expectOne(LOADOUT))).flush(loadout(2, 3, [['progress_mirror', 1], ['explain_anew', 2], ['recap_scribe', 2], ['reminder_bell', 2, false]]));
    await vi.waitFor(() => expect(exhibit().grew()).not.toBeNull());
    await settle();
    const label = (pill: Element) => [...pill.childNodes].filter((n) => n.nodeType === Node.TEXT_NODE).map((n) => n.textContent?.trim()).join('');
    expect([...el.querySelectorAll('.cx-up__pills .cx-pill:not(.cx-pill--ability)')].map(label)).toEqual(['Explain It Differently', 'Recap Scribe', 'Reminder']);
    expect(texts('.cx-up__pills .cx-pill:not(.cx-pill--ability) .cxp-tool__off')).toEqual(['not on yet']);
    expect(error).not.toHaveBeenCalledWith(expect.stringContaining('no plain words'));
    error.mockRestore();
  });

  it('a woken skill or tool with no plain words is said loudly and shown by its key', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await onLastRung();
    await win();
    await ledger(WON, RUNG);
    (await vi.waitFor(() => http.expectOne(GROWTH_URL))).flush(growth(IDS.pingu, 'Pingu', 'penguin', 2, 65, 15, 200, 'flash-lite', ['cite_atom', 'new_tool']));
    (await vi.waitFor(() => http.expectOne(LOADOUT))).flush(loadout(2, 3, [['progress_mirror', 1], ['mystery_skill', 2]]));
    await vi.waitFor(() => expect(exhibit().grew()).not.toBeNull());
    await settle();
    expect(error).toHaveBeenCalledWith(expect.stringContaining('mystery_skill, new_tool'));
    expect(texts('.cx-up__pills .cx-pill')).toEqual(['mystery_skill', 'new_tool']);
  });

  it('a skill that woke but is not switched on in Chora is tagged, and the moment stays when another Companion is picked and back', async () => {
    await onLastRung();
    await win();
    await ledger(WON, RUNG);
    (await vi.waitFor(() => http.expectOne(GROWTH_URL))).flush(PINGU_AFTER);
    (await vi.waitFor(() => http.expectOne(LOADOUT))).flush({ ...PINGU_LOADOUT, grants: PINGU_LOADOUT.grants.map((g) => (g.skillKey === 'recap_scribe' ? { ...g, catalogueActive: false } : g)) });
    await vi.waitFor(() => expect(exhibit().grew()).not.toBeNull());
    await settle();
    expect(texts('.cx-up__pills .cx-pill:not(.cx-pill--ability) .cxp-tool__off')).toEqual(['not on yet']);
    exhibit().select(IDS.nova);
    await settle();
    expect(el.querySelector('.cx-up')).toBeNull();
    exhibit().select(IDS.pingu);
    await settle();
    expect(text('.cx-up__heading')).toBe(`Pingu is now ${breedStageLabel('penguin', 2)}!`);
  });
});
