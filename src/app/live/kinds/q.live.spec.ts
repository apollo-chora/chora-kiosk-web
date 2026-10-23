import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { HttpClient } from '@angular/common/http';
import { inject, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';

import { LiveHttp, modelCallGuard } from '../live-http';
import { LIVE_KINDS, LIVE_POLL_MS, LiveStageId } from '../live-kinds';
import { LIVE_EXECUTORS, LiveAvailability, LiveRunContext, LiveService } from '../live.service';
import recorded from './campaign-trace.recorded.json';
import { CampaignTraceStep, QLive, questionAt, type QResult } from './q.live';

// LIVE q (K103, Q-fresh): a fresh campaign set for (concept, rung) beside the prepared one,
// polled by its own id. Wire: consumption goals_campaign_fresh_handler.go (API-CONTRACT.md
// section 5, Q-fresh 55679618b).
const PRESS = '/api/v1/me/goals/goal-water/campaign/questions/fresh';
const READ = `${PRESS}/fresh-1`;

const SANITISED = {
  candidates: [
    {
      stem: 'Which stage of NEWater production removes the smallest particles?',
      question_type: 'mcq',
      options: [
        { option_id: 'o1', label: 'Microfiltration', text: 'Microfiltration' },
        { option_id: 'o2', label: 'Reverse osmosis', text: 'Reverse osmosis' },
        { option_id: 'o3', label: 'Ultraviolet disinfection', text: 'Ultraviolet disinfection' },
      ],
    },
  ],
};
// The served trace as consumption really answers it (recorded from the stack, not built from this
// client's reading): the set lane's `critique` row per critic call carries no verdict; each
// candidate's `critique_verdict` row does. Here the critic sent both back once, then accepted both.
const TRACE: readonly CampaignTraceStep[] = recorded.pipeline_trace;

function setup() {
  TestBed.configureTestingModule({
    providers: [provideHttpClient(withInterceptors([modelCallGuard])), provideHttpClientTesting()],
  });
  const ac = new AbortController();
  const stages: LiveStageId[] = [];
  const ctx: LiveRunContext = { kind: 'q', signal: ac.signal, http: TestBed.inject(LiveHttp), stage: (id) => void stages.push(id) };
  return { backend: TestBed.inject(HttpTestingController), ctx, stages };
}

describe('LIVE q (K103): a fresh question set, polled by its own id', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  async function pressAndAccept() {
    const s = setup();
    const p = TestBed.inject(QLive).run({ goalId: 'goal-water', conceptId: 'res', rung: 6 }, s.ctx);
    const press = s.backend.expectOne(PRESS);
    expect(press.request.method).toBe('POST');
    expect(press.request.body).toEqual({ concept_id: 'res', rung: 6 });
    press.flush(
      { fresh_set_id: 'fresh-1', status: 'requested', concept_id: 'res', concept_key: 'reservoirs', rung: 6 },
      { status: 202, statusText: 'Accepted' },
    );
    await vi.advanceTimersByTimeAsync(LIVE_POLL_MS);
    s.backend.expectOne(READ).flush({ fresh_set_id: 'fresh-1', status: 'requested', concept_id: 'res', concept_key: 'reservoirs', rung: 6 });
    await vi.advanceTimersByTimeAsync(LIVE_POLL_MS);
    return { ...s, p };
  }

  it('ready: the fresh questions, their trace and its id; the crew ticks off from the trace', async () => {
    const { backend, p, stages } = await pressAndAccept();
    backend.expectOne(READ).flush({
      fresh_set_id: 'fresh-1', source: 'fresh', status: 'ready', concept_id: 'res', concept_key: 'reservoirs', rung: 6,
      questions: SANITISED, trace_id: '4bf92f3577b34da6a3ce929d0e0e4736', pipeline_trace: TRACE,
    });
    const r = await p;
    expect(r.freshSetId).toBe('fresh-1');
    expect(r.rung).toBe(6);
    expect(r.questions.map((q) => q.stem)).toEqual(['Which stage of NEWater production removes the smallest particles?']);
    expect(r.questions[0].options.map((o) => o.optionId)).toEqual(['o1', 'o2', 'o3']);
    expect(r.questions[0].sourceIndex).toBe(0);
    expect(r.traceId).toBe('4bf92f3577b34da6a3ce929d0e0e4736');
    expect(r.trace).toEqual(TRACE);
    expect(r.critic).toEqual({ accepted: true });
    expect(stages).toEqual(['writer', 'critic']);
  });

  it('a set shipped with a candidate the critic still rejected reads as rejected, never accepted', async () => {
    const { backend, p } = await pressAndAccept();
    const last = TRACE.map((s) => s.name).lastIndexOf('critique_verdict');
    const trace = TRACE.map((s, i) => (i === last ? { ...s, status: 'REJECTED', accepted: false } : s));
    backend.expectOne(READ).flush({
      fresh_set_id: 'fresh-1', status: 'ready', concept_id: 'res', concept_key: 'reservoirs', rung: 6,
      questions: SANITISED, trace_id: recorded.trace_id, pipeline_trace: trace,
    });
    expect((await p).critic).toEqual({ accepted: false });
  });

  it('a critic call with no verdict row leaves the verdict unknown, never accepted or rejected', async () => {
    const { backend, p, stages } = await pressAndAccept();
    const trace = TRACE.filter((s) => s.name !== 'critique_verdict');
    backend.expectOne(READ).flush({
      fresh_set_id: 'fresh-1', status: 'ready', concept_id: 'res', concept_key: 'reservoirs', rung: 6,
      questions: SANITISED, trace_id: recorded.trace_id, pipeline_trace: trace,
    });
    expect((await p).critic).toBeNull();
    expect(stages).toEqual(['writer', 'critic']);
  });

  it('failed: a failure carrying the set’s own reason, so the screen falls back to the prepared set', async () => {
    const { backend, p } = await pressAndAccept();
    backend.expectOne(READ).flush({ fresh_set_id: 'fresh-1', status: 'failed', concept_id: 'res', concept_key: 'reservoirs', rung: 6, failure_reason: 'critic rejected every draft' });
    await expect(p).rejects.toThrow(/fresh set fresh-1 failed: critic rejected every draft/);
  });

  it('ready with no usable question is a failure, never an empty quiz', async () => {
    const { backend, p } = await pressAndAccept();
    backend.expectOne(READ).flush({ fresh_set_id: 'fresh-1', status: 'ready', concept_id: 'res', concept_key: 'reservoirs', rung: 6, questions: { candidates: [] }, trace_id: null, pipeline_trace: null });
    await expect(p).rejects.toThrow(/fresh set fresh-1 is ready with no usable question/);
  });

  it('a status the fresh lane never gives is a failure', async () => {
    const { backend, p } = await pressAndAccept();
    backend.expectOne(READ).flush({ fresh_set_id: 'fresh-1', status: 'tap_capped', concept_id: 'res', concept_key: 'reservoirs', rung: 6 });
    await expect(p).rejects.toThrow(/fresh set fresh-1 answered tap_capped/);
  });

  it('a press refused for the day’s budget (429 TAP_CAPPED) is a failure', async () => {
    const { backend, ctx } = setup();
    const p = TestBed.inject(QLive).run({ goalId: 'goal-water', conceptId: 'res', rung: 6 }, ctx);
    backend.expectOne(PRESS).flush({ code: 'TAP_CAPPED', message: "today's practice requests are spent" }, { status: 429, statusText: 'Too Many Requests' });
    await expect(p).rejects.toThrow(/429/);
  });

  describe('K144: a press re-attaches to its own run', () => {
    // F39: "Stop waiting" stops only the screen and a late miss only the wait; the crew keeps
    // running, and a second POST would queue behind it. So the next press on the same question
    // (goal, concept, rung) picks that set up again instead.
    const SUBJECT = { goalId: 'goal-water', conceptId: 'res', rung: 6 };
    const read = (status: string, id = 'fresh-1', extra: object = {}) => ({
      fresh_set_id: id, status, concept_id: 'res', concept_key: 'reservoirs', rung: 6, ...extra,
    });
    const ready = (id = 'fresh-1') => read('ready', id, { questions: SANITISED, trace_id: recorded.trace_id, pipeline_trace: TRACE });

    /** A second press with its own signal and its own stage log, on the same QLive. */
    function pressAgain(params: { goalId: string; conceptId: string; rung: number } = SUBJECT) {
      const ac = new AbortController();
      const stages: LiveStageId[] = [];
      const ctx: LiveRunContext = { kind: 'q', signal: ac.signal, http: TestBed.inject(LiveHttp), stage: (id) => void stages.push(id) };
      const p = TestBed.inject(QLive).run(params, ctx);
      p.catch(() => undefined);
      return { p, ac, stages };
    }

    /** Press 1 is let go while its set is still being written (reason: 'stopped' or 'late'). */
    async function letGo(reason: 'stopped' | 'late') {
      const s = setup();
      const ac = new AbortController();
      const first = TestBed.inject(QLive).run(SUBJECT, { ...s.ctx, signal: ac.signal });
      first.catch(() => undefined);
      s.backend.expectOne(PRESS).flush(read('requested'), { status: 202, statusText: 'Accepted' });
      await vi.advanceTimersByTimeAsync(LIVE_POLL_MS);
      s.backend.expectOne(READ).flush(read('requested'));
      ac.abort(reason);
      await expect(first).rejects.toThrow(/aborted/);
      return s;
    }

    it('after Stop waiting, the next press follows the run already going: no second POST', async () => {
      const { backend } = await letGo('stopped');
      const again = pressAgain();
      backend.expectOne(READ).flush(read('requested'));
      backend.expectNone(PRESS);
      await vi.advanceTimersByTimeAsync(LIVE_POLL_MS);
      backend.expectOne(READ).flush(ready());
      const r = await again.p;
      expect(r.freshSetId).toBe('fresh-1');
      expect(again.stages).toEqual(['writer', 'critic']);
      backend.verify();
    });

    it('after a late miss, a press shows the set that landed meanwhile at once: no POST, no wait', async () => {
      const { backend } = await letGo('late');
      const again = pressAgain();
      backend.expectOne(READ).flush(ready());
      const r = await again.p;
      expect(r.freshSetId).toBe('fresh-1');
      expect(r.questions.map((q) => q.stem)).toEqual(['Which stage of NEWater production removes the smallest particles?']);
      backend.expectNone(PRESS);
      backend.verify();
    });

    it('a set that failed meanwhile is dropped and the press asks for a new one', async () => {
      const { backend } = await letGo('stopped');
      const again = pressAgain();
      backend.expectOne(READ).flush(read('failed', 'fresh-1', { failure_reason: 'critic rejected every draft' }));
      await vi.waitFor(() => backend.expectOne(PRESS).flush(read('requested', 'fresh-2'), { status: 202, statusText: 'Accepted' }));
      await vi.advanceTimersByTimeAsync(LIVE_POLL_MS);
      backend.expectOne(`${PRESS}/fresh-2`).flush(ready('fresh-2'));
      expect((await again.p).freshSetId).toBe('fresh-2');
      backend.verify();
    });

    it('a set that fails while a re-attached press follows it is a failure, and the next press asks anew', async () => {
      const { backend } = await letGo('stopped');
      const again = pressAgain();
      backend.expectOne(READ).flush(read('requested'));
      await vi.advanceTimersByTimeAsync(LIVE_POLL_MS);
      backend.expectOne(READ).flush(read('failed', 'fresh-1', { failure_reason: 'the writer timed out' }));
      await expect(again.p).rejects.toThrow(/fresh set fresh-1 failed: the writer timed out/);
      pressAgain();
      backend.expectOne(PRESS);
      backend.expectNone(READ);
    });

    it('another question never re-attaches: a different concept or rung presses its own run', async () => {
      const { backend } = await letGo('stopped');
      pressAgain({ ...SUBJECT, rung: 5 });
      backend.expectOne(PRESS);
      pressAgain({ ...SUBJECT, conceptId: 'taps' });
      expect(backend.match(PRESS)).toHaveLength(1);
      pressAgain({ ...SUBJECT, goalId: 'goal-nature' });
      backend.expectOne('/api/v1/me/goals/goal-nature/campaign/questions/fresh');
      backend.expectNone(READ);
    });

    it('a set the screen has shown is never shown again: the next press asks for a new one', async () => {
      const { backend, ctx } = setup();
      const first = TestBed.inject(QLive).run(SUBJECT, ctx);
      backend.expectOne(PRESS).flush(read('requested'), { status: 202, statusText: 'Accepted' });
      await vi.advanceTimersByTimeAsync(LIVE_POLL_MS);
      backend.expectOne(READ).flush(ready());
      await first;
      pressAgain();
      backend.expectOne(PRESS);
      backend.expectNone(READ);
    });

    it('through the LIVE service: the press after a late miss has its own 45 s, counted from that press', async () => {
      TestBed.configureTestingModule({
        providers: [
          provideHttpClient(withInterceptors([modelCallGuard])),
          provideHttpClientTesting(),
          { provide: LIVE_EXECUTORS, useFactory: () => ({ q: inject(QLive) }) },
          { provide: LiveAvailability, useValue: { text: signal(true), picture: signal(true) } },
        ],
      });
      const live = TestBed.inject(LiveService);
      const backend = TestBed.inject(HttpTestingController);
      const stillWriting = async (ms: number) => {
        for (let t = 0; t < ms; t += LIVE_POLL_MS) {
          await vi.advanceTimersByTimeAsync(LIVE_POLL_MS);
          for (const r of backend.match(READ).filter((x) => !x.cancelled)) r.flush(read('requested'));
        }
      };
      const first = live.press('q:comp:res', 'q', SUBJECT);
      backend.expectOne(PRESS).flush(read('requested'), { status: 202, statusText: 'Accepted' });
      await stillWriting(LIVE_KINDS.q.limitMs);
      expect(await first).toMatchObject({ status: 'missed', reason: 'late' });

      const second = live.press('q:comp:res', 'q', SUBJECT);
      backend.expectOne(READ).flush(read('requested'));
      await stillWriting(LIVE_KINDS.q.limitMs - 2 * LIVE_POLL_MS);
      expect(live.state('q:comp:res')()?.status).toBe('calling');
      await vi.advanceTimersByTimeAsync(LIVE_POLL_MS);
      backend.expectOne(READ).flush(ready());
      expect(await second).toMatchObject({ status: 'done', result: { freshSetId: 'fresh-1' } });
      backend.expectNone(PRESS);
      backend.verify();
    });

    it('the end of the demo session forgets every set it pressed', async () => {
      const { backend } = await letGo('stopped');
      TestBed.inject(QLive).endSession();
      pressAgain();
      backend.expectOne(PRESS);
      backend.expectNone(READ);
    });
  });

  it('the press route is a model call: refused outside the LIVE service', async () => {
    setup();
    const plain = TestBed.inject(HttpClient);
    await expect(firstValueFrom(plain.post(PRESS, { concept_id: 'res', rung: 6 }))).rejects.toThrow(/a model call outside the LIVE service/);
  });
});

describe('questionAt (K103, W79): a LIVE set shows in a quiz only at the rung it was written for', () => {
  const option = (optionId: string, text: string) => ({ optionId, text });
  const set = (rung: number, questions: QResult['questions']): QResult => ({ freshSetId: 'fs-1', conceptId: 'res', conceptKey: 'reservoirs', rung, questions, traceId: null, trace: null, critic: null });
  const Q = { stem: 'Why protect catchments?', options: [option('a', 'Clean water'), option('b', 'Parking')], sourceIndex: 0 } as QResult['questions'][number];

  it('at its rung: its first question and its set', () => {
    expect(questionAt(set(6, [Q]), 6)).toEqual({ question: Q, freshSetId: 'fs-1' });
  });

  it('at another rung (the idea climbed since): none', () => {
    expect(questionAt(set(5, [Q]), 6)).toBeNull();
  });

  it('a set with no question: none, said loudly', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(questionAt(set(6, []), 6)).toBeNull();
    expect(error).toHaveBeenCalledWith(expect.stringContaining('fs-1 holds no question'));
    error.mockRestore();
  });
});
