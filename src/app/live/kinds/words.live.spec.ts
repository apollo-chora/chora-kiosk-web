import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { LiveHttp, modelCallGuard } from '../live-http';
import { LIVE_POLL_MS, LiveStageId } from '../live-kinds';
import { LiveRunContext } from '../live.service';
import { WordsLive } from './words.live';
import RECORDED from '../../../../kiosk/stack/tests/words-trace.recorded.json';

const ATOM = '0192f3c4-0000-7000-8000-00000000a70a';
const JOB = '0192f3c4-0000-7000-8000-0000000000j1';
const CREATE = `/api/atoms/${ATOM}/question-jobs`;
const POLL = `/api/atoms/${ATOM}/question-jobs/${JOB}`;

const DRAFT = {
  draft_id: '0192f3c4-0000-7000-8000-0000000000d1',
  type: 'mcq',
  prompt: 'Which NEWater stage destroys germs that slip through the membranes?',
  mcq_payload: {
    options: [
      { option_id: 'a', label: 'Microfiltration', is_correct: false, explainer: 'Removes fine particles.' },
      { option_id: 'b', label: 'UV disinfection', is_correct: true, explainer: 'UV light destroys germs.' },
    ],
  },
  model_used: 'gpt-oss:120b',
  image_url: '/blob/kiosk/q1.png',
};
const TRACE_RUNNING = [{ name: 'generate', status: 'COMPLETED', attempt: 1 }];
// A finished words job's trace as the stack recorded it (creation's single lane: one critique row carries
// the verdict and the critic's note, no critique_verdict row).
const TRACE_DONE = RECORDED.pipeline_trace;

function setup() {
  TestBed.configureTestingModule({
    providers: [provideHttpClient(withInterceptors([modelCallGuard])), provideHttpClientTesting()],
  });
  const ac = new AbortController();
  const stages: [LiveStageId, string][] = [];
  const ctx: LiveRunContext = {
    kind: 'words',
    signal: ac.signal,
    http: TestBed.inject(LiveHttp),
    stage: (id, state) => void stages.push([id, state]),
  };
  return { words: TestBed.inject(WordsLive), backend: TestBed.inject(HttpTestingController), ctx, ac, stages };
}

describe('WordsLive: a new draft from the visitor’s instruction (step 4a, K35)', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('creates an ai_draft job on the step’s atom, polls it, and returns the draft and the critic verdict', async () => {
    const { words, backend, ctx, stages } = setup();
    const p = words.run(
      { atomId: ATOM, questionType: 'mcq', prompt: 'The question so far.\n\nMake option D clearly wrong.', imageForStem: true },
      ctx,
    );
    const create = backend.expectOne(CREATE);
    expect(create.request.method).toBe('POST');
    expect(create.request.body).toEqual({
      type: 'ai_draft',
      question_type: 'mcq',
      prompt: 'The question so far.\n\nMake option D clearly wrong.',
      image_for_stem: true,
    });
    create.flush({ job_id: JOB, status: 'requested', poll_url: POLL }, { status: 202, statusText: 'Accepted' });

    await vi.advanceTimersByTimeAsync(LIVE_POLL_MS);
    backend.expectOne(POLL).flush({ job_id: JOB, status: 'running', pipeline_trace: TRACE_RUNNING });
    await vi.advanceTimersByTimeAsync(0);
    expect(stages).toEqual([['writer', 'done']]);

    await vi.advanceTimersByTimeAsync(LIVE_POLL_MS);
    backend.expectOne(POLL).flush({
      job_id: JOB,
      status: 'succeeded',
      candidate_questions: [DRAFT],
      pipeline_trace: TRACE_DONE,
    });
    const result = await p;
    expect(result.jobId).toBe(JOB);
    expect(result.draft.prompt).toBe(DRAFT.prompt);
    expect(result.draft.mcq_payload?.options[1].is_correct).toBe(true);
    expect(result.critic).toEqual({ accepted: true, notes: RECORDED.pipeline_trace.find((s) => s.name === 'critique')?.notes });
    expect(result.modelUsed).toBe('gpt-oss:120b');
    expect(stages).toEqual([
      ['writer', 'done'],
      ['critic', 'done'],
    ]);
    backend.verify();
  });

  it('a failed job is an error carrying the job’s own reason', async () => {
    const { words, backend, ctx } = setup();
    const p = words.run({ atomId: ATOM, questionType: 'mcq', prompt: 'x', imageForStem: false }, ctx);
    backend.expectOne(CREATE).flush({ job_id: JOB, status: 'requested', poll_url: POLL });
    await vi.advanceTimersByTimeAsync(LIVE_POLL_MS);
    backend.expectOne(POLL).flush({ job_id: JOB, status: 'failed', error: 'critic rejected every attempt' });
    await expect(p).rejects.toThrow(/job .* failed: critic rejected every attempt/);
  });

  it('a succeeded job with no draft is an error, never an empty result', async () => {
    const { words, backend, ctx } = setup();
    const p = words.run({ atomId: ATOM, questionType: 'mcq', prompt: 'x', imageForStem: false }, ctx);
    backend.expectOne(CREATE).flush({ job_id: JOB, status: 'requested', poll_url: POLL });
    await vi.advanceTimersByTimeAsync(LIVE_POLL_MS);
    backend.expectOne(POLL).flush({ job_id: JOB, status: 'succeeded', candidate_questions: [] });
    await expect(p).rejects.toThrow(/succeeded with no draft/);
  });

  it('stops polling the moment the call is let go', async () => {
    const { words, backend, ctx, ac } = setup();
    const p = words.run({ atomId: ATOM, questionType: 'oe', prompt: 'x', imageForStem: false }, ctx);
    backend.expectOne(CREATE).flush({ job_id: JOB, status: 'requested', poll_url: POLL });
    ac.abort('late');
    await expect(p).rejects.toThrow(/aborted: late/);
    await vi.advanceTimersByTimeAsync(LIVE_POLL_MS * 3);
    backend.expectNone(POLL);
  });

  it('a critic that rejected the final draft is reported as rejected with its notes', async () => {
    const { words, backend, ctx } = setup();
    const p = words.run({ atomId: ATOM, questionType: 'mcq', prompt: 'x', imageForStem: false }, ctx);
    backend.expectOne(CREATE).flush({ job_id: JOB, status: 'requested', poll_url: POLL });
    await vi.advanceTimersByTimeAsync(LIVE_POLL_MS);
    backend.expectOne(POLL).flush({
      job_id: JOB,
      status: 'succeeded',
      candidate_questions: [DRAFT],
      pipeline_trace: [
        // The single lane sent back twice: each pass's own critique row carries its verdict.
        { name: 'generate', status: 'COMPLETED', attempt: 1, notes: 'candidate produced' },
        { name: 'critique', status: 'REJECTED', attempt: 1, notes: 'Option D is arguable.', accepted: false, suggested_revisions: ['x'] },
        { name: 'quality_gate', status: 'RETRY', attempt: 1, notes: 'Option D is arguable.' },
        { name: 'generate', status: 'COMPLETED', attempt: 2, notes: 'candidate produced' },
        { name: 'critique', status: 'REJECTED', attempt: 2, notes: 'Still arguable.', accepted: false, suggested_revisions: ['y'] },
      ],
    });
    const r = await p;
    // The critic's own words, as written (K133), from the last pass's critique row.
    expect(r.critic).toEqual({ accepted: false, notes: 'Still arguable.' });
  });

  it('a job with no critique row says the critic verdict is unknown, never accepted', async () => {
    const { words, backend, ctx } = setup();
    const p = words.run({ atomId: ATOM, questionType: 'mcq', prompt: 'x', imageForStem: false }, ctx);
    backend.expectOne(CREATE).flush({ job_id: JOB, status: 'requested', poll_url: POLL });
    await vi.advanceTimersByTimeAsync(LIVE_POLL_MS);
    backend.expectOne(POLL).flush({ job_id: JOB, status: 'succeeded', candidate_questions: [DRAFT] });
    expect((await p).critic).toBeNull();
  });
});
