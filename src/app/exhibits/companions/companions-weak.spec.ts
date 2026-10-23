import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { KioskLanguage, provideKioskI18n } from '../../i18n/i18n';
import { modelCallGuard } from '../../live/live-http';
import { provideLive } from '../../live/live.providers';
import { LIVE_EXECUTORS, LiveAvailability, LiveService, type LiveExecutor } from '../../live/live.service';
import { ReadinessService } from '../../kiosk-api/readiness.service';
import { readinessExample } from '../../kiosk-api/readiness.testing';
import { KioskStore } from '../../shell/kiosk.store';
import { CompanionsExhibit } from './companions-exhibit';
import { WEAK_SAVE_POLL_MS, WEAK_SAVE_TRIES } from './companions-weak';
import { CompanionsSceneComponent } from './companions-scene.component';
import { GROWTH, IDS, MAPS, PAPER_UPLOADS, PAPERS_JSON, essayJob, weakJob, weakManifest } from './companions-world.testing';
import { keepServedOrder } from '../../shared/visit-order.testing';

// The weakness analyser, Companions' fourth ability (K158): the picked Companion's prepared paper
// (D5), its prepared run's review read from the product (D6: the run itself, left at review), the
// visitor's Keep / Not this one / Same as another here on each proposed weak spot, Save my choices
// through the review's confirm (D7: never reiterate, never an output, D4). K206 and K210: a marked test
// keeps its prepared reading and has no LIVE read; Pingu's essay has the LIVE read (companions-essay.spec.ts).
describe('CompanionsSceneComponent (read my marked test)', () => {
  let http: HttpTestingController;
  let fixture: ComponentFixture<CompanionsSceneComponent>;
  let el: HTMLElement;
  const UPLOADS = '/api/v1/me/growth-edges/uploads';
  const exhibit = () => TestBed.inject(CompanionsExhibit);

  async function settle(): Promise<void> {
    for (let i = 0; i < 6; i++) {
      await Promise.resolve();
      fixture.detectChanges();
    }
  }

  beforeEach(async () => {
    // LIVE reading is on (the opening check found the reader), as on a working day; the presses are the essay's
    // (companions-essay.spec.ts), so this one never answers.
    const live: LiveExecutor = { run: () => new Promise(() => undefined) };
    TestBed.configureTestingModule({
      providers: [
        ...keepServedOrder(),
        provideHttpClient(withInterceptors([modelCallGuard])),
        provideHttpClientTesting(),
        ...provideKioskI18n(),
        ...provideLive(),
        { provide: LIVE_EXECUTORS, useValue: { weak: live } },
        { provide: LiveAvailability, useValue: { text: signal(true).asReadonly(), picture: signal(true).asReadonly(), reader: signal(true).asReadonly() } },
      ],
    });
    http = TestBed.inject(HttpTestingController);
    await TestBed.inject(KioskLanguage).ready();
    fixture = TestBed.createComponent(CompanionsSceneComponent);
    el = fixture.nativeElement as HTMLElement;
    fixture.detectChanges();
    http.expectOne('/api/v1/kiosk/prewarm/manifest').flush(weakManifest());
    for (const goal of [IDS.water, IDS.nature, IDS.hawker]) await vi.waitFor(() => http.expectOne(`/api/v1/me/maps/${goal}/graph`).flush(MAPS[goal]));
    for (const c of [IDS.pingu, IDS.nova, IDS.ember]) await vi.waitFor(() => http.expectOne(`/api/v1/me/companions/${c}/growth`).flush(GROWTH[c]));
    await vi.waitFor(() => expect(exhibit().status()).toBe('ready'));
    await settle();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    exhibit().forget();
    TestBed.inject(LiveService).endSession();
  });

  const text = (sel: string) => el.querySelector(sel)?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
  const texts = (sel: string) => Array.from(el.querySelectorAll(sel)).map((n) => n.textContent?.replace(/\s+/g, ' ').trim() ?? '');
  const click = async (sel: string) => {
    const target = el.querySelector(sel) as HTMLElement | null;
    if (!target) throw new Error(`no ${sel}`);
    target.click();
    await settle();
  };
  /** W42 (K170): the Save holds until the job read says COMPLETED (consumption's push handler finishes the job). */
  async function jobCompletes(upload: string = PAPER_UPLOADS.water): Promise<void> {
    await settle();
    expect(el.querySelector('.cx-weak__saved')).toBeNull();
    expect(text('[data-act="weakSave"]')).toBe('Saving…');
    (await vi.waitFor(() => http.expectOne(`${UPLOADS}/${upload}`))).flush({ upload_id: upload, status: 'COMPLETED', upserted_growth_edge_ids: ['g1'] });
    await settle();
  }
  const pressedOf = (edge: string) => Array.from(el.querySelectorAll(`[data-edge="${edge}"] [data-act="weakDecide"]`)).filter((b) => b.getAttribute('aria-pressed') === 'true').map((b) => b.getAttribute('data-decision'));

  /** K206: Pingu's open also reads its essay's prepared run, the LIVE read's fallback (companions-essay.spec.ts). */
  const essayRead = () => vi.waitFor(() => http.expectOne(`${UPLOADS}/${PAPER_UPLOADS.essay}`).flush(essayJob(PAPER_UPLOADS.essay)));

  /** The ability pressed for the picked Companion: the papers' titles (once a visit) and the prepared run's job (Pingu's essay's too). */
  async function openWeak(upload: string = PAPER_UPLOADS.water, titles = true): Promise<void> {
    await click('[data-act="ability"][data-ab="weak"]');
    if (titles) await vi.waitFor(() => http.expectOne('/papers/papers.json').flush(PAPERS_JSON));
    await vi.waitFor(() => http.expectOne(`${UPLOADS}/${upload}`).flush(weakJob(upload)));
    if (upload === PAPER_UPLOADS.water) await essayRead();
    await settle();
  }

  it('is the fourth ability, and the prompt now counts four', () => {
    expect(texts('[data-act="ability"]')).toEqual(['Suggest ideas to march into', 'Quiz me on this map', 'Today’s dose', 'Read my marked test']);
    expect(text('.comp-pick')).toBe('Pick one of the four above to watch it work');
  });

  it('shows the Companion’s own paper and its prepared run’s weak spots, each kept until the visitor says otherwise', async () => {
    await openWeak();
    const img = el.querySelector('.cx-weak__paper img') as HTMLImageElement;
    expect(img.getAttribute('src')).toBe('/papers/paper-water.png');
    expect(img.getAttribute('alt')).toBe('The paper: Water for Life, Unit 1 test');
    expect(text('.cx-weak__line')).toBe('The paper: Water for Life, Unit 1 test');
    expect(text('.cx-weak__hint')).toBe('Pingu reads a test paper its learner sat, marked by a teacher, and proposes the weak spots it finds. You decide which ones it keeps.');
    expect(texts('.cx-edge__label')).toEqual(['The Four National Taps', 'Reverse osmosis', 'The energy cost of desalination']);
    expect(texts('.cx-edge__summary')[0]).toBe('Rainwater is local catchment; the fourth tap is desalinated water.');
    expect(texts(`[data-edge="${PAPER_UPLOADS.water}-1"] [data-act="weakDecide"]`)).toEqual(['Keep', 'Not this one', 'Same as another here']);
    for (const i of [1, 2, 3]) expect(pressedOf(`${PAPER_UPLOADS.water}-${i}`)).toEqual(['accept']);
    // The prepared run's own time (K101); K206: the marked test has no LIVE read of its own.
    expect(text('.cx-weak .stamp')).toBe('Prepared 20 Oct, 14:30');
    expect(el.querySelector('.cx-weak [data-live]')).toBeNull();
    expect(el.querySelector('.cx-weak .live-btn')).toBeNull();
    http.verify();
  });

  it('Same as another here offers only the panel’s other kept weak spots, and Save waits until one is picked', async () => {
    await openWeak();
    const [a, b, c] = [1, 2, 3].map((i) => `${PAPER_UPLOADS.water}-${i}`);
    await click(`[data-edge="${c}"] [data-decision="reject"]`);
    await click(`[data-edge="${b}"] [data-decision="merge"]`);
    expect(pressedOf(b)).toEqual(['merge']);
    // The targets come with their question (K161), so a grey Save is not a puzzle.
    expect(text(`[data-edge="${b}"] .cx-edge__ask`)).toBe('Same as which one?');
    expect(texts(`[data-edge="${b}"] [data-act="weakInto"]`)).toEqual(['The Four National Taps']);
    expect((el.querySelector('[data-act="weakSave"]') as HTMLButtonElement).disabled).toBe(true);
    await click(`[data-edge="${b}"] [data-act="weakInto"][data-into="${a}"]`);
    expect((el.querySelector('[data-act="weakSave"]') as HTMLButtonElement).disabled).toBe(false);
    // The target dropped: the merge has nothing to go into, and Save waits again.
    await click(`[data-edge="${a}"] [data-decision="reject"]`);
    expect(texts(`[data-edge="${b}"] [data-act="weakInto"]`)).toEqual([]);
    expect((el.querySelector('[data-act="weakSave"]') as HTMLButtonElement).disabled).toBe(true);
    http.verify();
  });

  it('Save my choices confirms the review with each decision, and says how many weak spots the Companion keeps', async () => {
    await openWeak();
    const [a, b, c] = [1, 2, 3].map((i) => `${PAPER_UPLOADS.water}-${i}`);
    await click(`[data-edge="${b}"] [data-decision="merge"]`);
    await click(`[data-edge="${b}"] [data-act="weakInto"][data-into="${a}"]`);
    await click('[data-act="weakSave"]');
    const req = http.expectOne(`${UPLOADS}/${PAPER_UPLOADS.water}/resume`);
    expect(req.request.body).toEqual({
      action: 'confirm',
      edges: [
        { proposed_edge_id: a, decision: 'accept', difficulty: 'standard' },
        { proposed_edge_id: b, decision: 'merge', merge_into_id: a, difficulty: 'easier' },
        { proposed_edge_id: c, decision: 'accept', difficulty: 'standard' },
      ],
      added_struggles: [],
      selected_outputs: [],
    });
    expect((el.querySelector('[data-act="weakSave"]') as HTMLButtonElement).disabled).toBe(true);
    req.flush({ upload_id: PAPER_UPLOADS.water, status: 'completed', panel: null });
    // W42: the POST's answer is not the save; the job read saying COMPLETED is.
    await jobCompletes();
    expect(text('.cx-weak__saved')).toBe('Saved. Pingu keeps 2 weak spots, to tailor your daily dose and the ideas to march into.');
    expect(el.querySelector('[data-act="weakSave"]')).toBeNull();
    expect(el.querySelector('[data-act="weakDecide"]')).toBeNull();
  });

  it('one weak spot kept is said in the singular (K161)', async () => {
    await openWeak();
    const [b, c] = [2, 3].map((i) => `${PAPER_UPLOADS.water}-${i}`);
    await click(`[data-edge="${b}"] [data-decision="reject"]`);
    await click(`[data-edge="${c}"] [data-decision="reject"]`);
    await click('[data-act="weakSave"]');
    http.expectOne(`${UPLOADS}/${PAPER_UPLOADS.water}/resume`).flush({ upload_id: PAPER_UPLOADS.water, status: 'completed', panel: null });
    await jobCompletes();
    expect(text('.cx-weak__saved')).toBe('Saved. Pingu keeps 1 weak spot, to tailor your daily dose and the ideas to march into.');
  });

  it('nothing kept: Save still confirms, as production lets a learner drop every proposal, and says the paper changes nothing (K161)', async () => {
    await openWeak();
    const ids = [1, 2, 3].map((i) => `${PAPER_UPLOADS.water}-${i}`);
    for (const id of ids) await click(`[data-edge="${id}"] [data-decision="reject"]`);
    expect((el.querySelector('[data-act="weakSave"]') as HTMLButtonElement).disabled).toBe(false);
    await click('[data-act="weakSave"]');
    const req = http.expectOne(`${UPLOADS}/${PAPER_UPLOADS.water}/resume`);
    expect((req.request.body as { edges: { decision: string }[] }).edges.map((e) => e.decision)).toEqual(['reject', 'reject', 'reject']);
    req.flush({ upload_id: PAPER_UPLOADS.water, status: 'completed', panel: null });
    await jobCompletes();
    expect(text('.cx-weak__saved')).toBe('Saved. Pingu keeps none of these weak spots, so this paper changes nothing in your daily dose or the ideas to march into.');
  });

  it('W42: a Save whose job does not complete within the bound says plainly it was not saved, and offers no Save again for that paper', async () => {
    const errors: string[] = [];
    vi.spyOn(console, 'error').mockImplementation((...x: unknown[]) => void errors.push(x.join(' ')));
    await openWeak();
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    await click('[data-act="weakSave"]');
    // The orchestrator's graph answers at once; the job completes only once consumption embeds on Vertex.
    http.expectOne(`${UPLOADS}/${PAPER_UPLOADS.water}/resume`).flush({ upload_id: PAPER_UPLOADS.water, status: 'completed', panel: null });
    for (let i = 0; i < WEAK_SAVE_TRIES; i++) {
      await settle();
      (await vi.waitFor(() => http.expectOne(`${UPLOADS}/${PAPER_UPLOADS.water}`))).flush(weakJob(PAPER_UPLOADS.water));
      await vi.advanceTimersByTimeAsync(WEAK_SAVE_POLL_MS);
    }
    vi.useRealTimers();
    await settle();
    http.expectNone(`${UPLOADS}/${PAPER_UPLOADS.water}`);
    expect(el.querySelector('.cx-weak__saved')).toBeNull();
    expect(text('.cx-weak__notSaved')).toBe('Not saved: Pingu could not finish matching your choices to your map. This paper cannot be saved again in this demo session.');
    expect(el.querySelector('[data-act="weakSave"]')).toBeNull();
    expect(Array.from(el.querySelectorAll('[data-act="weakDecide"]')).every((b) => (b as HTMLButtonElement).disabled)).toBe(true);
    expect(errors.join('\n')).toMatch(/\[kiosk\] .*up-water.* not COMPLETED after/);
    // Back to the map and the ability again: the paper still cannot be saved.
    await click('[data-act="ability"][data-ab="quiz"]');
    await click('[data-act="ability"][data-ab="weak"]');
    expect(el.querySelector('[data-act="weakSave"]')).toBeNull();
  });

  it('W42: a job that FAILED is not saved at once, never polled further', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await openWeak();
    await click('[data-act="weakSave"]');
    http.expectOne(`${UPLOADS}/${PAPER_UPLOADS.water}/resume`).flush({ upload_id: PAPER_UPLOADS.water, status: 'completed', panel: null });
    await settle();
    (await vi.waitFor(() => http.expectOne(`${UPLOADS}/${PAPER_UPLOADS.water}`))).flush({ upload_id: PAPER_UPLOADS.water, status: 'FAILED', failure_reason: 'dead-lettered' });
    await settle();
    expect(text('.cx-weak__notSaved')).toContain('Not saved: Pingu');
    http.expectNone(`${UPLOADS}/${PAPER_UPLOADS.water}`);
  });

  it('W42: while readiness says Google’s AI (Vertex) does not work, Save is off with one plain line; the prepared review still shows (K45)', async () => {
    const readiness = TestBed.inject(ReadinessService);
    void readiness.load();
    const r = readinessExample();
    http.expectOne('/api/v1/kiosk/readiness').flush(
      readinessExample({ providers: { ollama: 'works', vertex: 'fails' }, internet: 'down', live: { ...r.live, save: { on: false, off_reason: 'internet_down' } } }),
    );
    await settle();
    await openWeak();
    expect(texts('.cx-edge__label')).toEqual(['The Four National Taps', 'Reverse osmosis', 'The energy cost of desalination']);
    expect((el.querySelector('[data-act="weakSave"]') as HTMLButtonElement).disabled).toBe(true);
    expect(text('.cx-weak__saveOff')).toBe('Save is off for now: saving needs Google’s AI online to match each weak spot to your map.');
    http.expectNone(`${UPLOADS}/${PAPER_UPLOADS.water}/resume`);
  });

  it('K177: Save follows live.save alone: a failing reader or picture (Vertex fails) leaves it offered', async () => {
    const readiness = TestBed.inject(ReadinessService);
    void readiness.load();
    const r = readinessExample();
    http.expectOne('/api/v1/kiosk/readiness').flush(
      readinessExample({
        providers: { ollama: 'works', vertex: 'fails' },
        live: { ...r.live, picture: { on: false, off_reason: 'vertex_fails' }, reader: { on: false, off_reason: 'vertex_fails' }, save: { on: true, off_reason: null } },
      }),
    );
    await settle();
    await openWeak();
    expect((el.querySelector('[data-act="weakSave"]') as HTMLButtonElement).disabled).toBe(false);
    expect(el.querySelector('.cx-weak__saveOff')).toBeNull();
  });

  for (const reason of ['internet_down', 'vertex_fails', 'not_checked', 'model_gateway_down', 'key_changed'] as const) {
    it(`K177: Save is off with live.save's reason ${reason}, even when Vertex reads works`, async () => {
      const readiness = TestBed.inject(ReadinessService);
      void readiness.load();
      const r = readinessExample();
      http.expectOne('/api/v1/kiosk/readiness').flush(readinessExample({ live: { ...r.live, save: { on: false, off_reason: reason } } }));
      await settle();
      await openWeak();
      expect((el.querySelector('[data-act="weakSave"]') as HTMLButtonElement).disabled).toBe(true);
      expect(text('.cx-weak__saveOff')).toBe('Save is off for now: saving needs Google’s AI online to match each weak spot to your map.');
    });
  }

  it('a paper reviewed with nothing kept reads back with no upserted_growth_edge_ids (omitempty) and says so, never a failure', async () => {
    const errors: string[] = [];
    vi.spyOn(console, 'error').mockImplementation((...x: unknown[]) => void errors.push(x.join(' ')));
    await click('[data-act="ability"][data-ab="weak"]');
    await vi.waitFor(() => http.expectOne('/papers/papers.json').flush(PAPERS_JSON));
    // growth_edge_uploads_handler.go:71: the ids are `omitempty`, so an empty list is no field at all.
    await vi.waitFor(() => http.expectOne(`${UPLOADS}/${PAPER_UPLOADS.water}`).flush({ upload_id: PAPER_UPLOADS.water, status: 'COMPLETED' }));
    await settle();
    expect(text('.cx-weak__saved')).toBe('Saved. Pingu keeps none of these weak spots, so this paper changes nothing in your daily dose or the ideas to march into.');
    expect(errors).toEqual([]);
  });

  it('a save the product refuses keeps the review on screen, says it failed, and reports it', async () => {
    const errors: string[] = [];
    vi.spyOn(console, 'error').mockImplementation((...x: unknown[]) => void errors.push(x.join(' ')));
    await openWeak();
    await click('[data-act="weakSave"]');
    http.expectOne(`${UPLOADS}/${PAPER_UPLOADS.water}/resume`).flush({ upload_id: PAPER_UPLOADS.water, status: 'blocked' });
    await settle();
    expect(text('.cx-weak .msg-error')).toBe('This step could not reach Chora. Please ask the presenter.');
    expect(el.querySelectorAll('[data-act="weakDecide"]').length).toBe(9);
    expect((el.querySelector('[data-act="weakSave"]') as HTMLButtonElement).disabled).toBe(false);
    expect(errors.join('\n')).toMatch(/\[kiosk\] .*review of up-water answered blocked, not completed/);
  });

  it('a paper already reviewed since the last reset shows what was kept then, from the job', async () => {
    await click('[data-act="ability"][data-ab="weak"]');
    await vi.waitFor(() => http.expectOne('/papers/papers.json').flush(PAPERS_JSON));
    await vi.waitFor(() => http.expectOne(`${UPLOADS}/${PAPER_UPLOADS.water}`).flush({ upload_id: PAPER_UPLOADS.water, status: 'COMPLETED', upserted_growth_edge_ids: ['g1', 'g2', 'g3'] }));
    await settle();
    expect(text('.cx-weak__saved')).toBe('Saved. Pingu keeps 3 weak spots, to tailor your daily dose and the ideas to march into.');
    expect(el.querySelector('[data-act="weakDecide"]')).toBeNull();
    // K206: no LIVE read of the marked test, saved or not.
    expect(el.querySelector('.cx-weak .live-btn')).toBeNull();
  });

  it('a prepared run that is not at its review, or a Companion with no prepared paper, says so loudly, never an empty panel', async () => {
    const errors: string[] = [];
    vi.spyOn(console, 'error').mockImplementation((...x: unknown[]) => void errors.push(x.join(' ')));
    await click('[data-act="ability"][data-ab="weak"]');
    await vi.waitFor(() => http.expectOne('/papers/papers.json').flush(PAPERS_JSON));
    await vi.waitFor(() => http.expectOne(`${UPLOADS}/${PAPER_UPLOADS.water}`).flush({ upload_id: PAPER_UPLOADS.water, status: 'QUEUED' }));
    await essayRead();
    await settle();
    expect(text('.cx-weak .msg-error')).toBe('This step could not reach Chora. Please ask the presenter.');
    expect(errors.join('\n')).toMatch(/\[kiosk\] .*up-water is QUEUED, not at its review/);
    // Ember's map has no prepared paper in this manifest.
    await click(`[data-act="mate"][data-id="${IDS.ember}"]`);
    await click('[data-act="ability"][data-ab="weak"]');
    expect(text('.cx-weak .msg-error')).toBe('This step could not reach Chora. Please ask the presenter.');
    expect(errors.join('\n')).toMatch(/\[kiosk\] no prepared paper for c-ember/);
    http.verify();
  });

  it('the review is kept per Companion through the visit, and a new visitor starts afresh', async () => {
    await openWeak();
    await click(`[data-edge="${PAPER_UPLOADS.water}-2"] [data-decision="reject"]`);
    await click('[data-act="ability"][data-ab="suggest"]');
    http.match(() => true).forEach((r) => r.flush({ suggestions: [] }));
    await settle();
    await click('[data-act="ability"][data-ab="weak"]');
    http.expectNone(`${UPLOADS}/${PAPER_UPLOADS.water}`);
    expect(pressedOf(`${PAPER_UPLOADS.water}-2`)).toEqual(['reject']);
    // Nova's own paper is its own read.
    await click(`[data-act="mate"][data-id="${IDS.nova}"]`);
    await click('[data-act="ability"][data-ab="weak"]');
    await vi.waitFor(() => http.expectOne(`${UPLOADS}/${PAPER_UPLOADS.nature}`).flush(weakJob(PAPER_UPLOADS.nature)));
    await settle();
    expect((el.querySelector('.cx-weak__paper img') as HTMLImageElement).getAttribute('src')).toBe('/papers/paper-nature.png');
    expect(text('.cx-weak__line')).toBe('The paper: Nature Ranger, Unit 1 test');
  });

  // W52 (K182): a tap on the paper opens how the Companion read it, inside the scene (the footer and its
  // Next stay put): the paper full size, every question that lost marks, and under each the weak spot
  // whose own words name it (paper-extract.ts). Static: no request, no write, prepared or LIVE alike.
  describe('W52: the paper popup', () => {
    const store = () => TestBed.inject(KioskStore);
    const spots = (n: number) => texts(`.paper-pop [data-q="${n}"] .pp-spot__label`);
    const HOW = 'The AI reads the whole paper and proposes weak spots without question numbers. Each sits under the question its own words name; one that names no single question is listed apart.';

    it('a tap on the paper opens it inside the scene: the paper full size, each lost mark, the weak spot under it; nothing is requested', async () => {
      await openWeak();
      expect(text('.cx-weak__tap')).toBe('Tap the paper to see how Pingu read it');
      expect(el.querySelector('.paper-pop')).toBeNull();
      await click('[data-act="paperOpen"]');
      expect(store().overlay()).toBe('paper');
      const pop = el.querySelector('.paper-pop') as HTMLElement;
      expect(pop.getAttribute('role')).toBe('dialog');
      expect(pop.getAttribute('aria-modal')).toBe('true');
      expect((pop.querySelector('.paper-pop__paper') as HTMLImageElement).getAttribute('src')).toBe('/papers/paper-water.png');
      expect(text('.paper-pop__head h3')).toBe('How Pingu read Water for Life');
      expect(text('.paper-pop__head .stamp')).toBe('Prepared 20 Oct, 14:30');
      expect(text('.paper-pop__how')).toBe(HOW);
      expect(texts('.paper-pop .pp-q__h')).toEqual(['Question 1: 1 of 2 marks', 'Question 3: 0 of 2 marks', 'Question 5: 0 of 2 marks']);
      expect(text('.paper-pop [data-q="3"] .pp-q__stem')).toBe('In desalination, which step removes the salt from seawater?');
      expect(text('.paper-pop [data-q="3"] .pp-q__answer')).toBe('Answer: Microfiltration');
      expect(text('.paper-pop [data-q="3"] .pp-q__note')).toBe('Teacher: Microfiltration removes tiny particles. Reverse osmosis removes the salt.');
      expect(text('.paper-pop [data-q="3"] .pp-q__spotH')).toBe('Weak spot proposed:');
      expect([1, 3, 5].map(spots)).toEqual([['The Four National Taps'], ['Reverse osmosis'], ['The energy cost of desalination']]);
      expect(text('.paper-pop [data-q="1"] .pp-spot__summary')).toBe('Rainwater is local catchment; the fourth tap is desalinated water.');
      expect(el.querySelector('.paper-pop .pp-q__none')).toBeNull();
      expect(el.querySelector('.paper-pop .pp-apart')).toBeNull();
      expect(text('.paper-pop [data-act="paperClose"]')).toBe('Close');
      http.verify();
    });

    it('Close, and Esc, close it and leave the panel as it was', async () => {
      await openWeak();
      await click(`[data-edge="${PAPER_UPLOADS.water}-2"] [data-decision="reject"]`);
      await click('[data-act="paperOpen"]');
      await click('[data-act="paperClose"]');
      expect(store().overlay()).toBeNull();
      expect(el.querySelector('.paper-pop')).toBeNull();
      await click('[data-act="paperOpen"]');
      store().escapeUp();
      await settle();
      expect(el.querySelector('.paper-pop')).toBeNull();
      expect(exhibit().view()).toBe('weak');
      expect(pressedOf(`${PAPER_UPLOADS.water}-2`)).toEqual(['reject']);
    });

    it('another ability, or another Companion, closes it', async () => {
      await openWeak();
      await click('[data-act="paperOpen"]');
      // The press waits on its read, so it is flushed before the press is awaited.
      const suggest = exhibit().openSuggest();
      expect(store().overlay()).toBeNull();
      await vi.waitFor(() => http.match(() => true).forEach((r) => r.flush({ suggestions: [] })));
      await suggest;
      await click('[data-act="ability"][data-ab="weak"]');
      await click('[data-act="paperOpen"]');
      expect(store().overlay()).toBe('paper');
      exhibit().select(IDS.nova);
      expect(store().overlay()).toBeNull();
    });

    it('a lost mark no weak spot names says so, and a weak spot naming no single question is listed apart', async () => {
      const job = weakJob(PAPER_UPLOADS.water);
      const [taps] = job.review.proposed_edges;
      const johor = { ...taps, proposed_edge_id: 'j', concept_label: 'The Johor water agreement', summary: 'When the agreement ends.' };
      const both = { ...taps, proposed_edge_id: 'b', concept_label: 'Reverse osmosis and its energy', summary: '' };
      await click('[data-act="ability"][data-ab="weak"]');
      await vi.waitFor(() => http.expectOne('/papers/papers.json').flush(PAPERS_JSON));
      await vi.waitFor(() => http.expectOne(`${UPLOADS}/${PAPER_UPLOADS.water}`).flush({ ...job, review: { ...job.review, proposed_edges: [taps, johor, both] } }));
      await settle();
      await click('[data-act="paperOpen"]');
      expect([1, 3, 5].map(spots)).toEqual([['The Four National Taps'], [], []]);
      expect(texts('.paper-pop [data-q="3"] .pp-q__none')).toEqual(['No weak spot names this question.']);
      expect(texts('.paper-pop .pp-q__none')).toHaveLength(2);
      expect(text('.paper-pop .pp-apart__h')).toBe('Also proposed, not tied to one question');
      expect(texts('.paper-pop .pp-apart .pp-spot__label')).toEqual(['The Johor water agreement', 'Reverse osmosis and its energy']);
    });

    it('after Save it still shows the run’s weak spots', async () => {
      await openWeak();
      await click('[data-act="weakSave"]');
      http.expectOne(`${UPLOADS}/${PAPER_UPLOADS.water}/resume`).flush({ upload_id: PAPER_UPLOADS.water, status: 'completed' });
      await jobCompletes();
      await click('[data-act="paperOpen"]');
      expect([1, 3, 5].map(spots)).toEqual([['The Four National Taps'], ['Reverse osmosis'], ['The energy cost of desalination']]);
    });

    it('a paper saved before this visit lists its lost marks and says its weak spots are not listed, never "none names it"', async () => {
      await click('[data-act="ability"][data-ab="weak"]');
      await vi.waitFor(() => http.expectOne('/papers/papers.json').flush(PAPERS_JSON));
      await vi.waitFor(() => http.expectOne(`${UPLOADS}/${PAPER_UPLOADS.water}`).flush({ upload_id: PAPER_UPLOADS.water, status: 'COMPLETED', upserted_growth_edge_ids: ['g1'] }));
      await settle();
      await click('[data-act="paperOpen"]');
      expect(texts('.paper-pop .pp-q__h')).toEqual(['Question 1: 1 of 2 marks', 'Question 3: 0 of 2 marks', 'Question 5: 0 of 2 marks']);
      expect(text('.paper-pop .paper-pop__earlier')).toBe('These weak spots were saved before this demo session, so they are not listed here.');
      expect(el.querySelector('.paper-pop .pp-q__none')).toBeNull();
      expect(el.querySelector('.paper-pop .pp-q__spotH')).toBeNull();
    });

    it('Nova’s is Nova’s own paper, and a one-mark question reads in the singular', async () => {
      await click(`[data-act="mate"][data-id="${IDS.nova}"]`);
      await openWeak(PAPER_UPLOADS.nature);
      await click('[data-act="paperOpen"]');
      expect(text('.paper-pop__head h3')).toBe('How Nova read Nature Ranger');
      expect((el.querySelector('.paper-pop__paper') as HTMLImageElement).getAttribute('src')).toBe('/papers/paper-nature.png');
      expect(texts('.paper-pop .pp-q__h')).toEqual(['Question 2: 0 of 1 mark', 'Question 3: 0 of 2 marks', 'Question 4: 0 of 2 marks', 'Question 5: 1 of 2 marks']);
    });

    it('a paper record whose lost mark names no spot_words fails loudly: the paper shows, the extract says it could not be read', async () => {
      const errors: string[] = [];
      vi.spyOn(console, 'error').mockImplementation((...x: unknown[]) => void errors.push(x.join(' ')));
      const bare = { ...PAPERS_JSON, papers: PAPERS_JSON.papers.map((p) => ({ ...p, questions: p.questions.map(({ spot_words: _, ...q }) => q) })) };
      await click('[data-act="ability"][data-ab="weak"]');
      await vi.waitFor(() => http.expectOne('/papers/papers.json').flush(bare));
      await vi.waitFor(() => http.expectOne(`${UPLOADS}/${PAPER_UPLOADS.water}`).flush(weakJob(PAPER_UPLOADS.water)));
      await settle();
      // The panel itself still reviews and saves.
      expect(texts('.cx-edge__label')).toHaveLength(3);
      await click('[data-act="paperOpen"]');
      expect((el.querySelector('.paper-pop__paper') as HTMLImageElement).getAttribute('src')).toBe('/papers/paper-water.png');
      expect(text('.paper-pop .msg-error')).toBe('This step could not reach Chora. Please ask the presenter.');
      expect(el.querySelector('.paper-pop .pp-q')).toBeNull();
      expect(errors.join('\n')).toMatch(/\[kiosk\] .*papers\.json's paper\.water question 1 lost marks and names no spot_words/);
    });
  });

  // W52 (K182 with K173): the tour's Companions beats gain C6, the paper popup after C5's panel. Next on
  // C5 opens it, Back on C6 closes it to C5, Back from D1 opens it again: reads only, never a write.
  describe('W52: the tour’s C5 and C6', () => {
    const store = () => TestBed.inject(KioskStore);
    async function reads(): Promise<void> {
      await vi.waitFor(() => http.expectOne('/papers/papers.json').flush(PAPERS_JSON));
      await vi.waitFor(() => http.expectOne(`${UPLOADS}/${PAPER_UPLOADS.water}`).flush(weakJob(PAPER_UPLOADS.water)));
      await essayRead();
    }

    it('C6 by Next opens Pingu’s paper popup over C5’s panel; C5 by Back closes it', async () => {
      exhibit().select(IDS.nova);
      const c5 = exhibit().tourShow('weak', 'next');
      await reads();
      await c5;
      await settle();
      expect(exhibit().tourShows('weak')).toBe(true);
      expect(exhibit().tourShows('paper')).toBe(false);
      await exhibit().tourShow('paper', 'next');
      await settle();
      expect(store().overlay()).toBe('paper');
      expect(text('.paper-pop__head h3')).toBe('How Pingu read Water for Life');
      expect(exhibit().tourShows('paper')).toBe(true);
      expect(exhibit().tourShows('weak')).toBe(false);
      await exhibit().tourShow('weak', 'back');
      await settle();
      expect(store().overlay()).toBeNull();
      expect(el.querySelector('.paper-pop')).toBeNull();
      expect(exhibit().view()).toBe('weak');
      expect(exhibit().tourShows('weak')).toBe(true);
      http.verify();
    });

    it('C6 by Back from D1, with nothing open, reads Pingu’s paper and opens the popup: reads only', async () => {
      const c6 = exhibit().tourShow('paper', 'back');
      await reads();
      await c6;
      await settle();
      expect(exhibit().selected()?.id).toBe(IDS.pingu);
      expect(store().overlay()).toBe('paper');
      expect(texts('.paper-pop .pp-q__h')).toHaveLength(3);
      http.verify();
    });

    it('a free Close on C6 leaves the beat not shown, so the tour’s Back shows it again first', async () => {
      const c6 = exhibit().tourShow('paper', 'next');
      await reads();
      await c6;
      await settle();
      await click('[data-act="paperClose"]');
      expect(exhibit().tourShows('paper')).toBe(false);
      expect(exhibit().tourShows('weak')).toBe(true);
    });

    it('C6 on a paper that failed to load opens no popup and says so loudly', async () => {
      const errors: string[] = [];
      vi.spyOn(console, 'error').mockImplementation((...x: unknown[]) => void errors.push(x.join(' ')));
      const c6 = exhibit().tourShow('paper', 'next');
      await vi.waitFor(() => http.expectOne('/papers/papers.json').flush(PAPERS_JSON));
      await vi.waitFor(() => http.expectOne(`${UPLOADS}/${PAPER_UPLOADS.water}`).flush({ upload_id: PAPER_UPLOADS.water, status: 'QUEUED' }));
      await essayRead();
      await c6;
      await settle();
      expect(store().overlay()).toBeNull();
      expect(errors.join('\n')).toMatch(/\[kiosk\] the tour could not open Pingu's paper: its marked test is failed/);
    });
  });
});
