import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { provideLive } from '../live/live.providers';
import { LIVE_EXECUTORS, LiveAvailability, LiveService, type LiveExecutor } from '../live/live.service';
import { signal } from '@angular/core';
import { VisitDecisions } from '../shared/sugg/visit-decisions';
import { HookStory } from './hook-story';
import {
  GOAL,
  ROOT,
  TAPS,
  NEWATER,
  DESAL,
  DESAL_IDS,
  manifest,
  graph,
  pendingDto,
  ALL_PENDING,
  NEW_UNDER_DESAL,
  SERVED,
} from './hook-world.testing';
import { VisitTally } from '../shared/visit-tally';

// Steps 1 to 3 of the story on the product's own reads: the learner's water map, the Companion's
// pending suggestions (the hidden fresh batches kept out, K64), accept or dismiss, the new idea a
// prepared set is adopted by (V1, h3 = A), and its practice question.
describe('HookStory (steps 1 to 3)', () => {
  let story: HookStory;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting(), ...provideLive()] });
    story = TestBed.inject(HookStory);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  const flushPending = (list: unknown[]) =>
    http.expectOne((r) => r.url === '/api/v1/me/concept-graph/suggestions' && r.params.get('goalId') === GOAL).flush({ suggestions: list });

  async function loaded(twinKey?: string, twinSuggestion?: string): Promise<void> {
    const done = story.load();
    http.expectOne('/api/v1/kiosk/prewarm/manifest').flush(manifest(twinKey, twinSuggestion));
    await vi.waitFor(() => http.expectOne(`/api/v1/me/maps/${GOAL}/graph`).flush(graph()));
    await vi.waitFor(() => flushPending(ALL_PENDING));
    await done;
  }

  async function accepted(): Promise<void> {
    await loaded();
    story.chooseBranch(DESAL);
    const done = story.acceptBranch();
    for (const id of ADD_ORDER) await accept(id);
    await vi.waitFor(() => http.expectOne(`/api/v1/me/maps/${GOAL}/graph`).flush(graph(NEW_UNDER_DESAL)));
    await vi.waitFor(() => flushPending(ALL_PENDING.filter((s) => !DESAL_IDS.includes(s.suggestionId))));
    await done;
  }

  /** "Add all" adds the idea step 3 asks about first (K189 (1), R4), then the batch in its order. */
  const ADD_ORDER = ['s-rod', 's-sea', 's-en'];
  const accept = (id: string) =>
    vi.waitFor(() => http.expectOne(`/api/v1/me/concept-graph/suggestions/${id}/accept`).flush({ ...pendingDto(id, DESAL, id), status: 'accepted' }));

  it('step 1: the learner’s map, resting on Four National Taps, only Desalination glowing (K139)', async () => {
    await loaded();
    expect(story.status()).toBe('ready');
    expect(story.beat()).toBe(1);
    expect(story.graph()?.concepts.length).toBe(4);
    // K191 (water map A): Desalination hangs off the root, so step 1 rests on the root.
    expect(story.lensFocusId()).toBe(ROOT);
    expect(story.frontier()).toEqual([DESAL]);
    expect(story.glowIds()).toEqual([DESAL]);
    expect(story.companionName()).toBe('Pingu');
  });

  it('fogs the glowing idea with its waiting suggestions, never the hidden fresh ones (K64)', async () => {
    await loaded();
    expect(story.fogGhosts().map((g) => g.suggestionId)).toEqual(DESAL_IDS);
    expect(story.fogGhosts()[0]).toEqual({ suggestionId: 's-sea', title: 'Seawater intake', focalConceptId: DESAL });
  });

  it('a won idea holding only hidden batches never reaches the lens: no glow, no fog ghost, no branch (K139, K64)', async () => {
    await loaded();
    const hidden = ['s-dtss', 's-fabs', 's-brine', 's-tuas', 's-rain', 's-catch'];
    expect(story.frontier()).not.toContain(NEWATER);
    expect(story.frontier()).not.toContain(ROOT);
    expect(story.glowIds()).toEqual([DESAL]);
    expect(story.fogGhosts().filter((g) => g.focalConceptId === NEWATER || g.focalConceptId === ROOT)).toEqual([]);
    expect(story.fogGhosts().filter((g) => hidden.includes(g.suggestionId))).toEqual([]);
    story.chooseBranch(NEWATER);
    story.chooseBranch(ROOT);
    expect(story.beat()).toBe(1);
    expect(story.branch()).toBeNull();
  });

  it('step 2: a glowing idea opens its prepared batch, the hidden fresh ideas kept out (K64)', async () => {
    await loaded();
    story.chooseBranch(TAPS);
    expect(story.beat()).toBe(1);
    story.chooseBranch(DESAL);
    expect(story.beat()).toBe(2);
    expect(story.lensFocusId()).toBe(DESAL);
    expect(story.drawerOpen()).toBe(true);
    expect(story.glowIds()).toEqual([]);
    expect(story.drawerSuggestions().map((s) => s.title)).toEqual(['Seawater intake', 'Reverse osmosis', 'Energy use']);
  });

  it('what the hook decides is kept for the visit, so the atlas shows it (K42)', async () => {
    await accepted();
    const decided = TestBed.inject(VisitDecisions).all();
    expect(DESAL_IDS.map((id) => decided.get(id)?.state)).toEqual(DESAL_IDS.map(() => 'added'));
    expect(decided.get(DESAL_IDS[0])?.suggestion.suggestionId).toBe(DESAL_IDS[0]);
  });

  it('accepting adds the batch to the map; the new idea a prepared set keys to glows (h3 = A)', async () => {
    await accepted();
    expect(story.beat()).toBe(3);
    expect(story.accepted()).toBe(true);
    expect(story.graph()?.concepts.length).toBe(7);
    expect(story.focusConcept()?.conceptId).toBe('c-ro');
    expect(story.practice().state).toBe('prepared');
    expect(story.glowIds()).toEqual(['c-ro']);
    expect(story.lensFocusId()).toBe(DESAL);
    expect(story.drawerOpen()).toBe(false);
  });

  it('step 3: the drawer serves the adopted set at its rung and grades an answer by its served id', async () => {
    await accepted();
    const open = story.openPanel();
    expect(story.lensFocusId()).toBe('c-ro');
    const req = await vi.waitFor(() => http.expectOne((r) => r.url === `/api/v1/me/goals/${GOAL}/campaign/questions`));
    expect(req.request.params.get('concept_id')).toBe('c-ro');
    expect(req.request.params.get('rung')).toBe('1');
    req.flush(SERVED);
    await open;
    const p = story.practice();
    expect(p.state).toBe('ready');
    if (p.state !== 'ready') throw new Error('not ready');
    expect(p.question.stem).toBe('Which step holds back dissolved salts?');
    expect(p.question.options.map((o) => o.text)).toEqual(['UV disinfection', 'Microfiltration', 'Reverse osmosis']);
    expect(p.preparedAt.toISOString()).toBe('2026-10-20T05:41:40.000Z');

    const answering = story.answerWith('c161');
    expect(story.answer().state).toBe('checking');
    const post = http.expectOne(`/api/v1/me/goals/${GOAL}/campaign/questions/answer`);
    expect(post.request.body).toEqual({ concept_id: 'c-ro', rung: 1, question_index: 0, selected_option_id: 'c161' });
    post.flush({ correct: true, rung: 1, is_refresher: false, counted: true, cleared_rung: 0, won: false, paced_today: false, rungs_cleared: 0, current_rung_correct: 1, needed_correct: 2, retention_r: 1, correct_option_id: 'c161', explainer: 'Salts stay behind.' });
    await answering;
    const a = story.answer();
    expect(a.state).toBe('done');
    if (a.state === 'done') {
      expect(a.result.correct).toBe(true);
      expect(a.selected).toBe('c161');
    }
    // The crews timeline's tally counts the graded answer (mockup hookAnswer, line 4488).
    expect(TestBed.inject(VisitTally).answers()).toBe(1);
    story.answerWith('45a9');
    http.expectNone(`/api/v1/me/goals/${GOAL}/campaign/questions/answer`);
    expect(TestBed.inject(VisitTally).answers()).toBe(1);
  });

  it('a serve door that answers anything but ready is a loud failure, never a question', async () => {
    await accepted();
    const open = story.openPanel();
    (await vi.waitFor(() => http.expectOne((r) => r.url === `/api/v1/me/goals/${GOAL}/campaign/questions`))).flush({ ...SERVED, status: 'requested', questions: undefined });
    await open;
    const p = story.practice();
    expect(p.state).toBe('failed');
    if (p.state === 'failed') expect(p.reason).toMatch(/requested/);
  });

  it('the chosen batch’s twin whose key the minted idea does not carry: said loudly, no practice, no serve call (h3 = A)', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await loaded('no-such-key');
    story.chooseBranch(DESAL);
    const done = story.acceptBranch();
    for (const id of ADD_ORDER) await accept(id);
    await vi.waitFor(() => http.expectOne(`/api/v1/me/maps/${GOAL}/graph`).flush(graph(NEW_UNDER_DESAL)));
    await vi.waitFor(() => flushPending([]));
    await done;
    expect(story.focusConcept()?.conceptId).toBe('c-sea');
    expect(story.practice().state).toBe('none');
    await story.openPanel();
    http.expectNone((r) => r.url.includes('/campaign/questions'));
    expect(error).toHaveBeenCalledWith(expect.stringContaining('v1.reverse-osmosis'));
    error.mockRestore();
  });

  it('a twin made from another batch is not this batch’s: the first new idea, no practice, nothing to report (h3 = A)', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await loaded('reverse-osmosis', 's-elsewhere');
    story.chooseBranch(DESAL);
    const done = story.acceptBranch();
    for (const id of DESAL_IDS) {
      await vi.waitFor(() => http.expectOne(`/api/v1/me/concept-graph/suggestions/${id}/accept`).flush({ ...pendingDto(id, DESAL, id), status: 'accepted' }));
    }
    await vi.waitFor(() => http.expectOne(`/api/v1/me/maps/${GOAL}/graph`).flush(graph(NEW_UNDER_DESAL)));
    await vi.waitFor(() => flushPending([]));
    await done;
    expect(story.focusConcept()?.conceptId).toBe('c-sea');
    expect(story.practice().state).toBe('none');
    expect(error).not.toHaveBeenCalled();
    error.mockRestore();
  });

  it('“Leave them out” dismisses the batch and returns to step 1 with no idea glowing; Next goes on to the teacher (K42, K139)', async () => {
    await loaded();
    story.chooseBranch(DESAL);
    const done = story.skipBranch();
    for (const id of DESAL_IDS) {
      await vi.waitFor(() => http.expectOne(`/api/v1/me/concept-graph/suggestions/${id}/dismiss`).flush({ ...pendingDto(id, DESAL, id), status: 'dismissed' }));
    }
    await vi.waitFor(() => flushPending(ALL_PENDING.filter((s) => !DESAL_IDS.includes(s.suggestionId))));
    await done;
    expect(story.beat()).toBe(1);
    expect(story.branch()).toBeNull();
    expect(story.frontier()).toEqual([]);
    expect(story.glowIds()).toEqual([]);
    expect(story.skipped()).toEqual([DESAL]);
    await story.next();
    expect(story.beat()).toBe(4);
  });

  it('Next without a click takes the glowing idea, Desalination (K139); Back reviews an earlier step', async () => {
    await loaded();
    story.next();
    expect(story.branch()).toBe(DESAL);
    expect(story.beat()).toBe(2);
    story.back();
    expect(story.beat()).toBe(1);
    expect(story.reviewing()).toBe(true);
    expect(story.glowIds()).toEqual([]);
    story.next();
    expect(story.beat()).toBe(2);
    expect(story.reviewing()).toBe(false);
  });

  it('an answer the server does not grade is a failed answer, not a verdict', async () => {
    await accepted();
    const open = story.openPanel();
    (await vi.waitFor(() => http.expectOne((r) => r.url === `/api/v1/me/goals/${GOAL}/campaign/questions`))).flush(SERVED);
    await open;
    const answering = story.answerWith('c161');
    http.expectOne(`/api/v1/me/goals/${GOAL}/campaign/questions/answer`).flush({ code: 'X', message: 'down' }, { status: 503, statusText: 'Down' });
    await answering;
    expect(story.answer().state).toBe('failed');
    expect(TestBed.inject(VisitTally).answers()).toBe(0);
  });

  it('a failed accept stops the story loudly and lets the buttons go', async () => {
    await loaded();
    story.chooseBranch(DESAL);
    const done = story.acceptBranch();
    http.expectOne('/api/v1/me/concept-graph/suggestions/s-rod/accept').flush({ code: 'X' }, { status: 500, statusText: 'Boom' });
    await done;
    expect(story.status()).toBe('failed');
    expect(story.busy()).toBe(false);
    expect(story.beat()).toBe(2);
  });

  it('Next walks the steps with the prepared moves, step 2 waiting for its Add (K189 (1)), then on to the teacher (K34)', async () => {
    await loaded();
    story.next();
    expect(story.beat()).toBe(2);
    // K189 (1): step 2's Next waits until Reverse osmosis is on the map; "Add all" is the visitor's move.
    await story.next();
    http.expectNone((r) => r.url.endsWith('/accept'));
    const accepting = (async () => {
      for (const id of ADD_ORDER) await accept(id);
      await vi.waitFor(() => http.expectOne(`/api/v1/me/maps/${GOAL}/graph`).flush(graph(NEW_UNDER_DESAL)));
      await vi.waitFor(() => flushPending([]));
    })();
    void story.acceptBranch();
    await accepting;
    await vi.waitFor(() => expect(story.beat()).toBe(3));
    // Behind the scenes follows the beat (mockup hookXrayKind): the map until step 3's question shows.
    expect(story.xrayKind()).toBe('maps');
    story.next();
    (await vi.waitFor(() => http.expectOne((r) => r.url === `/api/v1/me/goals/${GOAL}/campaign/questions`))).flush(SERVED);
    await vi.waitFor(() => expect(story.practice().state).toBe('ready'));
    expect(story.xrayKind()).toBe('q');
    expect(story.step()).toBe(4);
    story.next();
    expect(story.beat()).toBe(4);
    expect(story.sub()).toBe('a');
    expect(story.xrayKind()).toBe('draft');
    expect(story.step()).toBe(5);
    story.back();
    expect(story.step()).toBe(4);
    expect(story.lensFocusId()).toBe('c-ro');
    story.viewStep(1);
    story.back();
    expect(story.step()).toBe(1);
    story.viewStep(9);
    expect(story.step()).toBe(1);
  });

  it('a second load while one is reading makes no second read', async () => {
    const a = story.load();
    const b = story.load();
    http.expectOne('/api/v1/kiosk/prewarm/manifest').flush(manifest());
    await vi.waitFor(() => http.expectOne(`/api/v1/me/maps/${GOAL}/graph`).flush(graph()));
    await vi.waitFor(() => flushPending(ALL_PENDING));
    await Promise.all([a, b]);
    expect(story.status()).toBe('ready');
  });

  it('names its talking point per beat, h4b on the picture (the presenter panel)', async () => {
    await loaded();
    expect(story.talkKey()).toBe('h1');
    story.chooseBranch(DESAL);
    expect(story.talkKey()).toBe('h2');
    story.toTeacher();
    expect(story.talkKey()).toBe('h4');
    story.viewStep(6);
    expect(story.talkKey()).toBe('h4');
  });

  it('a jump reaches a beat by the story’s own prepared moves, real calls and all, and reviews a beat already reached', async () => {
    await loaded();
    const jumping = story.advanceToBeat(3);
    for (const id of ADD_ORDER) await accept(id);
    await vi.waitFor(() => http.expectOne(`/api/v1/me/maps/${GOAL}/graph`).flush(graph(NEW_UNDER_DESAL)));
    await vi.waitFor(() => flushPending([]));
    await jumping;
    expect(story.beat()).toBe(3);
    expect(story.step()).toBe(3);
    expect(story.maxStep()).toBe(3);
    await story.advanceToBeat(1);
    expect(story.step()).toBe(1);
    expect(story.reviewing()).toBe(true);
  });

  it('LIVE sugg: a live answer is its own group of fresh ideas; a missed one shows the prepared fresh batch, labelled (K64)', async () => {
    await loaded();
    story.chooseBranch(DESAL);
    story.onSuggOutcome({ status: 'done', kind: 'sugg', ms: 900, at: new Date(), result: { status: 'ready', requestId: 'r1', suggestions: [pendingDto('s-live', DESAL, 'Brine recovery')] } });
    expect(story.fresh()?.source).toBe('live');
    expect(story.fresh()?.rows.map((r) => r.suggestion.title)).toEqual(['Brine recovery']);
    story.onSuggOutcome({ status: 'missed', kind: 'sugg', reason: 'late', ms: 20000 });
    const f = story.fresh();
    expect(f?.source).toBe('prepared');
    expect(f?.rows.map((r) => r.suggestion.title)).toEqual(['Brine discharge', 'Tuas plant']);
    expect(f?.preparedAt?.toISOString()).toBe('2026-10-20T05:31:40.000Z');
    expect(story.drawerSuggestions().map((s) => s.title)).toEqual(['Seawater intake', 'Reverse osmosis', 'Energy use']);
  });

  describe('K189 (1): step 2, each of the six addable, Next waiting for the idea step 3 asks about', () => {
    async function loadedWith(g: object): Promise<void> {
      const done = story.load();
      http.expectOne('/api/v1/kiosk/prewarm/manifest').flush(manifest());
      await vi.waitFor(() => http.expectOne(`/api/v1/me/maps/${GOAL}/graph`).flush(g));
      await vi.waitFor(() => flushPending(ALL_PENDING));
      await done;
    }
    async function addOne(id: string, onMap: { id: string; title: string; under: string }[], left: string[]): Promise<void> {
      const adding = story.addIdea(id);
      await accept(id);
      await vi.waitFor(() => http.expectOne(`/api/v1/me/maps/${GOAL}/graph`).flush(graph(onMap)));
      await vi.waitFor(() => flushPending(ALL_PENDING.filter((s) => !DESAL_IDS.includes(s.suggestionId) || left.includes(s.suggestionId))));
      await adding;
    }

    it('an idea added on its own leaves the list and step 2 stays; Next waits until Reverse osmosis is on the map, then goes on', async () => {
      await loaded();
      story.chooseBranch(DESAL);
      expect(story.waitsFor()).toBe('Reverse osmosis');
      expect(story.nextWaits()).toBe(true);
      expect(story.branchUntouched()).toBe(true);
      await story.next();
      http.expectNone((r) => r.url.endsWith('/accept'));
      expect(story.beat()).toBe(2);
      await addOne('s-sea', [NEW_UNDER_DESAL[0]], ['s-rod', 's-en']);
      expect(story.beat()).toBe(2);
      expect(story.drawerSuggestions().map((s) => s.title)).toEqual(['Reverse osmosis', 'Energy use']);
      expect(story.nextWaits()).toBe(true);
      expect(story.branchUntouched()).toBe(false);
      expect(TestBed.inject(VisitDecisions).all().get('s-sea')?.state).toBe('added');
      await addOne('s-rod', NEW_UNDER_DESAL.slice(0, 2), ['s-en']);
      expect(story.waitsFor()).toBeNull();
      expect(story.nextWaits()).toBe(false);
      expect(story.beat()).toBe(2);
      await story.next();
      expect(story.beat()).toBe(3);
      expect(story.accepted()).toBe(true);
      expect(story.focusConcept()?.conceptId).toBe('c-ro');
      expect(story.practice().state).toBe('prepared');
      expect(story.glowIds()).toEqual(['c-ro']);
    });

    it('"Add all" adds the waiting ideas that fit, Reverse osmosis first, then goes on to step 3', async () => {
      const four = ['k1', 'k2', 'k3', 'k4'].map((k) => ({ id: `c-${k}`, title: `Kid ${k}`, under: DESAL }));
      await loadedWith(graph(four));
      story.chooseBranch(DESAL);
      expect(story.addAllIds()).toEqual(['s-rod', 's-sea']);
      const done = story.acceptBranch();
      await accept('s-rod');
      await accept('s-sea');
      await vi.waitFor(() => http.expectOne(`/api/v1/me/maps/${GOAL}/graph`).flush(graph([...four, ...NEW_UNDER_DESAL.slice(0, 2)])));
      await vi.waitFor(() => flushPending(ALL_PENDING.filter((s) => !['s-rod', 's-sea'].includes(s.suggestionId))));
      await done;
      http.expectNone((r) => r.url.endsWith('/s-en/accept'));
      expect(story.beat()).toBe(3);
      expect(story.focusConcept()?.conceptId).toBe('c-ro');
    });

    it('"Add all" counts only what still waits and fits; none at all when the idea is full', async () => {
      await loaded();
      story.chooseBranch(DESAL);
      expect(story.addAllIds()).toEqual(ADD_ORDER);
    });

    it('"Add all" adds nothing under an idea that already holds six', async () => {
      const six = ['k1', 'k2', 'k3', 'k4', 'k5', 'k6'].map((k) => ({ id: `c-${k}`, title: `Kid ${k}`, under: DESAL }));
      await loadedWith(graph(six));
      story.chooseBranch(DESAL);
      expect(story.addAllIds()).toEqual([]);
      await story.acceptBranch();
      http.expectNone((r) => r.url.endsWith('/accept'));
      expect(story.beat()).toBe(2);
    });

    it('the presenter’s jump from an untouched step 2 still makes "Add all" its prepared move', async () => {
      await loaded();
      story.chooseBranch(DESAL);
      const jump = story.advanceToBeat(3);
      for (const id of ADD_ORDER) await accept(id);
      await vi.waitFor(() => http.expectOne(`/api/v1/me/maps/${GOAL}/graph`).flush(graph(NEW_UNDER_DESAL)));
      await vi.waitFor(() => flushPending(ALL_PENDING.filter((s) => !DESAL_IDS.includes(s.suggestionId))));
      await jump;
      expect(story.beat()).toBe(3);
      expect(story.focusConcept()?.conceptId).toBe('c-ro');
    });

    it('K190: with Desalination full and Reverse osmosis not on the map, Next goes on and skips step 3, as "Leave them out" does', async () => {
      const six = ['k1', 'k2', 'k3', 'k4', 'k5', 'k6'].map((k) => ({ id: `c-${k}`, title: `Kid ${k}`, under: DESAL }));
      await loadedWith(graph(six));
      story.chooseBranch(DESAL);
      expect(story.waitsFor()).toBeNull();
      expect(story.fullSkip()).toEqual({ c: 'Reverse osmosis', p: 'Desalination' });
      expect(story.nextWaits()).toBe(false);
      await story.next();
      http.expectNone((r) => r.url.endsWith('/accept'));
      expect(story.beat()).toBe(4);
      expect(story.sub()).toBe('a');
      expect(story.swap()).toBe(true);
      expect(story.focusConcept()).toBeNull();
      http.match((r) => r.url.includes('/kiosk/prewarm/manifest') || r.url.includes('question-jobs'));
    });

    it('K190: with room left the card waits for Reverse osmosis; no skip line', async () => {
      await loaded();
      story.chooseBranch(DESAL);
      expect(story.fullSkip()).toBeNull();
      expect(story.waitsFor()).toBe('Reverse osmosis');
    });

    it('a fresh idea is added from the same list, through the same Add', async () => {
      await loaded();
      story.chooseBranch(DESAL);
      story.onSuggOutcome({ status: 'missed', kind: 'sugg', reason: 'failed', ms: 300 });
      const adding = story.addIdea('s-brine');
      await accept('s-brine');
      await vi.waitFor(() => http.expectOne(`/api/v1/me/maps/${GOAL}/graph`).flush(graph([{ id: 'c-brine', title: 'Brine discharge', under: DESAL }])));
      await adding;
      expect(story.fresh()?.rows.find((r) => r.suggestion.suggestionId === 's-brine')?.state).toBe('added');
      expect(story.beat()).toBe(2);
      expect(story.branchUntouched()).toBe(true);
    });
  });

  it('a fresh idea is added or dismissed on its own, and an added one reaches the map', async () => {
    await loaded();
    story.chooseBranch(DESAL);
    story.onSuggOutcome({ status: 'missed', kind: 'sugg', reason: 'failed', ms: 300 });
    const adding = story.decideFresh('s-brine', 'accept');
    http.expectOne('/api/v1/me/concept-graph/suggestions/s-brine/accept').flush({ ...pendingDto('s-brine', DESAL, 'x'), status: 'accepted' });
    await vi.waitFor(() => http.expectOne(`/api/v1/me/maps/${GOAL}/graph`).flush(graph([{ id: 'c-brine', title: 'Brine discharge', under: DESAL }])));
    await adding;
    expect(story.graph()?.concepts.length).toBe(5);
    expect(story.fresh()?.rows.find((r) => r.suggestion.suggestionId === 's-brine')?.state).toBe('added');
    const dropping = story.decideFresh('s-tuas', 'dismiss');
    http.expectOne('/api/v1/me/concept-graph/suggestions/s-tuas/dismiss').flush({ ...pendingDto('s-tuas', DESAL, 'x'), status: 'dismissed' });
    await dropping;
    expect(story.fresh()?.rows.find((r) => r.suggestion.suggestionId === 's-tuas')?.state).toBe('dropped');
    const decided = TestBed.inject(VisitDecisions).all();
    expect([decided.get('s-brine')?.state, decided.get('s-tuas')?.state]).toEqual(['added', 'dropped']);
  });

  it('LIVE q: a fresh set replaces the question and is answered against its own key; a missed press keeps the prepared one', async () => {
    await accepted();
    const open = story.openPanel();
    (await vi.waitFor(() => http.expectOne((r) => r.url === `/api/v1/me/goals/${GOAL}/campaign/questions`))).flush(SERVED);
    await open;
    story.onQOutcome({ status: 'missed', kind: 'q', reason: 'late', ms: 45000 });
    expect(story.practice().state).toBe('ready');
    const fresh = { stem: 'Live stem?', options: [{ optionId: 'f1', text: 'One' }, { optionId: 'f2', text: 'Two' }], sourceIndex: 0 };
    story.onQOutcome({ status: 'done', kind: 'q', ms: 30000, at: new Date(), result: { freshSetId: 'fs-1', conceptId: 'c-ro', conceptKey: 'reverse-osmosis', rung: 1, questions: [fresh], traceId: null, trace: null, critic: { accepted: true } } });
    const p = story.practice();
    expect(p.state === 'ready' && p.question.stem).toBe('Live stem?');
    expect(p.state === 'ready' && p.freshSetId).toBe('fs-1');
    expect(story.qLive()).toBe(true);
    const answering = story.answerWith('f2');
    const post = http.expectOne(`/api/v1/me/goals/${GOAL}/campaign/questions/answer`);
    expect(post.request.body).toEqual({ concept_id: 'c-ro', rung: 1, question_index: 0, selected_option_id: 'f2', fresh_set_id: 'fs-1' });
    post.flush({ correct: false, rung: 1, is_refresher: false, counted: false, cleared_rung: 0, won: false, paced_today: false, rungs_cleared: 0, current_rung_correct: 0, needed_correct: 2, retention_r: 1, correct_option_id: 'f1', explainer: 'Live why.' });
    await answering;
    expect(story.answer().state).toBe('done');
  });

  it('a read that fails puts the story in a loud failed state', async () => {
    const done = story.load();
    http.expectOne('/api/v1/kiosk/prewarm/manifest').flush({ error: 'x' }, { status: 503, statusText: 'Service Unavailable' });
    await done;
    expect(story.status()).toBe('failed');
    expect(story.error()).toMatch(/manifest/);
  });

  it('forgets the visit (a new visitor starts at step 1 on a fresh read)', async () => {
    await accepted();
    story.forget();
    expect(story.status()).toBe('idle');
    expect(story.beat()).toBe(1);
    expect(story.branch()).toBeNull();
    expect(story.graph()).toBeNull();
  });

  describe('gap (a): a press’s outcome reaches the story even when its drawer has gone', () => {
    let finish: (r: unknown) => void;
    beforeEach(() => {
      TestBed.resetTestingModule();
      const sugg: LiveExecutor = { run: () => new Promise((resolve) => (finish = resolve)) };
      TestBed.configureTestingModule({
        providers: [
          provideHttpClient(),
          provideHttpClientTesting(),
          ...provideLive(),
          { provide: LIVE_EXECUTORS, useValue: { sugg } },
          { provide: LiveAvailability, useValue: { text: signal(true).asReadonly(), picture: signal(true).asReadonly(), reader: signal(true).asReadonly() } },
        ],
      });
      story = TestBed.inject(HookStory);
      http = TestBed.inject(HttpTestingController);
    });

    it('a LIVE fresh-ideas press answered after Back to step 1 still lands as step 2’s fresh ideas', async () => {
      await loaded();
      story.chooseBranch(DESAL);
      const press = TestBed.inject(LiveService).press(`sugg:hook:${DESAL}`, 'sugg', { focalConceptId: DESAL });
      story.back();
      expect(story.beat()).toBe(1);
      finish({ status: 'ready', requestId: 'r1', suggestions: [pendingDto('s-live', DESAL, 'Brine recovery')] });
      await press;
      expect(story.fresh()?.source).toBe('live');
      expect(story.fresh()?.rows.map((r) => r.suggestion.title)).toEqual(['Brine recovery']);
    });
  });
});
