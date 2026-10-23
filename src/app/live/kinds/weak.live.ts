import { Injectable } from '@angular/core';

import type { WeaknessReviewPanel, WeaknessUploadJob } from '../../product-api/growth-edges.service';
import { sleep } from '../abortable';
import { LIVE_POLL_MS } from '../live-kinds';
import { LiveExecutor, LiveRunContext } from '../live.service';

/**
 * LIVE `weak` (K158 D7): the Companion reads a prepared paper now. The paper is the build's own
 * copy (kiosk/world/papers/, served same-origin at /papers/, D5), checked against the sha256 the
 * golden run recorded for it, since the door takes only the prepared papers (D3). It goes through
 * production's door as the conductor's golden run sends it (run_weakness_paper.go paperForm): the
 * file, the upload kind and the goal, never an output (D4). The job is read until it parks at its
 * review; FAILED, a panel with no proposed edge, or any other end is a failure (the screen shows
 * the prepared run, labelled, K45). A failed or blocked run leaves its job QUEUED for ever (F45):
 * the 45 s budget ends that wait.
 */
export interface WeakParams {
  /** The paper's file name in kiosk/world/papers/ (the prepared choice's `paper`). */
  readonly paper: string;
  /** The paper's bytes as the golden run uploaded them (the manifest's record). */
  readonly sha256: string;
  readonly goalId: string;
  readonly uploadKind: 'marked_test' | 'notes' | 'scribble';
}

export interface WeakResult {
  readonly uploadId: string;
  readonly review: WeaknessReviewPanel;
}

const UPLOADS = '/api/v1/me/growth-edges/uploads';
/** The door's types by extension, as the conductor sends them (run_weakness_paper.go paperMIME). */
const PAPER_MIME: Readonly<Record<string, string>> = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', pdf: 'application/pdf' };

async function sha256Hex(blob: Blob): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer());
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

@Injectable({ providedIn: 'root' })
export class WeakLive implements LiveExecutor<WeakParams, WeakResult> {
  async run(params: WeakParams, ctx: LiveRunContext): Promise<WeakResult> {
    const mime = PAPER_MIME[params.paper.split('.').pop()?.toLowerCase() ?? ''];
    if (!mime || params.paper.includes('/')) throw new Error(`the paper ${params.paper} is not a PNG, JPEG or PDF in the papers folder`);
    const url = `/papers/${encodeURIComponent(params.paper)}`;
    const bytes = await ctx.http.blob(url, ctx.signal);
    const sum = await sha256Hex(bytes);
    if (sum !== params.sha256) throw new Error(`${url}: its sha256 ${sum} is not the prepared paper's ${params.sha256}: the build's copy differs from the golden run's`);

    const form = new FormData();
    form.append('file', new File([bytes], params.paper, { type: mime }));
    form.append('upload_kind', params.uploadKind);
    form.append('goal_id', params.goalId);
    const started = await ctx.http.post<{ readonly upload_id?: string; readonly status?: string }>(UPLOADS, form, ctx.signal);
    if (!started.upload_id) throw new Error(`POST ${UPLOADS} answered no upload_id (status ${String(started.status)})`);
    const id = started.upload_id;

    for (;;) {
      await sleep(LIVE_POLL_MS, ctx.signal);
      const job = await ctx.http.get<WeaknessUploadJob>(`${UPLOADS}/${encodeURIComponent(id)}`, ctx.signal);
      if (job.status === 'QUEUED' || job.status === 'ANALYZING') continue;
      if (job.status === 'FAILED') throw new Error(`upload ${id} FAILED: ${job.failure_reason ?? 'no reason given'}`);
      if (job.status === 'COMPLETED') throw new Error(`upload ${id} ended COMPLETED before anyone reviewed it`);
      if (job.status !== 'AWAITING_REVIEW') throw new Error(`upload ${id} answered ${String(job.status)}, which the screen cannot review`);
      if (!job.review?.proposed_edges.length) throw new Error(`upload ${id} is at review with no proposed weak spot`);
      ctx.stage('companion', 'done');
      return { uploadId: id, review: job.review };
    }
  }
}
