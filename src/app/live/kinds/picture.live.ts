import { Injectable } from '@angular/core';

import { sleep } from '../abortable';
import { LIVE_POLL_MS, LiveStageId } from '../live-kinds';
import { LiveExecutor, LiveRunContext } from '../live.service';

/**
 * LIVE `picture` (step 4b, V2 with K113 and K150; kiosk/world/PREPARED-CHOICES.md 5.6): a regenerate
 * on the chain's one draft, always with its mode, naming the picture it starts from as its source
 * (K150: a scene target with a source is a direct edit, no writer; a diagram target goes through the
 * writer). Creation refuses a source not its own (422 CREATION_REGEN_SOURCE_NOT_OWN) or a source with
 * no mode (422 CREATION_REGEN_SOURCE_NEEDS_MODE). Then the regenerate job is polled and its own
 * `output_picture` read (D8-c): the next regenerate overwrites the parent's candidate in place, so the
 * parent is never read for it; its `pipeline_trace` names the stages that ran.
 * Wire: chora-creation question_jobs_handler.go (imageRegenReq, jobAcceptedResponse, outputPicture).
 */
export type PictureMode = 'mermaid' | 'scene';

export interface PictureParams {
  readonly atomId: string;
  /** The parent job and draft that hold the picture chain (`draft.h4`). */
  readonly jobId: string;
  readonly draftId: string;
  readonly prompt: string;
  readonly mode: PictureMode;
  readonly sourceImageGcsUri: string | null;
}

/** One stage the regenerate job ran (K150): `generate` (the writer), `render_image` (the picture). */
export interface RegenTraceStep {
  readonly name: string;
  readonly status: string;
  readonly started_at?: string | null;
  readonly completed_at?: string | null;
}

export interface PictureResult {
  readonly regenJobId: string;
  readonly imageUrl: string;
  readonly imageGcsUri: string;
  readonly mode: PictureMode;
  /** The stages the job ran; null (or absent) for a job made before K150. */
  readonly trace?: readonly RegenTraceStep[] | null;
}

/** Each screen stage's step in the regenerate job's trace. */
const STEP: Readonly<Record<'writer' | 'image', string>> = { writer: 'generate', image: 'render_image' };

interface JobAccepted {
  readonly job_id: string;
  readonly poll_url: string;
}

interface RegenRead {
  readonly job_id: string;
  readonly status: 'requested' | 'running' | 'succeeded' | 'failed' | 'cancelled';
  readonly error?: string;
  readonly output_picture?: { readonly image_url: string; readonly image_gcs_uri: string; readonly image_mode: string | null };
  readonly pipeline_trace?: readonly RegenTraceStep[] | null;
}

@Injectable({ providedIn: 'root' })
export class PictureLive implements LiveExecutor<PictureParams, PictureResult> {
  /** K150: a scene change from a picture is a direct edit, the image model alone; a diagram's has the writer first. */
  stagesFor(params: PictureParams): readonly ('writer' | 'image')[] {
    return params.mode === 'scene' && params.sourceImageGcsUri ? ['image'] : ['writer', 'image'];
  }

  async run(params: PictureParams, ctx: LiveRunContext): Promise<PictureResult> {
    const url = `/api/atoms/${encodeURIComponent(params.atomId)}/question-jobs/${encodeURIComponent(params.jobId)}/regenerate-image`;
    const body = {
      draft_id: params.draftId,
      placement: 'stem',
      prompt: params.prompt,
      mode: params.mode,
      ...(params.sourceImageGcsUri ? { source_image_gcs_uri: params.sourceImageGcsUri } : {}),
    };
    const accepted = await ctx.http.post<JobAccepted>(url, body, ctx.signal);
    const id = accepted.job_id;
    for (;;) {
      await sleep(LIVE_POLL_MS, ctx.signal);
      const job = await ctx.http.get<RegenRead>(accepted.poll_url, ctx.signal);
      if (job.status === 'failed' || job.status === 'cancelled') {
        throw new Error(`regenerate ${id} ${job.status}: ${job.error ?? 'no reason given'}`);
      }
      if (job.status !== 'succeeded') continue;
      const out = job.output_picture;
      if (!out?.image_url) throw new Error(`regenerate ${id} succeeded with no picture of its own`);
      if (out.image_mode !== params.mode) throw new Error(`regenerate ${id} made a ${out.image_mode ?? 'unrecorded'} picture, not the ${params.mode} asked for`);
      const trace = job.pipeline_trace ?? null;
      this.tick(id, this.stagesFor(params), trace, ctx);
      return { regenJobId: id, imageUrl: out.image_url, imageGcsUri: out.image_gcs_uri, mode: params.mode, trace };
    }
  }

  /** Ticks off the stages the job ran; a trace that disagrees with the change is said loudly. */
  private tick(id: string, expected: readonly ('writer' | 'image')[], trace: readonly RegenTraceStep[] | null, ctx: LiveRunContext): void {
    if (!trace) {
      console.warn(`[kiosk] regenerate ${id} carries no pipeline_trace (a job made before K150); its expected stages stand`);
      for (const s of expected) ctx.stage(s as LiveStageId, 'done');
      return;
    }
    const ran = trace.map((t) => t.name);
    const want = expected.map((s) => STEP[s]);
    if (ran.join() !== want.join()) console.error(`[kiosk] regenerate ${id} ran ${ran.join(', ')} where the change expected ${want.join(', ')}`);
    for (const s of expected) if (ran.includes(STEP[s])) ctx.stage(s as LiveStageId, 'done');
  }
}
