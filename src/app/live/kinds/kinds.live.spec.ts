import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { LiveHttp, modelCallGuard } from '../live-http';
import { LIVE_POLL_MS, LiveKind, LiveStageId } from '../live-kinds';
import { LiveRunContext } from '../live.service';
import { GradeLive } from './grade.live';
import { GreetLive, PreparedGreetings } from './greet.live';
import { SuggLive } from './sugg.live';

function setup(kind: LiveKind) {
  TestBed.configureTestingModule({
    providers: [provideHttpClient(withInterceptors([modelCallGuard])), provideHttpClientTesting()],
  });
  const ac = new AbortController();
  const stages: LiveStageId[] = [];
  const ctx: LiveRunContext = { kind, signal: ac.signal, http: TestBed.inject(LiveHttp), stage: (id) => void stages.push(id) };
  return { backend: TestBed.inject(HttpTestingController), ctx, ac, stages };
}

describe('LIVE greet (K49): one named Companion, a fresh turn', () => {
  it('posts a fresh turn id for the Companion and returns the greeting and the model that ran', async () => {
    const { backend, ctx, stages } = setup('greet');
    const p = TestBed.inject(GreetLive).run({ companionId: 'pingu-1' }, ctx);
    const req = backend.expectOne('/api/companion/greeting');
    expect(req.request.method).toBe('POST');
    expect(req.request.body.companion_id).toBe('pingu-1');
    expect(req.request.body.turn_id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    req.flush({ companion_id: 'pingu-1', turn_id: req.request.body.turn_id, greeting: 'Hello!', model: 'gpt-oss:120b', replayed: false });
    await expect(p).resolves.toEqual({ greeting: 'Hello!', model: 'gpt-oss:120b', turnId: req.request.body.turn_id });
    expect(stages).toEqual(['companion']);
  });

  it('two presses use two different turns', async () => {
    const { backend, ctx } = setup('greet');
    const greet = TestBed.inject(GreetLive);
    void greet.run({ companionId: 'c' }, ctx);
    void greet.run({ companionId: 'c' }, ctx);
    const reqs = backend.match('/api/companion/greeting');
    expect(reqs[0].request.body.turn_id).not.toBe(reqs[1].request.body.turn_id);
  });

  it('a GREETING_FAILED or GREETING_TIMEOUT answer is a failure', async () => {
    const { backend, ctx } = setup('greet');
    const p = TestBed.inject(GreetLive).run({ companionId: 'c' }, ctx);
    backend.expectOne('/api/companion/greeting').flush({ error: 'GREETING_TIMEOUT', detail: 'x', turn_id: 't' }, { status: 503, statusText: 'Service Unavailable' });
    await expect(p).rejects.toThrow(/503/);
  });
});

describe('the prepared greeting (K49, ADR-259 D9 rule 2): the golden run’s turn, replayed', () => {
  it('replays the manifest’s turn id with no model call', async () => {
    const { backend } = setup('greet');
    const p = TestBed.inject(PreparedGreetings).read('pingu-1', 'turn-golden');
    const req = backend.expectOne('/api/companion/greeting');
    expect(req.request.body).toEqual({ companion_id: 'pingu-1', turn_id: 'turn-golden' });
    req.flush({ companion_id: 'pingu-1', turn_id: 'turn-golden', greeting: 'Good morning!', model: 'gpt-oss:120b', replayed: true });
    await expect(p).resolves.toEqual({ greeting: 'Good morning!', model: 'gpt-oss:120b', turnId: 'turn-golden' });
  });

  it('a "prepared" greeting that was not a replay made a model call nobody pressed: loud failure', async () => {
    const { backend } = setup('greet');
    const p = TestBed.inject(PreparedGreetings).read('pingu-1', 'turn-unknown');
    backend.expectOne('/api/companion/greeting').flush({ companion_id: 'pingu-1', turn_id: 'turn-unknown', greeting: 'Hi', model: 'm', replayed: false });
    await expect(p).rejects.toThrow(/was not a replay/);
  });
});

describe('LIVE sugg (K51, K64): fresh ideas, read by request id', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());
  const READ = '/api/v1/me/concept-graph/suggestions/requests/req-1';

  async function start(status: 'ready' | 'empty' | 'failed') {
    const { backend, ctx, stages } = setup('sugg');
    const p = TestBed.inject(SuggLive).run({ focalConceptId: 'newater', goalId: 'g1' }, ctx);
    const gen = backend.expectOne('/api/v1/me/concept-graph/suggestions/generate');
    expect(gen.request.body).toEqual({ focalConceptId: 'newater', goalId: 'g1' });
    gen.flush({ status: 'accepted', requestId: 'req-1', focalConceptId: 'newater' }, { status: 202, statusText: 'Accepted' });
    await vi.advanceTimersByTimeAsync(LIVE_POLL_MS);
    backend.expectOne(READ).flush({ requestId: 'req-1', status: 'requested', requestedAt: '2026-10-20T06:00:00Z', completedAt: null });
    await vi.advanceTimersByTimeAsync(LIVE_POLL_MS);
    const body: Record<string, unknown> = { requestId: 'req-1', status, requestedAt: '2026-10-20T06:00:00Z', completedAt: '2026-10-20T06:00:09Z' };
    if (status === 'ready') {
      body['suggestions'] = [{ suggestionId: 's1', kind: 'concept', status: 'pending', title: 'Ultrafiltration', createdAt: '2026-10-20T06:00:09Z' }];
    }
    if (status === 'failed') body['error'] = 'the explorer agent timed out';
    backend.expectOne(READ).flush(body);
    return { p, stages };
  }

  it('ready: the fresh ideas as their own group', async () => {
    const { p, stages } = await start('ready');
    const r = await p;
    expect(r).toMatchObject({ status: 'ready', requestId: 'req-1' });
    expect(r.status === 'ready' && r.suggestions.map((s) => s.title)).toEqual(['Ultrafiltration']);
    expect(stages).toEqual(['explorer']);
  });

  it('empty: its own state, never an empty list passed off as ideas', async () => {
    const { p } = await start('empty');
    await expect(p).resolves.toEqual({ status: 'empty', requestId: 'req-1' });
  });

  it('failed: a failure with the request’s own reason, never an empty list', async () => {
    const { p } = await start('failed');
    await expect(p).rejects.toThrow(/request req-1 failed: the explorer agent timed out/);
  });
});

describe('LIVE grade (K57): the learner’s own grading request, then the grading read', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());
  const REQ = '/api/v1/me/assessments/as-1/submissions/sub-1/request-grading';
  const READ = '/api/v1/assessments/as-1/submissions/sub-1/grading';

  it('requests grading once, polls while it grades, and returns the graded detail for review', async () => {
    const { backend, ctx, stages } = setup('grade');
    const p = TestBed.inject(GradeLive).run({ assessmentId: 'as-1', submissionId: 'sub-1' }, ctx);
    const req = backend.expectOne(REQ);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toBeNull();
    req.flush({ submission_id: 'sub-1', state: 'GRADING', grading_requested: true }, { status: 202, statusText: 'Accepted' });
    await vi.advanceTimersByTimeAsync(LIVE_POLL_MS);
    backend.expectOne(READ).flush({ submission_id: 'sub-1', state: 'GRADING', review_status: '', questions: [] });
    await vi.advanceTimersByTimeAsync(LIVE_POLL_MS);
    backend.expectOne(READ).flush({
      submission_id: 'sub-1',
      state: 'GRADED',
      review_status: 'PENDING_REVIEW',
      total_points_earned: 8,
      total_points_possible: 10,
      questions: [{ question_type: 'oe', points_earned: 8, ai_comment: 'Clear.' }],
    });
    const r = await p;
    expect(r.detail.state).toBe('GRADED');
    expect(r.detail.review_status).toBe('PENDING_REVIEW');
    expect(stages).toEqual(['evaluator', 'moderator']);
  });

  it('an already requested submission (200, grading_requested false) is followed, not requested again', async () => {
    const { backend, ctx } = setup('grade');
    const p = TestBed.inject(GradeLive).run({ assessmentId: 'as-1', submissionId: 'sub-1' }, ctx);
    backend.expectOne(REQ).flush({ submission_id: 'sub-1', state: 'GRADED', grading_requested: false });
    await vi.advanceTimersByTimeAsync(LIVE_POLL_MS);
    backend.expectOne(READ).flush({ submission_id: 'sub-1', state: 'GRADED', review_status: 'PENDING_REVIEW', questions: [] });
    await expect(p).resolves.toMatchObject({ detail: { state: 'GRADED' } });
  });

  it('a typed answer is held first on a fresh assessment (create, start, save, submit), then requested; the result names it', async () => {
    const { backend, ctx } = setup('grade');
    const typed = { testSetId: 'ts-g', title: 'Water for Life: open question', learnerGcid: 'g-visitor', testSetQuestionId: 'tsq-g', questionId: 'q-g', text: 'Johor ends in 2061.' };
    const p = TestBed.inject(GradeLive).run({ typed }, ctx);
    const create = await vi.waitFor(() => backend.expectOne('/api/v1/assessments'));
    expect(create.request.body).toEqual({ test_set_id: 'ts-g', title_override: 'Water for Life: open question', invited_gcids: ['g-visitor'], max_attempts: 1 });
    create.flush({ assessment_id: 'as-t', title: 'x' }, { status: 201, statusText: 'Created' });
    (await vi.waitFor(() => backend.expectOne('/api/v1/me/assessments/as-t/submissions'))).flush({ submission_id: 'sub-t' }, { status: 201, statusText: 'Created' });
    const save = await vi.waitFor(() => backend.expectOne('/api/v1/me/assessments/as-t/submissions/sub-t'));
    expect(save.request.method).toBe('PATCH');
    expect(save.request.body).toEqual({ answers: [{ test_set_question_id: 'tsq-g', question_id: 'q-g', question_type: 'oe', oe_response_text: 'Johor ends in 2061.' }] });
    save.flush({});
    (await vi.waitFor(() => backend.expectOne('/api/v1/me/assessments/as-t/submissions/sub-t/submit'))).flush({ submission_id: 'sub-t', state: 'SUBMITTED', grading_held: true }, { status: 202, statusText: 'Accepted' });
    (await vi.waitFor(() => backend.expectOne('/api/v1/me/assessments/as-t/submissions/sub-t/request-grading'))).flush({ submission_id: 'sub-t', state: 'GRADING', grading_requested: true }, { status: 202, statusText: 'Accepted' });
    await vi.advanceTimersByTimeAsync(LIVE_POLL_MS);
    backend.expectOne('/api/v1/assessments/as-t/submissions/sub-t/grading').flush({ submission_id: 'sub-t', state: 'GRADED', review_status: 'PENDING_REVIEW', questions: [] });
    await expect(p).resolves.toMatchObject({ assessmentId: 'as-t', submissionId: 'sub-t', detail: { state: 'GRADED' } });
  });

  it('a create that answers no assessment id fails the press, and nothing is requested', async () => {
    const { backend, ctx } = setup('grade');
    const typed = { testSetId: 'ts-g', title: 'T', learnerGcid: 'g', testSetQuestionId: 'tsq-g', questionId: 'q-g', text: 'x' };
    const p = TestBed.inject(GradeLive).run({ typed }, ctx);
    (await vi.waitFor(() => backend.expectOne('/api/v1/assessments'))).flush({ title: 'x' }, { status: 201, statusText: 'Created' });
    await expect(p).rejects.toThrow(/no assessment_id/);
    backend.expectNone((r) => r.url.includes('request-grading'));
  });

  it('nothing to grade (409) is a failure', async () => {
    const { backend, ctx } = setup('grade');
    const p = TestBed.inject(GradeLive).run({ assessmentId: 'as-1', submissionId: 'sub-1' }, ctx);
    backend.expectOne(REQ).flush({ error: { code: 'DELIVERY_NOTHING_TO_GRADE' } }, { status: 409, statusText: 'Conflict' });
    await expect(p).rejects.toThrow(/409/);
  });
});
