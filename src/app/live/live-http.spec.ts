import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';

import { LiveHttp, modelCallGuard } from './live-http';

function setup() {
  TestBed.configureTestingModule({
    providers: [provideHttpClient(withInterceptors([modelCallGuard])), provideHttpClientTesting()],
  });
  return {
    http: TestBed.inject(HttpClient),
    live: TestBed.inject(LiveHttp),
    backend: TestBed.inject(HttpTestingController),
  };
}

const MODEL_CALLS: [string, string][] = [
  ['POST', '/api/atoms/0192a/question-jobs'],
  ['POST', '/api/atoms/0192a/question-jobs/0192j/regenerate-image'],
  ['POST', '/api/v1/me/concept-graph/suggestions/generate'],
  ['POST', '/api/companion/greeting'],
  ['POST', '/api/v1/me/assessments/0192as/submissions/0192s/request-grading'],
  ['POST', '/api/v1/me/growth-edges/uploads'],
];

describe('modelCallGuard: no model call outside the LIVE service (T3.4)', () => {
  let errors: string[];
  beforeEach(() => {
    errors = [];
    vi.spyOn(console, 'error').mockImplementation((...a: unknown[]) => void errors.push(a.join(' ')));
  });
  afterEach(() => vi.restoreAllMocks());

  for (const [method, url] of MODEL_CALLS) {
    it(`refuses ${method} ${url} from plain HttpClient, loudly, before it leaves the page`, async () => {
      const { http, backend } = setup();
      await expect(firstValueFrom(http.request(method, url, { body: {} }))).rejects.toThrow(
        /a model call outside the LIVE service/,
      );
      backend.expectNone(url);
      expect(errors.join('\n')).toContain(`${method} ${url}`);
    });

    it(`lets ${method} ${url} through the LIVE service's own client`, async () => {
      const { live, backend } = setup();
      const ac = new AbortController();
      const p = live.post<{ job_id: string }>(url, {}, ac.signal);
      backend.expectOne(url).flush({ job_id: 'j1' });
      await expect(p).resolves.toEqual({ job_id: 'j1' });
      backend.verify();
    });
  }

  it('matches an absolute URL by its path, so a full address does not slip past', async () => {
    const { http, backend } = setup();
    const url = 'http://127.0.0.1:18080/api/atoms/0192a/question-jobs';
    await expect(firstValueFrom(http.post(url, {}))).rejects.toThrow(/outside the LIVE service/);
    backend.expectNone(url);
  });

  it('matches a protocol-relative URL, and a URL with a query, by its path', async () => {
    const { http, backend } = setup();
    await expect(firstValueFrom(http.post('//127.0.0.1:18080/api/v1/me/concept-graph/suggestions/generate', {}))).rejects.toThrow(
      /outside the LIVE service/,
    );
    await expect(firstValueFrom(http.post('/api/atoms/0192a/question-jobs?x=1#y', {}))).rejects.toThrow(
      /outside the LIVE service/,
    );
    backend.verify();
  });

  it('leaves the reads alone: polling a job and reading a set are not model calls', async () => {
    const { http, backend } = setup();
    const p1 = firstValueFrom(http.get('/api/atoms/0192a/question-jobs/0192j'));
    backend.expectOne('/api/atoms/0192a/question-jobs/0192j').flush({ status: 'running' });
    await expect(p1).resolves.toEqual({ status: 'running' });
    const p2 = firstValueFrom(http.post('/api/atoms/0192a/question-jobs/0192j/accept', { accepted_candidates: [] }));
    backend.expectOne('/api/atoms/0192a/question-jobs/0192j/accept').flush({ persisted: [] });
    await expect(p2).resolves.toEqual({ persisted: [] });
  });

  it('refuses even through the LIVE client the routes the kiosk never calls (K49: daily-dose/ai; ai-assist)', async () => {
    const { live, backend } = setup();
    const ac = new AbortController();
    await expect(live.get('/api/companion/daily-dose/ai', ac.signal)).rejects.toThrow(/never called by the kiosk/);
    await expect(live.post('/api/atoms/ai-assist', {}, ac.signal)).rejects.toThrow(/never called by the kiosk/);
    await expect(
      live.post('/api/atoms/0192a/questions/0192q/ai-model-answer-jobs', {}, ac.signal),
    ).rejects.toThrow(/never called by the kiosk/);
    backend.expectNone('/api/companion/daily-dose/ai');
  });

  it('refuses the Companion routes behind the kiosk edge that start the explorer, which the kiosk never calls (T3.4 census)', async () => {
    // A census of the edge's kiosk allowlist (chora-gateway kiosk_edition.go kioskProductRoutes) against the
    // services' handlers found these two under /api/v1/me/companions/: each publishes a suggestion request
    // (consumption companion_skill_invoke_handler.go, companion_ceremony_edge_scout_handler.go).
    const { live, http, backend } = setup();
    const ac = new AbortController();
    await expect(live.post('/api/v1/me/companions/c1/skills/scout/invoke', {}, ac.signal)).rejects.toThrow(/never called by the kiosk/);
    await expect(live.post('/api/v1/me/companions/c1/ceremony/edge-scout', { goal_id: 'g' }, ac.signal)).rejects.toThrow(/never called by the kiosk/);
    await expect(firstValueFrom(http.post('/api/v1/me/companions/c1/skills/sight/invoke', {}))).rejects.toThrow(/never called by the kiosk/);
    backend.expectNone(() => true);
  });

  it('K158 D7: a review is only ever confirmed: a reiterate (another model call) is refused through any client', async () => {
    const { live, http, backend } = setup();
    const ac = new AbortController();
    const url = '/api/v1/me/growth-edges/uploads/0192u/resume';
    const reiterate = { action: 'reiterate', edges: [], added_struggles: [], selected_outputs: [] };
    await expect(firstValueFrom(http.post(url, reiterate))).rejects.toThrow(/never called by the kiosk.*reiterate/);
    await expect(live.post(url, reiterate, ac.signal)).rejects.toThrow(/never called by the kiosk/);
    backend.expectNone(url);
  });

  it('K158 D4: a review that asks for learner outputs (study aids, a practice test) is refused, named', async () => {
    const { http, backend } = setup();
    const url = '/api/v1/me/growth-edges/uploads/0192u/resume';
    await expect(firstValueFrom(http.post(url, { action: 'confirm', edges: [], added_struggles: [], selected_outputs: ['study_aids'] }))).rejects.toThrow(
      /never called by the kiosk.*outputs/,
    );
    await expect(firstValueFrom(http.post(url, { action: 'confirm', edges: [], added_struggles: [] }))).rejects.toThrow(/never called by the kiosk/);
    backend.expectNone(url);
  });

  it('K158 D7: confirming a review with no outputs is not a model call: it goes through plain HttpClient', async () => {
    const { http, backend } = setup();
    const url = '/api/v1/me/growth-edges/uploads/0192u/resume';
    const p = firstValueFrom(http.post(url, { action: 'confirm', edges: [{ proposed_edge_id: 'e1', decision: 'accept' }], added_struggles: [], selected_outputs: [] }));
    backend.expectOne(url).flush({ upload_id: '0192u', status: 'completed' });
    await expect(p).resolves.toEqual({ upload_id: '0192u', status: 'completed' });
    const read = firstValueFrom(http.get('/api/v1/me/growth-edges/uploads/0192u'));
    backend.expectOne('/api/v1/me/growth-edges/uploads/0192u').flush({ status: 'QUEUED' });
    await expect(read).resolves.toEqual({ status: 'QUEUED' });
  });

  it('K158 D4: an upload that asks for outputs is refused even through the LIVE client', async () => {
    const { live, backend } = setup();
    const form = new FormData();
    form.append('upload_kind', 'marked_test');
    form.append('requested_outputs', 'practice_test');
    await expect(live.post('/api/v1/me/growth-edges/uploads', form, new AbortController().signal)).rejects.toThrow(/never called by the kiosk.*outputs/);
    backend.expectNone('/api/v1/me/growth-edges/uploads');
  });

  it('reads a same-origin file as bytes through the LIVE client (a prepared paper for an upload)', async () => {
    const { live, backend } = setup();
    const p = live.blob('/papers/paper-water.png', new AbortController().signal);
    const req = backend.expectOne('/papers/paper-water.png');
    expect(req.request.responseType).toBe('blob');
    req.flush(new Blob([new Uint8Array([1, 2, 3])], { type: 'image/png' }));
    const b = await p;
    expect(b.size).toBe(3);
  });

  it('the prepared-greeting replay may reach the greeting route, and only that route', async () => {
    const { live, backend } = setup();
    const ac = new AbortController();
    const p = live.replay<{ replayed: boolean }>('/api/companion/greeting', { companion_id: 'c', turn_id: 't' }, ac.signal);
    backend.expectOne('/api/companion/greeting').flush({ replayed: true });
    await expect(p).resolves.toEqual({ replayed: true });
    await expect(live.replay('/api/atoms/0192a/question-jobs', {}, ac.signal)).rejects.toThrow(
      /a model call outside the LIVE service/,
    );
  });

  it('a stopped call is cancelled on the wire and its promise rejects', async () => {
    const { live, backend } = setup();
    const ac = new AbortController();
    const p = live.get('/api/atoms/0192a/question-jobs/0192j', ac.signal);
    const req = backend.expectOne('/api/atoms/0192a/question-jobs/0192j');
    ac.abort('late');
    expect(req.cancelled).toBe(true);
    await expect(p).rejects.toThrow(/aborted: late/);
  });

  it('a call on an already stopped signal never leaves the page', async () => {
    const { live, backend } = setup();
    const ac = new AbortController();
    ac.abort('stopped');
    await expect(live.get('/api/atoms/0192a/question-jobs/0192j', ac.signal)).rejects.toThrow(/aborted: stopped/);
    backend.expectNone('/api/atoms/0192a/question-jobs/0192j');
  });

  it('an HTTP error reaches the caller as an error naming the call and its status', async () => {
    const { live, backend } = setup();
    const ac = new AbortController();
    const p = live.post('/api/atoms/0192a/question-jobs', {}, ac.signal);
    backend
      .expectOne('/api/atoms/0192a/question-jobs')
      .flush({ error: { code: 'INSUFFICIENT_MANA' } }, { status: 402, statusText: 'Payment Required' });
    await expect(p).rejects.toThrow(/POST \/api\/atoms\/0192a\/question-jobs: 402/);
  });

  it('the error names the refusal’s own code and message: creation’s top-level envelope and the edge’s nested one (K150)', async () => {
    const { live, backend } = setup();
    const ac = new AbortController();
    const regen = '/api/atoms/0192a/question-jobs/0192j/regenerate-image';
    for (const [body, code] of [
      [{ code: 'CREATION_REGEN_BASELINE_MISSING', message: 'the diagram records no Mermaid to start from' }, /422 Unprocessable Entity CREATION_REGEN_BASELINE_MISSING: the diagram records no Mermaid to start from/],
      [{ code: 'CREATION_REGEN_SOURCE_NOT_OWN', message: 'not a picture of this draft' }, /422 Unprocessable Entity CREATION_REGEN_SOURCE_NOT_OWN: not a picture of this draft/],
      [{ error: { code: 'INSUFFICIENT_MANA', message: 'mana spent' } }, /402 Payment Required INSUFFICIENT_MANA: mana spent/],
    ] as const) {
      const p = live.post(regen, {}, ac.signal);
      const status = code.source.startsWith('402') ? 402 : 422;
      backend.expectOne(regen).flush(body, { status, statusText: status === 402 ? 'Payment Required' : 'Unprocessable Entity' });
      await expect(p).rejects.toThrow(code);
    }
  });
});
