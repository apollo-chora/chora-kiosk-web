/**
 * Test-Set Editor: model types (X.2, ADR-155).
 *
 * Mirrors the shapes locked in `chora-contracts/openapi/delivery-test-sets.yaml`.
 *
 * Cross-domain composition (ADR-155 D1):
 *   - TestSet lives in `chora_delivery` (this contract)
 *   - Per-question inclusion references `chora_creation.questions` by UUID
 *     (no FK; ddd-enforcement #3); snapshot is captured at add-time
 *
 * Lifecycle (ADR-155 D5):
 *   DRAFT     → PUBLISHED  (via /publish; ≥1 question + valid points)
 *   DRAFT     → ARCHIVED   (via DELETE: soft-delete)
 *   PUBLISHED → ARCHIVED   (via /archive: preserves audit trail)
 *   PUBLISHED test-sets are IMMUTABLE on the question list: edits return
 *   409 `DELIVERY_TEST_SET_PUBLISHED_IMMUTABLE`. v1 demo edit-flow:
 *   archive + create new (D8).
 */

export type TestSetState = 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
export type GradingMcqDispatch = 'DETERMINISTIC';
export type GradingOeDispatch = 'LLM_EVALUATOR_AGENT';
export type GraderTier = 'T1' | 'T2';
export type SnapshotQuestionType = 'mcq' | 'oe';

export interface GradingConfig {
  readonly mcq_dispatch: GradingMcqDispatch;
  readonly oe_dispatch: GradingOeDispatch;
  readonly llm_evaluator_model_tier?: GraderTier;
  readonly passing_threshold_percent: number;
  readonly per_question_feedback_enabled: boolean;
  readonly auto_release?: boolean;
}

export const DEFAULT_GRADING_CONFIG: GradingConfig = {
  mcq_dispatch: 'DETERMINISTIC',
  oe_dispatch: 'LLM_EVALUATOR_AGENT',
  llm_evaluator_model_tier: 'T1',
  passing_threshold_percent: 70,
  per_question_feedback_enabled: true,
  auto_release: false,
};

export interface TestSet {
  readonly test_set_id: string;
  readonly tenant_id: string;
  readonly author_gcid: string;
  readonly title: string;
  readonly description?: string | null;
  readonly learner_facing_name?: string | null;
  readonly tags?: readonly string[];
  readonly state: TestSetState;
  readonly total_points: number;
  readonly question_count: number;
  readonly revision_number?: number;
  readonly parent_test_set_id?: string | null;
  readonly default_grading_config: GradingConfig;
  readonly deleted_at?: string | null;
  readonly created_at: string;
  readonly updated_at: string;
  readonly published_at?: string | null;
  readonly archived_at?: string | null;
}

export interface QuestionSnapshot {
  readonly question_id: string;
  readonly atom_id: string;
  readonly atom_title: string;
  readonly question_type: SnapshotQuestionType;
  readonly prompt_preview: string;
  readonly topic_node_ids?: readonly string[];
  readonly tags?: readonly string[];
  readonly difficulty?: number;
  readonly cognitive_level?: string | null;
  readonly revision_number: number;
}

/**
 * CHO-2402: the copy pinned at publish, as chora-delivery now ships it on
 * `test_set_questions.payload_snapshot`.
 *
 * Distinct from `QuestionSnapshot` above, which is add-time metadata. This is
 * the learner-facing payload the SITTING is served from: once a set is
 * published, this is the question, and the live atom may have moved on.
 * DRAFT rows carry none and follow the live question by design.
 */
export interface PinnedOption {
  readonly option_id: string;
  readonly label: string;
  readonly is_correct: boolean;
  readonly explainer?: string | null;
}

export interface PinnedPayloadSnapshot {
  readonly stem?: string;
  readonly options?: readonly PinnedOption[];
  /** OE rows pin the model answer and its rubric instead of options. */
  readonly model_answer?: string | null;
  readonly rubric?: readonly {
    readonly title?: string;
    readonly description?: string | null;
    readonly weight?: number | null;
  }[];
}

export interface TestSetQuestion {
  readonly test_set_question_id: string;
  readonly test_set_id: string;
  readonly question_id: string;
  /**
   * LEG3-D R3 Option B: chora-delivery now stores `question_atom_id`
   * distinct from `question_id`. Sourced atom UUID.
   */
  readonly question_atom_id: string;
  readonly question_revision_number?: number;
  readonly question_type?: SnapshotQuestionType;
  readonly points: number;
  readonly display_order: number;
  readonly required?: boolean;
  /**
   * Captured at TestSet.publish() time per LEG3-D R3 + the proposed
   * atom-aggregate redesign (`docs/architecture/atom-aggregate-holistic-
   * assessment-2026-05-16.md`). DRAFT test-sets have null snapshot;
   * FE renders fallback when missing.
   */
  readonly snapshot?: QuestionSnapshot;
  /** CHO-2402: present only on PUBLISHED rows; the copy the sitting serves. */
  readonly payload_snapshot?: PinnedPayloadSnapshot;
  /** When that copy was pinned. Absent on DRAFT rows. */
  readonly snapshot_at?: string;
  readonly added_at: string;
  readonly updated_at?: string;
}

export interface TestSetWithQuestions extends TestSet {
  readonly questions: readonly TestSetQuestion[];
}

export interface TestSetListResponse {
  readonly items: readonly TestSet[];
  readonly next_page_token?: string | null;
  readonly total?: number | null;
}

// ─── Request payloads ──────────────────────────────────────────────────

export interface CreateTestSetRequest {
  readonly title: string;
  readonly description?: string;
  readonly learner_facing_name?: string;
  readonly tags?: readonly string[];
  readonly default_grading_config?: GradingConfig;
}

export interface UpdateTestSetRequest {
  readonly title?: string;
  readonly description?: string;
  readonly learner_facing_name?: string;
  readonly tags?: readonly string[];
  readonly default_grading_config?: GradingConfig;
}

/**
 * `POST /api/v1/test-sets/{id}/questions` request body: LEG3-D R3 Option B
 * (per `docs/m13/wave3-leg3d-round3-blocker-2026-05-16.md` + BE ack
 * `52bad4bc fix(delivery): ack LEG3-D R3: question_id explicit in
 * add-question`, image `chora-delivery:leg3d-r3b-153f2c0a`).
 *
 * Both UUIDs are REQUIRED and DISTINCT:
 *   - `question_atom_id`: LearningAtom row UUID in chora_creation.
 *   - `question_id`: embedded Question UUID inside the atom's payload
 *     (`mcq_payload.question_id` or `essay_payload.question_id`).
 *
 * FE picker is responsible: chora-delivery does NOT resolve atom→question
 * at add-question time. Source `question_id` via `GET /api/atoms/{atom_id}`
 * which returns `AtomWithQuestionProjection` (chora-contracts/openapi/
 * creation-questions.yaml §1281).
 */
export interface AddTestSetQuestionRequest {
  readonly question_atom_id: string;
  readonly question_id: string;
  readonly question_type: string;
  readonly points: number;
  readonly display_order?: number;
  readonly required?: boolean;
}

/**
 * `GET /api/atoms/{atom_id}` learner-safe projection (chora-creation, no
 * `/v1/` prefix). Wire shape verified live 2026-05-16 ~14:18: the BFF
 * wraps the projection in an `{ atom: ... }` envelope (NOT the flat
 * shape documented in `chora-contracts/openapi/creation-questions.yaml`
 * §1281). FE conforms to the deployed BFF shape per
 * [[feedback-arch-ground-in-deployed-reality]].
 *
 * The inner atom carries `mcq_payload.question_id` / `oe_payload.question_id`
 *: note the inner key is `oe_payload` (NOT `essay_payload` per OpenAPI).
 */
/**
 * Atom projection: full content envelope returned by GET /api/atoms/{id}.
 *
 * Per the 2026-05-17 smoke #3, the BE carries the full mcq/oe payload
 * (options, prompt/stem, model_answer, rubric) alongside question_id:
 * the FE model was previously trimmed to `{question_id}` only, which
 * forced the test-set picker preview to display just the id slug. Widen
 * the types so the picker's expandable detail view + the atom-player
 * preview can render the actual question content.
 */
export interface AtomProjection {
  readonly atom_id: string;
  readonly atom_type: string;
  readonly title?: string;
  readonly mcq_payload?: AtomProjectionMcqPayload | null;
  readonly oe_payload?: AtomProjectionOePayload | null;
  readonly essay_payload?: AtomProjectionOePayload | null;
  /**
   * Orphan-edition provenance (ADR-229 A1.1/A1.3, sibling lane CHO-2132):
   * the ORIGINAL atom id when this projection is a frozen "no longer shared"
   * orphan edition. Additive: absent until the orphan machinery deploys;
   * absence is normal, never an error. Bridges may camelise: coalesce both
   * variants (see atom-question-picker.model.ts#orphanedFrom).
   */
  readonly orphaned_from_atom_id?: string | null;
  readonly orphanedFromAtomId?: string | null;
}

export interface AtomProjectionMcqOption {
  readonly option_id: string;
  readonly label: string;
  readonly text?: string;
}

export interface AtomProjectionMcqPayload {
  readonly question_id: string;
  readonly prompt?: string;
  readonly options?: readonly AtomProjectionMcqOption[];
  /**
   * Author-generated illustrations (CHO-1638). The learner-safe atom
   * projection (`GET /api/atoms/{id}`) does NOT carry these: they live on
   * the AUTHOR projection (`GET /api/atoms/{id}/questions/{qid}` →
   * `question.mcq.{image_url,answer_image_url}`). Surfaced here so author
   * preview surfaces (test-set, picker) can render them when the getQuestion
   * fetch populates the cache. `image_url` = question illustration (safe
   * everywhere); `answer_image_url` = model-answer illustration (AUTHOR /
   * RESULT only: never leak to a learner pre-grade).
   */
  readonly image_url?: string | null;
  readonly answer_image_url?: string | null;
}

/**
 * Minimal slice of the AUTHOR question projection (`GET /api/atoms/{atom_id}/
 * questions/{question_id}`, operationId getQuestion): just the durable-signed
 * illustration URLs the preview surfaces need. The full author projection also
 * carries `is_correct` + answer text, which we deliberately do NOT model here.
 */
export interface AuthorQuestionImages {
  readonly image_url: string | null;
  readonly answer_image_url: string | null;
}

export interface GetQuestionResponse {
  readonly question?: {
    readonly mcq?: {
      readonly image_url?: string | null;
      readonly answer_image_url?: string | null;
    } | null;
  } | null;
}

export interface AtomProjectionOeRubricRow {
  readonly criterion_id: string;
  readonly title: string;
  readonly description?: string;
  readonly weight?: number;
}

export interface AtomProjectionOePayload {
  readonly question_id: string;
  readonly prompt?: string;
  readonly model_answer?: string;
  readonly rubric?: readonly AtomProjectionOeRubricRow[];
  readonly grader_tier?: 'T1' | 'T2';
}

export interface AtomProjectionResponse {
  readonly atom: AtomProjection;
  readonly session_error?: string;
}

export interface UpdateTestSetQuestionRequest {
  readonly points?: number;
  readonly display_order?: number;
  readonly required?: boolean;
}

// ─── UI-only state shapes ──────────────────────────────────────────────

/** Per-question point range per ADR-155 D5 / OpenAPI {minimum: 1, maximum: 100}. */
export const POINTS_MIN = 1;
export const POINTS_MAX = 100;
export const POINTS_DEFAULT = 10;

export type TestSetListLoadState =
  | { status: 'loading' }
  | { status: 'success'; sets: readonly TestSet[] }
  | { status: 'error'; error: string };

export type TestSetEditorLoadState =
  | { status: 'loading' }
  | { status: 'success'; testSet: TestSetWithQuestions }
  | { status: 'error'; error: string };

export type TestSetEditorAction =
  | { status: 'idle' }
  | { status: 'submitting' }
  | { status: 'success' }
  | { status: 'error'; error: string };
