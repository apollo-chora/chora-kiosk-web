/**
 * CampaignPracticeService: the WS-C7 (CHO-2086) hex-tap practice lane adapter.
 *
 * Two doors against chora-consumption's campaign question lane (ADR-227 D13),
 * both nested under the already-proxied `/api/v1/me/goals/{goalId}` subtree:
 *
 *   load(goalId, conceptId)  GET  …/campaign/questions?concept_id={conceptId}
 *   answer(goalId, req)      POST …/campaign/questions/answer
 *
 * The GET reuses the "generate once, retrieve forever" question bank: a servable
 * set returns `status: ready` + the qgen `BatchCandidatePayload` verbatim; a
 * miss / in-flight / failed set returns a poll status the component re-polls.
 *
 * Grading is SERVER-side ONLY (contract §3). The §2 serve is SANITISED
 * pre-grade (Slice F): no answer key AND no per-option explainer (it is
 * answer-revealing). `parseCampaignQuestions` normalises only the learner-safe
 * fields (stem + option id/text). The verdict, the correct option
 * (`correct_option_id`) and the explainer all arrive on the §3 POST response.
 *
 * Per chora-web CLAUDE.md §3 all HTTP goes through BffClientService; per
 * `reusable-fe-error-detail-apierror-body-not-error` every failure is read via
 * `httpErrorView` (ApiError.body, NOT err.error) and re-thrown as a typed
 * CampaignPracticeError carrying the BE's `{code, message}` envelope.
 *
 * KIOSK COPY (T3.6) of chora-web eeaec46eb, changed only where marked KIOSK:
 * `load` takes an optional explicit rung and `answer` an optional `fresh_set_id`
 * (Q-fresh, K103).
 */
import { Injectable, inject } from '@angular/core';
import { HttpParams } from '@angular/common/http';
import { Observable, catchError, throwError } from 'rxjs';

import { BffClientService } from '../../../core/services/bff-client.service';
import { httpErrorView } from '../../../core/interceptors/api-error.model';
import type {
  CampaignAnswerRequest,
  CampaignAnswerResult,
  CampaignQuestionsResponse,
} from '../../my-knowledge/campaign.model';

/** KIOSK: an answer to a LIVE question names its fresh set, graded against the fresh key. */
export interface KioskCampaignAnswerRequest extends CampaignAnswerRequest {
  readonly fresh_set_id?: string;
}

// ── Wire shape: the SANITISED campaign question serve ─────────────────────
//
// The `questions` field of a `ready` serve is the qgen crew's
// `candidate_payload_json`: but the §2 serve is SANITISED pre-grade (BE Slice
// F): the answer key (`is_correct`) AND the per-option `explainer` (which is
// answer-revealing) are stripped. So a served option carries only its stable
// `option_id` + display `text`/`label`. The correct option + explainer arrive
// on the §3 ANSWER response, post-grade (`CampaignAnswerResult.correct_option_id`
// + `.explainer`). We model the served shape honestly (no answer-key fields) and
// compute the A/B/C/D marker locally (mcq-option-naming).

/** One MCQ option as the SANITISED serve carries it: identity + display text
 *  only. No answer key, no explainer (both stripped pre-grade by Slice F). */
export interface CampaignPayloadOption {
  readonly option_id?: string;
  /** Author content; the batch path echoes it as both `label` and `text`. */
  readonly label?: string;
  readonly text?: string;
}

/** One candidate question in the BatchCandidatePayload `candidates[]` array. */
export interface CampaignPayloadCandidate {
  readonly stem?: string;
  /** Defensive alt to `stem` (some author projections use `prompt`). */
  readonly prompt?: string;
  readonly question_type?: string;
  readonly options?: readonly CampaignPayloadOption[];
  readonly mcq_payload?: { readonly options?: readonly CampaignPayloadOption[] } | null;
}

/** The verbatim qgen payload envelope. */
export interface BatchCandidatePayload {
  readonly candidates?: readonly CampaignPayloadCandidate[];
}

// ── Normalised player shapes (learner-safe projection) ───────────────────

/** A learner-facing MCQ option: stable identity + display text. The A/B/C/D
 *  marker is positional and computed in the component, never here. The
 *  explainer is NOT on the option: it arrives on the answer response. */
export interface CampaignOption {
  readonly optionId: string;
  readonly text: string;
}

/** A learner-facing question: the stem + its options (no answer key). */
export interface CampaignQuestion {
  readonly stem: string;
  readonly options: readonly CampaignOption[];
  /**
   * Index of this question in the SERVED `candidates` array: the value the
   * answers door means by `question_index` (CHO-2252).
   *
   * NOT the render position. Dropping unusable candidates below is a RENDER
   * choice, but `question_index` is a PROTOCOL field: the backend grades against
   * its own full candidates array. Posting the filtered position would grade the
   * learner against a DIFFERENT question than the one they answered, silently,
   * the moment anything is dropped.
   */
  readonly sourceIndex: number;
}

/**
 * Normalise the sanitised campaign serve into learner-facing questions. Pure +
 * total: malformed / empty input yields `[]` (the caller fail-louds a `ready`
 * serve that parses to nothing rather than inventing a question). Reads only
 * the learner-safe fields (identity + text); any stray answer-key/explainer
 * fields on the wire are ignored (defence: Slice F already strips them). Drops
 * any candidate without a stem or with <2 usable options.
 */
export function parseCampaignQuestions(raw: unknown): readonly CampaignQuestion[] {
  if (!raw || typeof raw !== 'object') return [];
  const candidates = (raw as BatchCandidatePayload).candidates;
  if (!Array.isArray(candidates)) return [];

  const out: CampaignQuestion[] = [];
  // `sourceIndex` tracks the position on the WIRE, so it must advance for every
  // candidate: including the ones dropped below.
  for (const [sourceIndex, c] of candidates.entries()) {
    if (!c || typeof c !== 'object') continue;
    const stem = (c.stem?.trim() || c.prompt?.trim()) ?? '';
    if (!stem) continue;

    const rawOpts = c.options ?? c.mcq_payload?.options ?? [];
    if (!Array.isArray(rawOpts)) continue;

    const options: CampaignOption[] = [];
    for (const o of rawOpts) {
      if (!o || typeof o !== 'object') continue;
      const optionId = (o.option_id ?? '').trim();
      if (!optionId) continue; // an option with no stable identity can't be graded
      const text = (o.text?.trim() || o.label?.trim()) ?? '';
      options.push({ optionId, text });
    }
    // Single-correct MCQ needs at least two distinct choices to be a question.
    if (options.length < 2) continue;
    out.push({ stem, options, sourceIndex });
  }
  return out;
}

/** A typed campaign-lane failure carrying the BE `{code, message}` envelope. */
export class CampaignPracticeError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'CampaignPracticeError';
  }
}

/**
 * Normalise EITHER error shape Chora observes (raw `HttpErrorResponse` in
 * specs, `ApiError` at runtime) into a typed CampaignPracticeError. The
 * consumption `extWriteError` envelope is flat `{code, message}` (ext_mux.go),
 * read off `httpErrorView(err).body`: never `err.error` directly.
 */
function toCampaignError(err: unknown): CampaignPracticeError {
  const view = httpErrorView(err);
  const status = view?.status ?? 0;
  const body =
    view && view.body && typeof view.body === 'object'
      ? (view.body as { code?: string; message?: string })
      : null;
  const code = body?.code?.trim() || 'UNKNOWN';
  const message = body?.message?.trim() || `campaign practice request failed (${status})`;
  return new CampaignPracticeError(status, code, message);
}

@Injectable({ providedIn: 'root' })
export class CampaignPracticeService {
  private readonly bff = inject(BffClientService);

  /** GET the node-scoped question serve for one campaign hex. `concept_id` is
   *  always sent, so the param-less `NO_FOCUS` 409 never applies here.
   *  KIOSK: an explicit `rung` skips the serve decision (the prepared set's rung). */
  load(goalId: string, conceptId: string, rung?: number): Observable<CampaignQuestionsResponse> {
    let params = new HttpParams().set('concept_id', conceptId);
    if (rung !== undefined) params = params.set('rung', String(rung));
    return this.bff
      .get<CampaignQuestionsResponse>(
        `/api/v1/me/goals/${goalId}/campaign/questions`,
        params,
      )
      .pipe(catchError((err) => throwError(() => toCampaignError(err))));
  }

  /** POST one server-graded answer; the verdict rides the response. The door
   *  has no idempotency store (bounded by the ladder threshold + D7 pacing):
   *  double-submit protection is the component's job. */
  answer(goalId: string, req: KioskCampaignAnswerRequest): Observable<CampaignAnswerResult> {
    return this.bff
      .post<CampaignAnswerResult>(
        `/api/v1/me/goals/${goalId}/campaign/questions/answer`,
        req,
      )
      .pipe(catchError((err) => throwError(() => toCampaignError(err))));
  }
}
