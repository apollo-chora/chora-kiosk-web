import { Injectable } from '@angular/core';

import { CampaignQuestion, parseCampaignQuestions } from '../../aplus/daily-dose/campaign-practice/campaign-practice.service';
import { sleep } from '../abortable';
import { LIVE_POLL_MS } from '../live-kinds';
import { LiveExecutor, LiveRunContext } from '../live.service';
import { setCriticVerdict } from './critic-verdict';

/**
 * LIVE `q` (K103, Q-fresh): "Write a new question" on a concept that already has its
 * prepared set. The press makes a FRESH set beside the prepared one (its own id, the qgen
 * crew: writer, then critic), polled by that id; the prepared set is never touched, so it
 * stays the fallback (K45). The visitor's answer names the fresh set and grades against its
 * own key (CampaignPracticeService.answer with `fresh_set_id`; graded by rules, no model).
 * Wire: consumption goals_campaign_fresh_handler.go (API-CONTRACT.md section 5).
 *
 * K144: a press re-attaches to its own run. "Stop waiting" stops only the screen and a late miss
 * only the wait (there is no cancel route): the crew keeps writing the set, and a second POST would
 * queue behind it (F39, O5). So the executor keeps, per question (goal, concept, rung) and per demo
 * session, the fresh sets it pressed that the screen has not shown. A press reads them first: a
 * set that landed meanwhile is shown at once (no POST, no extra daily tap); one still being written
 * is followed, on this press's own budget; a failed one is dropped. Only with none left does it
 * POST. A late result is still never swapped in on its own (K45, K48): only a press shows it.
 */
export interface QParams {
  readonly goalId: string;
  readonly conceptId: string;
  readonly rung: number;
}

/** One row of the served generation trace (V5; the stored trace is allowlisted server side). */
export interface CampaignTraceStep {
  readonly name: string;
  readonly status: string;
  readonly started_at?: string | null;
  readonly completed_at?: string | null;
  readonly attempt?: number | null;
  readonly input_tokens?: number | null;
  readonly output_tokens?: number | null;
  readonly accepted?: boolean | null;
  readonly notes?: unknown;
}

export interface QResult {
  readonly freshSetId: string;
  readonly conceptId: string;
  readonly conceptKey: string;
  readonly rung: number;
  readonly questions: readonly CampaignQuestion[];
  readonly traceId: string | null;
  readonly trace: readonly CampaignTraceStep[] | null;
  /** The critic's final word on the set (`setCriticVerdict`), or null when the trace carries none. */
  readonly critic: { readonly accepted: boolean } | null;
}

/**
 * K103, W79: a LIVE question set's question for a quiz at `rung`, or null: a set written for another
 * rung (the idea climbed since), or one that holds no question it can show (said loudly).
 */
export function questionAt(r: QResult, rung: number): { readonly question: CampaignQuestion; readonly freshSetId: string } | null {
  if (r.rung !== rung) return null;
  const question = r.questions[0];
  if (!question) {
    console.error(`[kiosk] the LIVE question set ${r.freshSetId} holds no question it can show`);
    return null;
  }
  return { question, freshSetId: r.freshSetId };
}

interface FreshRead {
  readonly fresh_set_id: string;
  readonly status: string;
  readonly concept_id: string;
  readonly concept_key: string;
  readonly rung: number;
  readonly questions?: unknown;
  readonly failure_reason?: string;
  readonly trace_id?: string | null;
  readonly pipeline_trace?: readonly CampaignTraceStep[] | null;
}

@Injectable({ providedIn: 'root' })
export class QLive implements LiveExecutor<QParams, QResult> {
  /** Fresh set ids pressed in this demo session and not yet shown, by question, oldest first. */
  private readonly unshown = new Map<string, string[]>();

  async run(params: QParams, ctx: LiveRunContext): Promise<QResult> {
    const base = `/api/v1/me/goals/${encodeURIComponent(params.goalId)}/campaign/questions/fresh`;
    const question = `${params.goalId}|${params.conceptId}|${params.rung}`;
    for (const id of [...(this.unshown.get(question) ?? [])].reverse()) {
      const set = await ctx.http.get<FreshRead>(`${base}/${encodeURIComponent(id)}`, ctx.signal);
      if (set.status === 'failed') {
        this.forget(question, id);
        continue;
      }
      return this.follow(question, base, id, set, ctx);
    }
    const pressed = await ctx.http.post<FreshRead>(base, { concept_id: params.conceptId, rung: params.rung }, ctx.signal);
    const id = pressed.fresh_set_id;
    if (!id) throw new Error('the fresh press answered with no fresh_set_id');
    this.unshown.set(question, [...(this.unshown.get(question) ?? []), id]);
    return this.follow(question, base, id, null, ctx);
  }

  /** The demo session ends: the next visitor's presses start their own runs. */
  endSession(): void {
    this.unshown.clear();
  }

  /** Polls set `id` until it ends; `first` is a read already made (null: wait, then read). */
  private async follow(question: string, base: string, id: string, first: FreshRead | null, ctx: LiveRunContext): Promise<QResult> {
    const readUrl = `${base}/${encodeURIComponent(id)}`;
    let set = first;
    while (set === null || set.status === 'requested') {
      await sleep(LIVE_POLL_MS, ctx.signal);
      set = await ctx.http.get<FreshRead>(readUrl, ctx.signal);
    }
    // The set has ended: shown below, or a failure the screen falls back from. Either way it is never followed again.
    this.forget(question, id);
    if (set.status === 'failed') throw new Error(`fresh set ${id} failed: ${set.failure_reason ?? 'no reason given'}`);
    if (set.status !== 'ready') throw new Error(`fresh set ${id} answered ${set.status}`);

    const questions = parseCampaignQuestions(set.questions);
    if (questions.length === 0) throw new Error(`fresh set ${id} is ready with no usable question`);
    const trace = set.pipeline_trace ?? null;
    ctx.stage('writer', 'done');
    if ((trace ?? []).some((s) => s.name === 'critique')) ctx.stage('critic', 'done');
    return {
      freshSetId: id,
      conceptId: set.concept_id,
      conceptKey: set.concept_key,
      rung: set.rung,
      questions,
      traceId: set.trace_id ?? null,
      trace,
      critic: setCriticVerdict(trace),
    };
  }

  private forget(question: string, id: string): void {
    const left = (this.unshown.get(question) ?? []).filter((x) => x !== id);
    if (left.length) this.unshown.set(question, left);
    else this.unshown.delete(question);
  }
}
