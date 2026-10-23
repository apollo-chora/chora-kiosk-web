import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { LiveHttp, modelCallGuard } from '../live-http';
import { LIVE_POLL_MS, LiveStageId } from '../live-kinds';
import { LiveRunContext } from '../live.service';
import { PictureLive } from './picture.live';

const ATOM = 'a-newater';
const PARENT = 'j-v1';
const REGEN = 'j-regen';
const START = `/api/atoms/${ATOM}/question-jobs/${PARENT}/regenerate-image`;
const POLL = `/api/atoms/${ATOM}/question-jobs/${REGEN}`;
const SOURCE = 'gs://kiosk-pictures/pic.illus.png';

function setup() {
  TestBed.configureTestingModule({
    providers: [provideHttpClient(withInterceptors([modelCallGuard])), provideHttpClientTesting()],
  });
  const ac = new AbortController();
  const stages: [LiveStageId, string][] = [];
  const ctx: LiveRunContext = {
    kind: 'picture',
    signal: ac.signal,
    http: TestBed.inject(LiveHttp),
    stage: (id, state) => void stages.push([id, state]),
  };
  return { picture: TestBed.inject(PictureLive), backend: TestBed.inject(HttpTestingController), ctx, stages };
}

// LIVE `picture` (step 4b, V2 with K113, PREPARED-CHOICES.md 5.6): a regenerate on the chain's one
// draft, always with its mode, naming the picture on screen as its source only for a scene restyle
// of a scene; then the regenerate job's own output_picture (D8-c), never the parent's candidate.
describe('PictureLive: a new picture at the visitor’s direction (step 4b)', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('regenerates on the draft with its mode and source, polls the regenerate job, and returns its own picture', async () => {
    const { picture, backend, ctx, stages } = setup();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const p = picture.run({ atomId: ATOM, jobId: PARENT, draftId: 'd-j-v1', prompt: 'Make it a pencil sketch.', mode: 'scene', sourceImageGcsUri: SOURCE }, ctx);
    const start = backend.expectOne(START);
    expect(start.request.method).toBe('POST');
    expect(start.request.body).toEqual({ draft_id: 'd-j-v1', placement: 'stem', prompt: 'Make it a pencil sketch.', mode: 'scene', source_image_gcs_uri: SOURCE });
    start.flush({ job_id: REGEN, status: 'requested', poll_url: POLL }, { status: 202, statusText: 'Accepted' });
    await vi.advanceTimersByTimeAsync(LIVE_POLL_MS);
    backend.expectOne(POLL).flush({ job_id: REGEN, status: 'running' });
    await vi.advanceTimersByTimeAsync(LIVE_POLL_MS);
    backend.expectOne(POLL).flush({
      job_id: REGEN,
      status: 'succeeded',
      output_picture: { image_url: '/pictures/live-1.png', image_gcs_uri: 'gs://kiosk-pictures/live-1.png', image_mode: 'scene' },
    });
    expect(await p).toEqual({ regenJobId: REGEN, imageUrl: '/pictures/live-1.png', imageGcsUri: 'gs://kiosk-pictures/live-1.png', mode: 'scene', trace: null });
    // K150: a scene change from a picture is a direct edit (the image model alone); this job has no trace.
    expect(stages).toEqual([['image', 'done']]);
    expect(warn).toHaveBeenCalledTimes(1);
    warn.mockRestore();
    backend.verify();
  });

  it('sends no source when there is none (a diagram is re-authored, a mode change starts afresh)', async () => {
    const { picture, backend, ctx } = setup();
    void picture.run({ atomId: ATOM, jobId: PARENT, draftId: 'd-j-v1', prompt: 'Redraw it.', mode: 'mermaid', sourceImageGcsUri: null }, ctx);
    expect(backend.expectOne(START).request.body).toEqual({ draft_id: 'd-j-v1', placement: 'stem', prompt: 'Redraw it.', mode: 'mermaid' });
  });

  it('a failed regenerate is an error carrying its own reason', async () => {
    const { picture, backend, ctx } = setup();
    const p = picture.run({ atomId: ATOM, jobId: PARENT, draftId: 'd', prompt: 'x', mode: 'scene', sourceImageGcsUri: null }, ctx);
    backend.expectOne(START).flush({ job_id: REGEN, status: 'requested', poll_url: POLL });
    await vi.advanceTimersByTimeAsync(LIVE_POLL_MS);
    backend.expectOne(POLL).flush({ job_id: REGEN, status: 'failed', error: 'image model refused' });
    await expect(p).rejects.toThrow(/regenerate j-regen failed: image model refused/);
  });

  it('a succeeded regenerate with no picture of its own is an error, never the parent’s picture', async () => {
    const { picture, backend, ctx } = setup();
    const p = picture.run({ atomId: ATOM, jobId: PARENT, draftId: 'd', prompt: 'x', mode: 'scene', sourceImageGcsUri: null }, ctx);
    backend.expectOne(START).flush({ job_id: REGEN, status: 'requested', poll_url: POLL });
    await vi.advanceTimersByTimeAsync(LIVE_POLL_MS);
    backend.expectOne(POLL).flush({ job_id: REGEN, status: 'succeeded' });
    await expect(p).rejects.toThrow(/regenerate j-regen succeeded with no picture of its own/);
  });

  it('a picture of another mode than asked is an error', async () => {
    const { picture, backend, ctx } = setup();
    const p = picture.run({ atomId: ATOM, jobId: PARENT, draftId: 'd', prompt: 'x', mode: 'scene', sourceImageGcsUri: null }, ctx);
    backend.expectOne(START).flush({ job_id: REGEN, status: 'requested', poll_url: POLL });
    await vi.advanceTimersByTimeAsync(LIVE_POLL_MS);
    backend.expectOne(POLL).flush({ job_id: REGEN, status: 'succeeded', output_picture: { image_url: '/p.png', image_gcs_uri: 'gs://p', image_mode: 'mermaid' } });
    await expect(p).rejects.toThrow(/regenerate j-regen made a mermaid picture, not the scene asked for/);
  });

  describe('K150: the stages the regenerate job ran', () => {
    const scene = { atomId: ATOM, jobId: PARENT, draftId: 'd-j-v1', prompt: 'Make it photorealistic', mode: 'scene' as const, sourceImageGcsUri: SOURCE };
    const diagram = { ...scene, prompt: 'Label each stage', mode: 'mermaid' as const, sourceImageGcsUri: 'gs://kiosk-pictures/h4.png' };
    async function finish(params: typeof scene | typeof diagram, trace: unknown) {
      const s = setup();
      const p = s.picture.run(params, s.ctx);
      s.backend.expectOne(START).flush({ job_id: REGEN, status: 'requested', poll_url: POLL }, { status: 202, statusText: 'Accepted' });
      await vi.advanceTimersByTimeAsync(LIVE_POLL_MS);
      s.backend.expectOne(POLL).flush({
        job_id: REGEN,
        status: 'succeeded',
        output_picture: { image_url: '/pictures/live-2.png', image_gcs_uri: 'gs://kiosk-pictures/live-2.png', image_mode: params.mode },
        ...(trace === undefined ? {} : { pipeline_trace: trace }),
      });
      return { ...s, r: await p };
    }
    const at = (name: string, t: string) => ({ name, status: 'succeeded', started_at: `2026-10-19T05:00:${t}Z`, completed_at: `2026-10-19T05:00:${t}Z` });

    it('a scene change with its source is a direct edit: the image model alone, before and after', async () => {
      const { r, stages, picture } = await finish(scene, [at('render_image', '09')]);
      expect(picture.stagesFor(scene)).toEqual(['image']);
      expect(stages).toEqual([['image', 'done']]);
      expect(r.trace).toEqual([at('render_image', '09')]);
    });

    it('a diagram change has the writer, then the drawing', async () => {
      const { r, stages, picture } = await finish(diagram, [at('generate', '04'), at('render_image', '05')]);
      expect(picture.stagesFor(diagram)).toEqual(['writer', 'image']);
      expect(stages).toEqual([
        ['writer', 'done'],
        ['image', 'done'],
      ]);
      expect(r.trace?.map((x) => x.name)).toEqual(['generate', 'render_image']);
    });

    it('a trace that disagrees with the change is said loudly; only the stages both name tick off', async () => {
      const err = vi.spyOn(console, 'error').mockImplementation(() => undefined);
      const { stages } = await finish(scene, [at('generate', '04'), at('render_image', '05')]);
      expect(stages).toEqual([['image', 'done']]);
      expect(err.mock.calls.flat().join(' ')).toMatch(/regenerate j-regen ran generate, render_image where the change expected render_image/);
      err.mockRestore();
    });

    it('a job with no trace (made before K150) keeps the expected stages and says so', async () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
      const { r, stages } = await finish(diagram, undefined);
      expect(stages).toEqual([
        ['writer', 'done'],
        ['image', 'done'],
      ]);
      expect(r.trace).toBeNull();
      expect(warn.mock.calls.flat().join(' ')).toMatch(/regenerate j-regen carries no pipeline_trace/);
      warn.mockRestore();
    });
  });
});
