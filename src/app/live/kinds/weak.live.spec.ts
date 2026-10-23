import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { LiveHttp, modelCallGuard } from '../live-http';
import { LIVE_POLL_MS, LiveStageId } from '../live-kinds';
import { LiveRunContext } from '../live.service';
import { WeakLive, type WeakParams } from './weak.live';

// The bytes the build serves for the paper, and their sha256 (as papers.sha256 would list them).
const BYTES = new Uint8Array([1, 2, 3]);
const SHA = '039058c6f2c0cb492c533b0a4d14ef77cc0f78abccced5287d84a1a2011cfb81';
const PARAMS: WeakParams = { paper: 'paper-water.png', sha256: SHA, goalId: 'goal-1', uploadKind: 'marked_test' };
const UPLOADS = '/api/v1/me/growth-edges/uploads';

const PANEL = {
  familiar: { familiar_id: 'pingu-1', name: 'Pingu' },
  proposed_edges: [{ proposed_edge_id: 'pe-1', concept_label: 'The Four National Taps', summary: 'Rainwater is local catchment.', strength: 0.5, suggested_difficulty: 'standard' }],
  candidate_struggles: [],
  available_outputs: [],
};

function setup() {
  TestBed.configureTestingModule({
    providers: [provideHttpClient(withInterceptors([modelCallGuard])), provideHttpClientTesting()],
  });
  const ac = new AbortController();
  const stages: LiveStageId[] = [];
  const ctx: LiveRunContext = { kind: 'weak', signal: ac.signal, http: TestBed.inject(LiveHttp), stage: (id) => void stages.push(id) };
  return { backend: TestBed.inject(HttpTestingController), ctx, ac, stages, weak: TestBed.inject(WeakLive) };
}

/** The paper's bytes, read from the build's assets. */
function servePaper(backend: HttpTestingController, bytes = BYTES): void {
  backend.expectOne('/papers/paper-water.png').flush(new Blob([bytes], { type: 'image/png' }));
}

/** The upload, once the paper's digest is done: WebCrypto answers on the real event loop, not the fake clock. */
function uploaded(backend: HttpTestingController) {
  return vi.waitFor(() => backend.expectOne(UPLOADS));
}

describe('LIVE weak (K158 D7): the Companion reads a prepared paper now', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('uploads the paper the build serves through the product door, with its kind and goal and nothing else, then waits for the review', async () => {
    const { backend, ctx, stages, weak } = setup();
    const p = weak.run(PARAMS, ctx);
    servePaper(backend);
    const up = await uploaded(backend);
    expect(up.request.method).toBe('POST');
    const form = up.request.body as FormData;
    expect([...form.keys()].sort()).toEqual(['file', 'goal_id', 'upload_kind']);
    const file = form.get('file') as File;
    expect(file.name).toBe('paper-water.png');
    expect(file.type).toBe('image/png');
    expect(new Uint8Array(await file.arrayBuffer())).toEqual(BYTES);
    expect(form.get('upload_kind')).toBe('marked_test');
    expect(form.get('goal_id')).toBe('goal-1');
    up.flush({ upload_id: 'up-2', status: 'QUEUED' }, { status: 202, statusText: 'Accepted' });

    await vi.advanceTimersByTimeAsync(LIVE_POLL_MS);
    backend.expectOne(`${UPLOADS}/up-2`).flush({ upload_id: 'up-2', status: 'QUEUED' });
    expect(stages).toEqual([]);
    await vi.advanceTimersByTimeAsync(LIVE_POLL_MS);
    backend.expectOne(`${UPLOADS}/up-2`).flush({ upload_id: 'up-2', status: 'AWAITING_REVIEW', review: PANEL });
    await expect(p).resolves.toEqual({ uploadId: 'up-2', review: PANEL });
    expect(stages).toEqual(['companion']);
    backend.verify();
  });

  it('refuses, before any upload, a paper whose bytes are not the ones the golden run uploaded (the door takes only those, D3)', async () => {
    const { backend, ctx, weak } = setup();
    const p = weak.run(PARAMS, ctx);
    const caught = p.catch((e: unknown) => e);
    servePaper(backend, new Uint8Array([9, 9, 9]));
    expect(String(await caught)).toMatch(/paper-water\.png.*sha256 .* not the prepared paper's 039058c6/);
    backend.expectNone(UPLOADS);
  });

  it('refuses a paper that is not a PNG, JPEG or PDF without reading it', async () => {
    const { backend, ctx, weak } = setup();
    await expect(weak.run({ ...PARAMS, paper: 'paper-water.gif' }, ctx)).rejects.toThrow(/not a PNG, JPEG or PDF/);
    backend.verify();
  });

  it('a run that FAILED is a failure naming its reason', async () => {
    const { backend, ctx, weak } = setup();
    const p = weak.run(PARAMS, ctx);
    const caught = p.catch((e: unknown) => e);
    servePaper(backend);
    (await uploaded(backend)).flush({ upload_id: 'up-2', status: 'QUEUED' }, { status: 202, statusText: 'Accepted' });
    await vi.advanceTimersByTimeAsync(LIVE_POLL_MS);
    backend.expectOne(`${UPLOADS}/up-2`).flush({ upload_id: 'up-2', status: 'FAILED', failure_reason: 'unreadable' });
    expect(String(await caught)).toMatch(/upload up-2 FAILED: unreadable/);
  });

  it('a review with no proposed weak spot, or a status the screen cannot review, is a failure, never an empty panel', async () => {
    for (const job of [
      { upload_id: 'up-2', status: 'AWAITING_REVIEW', review: { ...PANEL, proposed_edges: [] } },
      { upload_id: 'up-2', status: 'AWAITING_REVIEW' },
      { upload_id: 'up-2', status: 'COMPLETED', upserted_growth_edge_ids: [] },
      { upload_id: 'up-2', status: 'SOMETHING_NEW' },
    ]) {
      TestBed.resetTestingModule();
      const { backend, ctx, weak } = setup();
      const p = weak.run(PARAMS, ctx);
      const caught = p.catch((e: unknown) => e);
      servePaper(backend);
      (await uploaded(backend)).flush({ upload_id: 'up-2', status: 'QUEUED' }, { status: 202, statusText: 'Accepted' });
      await vi.advanceTimersByTimeAsync(LIVE_POLL_MS);
      backend.expectOne(`${UPLOADS}/up-2`).flush(job);
      expect(String(await caught)).toMatch(/upload up-2 (?:is at review with no proposed weak spot|ended COMPLETED|answered SOMETHING_NEW)/);
    }
  });

  it('an upload the door refuses (not a prepared paper, D3) fails, naming the refusal', async () => {
    const { backend, ctx, weak } = setup();
    const p = weak.run(PARAMS, ctx);
    const caught = p.catch((e: unknown) => e);
    servePaper(backend);
    (await uploaded(backend)).flush({ error: { code: 'NOT_A_PREPARED_PAPER', message: 'not on the list' } }, { status: 422, statusText: 'Unprocessable Entity' });
    expect(String(await caught)).toMatch(/422 .*NOT_A_PREPARED_PAPER/);
  });

  it('a press let go (late or stopped) stops reading the job', async () => {
    const { backend, ctx, ac, weak } = setup();
    const p = weak.run(PARAMS, ctx);
    const caught = p.catch((e: unknown) => e);
    servePaper(backend);
    (await uploaded(backend)).flush({ upload_id: 'up-2', status: 'QUEUED' }, { status: 202, statusText: 'Accepted' });
    ac.abort('late');
    expect(String(await caught)).toMatch(/aborted: late/);
    await vi.advanceTimersByTimeAsync(LIVE_POLL_MS * 3);
    backend.expectNone(`${UPLOADS}/up-2`);
  });
});
