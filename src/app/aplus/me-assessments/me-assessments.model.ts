/**
 * Me-Assessments model: A+ Learner Submission Flow (Phase X.3 / ADR-155).
 *
 * Hand-typed against `chora-contracts/openapi/delivery-assessments.yaml`
 *: focus on the 7 learner-facing ops under `/me/assessments/*`:
 *   - listMyAssessments        → GET    /me/assessments
 *   - getMyAssessment          → GET    /me/assessments/{id}
 *   - startMySubmission        → POST   /me/assessments/{id}/submissions
 *   - getMySubmission          → GET    /me/assessments/{id}/submissions/{subId}
 *   - autosaveMySubmission     → PATCH  /me/assessments/{id}/submissions/{subId}
 *   - submitMySubmission       → POST   /me/assessments/{id}/submissions/{subId}/submit
 *   - getMySubmissionResult    → GET    /me/assessments/{id}/submissions/{subId}/result
 *
 * Per ADR-155 D7 the Assessment FSM is
 *   DRAFT → SCHEDULED → OPEN → CLOSED → GRADING → GRADED → RELEASED → ARCHIVED
 * and the Submission FSM is
 *   IN_PROGRESS → SUBMITTED → GRADING → GRADED → RELEASED → ARCHIVED
 *
 * Per D8 the v1 demo path is **MCQ-only** for grading; OE answers can be
 * authored + submitted but stay `OE_BATCH_PENDING` until M14.x lands the
 * `oe_grader` agent. This file types both shapes so the UI can render the
 * OE_BATCH_PENDING chip honestly without breaking when grading goes live.
 */

// ── FSM states ────────────────────────────────────────────────────────

export type AssessmentState =
  | 'DRAFT'
  | 'SCHEDULED'
  | 'OPEN'
  | 'CLOSED'
  | 'GRADING'
  | 'GRADED'
  | 'RELEASED'
  | 'ARCHIVED';

export type SubmissionState =
  | 'IN_PROGRESS'
  | 'SUBMITTED'
  | 'GRADING'
  | 'GRADED'
  | 'RELEASED'
  | 'ARCHIVED';

export type QuestionType = 'mcq' | 'oe';

/**
 * Discriminant on `GET .../result`: controls whether to render the
 * holding panel or the full result envelope.
 */
export type SubmissionResultState = 'PENDING_RELEASE' | 'RELEASED';

/** Learner-side cohort eligibility tag: exposed in the assessment summary. */
export type LearnerAttemptStatus =
  | 'AVAILABLE'
  | 'IN_PROGRESS'
  | 'SUBMITTED'
  | 'RELEASED'
  | 'CLOSED'
  | 'SCHEDULED'
  | 'EXHAUSTED';

// ── List item: GET /me/assessments → LearnerAssessmentSummary ────────

export interface LearnerAssessmentSummary {
  readonly assessment_id: string;
  readonly title: string;
  readonly learner_facing_name?: string | null;
  readonly state: AssessmentState;
  readonly scheduled_open_at: string;
  readonly scheduled_close_at: string;
  readonly max_attempts: number;
  readonly learner_attempt_count: number;
  readonly learner_remaining_attempts: number;
  readonly learner_latest_submission_state?: SubmissionState;
  // BE shipped 2026-05-17 ~08:09 (commit e2e09d9d, closed at 71d670a7).
  // Populated when learner_attempt_count > 0; null otherwise. Used by
  // /a/me/assessments list "View result" deep link + cover-page CTA.
  readonly learner_latest_submission_id?: string | null;
  readonly question_count?: number;
  readonly total_points?: number;
  readonly time_limit_seconds?: number;
}

export interface LearnerAssessmentListResponse {
  readonly items: readonly LearnerAssessmentSummary[];
  readonly next_page_token?: string | null;
}

// ── Detail: GET /me/assessments/{id} → LearnerAssessmentDetail ──────

export interface LearnerMcqOption {
  readonly option_id: string;
  readonly label: string;
  readonly text: string;
}

export interface LearnerMcq {
  readonly options: readonly LearnerMcqOption[];
  readonly scoring_mode?:
    | 'single_correct'
    | 'multi_correct'
    | 'all_or_nothing';
  readonly shuffle_options?: boolean;
}

export interface LearnerOe {
  readonly model_answer?: string;
  readonly min_response_chars?: number;
  readonly max_response_chars?: number;
  readonly grader_tier?: 'T1' | 'T2';
}

/**
 * `prompt` is the snapshot payload published from chora-creation into the
 * assessment's per-question wire row. Per LEG3-D R5 fix the BE now ships
 * the full nested envelope:
 *   prompt: { stem, options?, model_answer?, rubric?, ... }
 * MCQ options live under `prompt.options`; OE rubric lives under
 * `prompt.rubric`. Older builds shipped `prompt: string` + sibling `mcq`/
 * `oe` blocks: those legacy shapes are still accepted via the fallback
 * branches in the template + component to keep cached assessments
 * renderable across the cutover window.
 */
export interface LearnerQuestionPrompt {
  readonly stem: string;
  /**
   * W8 image-gen: OPTIONAL stem illustration shown to the learner WHILE
   * taking the assessment (the question's accompanying picture, not part of
   * the answer key). BE surfaces it learner-safe on the question prompt.
   * Field name is IDENTICAL across every layer (snapshot json tag → DTO →
   * this model → template).
   */
  readonly image_url?: string | null;
  readonly options?: readonly LearnerMcqOption[];
  readonly model_answer?: string;
  readonly rubric?: readonly {
    readonly criterion_id: string;
    readonly title: string;
    readonly description?: string;
    readonly weight?: number;
  }[];
  readonly grader_tier?: 'T1' | 'T2';
  readonly min_response_chars?: number;
  readonly max_response_chars?: number;
  readonly scoring_mode?:
    | 'single_correct'
    | 'multi_correct'
    | 'all_or_nothing';
}

export interface LearnerQuestion {
  readonly test_set_question_id: string;
  readonly question_id: string;
  readonly question_atom_id?: string;
  readonly question_type: QuestionType;
  readonly prompt: LearnerQuestionPrompt | string;
  /**
   * BE wire field. `points_possible` is the legacy alias kept for back-
   * compat with cached pre-LEG3-D-R5 detail responses.
   */
  readonly points?: number;
  readonly points_possible?: number;
  readonly display_order: number;
  readonly required?: boolean;
  readonly mcq?: LearnerMcq | null;
  readonly oe?: LearnerOe | null;
}

export interface LearnerAssessmentDetail extends LearnerAssessmentSummary {
  readonly questions: readonly LearnerQuestion[];
}

// ── Submission ────────────────────────────────────────────────────────

export interface SubmissionAnswer {
  readonly test_set_question_id: string;
  readonly question_id: string;
  readonly mcq_choice_id?: string | null;
  readonly mcq_choice_ids?: readonly string[] | null;
  readonly oe_response_text?: string | null;
  readonly answered_at?: string | null;
}

export interface Submission {
  readonly submission_id: string;
  readonly assessment_id: string;
  readonly tenant_id: string;
  readonly learner_gcid: string;
  readonly attempt_number: number;
  readonly state: SubmissionState;
  readonly opens_at?: string;
  readonly closes_at?: string;
  readonly time_limit_seconds?: number;
  readonly time_remaining_seconds?: number;
  readonly started_at: string;
  readonly submitted_at?: string | null;
  readonly last_saved_at?: string | null;
  readonly answers: readonly SubmissionAnswer[];
}

export interface SubmissionStartedResponse {
  readonly submission_id: string;
  readonly attempt_number?: number;
  readonly opens_at: string;
  readonly closes_at: string;
  readonly time_limit_seconds: number;
  readonly idempotent_replay?: boolean;
}

export interface AutosaveAnswerInput {
  readonly test_set_question_id: string;
  readonly question_id: string;
  readonly mcq_choice_id?: string | null;
  readonly mcq_choice_ids?: readonly string[] | null;
  readonly oe_response_text?: string | null;
}

export interface AutosaveRequest {
  readonly answers: readonly AutosaveAnswerInput[];
}

export interface SubmissionSubmittedResponse {
  readonly submission_id: string;
  readonly state: SubmissionState;
  readonly grading_job_id: string;
  readonly grading_eta_seconds?: number | null;
}

// ── Result ────────────────────────────────────────────────────────────

export interface LearnerQuestionGradeMcqOption {
  readonly option_id: string;
  readonly label: string;
  readonly text: string;
  readonly is_correct: boolean;
  readonly explainer?: string | null;
}

export interface LearnerQuestionGradeMcqPost {
  readonly options: readonly LearnerQuestionGradeMcqOption[];
  /**
   * W8 image-gen: OPTIONAL model-answer illustration revealed in the result
   * alongside the answer reveal. Field name is IDENTICAL across every layer
   * (snapshot json tag → DTO → this model → template).
   */
  readonly answer_image_url?: string | null;
}

export interface LearnerQuestionGradeOeCriterion {
  readonly criterion_id: string;
  readonly title: string;
  readonly score: number;
  readonly max_score: number;
  readonly feedback?: string | null;
}

export interface LearnerQuestionGradeOeRubricRow {
  readonly criterion_id: string;
  readonly title: string;
  readonly description?: string;
  readonly weight?: number;
}

/** Provenance marker: distinguishes AI-authored from human-reviewer content. */
export type GradeProvenance = 'AI' | 'HUMAN';

export interface LearnerQuestionGradeOePost {
  readonly model_answer?: string;
  readonly rubric?: readonly LearnerQuestionGradeOeRubricRow[];
  readonly criterion_scores?: readonly LearnerQuestionGradeOeCriterion[];
  readonly llm_evaluator_feedback?: string | null;
  /**
   * ADR-172 OE post-grade reveal: per-question grader comment, AI/Human
   * provenance for the comment + the score, a low-quality flag, and the
   * model-answer illustration. `comment` is parsed from the SubmissionAnswer
   * OE comment field (BE); `criterion_scores` from criterion_scores_json.
   */
  readonly comment?: string | null;
  readonly comment_provenance?: GradeProvenance;
  readonly score_provenance?: GradeProvenance;
  readonly quality_flagged?: boolean;
  readonly answer_image_url?: string | null;
}

export interface LearnerAnswerEcho {
  readonly mcq_choice_id?: string | null;
  readonly mcq_choice_ids?: readonly string[] | null;
  readonly oe_response_text?: string | null;
}

export interface LearnerQuestionGrade {
  readonly test_set_question_id: string;
  readonly question_id: string;
  readonly question_type: QuestionType;
  readonly points_earned: number;
  readonly points_possible: number;
  readonly correct?: boolean | null;
  readonly grading_dispatch: 'DETERMINISTIC' | 'LLM_EVALUATOR';
  readonly learner_answer?: LearnerAnswerEcho;
  readonly mcq_post_grade?: LearnerQuestionGradeMcqPost | null;
  /**
   * W8 image-gen (CHO-1638): OPTIONAL question/stem illustration surfaced on
   * the result reveal so the learner reviews the question WITH its picture
   * (parallel to mcq_post_grade.answer_image_url for the model answer). The BE
   * mints the durable gs:// ref to a fresh signed URL. Field name IDENTICAL
   * across every layer (snapshot json tag → DTO → this model → template).
   */
  readonly question_image_url?: string | null;
  readonly oe_post_grade?: LearnerQuestionGradeOePost | null;
  readonly oe_batch_pending?: boolean;
  /**
   * FE-BUG-LEG5-A (2026-05-16): BE currently ships the LLM evaluator
   * feedback flat on the grade row (not nested under `oe_post_grade`).
   * Template falls back through both paths to render in either shape;
   * E2E-BE-LEG5-A asks BE to settle on one canonical placement.
   */
  readonly llm_evaluator_feedback?: string | null;
  /**
   * ADR-172 HITL: quality flag surfaced flat on the grade row (parallel to
   * `oe_post_grade.quality_flagged`); the result template reads either path.
   */
  readonly quality_flagged?: boolean;
}

export interface SubmissionResult {
  readonly submission_id: string;
  readonly total_points_earned: number;
  readonly total_points_possible: number;
  readonly passing_threshold_percent: number;
  readonly passed: boolean;
  readonly per_question_grades: readonly LearnerQuestionGrade[];
  readonly instructor_comment?: string | null;
  readonly released_at?: string;
  /**
   * ADR-172 whole-assessment OE comment: a per-submission grader comment
   * spanning the entire assessment (Submission overall_comment field on the
   * BE) with AI/Human provenance. `ai_overall_comment` carries the original
   * AI draft when a human reviewer overrode `overall_comment`.
   */
  readonly overall_comment?: string | null;
  readonly overall_comment_provenance?: GradeProvenance;
  readonly ai_overall_comment?: string | null;
}

export interface MySubmissionResultResponse {
  readonly state: SubmissionResultState;
  readonly message?: string;
  readonly result?: SubmissionResult;
}

// ── AsyncState discriminated unions (fail-loud per chora-web CLAUDE.md §3) ──

export type MeAssessmentsListState =
  | { readonly status: 'loading' }
  | {
      readonly status: 'success';
      readonly items: readonly LearnerAssessmentSummary[];
      /** Opaque cursor for the next page; null = no more pages. */
      readonly nextPageToken?: string | null;
    }
  | { readonly status: 'error'; readonly error: string };

export type MeAssessmentDetailLoadState =
  | { readonly status: 'loading' }
  | { readonly status: 'success'; readonly detail: LearnerAssessmentDetail }
  | { readonly status: 'error'; readonly error: string };

export type StartSubmissionState =
  | { readonly status: 'idle' }
  | { readonly status: 'starting' }
  | {
      readonly status: 'started';
      readonly started: SubmissionStartedResponse;
    }
  | { readonly status: 'error'; readonly error: string };

export type SubmissionLoadState =
  | { readonly status: 'idle' }
  | { readonly status: 'loading' }
  | { readonly status: 'success'; readonly submission: Submission }
  | { readonly status: 'error'; readonly error: string };

export type AutosaveState =
  | { readonly status: 'idle' }
  | { readonly status: 'saving' }
  | { readonly status: 'saved'; readonly saved_at: string }
  | { readonly status: 'error'; readonly error: string };

export type SubmitFinalState =
  | { readonly status: 'idle' }
  | { readonly status: 'submitting' }
  | {
      readonly status: 'submitted';
      readonly response: SubmissionSubmittedResponse;
    }
  | { readonly status: 'error'; readonly error: string };

export type ResultState =
  | { readonly status: 'loading' }
  | {
      readonly status: 'pending';
      readonly message: string;
    }
  | {
      readonly status: 'released';
      readonly result: SubmissionResult;
    }
  | { readonly status: 'error'; readonly error: string };

export const I18N_PREFIX = 'aplus.me_assessments' as const;

// ── Pagination helpers (CR2-C2) ───────────────────────────────────────

/** Allowed page-size values: mirrors atom-question-picker contract. */
export type PageSize = 10 | 20 | 50 | 100;

export const PAGE_SIZE_OPTIONS: readonly PageSize[] = [10, 20, 50, 100] as const;

/** Default page size for the assessments list. */
export const DEFAULT_PAGE_SIZE: PageSize = 20;
