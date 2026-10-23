import { Injectable } from '@angular/core';

import { sleep } from '../abortable';
import { LIVE_POLL_MS } from '../live-kinds';
import { LiveExecutor, LiveRunContext } from '../live.service';

/**
 * LIVE `sugg` (K51, K64): fresh ideas from the Companion around a won concept. The
 * generate trigger returns a request id; the K51 status read says requested, ready, empty
 * or failed. Failed is a failure (the screen shows the labelled prepared batch, K45, K64)
 * and empty is its own answer: neither is ever an empty list passed off as ideas.
 * Wire: consumption concept_suggestion_handler.go (suggestionGenerateReq, suggestionDTO,
 * suggestionRequestDTO).
 */
export interface SuggParams {
  readonly focalConceptId: string;
  readonly goalId?: string;
}

export interface SuggestionDto {
  readonly suggestionId: string;
  readonly kind: string;
  readonly status: string;
  readonly title?: string;
  readonly focalConceptId?: string;
  readonly sourceConceptId?: string;
  readonly targetConceptId?: string;
  readonly class?: string;
  readonly rationale?: string;
  readonly modelId?: string;
  readonly createdAt: string;
}

export type SuggResult =
  | { readonly status: 'ready'; readonly requestId: string; readonly suggestions: readonly SuggestionDto[] }
  | { readonly status: 'empty'; readonly requestId: string };

interface GenerateAccepted {
  readonly status: string;
  readonly requestId: string;
  readonly focalConceptId?: string;
}

interface RequestRead {
  readonly requestId: string;
  readonly status: 'requested' | 'ready' | 'empty' | 'failed';
  readonly error?: string;
  readonly suggestions?: readonly SuggestionDto[];
}

const BASE = '/api/v1/me/concept-graph/suggestions';

@Injectable({ providedIn: 'root' })
export class SuggLive implements LiveExecutor<SuggParams, SuggResult> {
  async run(params: SuggParams, ctx: LiveRunContext): Promise<SuggResult> {
    const body = params.goalId ? { focalConceptId: params.focalConceptId, goalId: params.goalId } : { focalConceptId: params.focalConceptId };
    const accepted = await ctx.http.post<GenerateAccepted>(`${BASE}/generate`, body, ctx.signal);
    const readUrl = `${BASE}/requests/${encodeURIComponent(accepted.requestId)}`;
    for (;;) {
      await sleep(LIVE_POLL_MS, ctx.signal);
      const r = await ctx.http.get<RequestRead>(readUrl, ctx.signal);
      if (r.status === 'requested') continue;
      ctx.stage('explorer', 'done');
      if (r.status === 'failed') throw new Error(`request ${r.requestId} failed: ${r.error ?? 'no reason given'}`);
      if (r.status === 'empty') return { status: 'empty', requestId: r.requestId };
      const suggestions = r.suggestions ?? [];
      if (suggestions.length === 0) throw new Error(`request ${r.requestId} is ready with no suggestions`);
      return { status: 'ready', requestId: r.requestId, suggestions };
    }
  }
}
