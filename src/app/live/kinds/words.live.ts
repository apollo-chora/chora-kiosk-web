import { Injectable } from '@angular/core';

import { sleep } from '../abortable';
import { LIVE_POLL_MS } from '../live-kinds';
import { LiveExecutor, LiveRunContext } from '../live.service';
import { criticVerdict, type CriticVerdict } from './critic-verdict';

/**
 * LIVE `words` (step 4a, K35, K113): a NEW ai_draft job on the step's atom, the current
 * question plus the visitor's instruction as the prompt, then polled until the qgen crew
 * (writer, then critic) finishes. Wire: chora-creation question_jobs_handler.go
 * (questionJobReq, jobResponse, candidateDraft).
 */
export interface WordsParams {
  readonly atomId: string;
  readonly questionType: 'mcq' | 'oe';
  readonly prompt: string;
  readonly imageForStem: boolean;
}

export interface McqOption {
  readonly option_id: string;
  readonly label: string;
  readonly is_correct: boolean;
  readonly explainer: string;
}

export interface CandidateDraft {
  readonly draft_id: string;
  readonly type: string;
  readonly prompt: string;
  readonly mcq_payload?: { readonly options: readonly McqOption[]; readonly image_url?: string };
  readonly oe_payload?: { readonly model_answer: string; readonly image_url?: string };
  readonly model_used?: string;
  readonly image_url?: string;
}

export interface PipelineTraceStep {
  readonly name: string;
  readonly status: string;
  readonly attempt?: number | null;
  readonly notes?: string | null;
  readonly accepted?: boolean | null;
  readonly suggested_revisions?: readonly string[] | null;
}

export interface WordsResult {
  readonly jobId: string;
  readonly draft: CandidateDraft;
  /** The critic's verdict and notes on the draft (critic-verdict.ts), or null when the job carries none. */
  readonly critic: CriticVerdict | null;
  readonly trace: readonly PipelineTraceStep[] | null;
  /** The model the draft reports; "How was this made?" names the model that ran from the ledger (K72). */
  readonly modelUsed: string | null;
}

interface JobAccepted {
  readonly job_id: string;
  readonly status: string;
  readonly poll_url: string;
}

interface JobRead {
  readonly job_id: string;
  readonly status: 'requested' | 'running' | 'succeeded' | 'failed' | 'accepted' | 'partially_accepted' | 'cancelled';
  readonly error?: string;
  readonly candidate_questions?: readonly CandidateDraft[];
  readonly pipeline_trace?: readonly PipelineTraceStep[];
}

@Injectable({ providedIn: 'root' })
export class WordsLive implements LiveExecutor<WordsParams, WordsResult> {
  async run(params: WordsParams, ctx: LiveRunContext): Promise<WordsResult> {
    const base = `/api/atoms/${encodeURIComponent(params.atomId)}/question-jobs`;
    const accepted = await ctx.http.post<JobAccepted>(
      base,
      { type: 'ai_draft', question_type: params.questionType, prompt: params.prompt, image_for_stem: params.imageForStem },
      ctx.signal,
    );
    const pollUrl = `${base}/${encodeURIComponent(accepted.job_id)}`;
    let writerDone = false;
    for (;;) {
      await sleep(LIVE_POLL_MS, ctx.signal);
      const job = await ctx.http.get<JobRead>(pollUrl, ctx.signal);
      const trace = job.pipeline_trace ?? [];
      if (!writerDone && trace.some((s) => s.name === 'generate' && s.status === 'COMPLETED')) {
        writerDone = true;
        ctx.stage('writer', 'done');
      }
      if (job.status === 'failed' || job.status === 'cancelled') {
        throw new Error(`job ${job.job_id} ${job.status}: ${job.error ?? 'no reason given'}`);
      }
      if (job.status !== 'succeeded') continue;

      const draft = job.candidate_questions?.[0];
      if (!draft) throw new Error(`job ${job.job_id} succeeded with no draft`);
      if (!writerDone) ctx.stage('writer', 'done');
      const critic = criticVerdict(trace);
      if (critic) ctx.stage('critic', 'done');
      return {
        jobId: job.job_id,
        draft,
        critic,
        trace: job.pipeline_trace ?? null,
        modelUsed: draft.model_used ?? null,
      };
    }
  }
}
