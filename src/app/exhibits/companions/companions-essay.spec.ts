import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { KioskLanguage, provideKioskI18n } from '../../i18n/i18n';
import { modelCallGuard } from '../../live/live-http';
import { provideLive } from '../../live/live.providers';
import { LIVE_POLL_MS } from '../../live/live-kinds';
import { LIVE_EXECUTORS, LiveAvailability, LiveService, type LiveExecutor, type LiveRunContext } from '../../live/live.service';
import { WeakLive, type WeakParams } from '../../live/kinds/weak.live';
import { keepServedOrder } from '../../shared/visit-order.testing';
import { CompanionsExhibit } from './companions-exhibit';
import { CompanionsSceneComponent } from './companions-scene.component';
import { GROWTH, IDS, MAPS, PAPER_UPLOADS, PAPERS_JSON, allPapersManifest, essayJob, weakJob } from './companions-world.testing';

// K206 (W90) and K210: "Read my marked test" gets a second document for Pingu, a marked one-page essay, and
// the LIVE press reads it. Pingu's panel has two tabs: the Unit 1 test (its prepared reading, no LIVE button)
// and the Unit 2 essay (a NEW mark; its page, the caption and "Read the essay with Pingu"; nothing listed
// before the press). A LIVE read that is done lists its run; one that misses, or LIVE reading off, lists the
// essay's prepared reading, labelled as prepared (K45). One "Save my choices" saves both documents. Nova's
// and Ember's marked tests are one document each, with no tabs and no LIVE read at all.
describe('CompanionsSceneComponent (read my marked test: Pingu’s essay, K206 and K210)', () => {
  let http: HttpTestingController;
  let fixture: ComponentFixture<CompanionsSceneComponent>;
  let el: HTMLElement;
  let press: { resolve: (r: unknown) => void; reject: (e: Error) => void } | null;
  let pressed: unknown[];
  /** True: the press runs the real reader (weak.live.ts) against the HTTP double, not the held promise. */
  let realReader: boolean;
  const reader = signal(true);
  // The bytes the build serves for the essay in the real reader's case, and their sha256 (weak.live.spec.ts's).
  const ESSAY_BYTES = new Uint8Array([1, 2, 3]);
  const ESSAY_SHA = '039058c6f2c0cb492c533b0a4d14ef77cc0f78abccced5287d84a1a2011cfb81';
  const UPLOADS = '/api/v1/me/growth-edges/uploads';
  const exhibit = () => TestBed.inject(CompanionsExhibit);
  const ESSAY_LABELS = ['How NEWater is treated', 'Who uses NEWater', 'Why desalination costs more', 'Brine disposal'];
  const TEST_LABELS = ['The Four National Taps', 'Reverse osmosis', 'The energy cost of desalination'];
  const CAPTION = 'Now we ask Pingu to read a new document: a one-page essay its learner wrote on an open question. Pingu reads it live, right now, and suggests the learning edges it finds.';

  async function settle(): Promise<void> {
    for (let i = 0; i < 6; i++) {
      await Promise.resolve();
      fixture.detectChanges();
    }
  }

  beforeEach(async () => {
    press = null;
    pressed = [];
    realReader = false;
    reader.set(true);
    const live: LiveExecutor = {
      run: (params: unknown, ctx: LiveRunContext) => {
        pressed.push(params);
        // The world's sha is a stand-in (`<file>-sha`), so the real reader checks the served bytes' own;
        // the bytes check has its own case (weak.live.spec.ts).
        if (realReader) return TestBed.inject(WeakLive).run({ ...(params as WeakParams), sha256: ESSAY_SHA }, ctx);
        return new Promise((resolve, reject) => (press = { resolve, reject }));
      },
    };
    TestBed.configureTestingModule({
      providers: [
        ...keepServedOrder(),
        provideHttpClient(withInterceptors([modelCallGuard])),
        provideHttpClientTesting(),
        ...provideKioskI18n(),
        ...provideLive(),
        { provide: LIVE_EXECUTORS, useValue: { weak: live } },
        { provide: LiveAvailability, useValue: { text: signal(true).asReadonly(), picture: signal(true).asReadonly(), reader: reader.asReadonly() } },
      ],
    });
    http = TestBed.inject(HttpTestingController);
    await TestBed.inject(KioskLanguage).ready();
    fixture = TestBed.createComponent(CompanionsSceneComponent);
    el = fixture.nativeElement as HTMLElement;
    fixture.detectChanges();
    http.expectOne('/api/v1/kiosk/prewarm/manifest').flush(allPapersManifest());
    for (const goal of [IDS.water, IDS.nature, IDS.hawker]) await vi.waitFor(() => http.expectOne(`/api/v1/me/maps/${goal}/graph`).flush(MAPS[goal]));
    for (const c of [IDS.pingu, IDS.nova, IDS.ember]) await vi.waitFor(() => http.expectOne(`/api/v1/me/companions/${c}/growth`).flush(GROWTH[c]));
    await vi.waitFor(() => expect(exhibit().status()).toBe('ready'));
    await settle();
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    exhibit().forget();
    TestBed.inject(LiveService).endSession();
    await TestBed.inject(KioskLanguage).setLang('en');
  });

  const text = (sel: string) => el.querySelector(sel)?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
  const texts = (sel: string) => Array.from(el.querySelectorAll(sel)).map((n) => n.textContent?.replace(/\s+/g, ' ').trim() ?? '');
  const click = async (sel: string) => {
    const target = el.querySelector(sel) as HTMLElement | null;
    if (!target) throw new Error(`no ${sel}`);
    target.click();
    await settle();
  };
  const zh = async () => {
    await TestBed.inject(KioskLanguage).setLang('zh');
    await settle();
  };
  const pressedOf = (edge: string) => Array.from(el.querySelectorAll(`[data-edge="${edge}"] [data-act="weakDecide"]`)).filter((b) => b.getAttribute('aria-pressed') === 'true').map((b) => b.getAttribute('data-decision'));
  const tab = (doc: string) => el.querySelector(`[data-act="weakDoc"][data-doc="${doc}"]`) as HTMLButtonElement;

  /** Pingu's ability: the papers' titles (once a visit), its test's prepared run and its essay's. */
  async function openPingu(essay: object = essayJob(PAPER_UPLOADS.essay)): Promise<void> {
    await click('[data-act="ability"][data-ab="weak"]');
    await vi.waitFor(() => http.expectOne('/papers/papers.json').flush(PAPERS_JSON));
    await vi.waitFor(() => http.expectOne(`${UPLOADS}/${PAPER_UPLOADS.water}`).flush(weakJob(PAPER_UPLOADS.water)));
    await vi.waitFor(() => http.expectOne(`${UPLOADS}/${PAPER_UPLOADS.essay}`).flush(essay));
    await settle();
  }

  /** The essay tab, its LIVE read pressed and answered with a run of its own. */
  async function essayReadLive(): Promise<void> {
    await click('[data-act="weakDoc"][data-doc="essay"]');
    await click('.cx-weak .live-btn');
    press?.resolve({ uploadId: 'up-live', review: essayJob('up-live').review });
    await settle();
  }

  /** Save's confirms answered, then each job read saying COMPLETED (W42). */
  async function saved(...uploads: string[]): Promise<void> {
    for (const u of uploads) http.expectOne(`${UPLOADS}/${u}/resume`).flush({ upload_id: u, status: 'completed', panel: null });
    await settle();
    for (const u of uploads) (await vi.waitFor(() => http.expectOne(`${UPLOADS}/${u}`))).flush({ upload_id: u, status: 'COMPLETED', upserted_growth_edge_ids: ['g'] });
    await settle();
  }

  it('Pingu’s panel has two tabs, the test’s first and pressed, the essay’s with a NEW mark (en and zh)', async () => {
    await openPingu();
    expect(Array.from(el.querySelectorAll('[data-act="weakDoc"]')).map((t) => t.getAttribute('data-doc'))).toEqual(['test', 'essay']);
    expect(texts('[data-act="weakDoc"] .cx-doc__label')).toEqual(['Unit 1 test · read before', 'Unit 2 essay']);
    expect(text('[data-doc="essay"] .cx-doc__new')).toBe('NEW');
    expect(tab('test').querySelector('.cx-doc__new')).toBeNull();
    expect([tab('test').getAttribute('aria-pressed'), tab('essay').getAttribute('aria-pressed')]).toEqual(['true', 'false']);
    expect([tab('test').classList.contains('on'), tab('essay').classList.contains('on')]).toEqual([true, false]);
    await zh();
    expect(texts('[data-act="weakDoc"] .cx-doc__label')).toEqual(['第 1 单元测验 · 之前读过', '第 2 单元短文']);
    expect(text('[data-doc="essay"] .cx-doc__new')).toBe('新');
  });

  it('the test tab is today’s panel: its prepared reading, Keep, Not this one and Same as another here, and no LIVE row', async () => {
    await openPingu();
    expect((el.querySelector('.cx-weak__paper img') as HTMLImageElement).getAttribute('src')).toBe('/papers/paper-water.png');
    expect(text('.cx-weak__line')).toBe('The paper: Water for Life, Unit 1 test');
    expect(text('.cx-weak__hint')).toBe('Pingu reads a test paper its learner sat, marked by a teacher, and proposes the weak spots it finds. You decide which ones it keeps.');
    expect(texts('.cx-edge__label')).toEqual(TEST_LABELS);
    expect(texts(`[data-edge="${PAPER_UPLOADS.water}-1"] [data-act="weakDecide"]`)).toEqual(['Keep', 'Not this one', 'Same as another here']);
    // Its prepared reading keeps its own time (K101); the LIVE read is the essay's alone (K206).
    expect(text('.cx-weak .stamp')).toBe('Prepared 20 Oct, 14:30');
    expect(el.querySelector('.cx-weak [data-live]')).toBeNull();
    expect(el.querySelector('.cx-weak [data-act="live"]')).toBeNull();
    expect(el.querySelector('.cx-weak__essayCap')).toBeNull();
    http.verify();
  });

  it('the essay tab: its page, the caption and the LIVE button in Pingu’s name, and no weak spot listed before the press (en and zh)', async () => {
    await openPingu();
    await click('[data-act="weakDoc"][data-doc="essay"]');
    expect([tab('test').getAttribute('aria-pressed'), tab('essay').getAttribute('aria-pressed')]).toEqual(['false', 'true']);
    expect((el.querySelector('.cx-weak__paper img') as HTMLImageElement).getAttribute('src')).toBe('/papers/paper-water-essay.png');
    expect(text('.cx-weak__line')).toBe('The paper: Water for Life, Unit 2 essay');
    expect(text('.cx-weak__essayCap')).toBe(CAPTION);
    expect(el.querySelector('.cx-weak__hint')).toBeNull();
    expect(text('.cx-weak .live-btn .live-label')).toBe('Read the essay with Pingu');
    expect(text('.cx-weak .live-btn .live-eta')).toBe('takes a while');
    // Nothing read yet: no weak spot, no stamp, and the page is no tap target (there is no reading to show).
    expect(el.querySelector('.cx-edge')).toBeNull();
    expect(el.querySelector('.cx-weak .stamp')).toBeNull();
    expect(el.querySelector('[data-act="paperOpen"]')).toBeNull();
    // The one Save still saves the test's choices.
    expect(text('[data-act="weakSave"]')).toBe('Save my choices');
    await zh();
    expect(text('.cx-weak__essayCap')).toBe('现在请 Pingu 读一份新的文件：学习者就一道开放式问题写的一页短文。Pingu 会现场实时阅读，并提出它找到的学习边缘。');
    expect(text('.cx-weak .live-btn .live-label')).toBe('请 Pingu 现场读这篇短文');
    http.verify();
  });

  it('LIVE: the press sends the essay; while it runs nothing is listed; its run then lists under LIVE tags, and the button is spent (K186)', async () => {
    await openPingu();
    await click('[data-act="weakDoc"][data-doc="essay"]');
    await click('.cx-weak .live-btn');
    expect(pressed).toEqual([{ paper: 'paper-water-essay.png', sha256: 'paper-water-essay.png-sha', goalId: IDS.water, uploadKind: 'marked_test' }]);
    // A call running is not LIVE being off: the prepared reading stays out of sight.
    expect(el.querySelector('.cx-weak .live-status')).not.toBeNull();
    expect(el.querySelector('.cx-edge')).toBeNull();
    press?.resolve({ uploadId: 'up-live', review: essayJob('up-live').review });
    await settle();
    expect(texts('.cx-edge__name')).toEqual(ESSAY_LABELS);
    expect(texts('.cx-edge__label .live-tag')).toEqual(['LIVE', 'LIVE', 'LIVE', 'LIVE']);
    for (const i of [1, 2, 3, 4]) expect(pressedOf(`up-live-${i}`)).toEqual(['accept']);
    expect(text('.cx-weak .stamp')).toBe('Live, just now');
    expect(el.querySelector('.cx-weak .live-btn')).toBeNull();
    // The test tab still shows its own prepared reading, untouched.
    await click('[data-act="weakDoc"][data-doc="test"]');
    expect(texts('.cx-edge__name')).toEqual(TEST_LABELS);
    expect(el.querySelector('.cx-edge__label .live-tag')).toBeNull();
    await zh();
    await click('[data-act="weakDoc"][data-doc="essay"]');
    expect(texts('.cx-edge__label .live-tag')).toEqual(['实时', '实时', '实时', '实时']);
  });

  it('LIVE missed: the essay’s prepared reading shows, labelled as the prepared result, and Save confirms it on its own upload', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await openPingu();
    await click('[data-act="weakDoc"][data-doc="essay"]');
    await click('.cx-weak .live-btn');
    press?.reject(new Error('upload up-live FAILED: unreadable'));
    await settle();
    expect(texts('.cx-edge__name')).toEqual(ESSAY_LABELS);
    expect(el.querySelector('.cx-edge__label .live-tag')).toBeNull();
    expect(texts('.cx-weak .stamp')).toEqual(['Showing the prepared result: the live call failed', 'Prepared 20 Oct, 14:35']);
    expect(text('.cx-weak .live-btn .live-label')).toBe('Try again');
    await click(`[data-edge="${PAPER_UPLOADS.essay}-4"] [data-decision="reject"]`);
    await click('[data-act="weakSave"]');
    const req = http.expectOne(`${UPLOADS}/${PAPER_UPLOADS.essay}/resume`);
    expect((req.request.body as { edges: { proposed_edge_id: string; decision: string }[] }).edges.map((e) => [e.proposed_edge_id, e.decision])).toEqual([
      [`${PAPER_UPLOADS.essay}-1`, 'accept'],
      [`${PAPER_UPLOADS.essay}-2`, 'accept'],
      [`${PAPER_UPLOADS.essay}-3`, 'accept'],
      [`${PAPER_UPLOADS.essay}-4`, 'reject'],
    ]);
    req.flush({ upload_id: PAPER_UPLOADS.essay, status: 'completed', panel: null });
    await saved(PAPER_UPLOADS.water);
    (await vi.waitFor(() => http.expectOne(`${UPLOADS}/${PAPER_UPLOADS.essay}`))).flush({ upload_id: PAPER_UPLOADS.essay, status: 'COMPLETED' });
    await settle();
    // The test's three kept and the essay's three.
    expect(text('.cx-weak__saved')).toBe('Saved. Pingu keeps 6 weak spots, to tailor your daily dose and the ideas to march into.');
  });

  it('LIVE read parked with no proposed weak spot (a malformed reading): the real reader counts it failed, so the prepared reading shows, labelled, with Try again', async () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    realReader = true;
    await openPingu();
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      await click('[data-act="weakDoc"][data-doc="essay"]');
      await click('.cx-weak .live-btn');
      (await vi.waitFor(() => http.expectOne('/papers/paper-water-essay.png'))).flush(new Blob([ESSAY_BYTES], { type: 'image/png' }));
      (await vi.waitFor(() => http.expectOne({ method: 'POST', url: UPLOADS }))).flush({ upload_id: 'up-live', status: 'QUEUED' });
      await vi.advanceTimersByTimeAsync(LIVE_POLL_MS);
      const parked = { ...essayJob('up-live'), review: { ...essayJob('up-live').review, proposed_edges: [], candidate_struggles: [] } };
      (await vi.waitFor(() => http.expectOne(`${UPLOADS}/up-live`))).flush(parked);
      await settle();
    } finally {
      vi.useRealTimers();
    }
    expect(texts('.cx-edge__name')).toEqual(ESSAY_LABELS);
    expect(el.querySelector('.cx-edge__label .live-tag')).toBeNull();
    expect(texts('.cx-weak .stamp')).toEqual(['Showing the prepared result: the live call failed', 'Prepared 20 Oct, 14:35']);
    expect(text('.cx-weak .live-btn .live-label')).toBe('Try again');
    expect(errors).toHaveBeenCalledWith(expect.stringMatching(/LIVE weak:.*failed: upload up-live is at review with no proposed weak spot/));
  });

  it('LIVE off at the opening check: the essay tab lists its prepared reading at once, labelled prepared, its LIVE button off', async () => {
    reader.set(false);
    await openPingu();
    await click('[data-act="weakDoc"][data-doc="essay"]');
    expect(texts('.cx-edge__name')).toEqual(ESSAY_LABELS);
    expect(text('.cx-weak .stamp')).toBe('Prepared 20 Oct, 14:35');
    expect((el.querySelector('.cx-weak .live-btn') as HTMLButtonElement).disabled).toBe(true);
    expect(text('.cx-weak .live-why')).toBe('Live calls are off for now');
    // The page is now a tap target: there is a reading to show.
    expect(el.querySelector('[data-act="paperOpen"]')).not.toBeNull();
    await zh();
    expect(text('.cx-weak .stamp')).toBe('10月20日 14:35 预先备好');
  });

  it('LIVE turned off by the presenter while the essay waits for its press: the prepared reading shows', async () => {
    await openPingu();
    await click('[data-act="weakDoc"][data-doc="essay"]');
    expect(el.querySelector('.cx-edge')).toBeNull();
    TestBed.inject(LiveService).setPresenterOff(true);
    await settle();
    expect(texts('.cx-edge__name')).toEqual(ESSAY_LABELS);
    expect(text('.cx-weak .stamp')).toBe('Prepared 20 Oct, 14:35');
  });

  it('Save my choices confirms both documents, each on its own upload with its own decisions, and the saved line counts the kept of both', async () => {
    await openPingu();
    await click(`[data-edge="${PAPER_UPLOADS.water}-3"] [data-decision="reject"]`);
    await essayReadLive();
    await click('[data-edge="up-live-4"] [data-decision="reject"]');
    await click('[data-edge="up-live-2"] [data-decision="merge"]');
    // Same as another here offers only this document's own kept weak spots (no merge across documents).
    expect(texts('[data-edge="up-live-2"] [data-act="weakInto"]')).toEqual(['How NEWater is treated', 'Why desalination costs more']);
    await click('[data-edge="up-live-2"] [data-act="weakInto"][data-into="up-live-1"]');
    await click('[data-act="weakSave"]');
    const test = http.expectOne(`${UPLOADS}/${PAPER_UPLOADS.water}/resume`);
    const essay = http.expectOne(`${UPLOADS}/up-live/resume`);
    expect(test.request.body).toEqual({
      action: 'confirm',
      edges: [
        { proposed_edge_id: `${PAPER_UPLOADS.water}-1`, decision: 'accept', difficulty: 'standard' },
        { proposed_edge_id: `${PAPER_UPLOADS.water}-2`, decision: 'accept', difficulty: 'easier' },
        { proposed_edge_id: `${PAPER_UPLOADS.water}-3`, decision: 'reject' },
      ],
      added_struggles: [],
      selected_outputs: [],
    });
    expect(essay.request.body).toEqual({
      action: 'confirm',
      edges: [
        { proposed_edge_id: 'up-live-1', decision: 'accept', difficulty: 'standard' },
        { proposed_edge_id: 'up-live-2', decision: 'merge', merge_into_id: 'up-live-1', difficulty: 'standard' },
        { proposed_edge_id: 'up-live-3', decision: 'accept', difficulty: 'easier' },
        { proposed_edge_id: 'up-live-4', decision: 'reject' },
      ],
      added_struggles: [],
      selected_outputs: [],
    });
    // The prepared essay, never shown, is never confirmed.
    http.expectNone(`${UPLOADS}/${PAPER_UPLOADS.essay}/resume`);
    expect(text('[data-act="weakSave"]')).toBe('Saving…');
    expect((el.querySelector('.cx-weak .live-row') as HTMLElement | null)?.querySelector('[data-act="live"]')).toBeFalsy();
    test.flush({ upload_id: PAPER_UPLOADS.water, status: 'completed', panel: null });
    essay.flush({ upload_id: 'up-live', status: 'completed', panel: null });
    await settle();
    for (const u of [PAPER_UPLOADS.water, 'up-live']) (await vi.waitFor(() => http.expectOne(`${UPLOADS}/${u}`))).flush({ upload_id: u, status: 'COMPLETED', upserted_growth_edge_ids: ['g'] });
    await settle();
    // The test keeps two and the essay two (a merge folds into a kept one).
    expect(text('.cx-weak__saved')).toBe('Saved. Pingu keeps 4 weak spots, to tailor your daily dose and the ideas to march into.');
    expect(el.querySelector('[data-act="weakDecide"]')).toBeNull();
    await click('[data-act="weakDoc"][data-doc="test"]');
    expect(text('.cx-weak__saved')).toBe('Saved. Pingu keeps 4 weak spots, to tailor your daily dose and the ideas to march into.');
    await zh();
    expect(text('.cx-weak__saved')).toBe('已保存。Pingu 记下了 4 个薄弱点，用来调整你的每日一练和可以进军的概念。');
  });

  it('Save with the essay not yet read confirms the test alone; a later LIVE read of the essay is saved by the same button', async () => {
    await openPingu();
    await click('[data-act="weakSave"]');
    await saved(PAPER_UPLOADS.water);
    http.expectNone(`${UPLOADS}/${PAPER_UPLOADS.essay}/resume`);
    expect(text('.cx-weak__saved')).toBe('Saved. Pingu keeps 3 weak spots, to tailor your daily dose and the ideas to march into.');
    await essayReadLive();
    expect(texts('.cx-edge__name')).toEqual(ESSAY_LABELS);
    await click('[data-act="weakSave"]');
    await saved('up-live');
    http.expectNone(`${UPLOADS}/${PAPER_UPLOADS.water}/resume`);
    expect(text('.cx-weak__saved')).toBe('Saved. Pingu keeps 7 weak spots, to tailor your daily dose and the ideas to march into.');
  });

  it('an essay whose prepared reading cannot be read says so loudly and never fails the test; after a miss the essay tab says it could not be read', async () => {
    const errors: string[] = [];
    vi.spyOn(console, 'error').mockImplementation((...x: unknown[]) => void errors.push(x.join(' ')));
    await openPingu({ upload_id: PAPER_UPLOADS.essay, status: 'QUEUED' });
    expect(texts('.cx-edge__label')).toEqual(TEST_LABELS);
    expect(errors.join('\n')).toMatch(/\[kiosk\] c-pingu's essay could not be read: the prepared run up-water-essay is QUEUED, not at its review/);
    await click('[data-act="weakDoc"][data-doc="essay"]');
    expect(el.querySelector('.cx-weak .msg-error')).toBeNull();
    await click('.cx-weak .live-btn');
    press?.reject(new Error('upload up-live FAILED: unreadable'));
    await settle();
    expect(text('.cx-weak .msg-error')).toBe('This step could not reach Chora. Please ask the presenter.');
    expect(el.querySelector('.cx-edge')).toBeNull();
  });

  it('W79: an essay read answered after Pingu was left lists its run when the essay tab is chosen again; the test tab opens first', async () => {
    await openPingu();
    await click('[data-act="weakDoc"][data-doc="essay"]');
    await click('.cx-weak .live-btn');
    await click(`[data-act="mate"][data-id="${IDS.nova}"]`);
    expect(el.querySelector('.cx-weak')).toBeNull();
    press?.resolve({ uploadId: 'up-live', review: essayJob('up-live').review });
    await vi.waitFor(() => expect(TestBed.inject(LiveService).state(`weak:comp:${IDS.pingu}`)()?.status).toBe('done'));
    await click(`[data-act="mate"][data-id="${IDS.pingu}"]`);
    await click('[data-act="ability"][data-ab="weak"]');
    http.expectNone(`${UPLOADS}/${PAPER_UPLOADS.water}`);
    http.expectNone(`${UPLOADS}/${PAPER_UPLOADS.essay}`);
    expect(tab('test').getAttribute('aria-pressed')).toBe('true');
    expect(texts('.cx-edge__name')).toEqual(TEST_LABELS);
    await click('[data-act="weakDoc"][data-doc="essay"]');
    expect(texts('.cx-edge__name')).toEqual(ESSAY_LABELS);
    expect(text('.cx-weak .stamp')).toBe('Live, just now');
  });

  it('K173: the tour’s C5 is the test tab, so the essay tab is not its view and C5 shows the test again', async () => {
    await openPingu();
    expect(exhibit().tourShows('weak')).toBe(true);
    await click('[data-act="weakDoc"][data-doc="essay"]');
    expect(exhibit().tourShows('weak')).toBe(false);
    await exhibit().tourShow('weak', 'back');
    await settle();
    expect(tab('test').getAttribute('aria-pressed')).toBe('true');
    expect(exhibit().tourShows('weak')).toBe(true);
  });

  it('K210: Nova’s and Ember’s panels are one document each, with no tabs and no LIVE read, in English and Chinese', async () => {
    const panels: [string, string, string][] = [
      [IDS.nova, PAPER_UPLOADS.nature, '/papers/paper-nature.png'],
      [IDS.ember, PAPER_UPLOADS.hawker, '/papers/paper-hawker.png'],
    ];
    let first = true;
    for (const [id, upload, src] of panels) {
      await click(`[data-act="mate"][data-id="${id}"]`);
      await click('[data-act="ability"][data-ab="weak"]');
      if (first) await vi.waitFor(() => http.expectOne('/papers/papers.json').flush(PAPERS_JSON));
      first = false;
      await vi.waitFor(() => http.expectOne(`${UPLOADS}/${upload}`).flush(weakJob(upload)));
      await settle();
      expect((el.querySelector('.cx-weak__paper img') as HTMLImageElement).getAttribute('src')).toBe(src);
      expect(texts('.cx-edge__label')).toHaveLength(3);
      for (const lang of ['en', 'zh'] as const) {
        await TestBed.inject(KioskLanguage).setLang(lang);
        await settle();
        expect(el.querySelector('[data-act="weakDoc"]'), `${id} ${lang}`).toBeNull();
        expect(el.querySelector('.cx-weak [data-live]'), `${id} ${lang}`).toBeNull();
        expect(el.querySelector('.cx-weak [data-act="live"]'), `${id} ${lang}`).toBeNull();
        expect(el.querySelector('.cx-weak .live-btn'), `${id} ${lang}`).toBeNull();
        expect(el.querySelector('.cx-weak__essayCap'), `${id} ${lang}`).toBeNull();
        expect(text('.cx-weak .stamp'), `${id} ${lang}`).toMatch(lang === 'en' ? /^Prepared 20 Oct, 14:3\d$/ : /^10月20日 14:3\d 预先备好$/);
      }
      await TestBed.inject(KioskLanguage).setLang('en');
      await settle();
    }
    http.verify();
  });

  describe('the essay’s popup', () => {
    const LINES = [
      'NEWater and desalination help because they do not need rain, so Singapore still has water in a drought.',
      'NEWater is made from used water. The used water is boiled until all the germs are dead, and then it is safe.',
      'Most of the NEWater goes straight into our taps at home for drinking.',
      'One challenge is that some people do not like the idea of drinking it.',
      'Desalination turns seawater into drinking water, and the sea is all around us.',
      'The challenge is that it is expensive because seawater is very dirty.',
      'The leftover salt is just salt, so it can be poured back into the sea anywhere.',
    ];

    it('lists its one question, the learner’s lines with each underline and the teacher’s tick or hint, and the weak spots under it', async () => {
      await openPingu();
      await essayReadLive();
      await click('[data-act="paperOpen"]');
      expect((el.querySelector('.paper-pop__paper') as HTMLImageElement).getAttribute('src')).toBe('/papers/paper-water-essay.png');
      expect(text('.paper-pop__head h3')).toBe('How Pingu read Water for Life');
      expect(text('.paper-pop__head .live-tag')).toBe('LIVE');
      expect(texts('.paper-pop .pp-q__h')).toEqual(['The essay: 4 of 8 marks']);
      expect(text('.paper-pop [data-q="1"] .pp-q__stem')).toBe('Singapore wants enough water for the future. Explain how NEWater and desalinated water help Singapore, and describe one challenge for each.');
      expect(el.querySelector('.paper-pop .pp-q__answer')).toBeNull();
      expect(texts('.paper-pop .pp-line__text')).toEqual(LINES);
      expect(texts('.paper-pop .pp-line__text u')).toEqual([
        'The used water is boiled until all the germs are dead',
        'Most of the NEWater goes straight into our taps at home for drinking.',
        'because seawater is very dirty',
        'The leftover salt is just salt, so it can be poured back into the sea anywhere.',
      ]);
      expect(texts('.paper-pop .pp-line__margin')).toEqual(['✓', '?', 'who uses most?', '✓', '✓', '?', 'just salt?']);
      expect(el.querySelector('.paper-pop .pp-line__tick')?.getAttribute('aria-label')).toBe('Teacher’s tick');
      expect(el.querySelector('.paper-pop .pp-line__hint')?.getAttribute('lang')).toBe('en');
      expect(text('.paper-pop [data-q="1"] .pp-q__note')).toBe('Teacher: Good start, and a good point about drought. Check how NEWater is really treated, and where most of it goes.');
      expect(texts('.paper-pop [data-q="1"] .pp-spot__label')).toEqual(ESSAY_LABELS);
      expect(el.querySelector('.paper-pop .pp-apart')).toBeNull();
      await zh();
      expect(texts('.paper-pop .pp-q__h')).toEqual(['短文：8分得4分']);
      expect(el.querySelector('.paper-pop .pp-line__tick')?.getAttribute('aria-label')).toBe('老师打的勾');
    });

    it('over the prepared fallback it says so; the test tab’s popup is still the test’s', async () => {
      reader.set(false);
      await openPingu();
      await click('[data-act="weakDoc"][data-doc="essay"]');
      await click('[data-act="paperOpen"]');
      expect(text('.paper-pop__head .stamp')).toBe('Prepared 20 Oct, 14:35');
      expect(texts('.paper-pop .pp-q__h')).toEqual(['The essay: 4 of 8 marks']);
      await click('[data-act="paperClose"]');
      await click('[data-act="weakDoc"][data-doc="test"]');
      await click('[data-act="paperOpen"]');
      expect((el.querySelector('.paper-pop__paper') as HTMLImageElement).getAttribute('src')).toBe('/papers/paper-water.png');
      expect(texts('.paper-pop .pp-q__h')).toEqual(['Question 1: 1 of 2 marks', 'Question 3: 0 of 2 marks', 'Question 5: 0 of 2 marks']);
      expect(el.querySelector('.paper-pop .pp-line')).toBeNull();
    });
  });
});
