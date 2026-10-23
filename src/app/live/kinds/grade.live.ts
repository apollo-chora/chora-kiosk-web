import { Injectable } from '@angular/core';

import type { GradingRead } from '../../product-api/assessments.service';
import { sleep } from '../abortable';
import { LIVE_POLL_MS } from '../live-kinds';
import { LiveExecutor, LiveRunContext } from '../live.service';

/**
 * LIVE `grade` (K57): the learner's own grading request on a held submission, then the
 * instructor's grading read until the grading crew has scored it (state GRADED, review
 * PENDING_REVIEW: the person reviews next, K27). The read shows no separate evaluator and
 * moderator moments, so both stages tick when the grading ends. A typed answer in the grading
 * exhibit is held first on a fresh assessment of the grading test set (API-CONTRACT.md section 3:
 * create, start, save, submit), made only by the press.
 * Wire: delivery assessment_handler.go (create, start, autosave, submit, request-grading) and
 * grading_review_handler.go (buildGradingReviewDetail).
 */
export interface TypedAnswer {
  readonly testSetId: string;
  /** The test set's title, as kiosk-web sends it for every take (title_override). */
  readonly title: string;
  readonly learnerGcid: string;
  readonly testSetQuestionId: string;
  readonly questionId: string;
  readonly text: string;
}

export type GradeParams = { readonly assessmentId: string; readonly submissionId: string } | { readonly typed: TypedAnswer };

export interface GradeResult {
  readonly detail: GradingRead;
  /** The submission graded: the one given, or the fresh one a typed answer was held on. */
  readonly assessmentId: string;
  readonly submissionId: string;
}

/** Still being graded (or not yet picked up): keep polling. */
const WAITING = new Set(['SUBMITTED', 'GRADING']);

@Injectable({ providedIn: 'root' })
export class GradeLive implements LiveExecutor<GradeParams, GradeResult> {
  async run(params: GradeParams, ctx: LiveRunContext): Promise<GradeResult> {
    const held = 'typed' in params ? await this.hold(params.typed, ctx) : params;
    const a = encodeURIComponent(held.assessmentId);
    const s = encodeURIComponent(held.submissionId);
    await ctx.http.post(`/api/v1/me/assessments/${a}/submissions/${s}/request-grading`, null, ctx.signal);
    const readUrl = `/api/v1/assessments/${a}/submissions/${s}/grading`;
    for (;;) {
      await sleep(LIVE_POLL_MS, ctx.signal);
      const detail = await ctx.http.get<GradingRead>(readUrl, ctx.signal);
      if (WAITING.has(detail.state)) continue;
      ctx.stage('evaluator', 'done');
      ctx.stage('moderator', 'done');
      return { detail, ...held };
    }
  }

  /** A fresh one-attempt assessment holding the typed answer, submitted (K57 holds its grading). */
  private async hold(t: TypedAnswer, ctx: LiveRunContext): Promise<{ readonly assessmentId: string; readonly submissionId: string }> {
    const created = await ctx.http.post<{ assessment_id?: string }>(
      '/api/v1/assessments',
      { test_set_id: t.testSetId, title_override: t.title, invited_gcids: [t.learnerGcid], max_attempts: 1 },
      ctx.signal,
    );
    if (!created?.assessment_id) throw new Error('[kiosk] POST /api/v1/assessments answered with no assessment_id');
    const a = encodeURIComponent(created.assessment_id);
    const started = await ctx.http.post<{ submission_id?: string }>(`/api/v1/me/assessments/${a}/submissions`, {}, ctx.signal);
    if (!started?.submission_id) throw new Error(`[kiosk] POST /api/v1/me/assessments/${a}/submissions answered with no submission_id`);
    const sub = `/api/v1/me/assessments/${a}/submissions/${encodeURIComponent(started.submission_id)}`;
    const answer = { test_set_question_id: t.testSetQuestionId, question_id: t.questionId, question_type: 'oe', oe_response_text: t.text };
    await ctx.http.patch(sub, { answers: [answer] }, ctx.signal);
    await ctx.http.post(`${sub}/submit`, {}, ctx.signal);
    return { assessmentId: created.assessment_id, submissionId: started.submission_id };
  }
}
