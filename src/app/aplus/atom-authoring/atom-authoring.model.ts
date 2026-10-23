/**
 * Atom Authoring model: A+ Stage 3 wave 3 (Phyllis demo Step 3 + Step 4).
 *
 * Domain anchors (per `domain-content-creation`):
 *   - `LearningAtom`: the atom being authored (aggregate root)
 *   - `AtomRevision`: append-only revision per save (chora-creation owns)
 *   - 6-agent content gate: Validator → Classifier → Web Researcher →
 *     Q&A Generator → Evaluator → Reporter
 *
 * Generator + Gatekeeper state machine (Phyllis demo Step 4):
 *   DRAFT → GENERATING → PENDING → APPROVED
 *                             ↘ REFUSED (Gatekeeper) → user rewrites → re-runs
 *
 * Risk-tier per ADR-141 + `imda-governance-4-dimensions`: each agent's
 * YAML declares which guardrail tiers apply. Surface here shows the user
 * an `IMDA D3 Safety & Robustness` audit trail when refused.
 */

export type AtomAuthoringMode = 'new' | 'edit';

/**
 * ADR-229 author-consent audience for atom reuse, narrowest first. ONE
 * vocabulary across the platform (collections reuse it per ADR-233 D7).
 * The wire values are the `learning_atoms.reuse_visibility` enum verbatim.
 */
export type ReuseAudience = 'private' | 'friends' | 'tenant';
export const REUSE_AUDIENCES: readonly ReuseAudience[] = ['private', 'friends', 'tenant'];

/** Coerce a wire value onto the audience vocabulary; unknown ⇒ the D1 default. */
export function parseReuseAudience(v: string | undefined | null): ReuseAudience {
  return REUSE_AUDIENCES.includes(v as ReuseAudience) ? (v as ReuseAudience) : 'private';
}

export type AtomDraftState =
  | 'DRAFT'
  | 'GENERATING'
  | 'PENDING'
  | 'APPROVED'
  | 'REFUSED'
  | 'PUBLISHED';

/**
 * FE cognitive-level taxonomy: REVISED Bloom labels (2001 revision). Kept
 * as the FE-canonical type for picker UX + translations. The wire boundary
 * maps to BE's older Bloom enum (see `WireCognitiveLevel` below).
 */
export type CognitiveLevel =
  | 'remembering'
  | 'understanding'
  | 'applying'
  | 'analyzing'
  | 'evaluating'
  | 'creating';

/**
 * BE-canonical cognitive-level enum: OLDER Bloom (1956). Lowercase per
 * OpenAPI convention. Source-of-truth:
 * `chora-contracts/openapi/creation-admin.yaml#CognitiveLevel`.
 *
 * Per ADR-156 Decision #3 the field is optional during Phase 1 and becomes
 * mandatory after curriculum onboarding lands.
 */
export type WireCognitiveLevel =
  | 'knowledge'
  | 'comprehension'
  | 'application'
  | 'analysis'
  | 'synthesis'
  | 'evaluation';

/**
 * FE (revised Bloom) → BE (older Bloom) lookup. Mapping is by cognitive
 * intent, not by alphabetical / positional alignment:
 *   - remembering   ↔ knowledge       (recall facts)
 *   - understanding ↔ comprehension   (explain ideas)
 *   - applying      ↔ application     (use in new situations)
 *   - analyzing     ↔ analysis        (draw connections)
 *   - evaluating    ↔ evaluation      (justify a stand)
 *   - creating      ↔ synthesis       (produce original work)
 */
const FE_TO_WIRE: Readonly<Record<CognitiveLevel, WireCognitiveLevel>> = {
  remembering: 'knowledge',
  understanding: 'comprehension',
  applying: 'application',
  analyzing: 'analysis',
  evaluating: 'evaluation',
  creating: 'synthesis',
};

const WIRE_TO_FE: Readonly<Record<WireCognitiveLevel, CognitiveLevel>> = {
  knowledge: 'remembering',
  comprehension: 'understanding',
  application: 'applying',
  analysis: 'analyzing',
  evaluation: 'evaluating',
  synthesis: 'creating',
};

/** Map a FE revised-Bloom label to the BE older-Bloom wire enum. */
export function toWireCognitiveLevel(fe: CognitiveLevel): WireCognitiveLevel {
  return FE_TO_WIRE[fe];
}

/**
 * Map a BE older-Bloom wire enum back to a FE revised-Bloom label. Returns
 * null for unrecognised inputs (defensive: older atoms may have no value
 * persisted, or a future enum extension may be ahead of FE).
 */
export function fromWireCognitiveLevel(
  wire: string | null | undefined,
): CognitiveLevel | null {
  if (wire == null) return null;
  if (Object.prototype.hasOwnProperty.call(WIRE_TO_FE, wire)) {
    return WIRE_TO_FE[wire as WireCognitiveLevel];
  }
  return null;
}

/**
 * Difficulty bucket vocabulary the qgen agents consume: `{foundation,
 * intermediate, advanced}` per ADR-157. The authoring drawer exposes a 1-5
 * slider; this maps it to the 3-bucket string the AI-assist `metadata`
 * carries. Difficulty ships as a STRING (not the canonical 1-5 int) because
 * the BE async handler types `metadata` as `map<string,string>`: the interim
 * agreed in the ADR-157 addendum (2026-06-03) that re-enabled difficulty on
 * the live AI-assist path while the full `difficulty_v2` enum/persistence
 * migration remains future work.
 */
export type DifficultyBucket = 'foundation' | 'intermediate' | 'advanced';

/** Map the 1-5 authoring difficulty slider to the qgen 3-bucket vocabulary. */
export function toDifficultyBucket(level: 1 | 2 | 3 | 4 | 5): DifficultyBucket {
  if (level <= 2) return 'foundation';
  if (level === 3) return 'intermediate';
  return 'advanced';
}

export interface AtomTag {
  readonly id: string;
  readonly label: string;
}

export interface AtomPrerequisite {
  readonly id: string;
  readonly label: string;
}

export interface AtomLearningObjective {
  readonly id: string;
  readonly text: string;
}

/** A draft LearningAtom record (component-local state for the demo). */
export interface AtomDraft {
  readonly atomId: string | null;
  readonly title: string;
  readonly body: string;
  readonly courseCode: string;
  readonly topic: string;
  readonly cognitiveLevel: CognitiveLevel;
  readonly tags: readonly AtomTag[];
  readonly prerequisites: readonly AtomPrerequisite[];
  readonly objectives: readonly AtomLearningObjective[];
  readonly state: AtomDraftState;
}

/**
 * AI Assist drawer "Generate" parameters: wired against the async
 * `POST /api/atoms/ai-assist` contract per
 * `docs/m13/handoff-mcq-ai-assist-be-ready-2026-05-17.md` §2.
 * The BE accepts only `mcq | oe` for `question_type`; other content
 * sketches (explanation / outline / flashcard) from the legacy mock
 * are out-of-scope and were dropped 2026-05-17.
 *
 * Note: `metadata.cognitive_level` is the BE-canonical older-Bloom
 * wire enum (`knowledge | comprehension | ...`). The drawer maps from
 * its FE revised-Bloom signal via `toWireCognitiveLevel()` before
 * issuing the request.
 *
 * IMPORTANT: BE's `aiAssistAsyncRequest.Metadata` is `map[string]string`
 * (services/chora-creation/internal/adapter/http/ai_assist_async_handler.go:46),
 * so ALL metadata values are stringified on the wire: including
 * `difficulty` (BE rejects numbers with 400 `ai_assist_invalid_body`).
 * The component-side `buildAiAssistMetadata()` handles the coercion.
 * The handoff doc §2 example showing `difficulty: 1` (number) is a doc
 * drift: wire is `"1"` per BE struct shape verified 2026-05-17 ~07:43.
 */
export interface AiAssistRequest {
  readonly question_type: 'mcq' | 'oe';
  readonly prompt: string;
  readonly metadata?: Readonly<Record<string, string>>;
  readonly max_retries?: number;
  /**
   * W8 AUTHOR-OPT-IN: when true, the author asked the generator to also
   * produce a diagram/image for the QUESTION stem. Default false (omitted →
   * no question image). The BE (parallel work) honours the flag and, when
   * set, returns the image on `AiAssistCandidate.image_url`. Wire field
   * `image_for_stem` (bool): aligned with chora-contracts (parallel add).
   */
  readonly image_for_stem?: boolean;
  /**
   * W8 AUTHOR-OPT-IN: when true, the author asked the generator to also
   * produce an image for the MODEL ANSWER (the 2nd image slot). Default
   * false (omitted → no answer image). The BE returns it on
   * `AiAssistCandidate.answer_image_url`. Wire field `image_for_answer`
   * (bool): aligned with chora-contracts (parallel add).
   */
  readonly image_for_answer?: boolean;
}

/** AI-Assist job lifecycle states per BE wire (Step 4c FSM). */
export type AiAssistJobStatus =
  | 'QUEUED'
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'REFUSED'
  | 'FAILED';

/** Refusal reason enum per BE `ai_assist_async_handler.go`. */
export type AiAssistRefusalReason =
  | 'GUARDRAIL_PRE'
  | 'GUARDRAIL_POST'
  | 'VALIDATION';

/**
 * BE-emitted refusal block. The `user_facing_message` is non-leaky
 * (never includes detected PII or raw guardrail trace per
 * `ai_assist.proto §251`) and MUST be rendered verbatim.
 */
export interface AiAssistRefusal {
  readonly reason: AiAssistRefusalReason;
  readonly model_armor_verdict?: string;
  readonly user_facing_message: string;
}

/**
 * Pipeline trace step: IMDA D2 Transparency. BE emits 7 named steps
 * per `qgen_crew`: validate_input → guardrail_pre → generate →
 * guardrail_post → critique → quality_gate → publish_completed.
 * The widget maps these into the 3 IMDA D2 group cards.
 */
export interface PipelineTraceStep {
  readonly name: string;
  readonly status: string;
  readonly started_at?: string;
  readonly completed_at?: string;
  readonly attempt?: number;
  readonly input_tokens?: number;
  readonly output_tokens?: number;
  readonly notes?: string;
  /**
   * Vertex AI Reasoning Engine resource path (when the step invoked an
   * engine). Defined in the BE contract at qgen_crew.py:_append_trace()
   * (services/chora-ai-kernel-orchestrator) but as of 2026-05-17 no node
   * actually passes it: every LLM-calling node defaults to "". When BE
   * starts populating it, FE prefers it over the step-name fallback in
   * `agent-trace.service.ts::resolveStepModelId()`.
   */
  readonly engine_resource?: string;
}

/**
 * Generated candidate: top-level on the GET envelope per the Go source
 * at `services/chora-creation/internal/adapter/http/ai_assist_async_handler.go:295-297`
 * (passes `result_payload` raw through to `out.Candidate`). The qgen_crew
 * terminal writer emits a McqPayload / OePayload shape *directly*: there
 * is NO `mcq_payload` / `oe_payload` wrapper at this level. Verified
 * against live smoke `a7a5bef1-7d23-4342-a1c7-645622cde157` 2026-05-17
 * where `result_payload.options[]` sat flat on the candidate.
 *
 * Discriminated by `question_type`. Narrowing on it gives MCQ vs OE.
 */
export type AiAssistCandidate = AiAssistMcqCandidate | AiAssistOeCandidate;

interface AiAssistCandidateBase {
  readonly stem: string;
  readonly intent?: string;
  readonly critic_notes?: string;
  /**
   * Optional URL of a generated diagram/scene image for this candidate's
   * QUESTION stem. Absent when no image was generated (the normal case
   * today). Wire-aligned with `AiAssistCandidate.image_url`
   * (creation-questions.yaml §1404, W8 image-gen). Bytes live in GCS/CDN;
   * only the URL rides on the candidate.
   */
  readonly image_url?: string;
  /**
   * Optional URL of a generated image for this candidate's MODEL ANSWER:
   * the 2nd image slot (W8 AUTHOR-OPT-IN). Populated by the BE only when
   * the generate request set `image_for_answer: true`. Absent otherwise
   * (the normal case today → the model-answer image render stays dormant).
   * Wire-aligned with `AiAssistCandidate.answer_image_url` (chora-contracts
   * parallel add). `image_url` stays the question/stem image; this is the
   * answer-side companion.
   */
  readonly answer_image_url?: string;
}

export interface AiAssistMcqCandidate
  extends AiAssistCandidateBase,
    McqPayload {
  readonly question_type: 'mcq';
}

export interface AiAssistOeCandidate extends AiAssistCandidateBase {
  readonly question_type: 'oe';
  /**
   * OE answer data is NESTED under `oe_payload` on the wire: matching the
   * canonical OpenAPI `AiAssistCandidate.oe_payload` (`creation-questions.yaml`
   * §1543) and the live qgen `outputNewOE` candidate shape (confirmed against
   * the deployed AI-Assist envelope 2026-06-03: `candidate.oe_payload.{model_answer,
   * rubric, grader_tier, min/max_response_chars}`). This is ASYMMETRIC with
   * `AiAssistMcqCandidate`, whose `options` ride FLAT (qgen `outputNewMCQ` emits
   * them flat: a deployed-reality drift from the OpenAPI's nested `mcq_payload`).
   * The prior `extends OePayload` (flat) shape never matched the OE wire; the
   * mismatch was latent because the OE AI-Assist tab was hidden until 2026-06-03.
   */
  readonly oe_payload: OePayload;
}

/**
 * AI-Assist job envelope: returned from POST 202 + GET poll. Mirrors
 * the BE `aiAssistJobEnvelope` in
 * `services/chora-creation/internal/adapter/http/ai_assist_async_handler.go`.
 *
 * IMPORTANT: `candidate` and `pipeline_trace` are TOP-LEVEL on the
 * envelope (not nested under `result_payload`). The handoff doc
 * `docs/m13/handoff-mcq-ai-assist-be-ready-2026-05-17.md §2` shows
 * `result_payload.candidate.mcq_payload.options[]` but the Go source
 * declares them flat: the source is authoritative.
 */
export interface AiAssistJob {
  readonly job_id: string;
  readonly tenant_id?: string;
  readonly author_gcid?: string;
  readonly status: AiAssistJobStatus;
  readonly question_type: 'mcq' | 'oe';
  readonly candidate?: AiAssistCandidate;
  readonly pipeline_trace?: readonly PipelineTraceStep[];
  readonly attempt_count: number;
  readonly quality_warning: boolean;
  readonly refusal?: AiAssistRefusal;
  readonly mana_charged?: number;
  readonly created_at: string;
  readonly updated_at: string;
  readonly completed_at?: string;
}

/**
 * Drawer-side lifecycle wrapper. `timeout` surfaces when the 90s poll
 * window expires before the job reaches a terminal status; `error`
 * wraps transport errors (5xx from the BFF, etc.).
 */
export type AiAssistJobState =
  | { readonly status: 'idle' }
  | { readonly status: 'submitting' }
  | { readonly status: 'polling'; readonly job: AiAssistJob }
  | { readonly status: 'completed'; readonly job: AiAssistJob }
  | { readonly status: 'refused'; readonly job: AiAssistJob }
  | { readonly status: 'failed'; readonly job: AiAssistJob }
  | { readonly status: 'timeout' }
  | { readonly status: 'error'; readonly error: string };

/** Drawer + modal visibility flags surfaced to the template. */
export interface AuthoringUiFlags {
  readonly aiAssistOpen: boolean;
  readonly gatekeeperOpen: boolean;
}

export const COGNITIVE_LEVELS: readonly CognitiveLevel[] = [
  'remembering',
  'understanding',
  'applying',
  'analyzing',
  'evaluating',
  'creating',
];

/**
 * Discriminated state for the initial draft load. F2 paydown 2026-05-13
 *: removes the indefinite "Loading the authoring canvas…" hang when
 * the BFF returns 5xx. Renders a fail-loud banner with a retry CTA.
 */
export type AtomDraftLoadState =
  | { readonly status: 'loading' }
  | { readonly status: 'success'; readonly data: AtomDraft }
  | { readonly status: 'error'; readonly error: string };

// ═════════════════════════════════════════════════════════════════════
// Phase C additions (CR Question Authoring): wired against BE-locked
// `chora-contracts/openapi/creation-questions.yaml` + design doc
// `docs/m14/cr-question-authoring-design-2026-05-15.md`.
//
// Existing types above kept intact during the transition. Phase H
// rewires the component to use the new shapes + drops `runAiAssist`.
// ═════════════════════════════════════════════════════════════════════

/**
 * 16-enum question_type: BE-canonical discriminator per
 * `chora-contracts/openapi/creation-questions.yaml#QuestionType` (lines
 * 637-659). Alphabetical order on `reserved_*` is part of the contract.
 * Distinct from the 5-enum `atom_type`. 2 enabled (`mcq`, `oe`) + 14
 * `reserved_*` sentinels that render as "Coming soon" tiles.
 */
export type QuestionType =
  | 'mcq'
  | 'oe'
  | 'reserved_code_execution'
  | 'reserved_completion'
  | 'reserved_drag_drop'
  | 'reserved_fill_blank'
  | 'reserved_matching'
  | 'reserved_multi_select'
  | 'reserved_multimedia'
  | 'reserved_oral'
  | 'reserved_ordering'
  | 'reserved_peer_graded'
  | 'reserved_short_answer'
  | 'reserved_simulation'
  | 'reserved_table_completion'
  | 'reserved_true_false';

/**
 * Server-driven registry entry per `creation-questions.yaml#QuestionTypeOption`
 * (lines 661-674). Sourced from `GET /api/atoms/question-types`. Wire
 * fields are snake_case + the discriminator field is `code` (NOT `type`,
 * which would shadow the question wire field). `enabled=false` tiles
 * render greyed-out with "Coming soon".
 *
 * `scope: 'phyllis'` = enabled-in-v1 demo scope. `scope: 'reserved'` =
 * future placeholder. The FE picker treats `enabled` as the activation
 * gate; `scope` is metadata for analytics + future filtering.
 */
export interface QuestionTypeOption {
  readonly code: QuestionType;
  readonly label_en: string;
  readonly label_zh?: string | null;
  readonly enabled: boolean;
  readonly scope: 'phyllis' | 'reserved';
}

/** @deprecated: kept for one release as alias to ease cross-session refactors. Use `QuestionTypeOption`. */
export type QuestionTypeRegistryEntry = QuestionTypeOption;

/** Single MCQ option per BE wire shape (snake_case mirrors). */
export interface McqOption {
  readonly option_id: string;
  readonly label: string;
  readonly is_correct: boolean;
  /** Per-option explainer: MANDATORY per BE design + Phase E locked decision (publish blocks if empty). */
  readonly explainer: string;
}

export interface McqScoring {
  readonly mode: 'single_correct' | 'multi_correct' | 'partial_credit';
  readonly partial_credit_policy?: 'none' | 'proportional';
}

/** MCQ payload: wire-aligned with BE `mcq_payload`. */
export interface McqPayload {
  readonly options: readonly McqOption[];
  readonly scoring?: McqScoring;
}

/**
 * Rubric criterion for OE grading.
 * Per BE OpenAPI (`creation-questions.yaml` §1004): field is `title`,
 * not `label`. Renamed 2026-05-16 to fix FE-BUG-OE-CONTRACT-DRIFT.
 */
export interface OeRubricCriterion {
  readonly criterion_id: string;
  readonly title: string;
  readonly weight: number;
  readonly description?: string;
}

/**
 * OE payload: wire-aligned with BE `oe_payload`
 * (`creation-questions.yaml` §981). 2026-05-16 fixes:
 * - Field name `rubric_criteria` → `rubric`.
 * - `grader_tier` enum tightened to `T1 | T2` (was `rubric | llm_assisted
 *   | manual`: BE rejects those values).
 */
export interface OePayload {
  readonly model_answer: string;
  readonly rubric?: readonly OeRubricCriterion[];
  readonly min_response_chars?: number | null;
  readonly max_response_chars?: number | null;
  readonly grader_tier?: 'T1' | 'T2' | null;
}

/** Question entity: admin AUTHOR projection from `GET /atoms/{id}/questions/{q_id}`. */
export interface Question {
  readonly question_id: string;
  readonly atom_id: string;
  readonly tenant_id: string;
  readonly type: QuestionType;
  readonly prompt: string;
  readonly revision: number;
  readonly latest_revision_id: string;
  readonly created_at: string;
  readonly updated_at: string;
  readonly mcq_payload?: McqPayload;
  readonly oe_payload?: OePayload;
}

/** Per-question revision (append-only per DDD #4). */
export interface QuestionRevision {
  readonly revision_id: string;
  readonly revision_number: number;
  readonly created_at: string;
  readonly payload: Record<string, unknown>;
}

/** Parent atom-revision summary returned alongside a save. */
export interface AtomRevisionSummary {
  readonly revision_id: string;
  readonly revision_number: number;
}

/** POST/PATCH 200/201 envelope: `{question, atom_revision}`. */
export interface QuestionSaveEnvelope {
  readonly question: Question;
  readonly atom_revision: AtomRevisionSummary;
}

/**
 * `AtomContent`: FE in-memory discriminated union for the editable
 * question-content form. The `kind` tag is the FE's editorial source
 * mode flag (manual / ai_draft / batch_accepted): analytics + UX hint
 * only, NOT a BE concept. The `type` field is the BE-canonical
 * discriminator and is serialised on the wire. `kind` is stripped
 * before POSTing/PATCHing (see `toCreateRequest` / `toEditRequest`).
 */
export type AtomContent = McqContent | OpenEndedContent;

export interface McqContent {
  readonly kind: 'manual' | 'ai_draft' | 'batch_accepted';
  readonly type: 'mcq';
  readonly prompt: string;
  readonly mcq_payload: McqPayload;
  /**
   * Optional generated diagram/scene image URL surfaced beside the stem in
   * the editor. Carried through from `AiAssistCandidate.image_url` (W8
   * image-gen). FE display-only: NOT wire-serialised by `toCreateRequest` /
   * `toEditRequest`. Absent on manual authoring (the normal case today).
   */
  readonly image_url?: string;
  /**
   * Optional generated MODEL-ANSWER image URL (W8 AUTHOR-OPT-IN, 2nd slot).
   * Surfaced in the MCQ correct-answer explainer area. Carried through from
   * `AiAssistCandidate.answer_image_url`. FE display-only: NOT
   * wire-serialised by `toCreateRequest` / `toEditRequest`. Absent unless
   * the author opted in (`image_for_answer`) AND the BE returned one.
   */
  readonly answer_image_url?: string;
}

export interface OpenEndedContent {
  readonly kind: 'manual' | 'ai_draft' | 'batch_accepted';
  readonly type: 'oe';
  readonly prompt: string;
  readonly oe_payload: OePayload;
  /**
   * Optional generated diagram/scene image URL surfaced beside the stem in
   * the editor. Carried through from `AiAssistCandidate.image_url` (W8
   * image-gen). FE display-only: NOT wire-serialised by `toCreateRequest` /
   * `toEditRequest`. Absent on manual authoring (the normal case today).
   */
  readonly image_url?: string;
  /**
   * Optional generated MODEL-ANSWER image URL (W8 AUTHOR-OPT-IN, 2nd slot).
   * Surfaced in a second render slot AFTER the model-answer textarea:
   * resolves the prior TODO that anticipated this distinct answer-image.
   * Carried through from `AiAssistCandidate.answer_image_url`. FE
   * display-only: NOT wire-serialised by `toCreateRequest` /
   * `toEditRequest`. Absent unless the author opted in (`image_for_answer`)
   * AND the BE returned one (the normal case today → render stays dormant).
   */
  readonly answer_image_url?: string;
}

/** Wire body for POST /api/atoms/{atom_id}/questions (manual or AI-commit). */
export interface CreateQuestionRequest {
  readonly type: 'mcq' | 'oe';
  readonly prompt: string;
  readonly mcq_payload?: McqPayload;
  readonly oe_payload?: OePayload;
  /**
   * W8 image-gen persistence: optional GCS/CDN URL of the generated
   * QUESTION/STEM image. Carried through from `AiAssistCandidate.image_url`
   * via the editable `McqContent`/`OpenEndedContent` so it survives the SAVE
   * path into the persisted question payload JSONB (chora-creation
   * mcq_payload/oe_payload) and surfaces to the learner verbatim. Omitted
   * on the manual no-image path (byte-stable). Wire name `image_url`:
   * IDENTICAL across FE / BE DTO / BE payload / OpenAPI.
   */
  readonly image_url?: string;
  /**
   * W8 image-gen persistence: optional GCS/CDN URL of the generated
   * MODEL-ANSWER image (2nd slot). Carried through from
   * `AiAssistCandidate.answer_image_url`. Omitted when absent (byte-stable).
   * Wire name `answer_image_url`: IDENTICAL across all layers.
   */
  readonly answer_image_url?: string;
}

/**
 * Wire body for PATCH /api/atoms/{atom_id}/questions/{q_id} (partial edit).
 * Only fields present are updated. `type` is immutable post-create.
 */
export interface EditQuestionRequest {
  readonly prompt?: string;
  readonly mcq_payload?: Partial<McqPayload>;
  readonly oe_payload?: Partial<OePayload>;
  /**
   * W8 image-gen persistence: optional QUESTION/STEM image URL. Same wire
   * field + persistence semantics as `CreateQuestionRequest.image_url`.
   * Omitted when absent (byte-stable no-image path).
   */
  readonly image_url?: string;
  /**
   * W8 image-gen persistence: optional MODEL-ANSWER image URL (2nd slot).
   * Same wire field + persistence semantics as
   * `CreateQuestionRequest.answer_image_url`. Omitted when absent.
   */
  readonly answer_image_url?: string;
}

// ─── AI generation job (uniform D4 lifecycle: all AI paths async) ────

export type QuestionGenerationJobStatus =
  // Canonical backend lifecycle (services/chora-creation domain/question/job.go):
  // requested → running → succeeded → accepted | partially_accepted | cancelled;
  // running → failed.
  | 'requested'
  | 'running'
  | 'succeeded'
  | 'partially_accepted'
  | 'cancelled'
  // Legacy/aspirational aliases still referenced by the single-atom path.
  | 'pending'
  | 'parsing'
  | 'generating'
  | 'ready_for_review'
  | 'accepted'
  | 'rejected'
  | 'failed';

export type QuestionGenerationJobType =
  | 'ai_model_answer'
  | 'ai_draft'
  | 'batch_source_material'
  // CHO-1819 P3: a lightweight job that re-renders ONE image (stem|answer) for
  // a single candidate of a parent batch job, without re-running the batch.
  | 'image_regen'
  // CHO-1826 U4: a manual authoring session: created already `succeeded`
  // (no LLM, no mana, no generation_requested event). Questions are committed
  // via the accept route with INLINE manual candidates (no draft_id).
  | 'manual_draft';

/**
 * Lane 1c (CHO-1703 / ADR-180, D9): one source citation on a generated
 * candidate. Sidebar chip semantics (creation-questions.yaml v1.5.0
 * `QuestionCitation`):
 *   verified === true       → "✓ verified"   (excerpt matched the chunk store)
 *   verified === false      → "⚠ unverified" (hallucination suspect: surfaced,
 *                                             NEVER silently dropped)
 *   verified == null/absent → "AI-reported"  (image sources have no text layer
 *                                             in v1: no verification ran)
 */
export interface QuestionCitation {
  /** The cited file: gs:// blob_uri or display filename of an uploaded source. */
  readonly source_file: string;
  /** 1-based page in the cited file (null for unpaged MD/TXT/images). */
  readonly page?: number | null;
  /** Short verbatim excerpt the crew cites as grounding. */
  readonly excerpt: string;
  /** UUIDv7 of the matched source_material_chunks row (verification pass). */
  readonly chunk_id?: string | null;
  readonly verified?: boolean | null;
}

/**
 * Lane 1c (D4/D5): the composer's LLM-proposed test-set structure for a
 * batch job: title/description mirrored from the source material, question
 * ORDER (draft_ids, first = position 1) and per-question POINTS extracted
 * from marks cues ("[5 marks]"), uniform default 10 when absent. Seeds the
 * review composer; the author's CURATED result goes back on the accept
 * request `test_set` block.
 */
export interface ProposedTestSet {
  readonly title: string;
  readonly description?: string;
  readonly order?: readonly string[];
  readonly points?: Readonly<Record<string, number>>;
}

/**
 * AI-produced candidate. The live backend `candidate_questions` jsonb shape
 * (services/chora-creation question_jobs_handler.go `candidateDraft`) carries
 * `mcq_payload`/`oe_payload` (NOT a generic `payload`). `payload`/`status`
 * remain optional for the single-atom path's older projection.
 */
export interface QuestionDraftCandidate {
  readonly draft_id: string;
  readonly type: QuestionType;
  readonly prompt: string;
  readonly mcq_payload?: McqPayload;
  readonly oe_payload?: OePayload;
  readonly qgen_score?: number;
  readonly model_used?: string;
  readonly payload?: Record<string, unknown>;
  readonly status?: 'ready_for_review' | 'accepted' | 'rejected';
  /**
   * Lane 1c (D9/D15): verification-stamped source citations: present on
   * grounded batch candidates AFTER chora-creation's completed-event
   * subscriber matched excerpts against source_material_chunks. Absent /
   * empty for ungrounded jobs + candidates predating 1c.
   */
  readonly citations?: readonly QuestionCitation[];
  /**
   * Qualitative critique from the qgen critic (single-mode parity). Present
   * when the candidate cleared with residual concerns. Display-only.
   */
  readonly critic_notes?: string;
  /** Retries-exhausted flag (single-mode parity): renders the quality warning. */
  readonly quality_warning?: boolean;
  /** W8 image-gen: optional QUESTION/STEM illustration URL (when present). */
  readonly image_url?: string;
  /** W8 image-gen: optional MODEL-ANSWER illustration URL (when present). */
  readonly answer_image_url?: string;
}

/** Uniform job envelope per BE design D4 (all AI calls async). */
export interface QuestionGenerationJob {
  readonly job_id: string;
  readonly atom_id: string;
  readonly job_type: QuestionGenerationJobType;
  readonly status: QuestionGenerationJobStatus;
  readonly created_at: string;
  readonly updated_at: string;
  readonly mana_charged?: number;
  readonly estimated_mana_cost?: number;
  /**
   * Live backend candidate field (jobResponse `candidate_questions`). The
   * older `drafts` alias is retained for the single-atom projection.
   */
  readonly candidate_questions?: readonly QuestionDraftCandidate[];
  readonly drafts?: readonly QuestionDraftCandidate[];
  readonly started_at?: string;
  readonly completed_at?: string;
  /** Server-suggested next poll delay (ms): overrides client default backoff. */
  readonly poll_after_ms?: number;
  /** Set when status=failed: backend `error`; `failure_reason` is the alias. */
  readonly error?: string;
  readonly failure_reason?: string;
  /**
   * Lane 1c (D4): composer's LLM-proposed test-set structure for batch jobs.
   * Null/absent for single-question jobs, ungrounded batches predating 1c,
   * or when the composer step was skipped. Seeds the review composer.
   */
  readonly proposed_test_set?: ProposedTestSet | null;
  /**
   * CHO-1819 P4: honest mixed-type / strict-shortfall accounting on a completed
   * batch job (projected from proto `GenerationSummary` f16). Drives the
   * review-stage shortfall banner + per-type counts. Absent for single-type /
   * legacy jobs.
   */
  readonly generation_summary?: GenerationSummary | null;
  /**
   * CHO-1826 Gap #4: per-step QGen pipeline trace (incl. the image-gen
   * render_image node) for the IMDA D2 transparency card: the SAME shape the
   * single-mode AI-Assist drawer renders. Projected from the ai_assist
   * completed.v1 field 12 on a completed AI job; absent for manual / refused /
   * failed jobs.
   */
  readonly pipeline_trace?: readonly PipelineTraceStep[];
}

/** Body for POST .../questions/{q_id}/ai-model-answer-jobs (path 2). */
export interface GenerateModelAnswerRequest {
  readonly question_id: string;
  readonly regenerate?: boolean;
}

/** Body for POST .../question-jobs path-3 single-question ai-draft (10 mana). */
export interface GenerateAiDraftRequest {
  readonly job_type: 'ai_draft';
  readonly question_type: QuestionType;
  readonly prompt: string;
  readonly difficulty: 1 | 2 | 3 | 4 | 5;
  /**
   * CHO-1826 U4.2: optional candidate count (1..5) for the unified no-files AI
   * path; the backend ai_draft handler accepts it. Omitted ⇒ backend default 1.
   */
  readonly count?: number;
  /**
   * CHO-1826 Gap #4: author forced-image opt-in for the no-files path. When
   * true the backend forwards it on ai_assist.started.v1 (proto fields 13/14)
   * so the single qgen runner's render_image node fires and the canvas trace
   * widget surfaces the Illustration card. Omitted ⇒ no image (byte-stable).
   */
  readonly image_for_stem?: boolean;
  readonly image_for_answer?: boolean;
  /**
   * CHO-1657: author hint map (str->str): `subject` / `cognitive_level`
   * (older-Bloom wire enum) / `difficulty` (3-bucket). The backend lifts it onto
   * ai_assist.started.v1 (proto field 12 metadata) so the qgen crew is conditioned
   * on the author's selections AND O+ Decision Traces surface them as ADR-197
   * prompt_conditions. Same `metadata` shape the single-mode drawer (AiAssistRequest)
   * sends; the unify (CHO-1826) dropped it, silently neutering Cognitive Level.
   */
  readonly metadata?: Readonly<Record<string, string>>;
}

/**
 * CHO-1819 P3: which illustration slot a regenerate targets: `stem` is the
 * question/stem image (`image_url`), `answer` the model-answer image
 * (`answer_image_url`). Identical wire vocabulary across FE / BE / proto.
 */
export type ImagePlacement = 'stem' | 'answer';

/**
 * Body for POST .../question-jobs/{parent_job_id}/regenerate-image (CHO-1819 P3
 * review image regenerate). Re-renders ONE image for a single candidate of the
 * parent batch job with a refined prompt, WITHOUT re-running the batch. `mode`
 * is an optional render-style hint passed through to the crew.
 */
export interface RegenerateImageRequest {
  readonly draft_id: string;
  readonly placement: ImagePlacement;
  readonly prompt: string;
  readonly mode?: string;
}

/**
 * CHO-1819 P4: one mixed-type quota row. The author composes a batch as a list
 * of these (e.g. 8 MCQ + 2 OE). `max_images` is the per-type cap on how many of
 * that type's questions the AI MAY illustrate (AI picks which + stem|answer);
 * `0 <= max_images <= count`. Backend validates via aiassist.NewTypePlan (the
 * domain VO owns every invariant), maps to proto `GenerationTypeQuota` (f21).
 */
export interface QuestionTypeQuota {
  readonly question_type: QuestionType;
  readonly count: number;
  readonly max_images: number;
  /**
   * CHO-1825: deterministic per-type image toggles. When true, EVERY question
   * of this type MUST carry that image (forced, independent of `max_images`).
   * Sent on `settings.type_plan[i]` only when set (proto3-omit-false parity).
   */
  readonly image_for_stem?: boolean;
  readonly image_for_answer?: boolean;
}

/**
 * CHO-1819 P4: the honest generation accounting surfaced on a completed batch
 * job (proto `GenerationSummary` f16 → projected onto the job record). Drives
 * the review-stage shortfall banner: a non-empty `shortfall_reason` (only legal
 * under strict grounding) means the source genuinely couldn't support the full
 * requested count: we generated as many distinct grounded questions as it did.
 */
export interface GenerationSummary {
  readonly requested_total: number;
  readonly generated_total: number;
  /** FLAT map question_type → generated count (matches the typed proto). */
  readonly generated_per_type: Readonly<Record<string, number>>;
  readonly shortfall_reason?: string;
}

/** Body for POST .../question-jobs path-4 batch (multipart; 50 + 5×accepted). */
export interface GenerateBatchRequest {
  readonly job_type: 'batch_source_material';
  /**
   * LEGACY single source file → multipart part name `file`. Kept for
   * back-compat (pre-1c callers + specs). New callers SHOULD use `files`.
   * Exactly one of `file` / `files` must be present.
   */
  readonly file?: File;
  /**
   * Lane 1c (CHO-1703 / ADR-180 D7): 1..5 source-material files → repeated
   * multipart part name `files`. Allowed: PDF/DOCX/MD/TXT + PNG/JPEG/WebP.
   * ≤32MB total request (incl. rubric_file).
   */
  readonly files?: readonly File[];
  /**
   * Lane 1c (D6): OPTIONAL dedicated rubric / mark-scheme file → multipart
   * part name `rubric_file` (≤1, same MIME allowlist). The crew aligns
   * per-OE-question rubric criteria AND the points distribution to it.
   */
  readonly rubric_file?: File | null;
  /**
   * Single question type for the legacy path. Backend reads
   * `settings.question_type`. When `type_plan` is supplied (CHO-1819 mixed-type),
   * the service sends `question_type:"mixed"` and this field is ignored.
   */
  readonly question_type: QuestionType;
  readonly question_count: number;
  /**
   * CHO-1819 P4: mixed-type breakdown. Non-empty ⇒ the single-pass set lane:
   * `settings.question_type` becomes "mixed", `settings.count` == sum(quota.count),
   * and `settings.type_plan` carries the per-type quotas. Empty/absent ⇒ the
   * legacy single-type path (question_type + question_count), byte-for-byte
   * unchanged.
   */
  readonly type_plan?: readonly QuestionTypeQuota[];
  readonly difficulty: 1 | 2 | 3 | 4 | 5;
  /**
   * EPIC-1a grounding mode. `strict` = generate ONLY from the uploaded source
   * material; `starting_point` = use it as a seed (default). The file is always
   * present on this path.
   */
  readonly grounding_mode: 'strict' | 'starting_point';
  /**
   * The author's free-text title/context body: an LLM hint the crew uses to
   * frame generation alongside the uploaded material. Maps to `settings.context`.
   */
  readonly context?: string;
  /**
   * CHO-1657: author hint map (str->str): `subject` / `cognitive_level` /
   * `difficulty` (bucket). Preserved through the batch settings passthrough onto
   * ai_assist.started.v1 (proto field 12) so the crew is conditioned on it AND
   * O+ surfaces it as ADR-197 prompt_conditions. Same shape as the ai_draft path.
   */
  readonly metadata?: Readonly<Record<string, string>>;
}

export type GenerateQuestionJobRequest =
  | GenerateAiDraftRequest
  | GenerateBatchRequest;

/**
 * Per-candidate override block on the accept body. Each candidate is
 * independently editable BEFORE persisting (editability invariant per
 * BE contract `bd34b47c`). Absent override fields → AI body persisted
 * as-is. Empty `accepted_candidates` accepts NONE (job transitions to
 * `accepted` with 0 persisted).
 */
export interface AtomMetaOverride {
  readonly title?: string | null;
  readonly tags?: readonly string[] | null;
  readonly difficulty?: number | null;
}

export interface AcceptedCandidate {
  /**
   * AI draft reference: the candidate's draft_id from the job's
   * candidate_questions. ABSENT for an INLINE manually-authored candidate
   * (CHO-1826 U4): the manual body rides `type` + `prompt_override` +
   * `*_payload_override` below, and the backend mints it as its own atom
   * (source_type=manual, FREE). When present (and `type` absent) this is an
   * AI-draft commit and the stored draft type wins.
   */
  readonly draft_id?: string;
  /**
   * REQUIRED for an INLINE manual candidate (no draft_id): 'mcq' | 'oe'
   * (CHO-1826 U4). Ignored for draft-backed candidates. Mirrors the backend
   * `acceptCandidate.Type` field; lets one accept interleave AI drafts +
   * inline manual questions (each becomes its own atom, in submission order).
   */
  readonly type?: 'mcq' | 'oe';
  readonly prompt_override?: string | null;
  readonly mcq_payload_override?: McqPayload | null;
  readonly oe_payload_override?: OePayload | null;
  /**
   * W8 image-gen: optional generated QUESTION/STEM + MODEL-ANSWER image URLs
   * carried into the accept override so they survive the AI-commit path (the
   * override replaces the draft payload server-side). Wire names IDENTICAL
   * across all layers. Omitted when absent (byte-stable).
   */
  readonly image_url?: string;
  readonly answer_image_url?: string;
  /**
   * Per-atom metadata overrides for batch jobs (1 atom per candidate
   * per D2). Ignored for ai_model_answer / ai_draft (single-question;
   * parent atom already exists).
   */
  readonly atom_meta_override?: AtomMetaOverride | null;
}

/**
 * Lane 1c (D1/D5): per-accepted-candidate test-set placement on the accept
 * request, keyed by draft_id (each MUST reference an accepted candidate).
 * Points are test-set-scoped (never on the atom); display_order is the
 * final 1-based curated position (drag order).
 */
export interface AcceptTestSetItem {
  readonly draft_id: string;
  readonly points?: number;
  readonly display_order?: number;
}

/**
 * Lane 1c (D1): author-curated test-set composition from the batch review
 * step. ABSENT ⇒ today's accept path bit-identical (toggle OFF: atoms
 * only). PRESENT ⇒ chora-creation outbox-publishes
 * `chora.creation.question_batch.accepted.v1` and chora-delivery assembles
 * ONE DRAFT test set (idempotent on `test_sets.source_job_id`); the FE then
 * polls `GET /api/v1/test-sets?source_job_id=`.
 */
export interface AcceptTestSetBlock {
  readonly title: string;
  readonly description?: string;
  readonly items?: readonly AcceptTestSetItem[];
}

/** Body for POST .../question-jobs/{job_id}/accept (per bd34b47c). */
export interface AcceptGenerationJobRequest {
  readonly accepted_candidates: readonly AcceptedCandidate[];
  /**
   * Lane 1c (D1): OPTIONAL curated test-set block. The key MUST be wholly
   * absent when the "Create test set" toggle is OFF: the toggle-OFF accept
   * request is byte-identical to the pre-1c shape.
   */
  readonly test_set?: AcceptTestSetBlock;
}

/**
 * Response envelope for the accept route. The live backend (acceptResponse)
 * returns `persisted` + `mana_debited`; `questions`/`mana_charged` are the
 * older aliases the single-atom path reads.
 */
export interface AcceptGenerationJobResponse {
  readonly persisted?: readonly Question[];
  readonly mana_debited?: number;
  readonly questions?: readonly Question[];
  readonly mana_charged?: number;
}

// ─── AsyncState unions (fail-loud per chora-web CLAUDE.md §3) ──────────

export type QuestionTypesLoadState =
  | { readonly status: 'loading' }
  | {
      readonly status: 'success';
      readonly items: readonly QuestionTypeOption[];
    }
  | { readonly status: 'error'; readonly error: string };

/** Response shape from `GET /api/atoms/{atom_id}` with question projection. */
export interface AtomWithProjection {
  readonly atom: AtomDraft;
  readonly question: Question | null;
}

export type AtomWithProjectionLoadState =
  | { readonly status: 'loading' }
  | { readonly status: 'success'; readonly projection: AtomWithProjection }
  | { readonly status: 'error'; readonly error: string };

export type QuestionSaveState =
  | { readonly status: 'idle' }
  | { readonly status: 'submitting' }
  | { readonly status: 'success'; readonly envelope: QuestionSaveEnvelope }
  | { readonly status: 'error'; readonly error: string };

export type GenerationJobState =
  | { readonly status: 'idle' }
  | { readonly status: 'submitting' }
  | { readonly status: 'submitted'; readonly job: QuestionGenerationJob }
  | { readonly status: 'polling'; readonly job: QuestionGenerationJob }
  | { readonly status: 'ready'; readonly job: QuestionGenerationJob }
  | {
      readonly status: 'accepted';
      readonly job: QuestionGenerationJob;
      readonly questions: readonly Question[];
    }
  | {
      readonly status: 'error';
      readonly error: string;
      readonly job?: QuestionGenerationJob;
    };

// ─── Wire serializers: strip FE-only `kind` tag before POST/PATCH ────

/**
 * Build the OE payload wire body.
 *
 * Rubric history: the 2026-05-17 smoke (run #2) initially failed
 * because the chora-creation Go decoder declared `rubric` as an
 * object, but the OpenAPI schema declared it as an array of
 * `RubricCriterion`. The workaround in c52d9e79 stripped `rubric`
 * when length 0 to unblock the common authoring path.
 *
 * BE ack landed in commit `11d5544e` (image pin `:44a097a`,
 * smoke-verified live 2026-05-17 ~04:47): the Go handler now
 * decodes `rubric` as a flat array per OpenAPI. The empty-rubric
 * strip is therefore dropped; `rubric: []` round-trips as-is.
 *
 * The null-omission paths for `min_response_chars` /
 * `max_response_chars` / `grader_tier` are KEPT until BE confirms
 * those nullable fields are independently accepted (separate ask).
 */
function buildOeWireBody(payload: OePayload): OePayload {
  const out: { -readonly [K in keyof OePayload]: OePayload[K] } = {
    model_answer: payload.model_answer,
  };
  if (payload.rubric !== undefined) {
    out.rubric = payload.rubric;
  }
  if (payload.min_response_chars != null) {
    out.min_response_chars = payload.min_response_chars;
  }
  if (payload.max_response_chars != null) {
    out.max_response_chars = payload.max_response_chars;
  }
  if (payload.grader_tier != null) {
    out.grader_tier = payload.grader_tier;
  }
  return out as OePayload;
}

/**
 * W8 image-gen persistence: build the optional image-URL fragment spread
 * onto the create/edit request. Both `image_url` (question/stem) and
 * `answer_image_url` (model-answer) are read off the editable `AtomContent`
 * (McqContent / OpenEndedContent carry them as display fields, threaded
 * through from the AI-Assist candidate). Each key is emitted ONLY when
 * truthy so the no-image manual path stays byte-stable (absent ≠ empty
 * string). Wire names `image_url` / `answer_image_url`: IDENTICAL across
 * FE request, BE DTO json tags, BE payload json tags, and the OpenAPI schema.
 */
function imageFields(
  content: AtomContent,
): { image_url?: string; answer_image_url?: string } {
  const out: { image_url?: string; answer_image_url?: string } = {};
  if (content.image_url) {
    out.image_url = content.image_url;
  }
  if (content.answer_image_url) {
    out.answer_image_url = content.answer_image_url;
  }
  return out;
}

/** Convert an `AtomContent` to the BE POST body (drops the `kind` tag). */
export function toCreateRequest(content: AtomContent): CreateQuestionRequest {
  if (content.type === 'mcq') {
    return {
      type: 'mcq',
      prompt: content.prompt,
      mcq_payload: content.mcq_payload,
      ...imageFields(content),
    };
  }
  return {
    type: 'oe',
    prompt: content.prompt,
    oe_payload: buildOeWireBody(content.oe_payload),
    ...imageFields(content),
  };
}

/** Convert an `AtomContent` to the BE PATCH body (partial-edit shape). */
export function toEditRequest(content: AtomContent): EditQuestionRequest {
  if (content.type === 'mcq') {
    return {
      prompt: content.prompt,
      mcq_payload: content.mcq_payload,
      ...imageFields(content),
    };
  }
  return {
    prompt: content.prompt,
    oe_payload: buildOeWireBody(content.oe_payload),
    ...imageFields(content),
  };
}

/**
 * Wire shape of `GET /api/atoms/{atom_id}/questions/{question_id}`: the
 * author projection (full). NOTE the BE serialises the payload under `mcq` /
 * `oe` keys (NOT `mcq_payload` / `oe_payload`), with `image_url` /
 * `answer_image_url` nested INSIDE the payload. Per CHO-1638 the BE mints any
 * durable `gs://` image refs to fresh signed GET URLs before serialising, so
 * the values here are directly `<img>`-renderable.
 */
export interface AuthorQuestionWire {
  readonly question_id: string;
  readonly type: QuestionType;
  readonly prompt: string;
  readonly mcq?: {
    readonly options?: readonly McqOption[];
    readonly image_url?: string;
    readonly answer_image_url?: string;
  };
  readonly oe?: {
    readonly model_answer?: string;
    // The author projection returns the rubric NESTED under `criteria` with
    // integer `weight_percent` + `description` (the chora-creation domain shape
    //: question/oe.go Rubric), NOT the FE-flat {title, weight} shape. This is
    // asymmetric with the AI-Assist drawer candidate; authorQuestionToAtomContent
    // normalizes it. (Verified against the live GET /atoms/{id}/questions/{qid}
    // author projection 2026-06-03.)
    readonly rubric?: {
      readonly criteria?: readonly {
        readonly criterion_id?: string;
        readonly description?: string;
        readonly weight_percent?: number;
      }[];
    };
    readonly grader_tier?: 'T1' | 'T2' | null;
    readonly min_response_chars?: number | null;
    readonly max_response_chars?: number | null;
    readonly image_url?: string;
    readonly answer_image_url?: string;
  };
}

/**
 * Convert an author-projection question (`AuthorQuestionWire`) into the
 * editable `AtomContent` used to seed the editor on re-open. Carries the
 * options + per-option answer key (`is_correct` / `explainer`) and the
 * (already-minted) `image_url` / `answer_image_url` so the saved question
 * renders exactly as authored. Returns `null` for an unsupported/empty shape.
 * `kind: 'manual'`: a persisted question is not an in-flight AI draft.
 */
export function authorQuestionToAtomContent(
  q: AuthorQuestionWire,
): AtomContent | null {
  if (q.type === 'mcq' && q.mcq) {
    const content: McqContent = {
      kind: 'manual',
      type: 'mcq',
      prompt: q.prompt,
      mcq_payload: { options: q.mcq.options ?? [] },
      ...(q.mcq.image_url ? { image_url: q.mcq.image_url } : {}),
      ...(q.mcq.answer_image_url
        ? { answer_image_url: q.mcq.answer_image_url }
        : {}),
    };
    return content;
  }
  if (q.type === 'oe' && q.oe) {
    // The author projection's rubric is NESTED under `criteria` with integer
    // `weight_percent` + `description`. Normalize to the FE-flat
    // OeRubricCriterion[] (description → title; weight_percent/100 → weight) so
    // oe-fields can `.map` it on re-open: copying it verbatim left `rubric` an
    // object and crashed the editor seed (`(rubric ?? []).map is not a fn`),
    // leaving the edit-OE editor empty.
    const criteria = q.oe.rubric?.criteria ?? [];
    const rubric: OeRubricCriterion[] = criteria.map((c, i) => ({
      criterion_id: c.criterion_id ?? `c${i + 1}`,
      title: c.description ?? '',
      weight: (c.weight_percent ?? 0) / 100,
      ...(c.description ? { description: c.description } : {}),
    }));
    const content: OpenEndedContent = {
      kind: 'manual',
      type: 'oe',
      prompt: q.prompt,
      oe_payload: {
        model_answer: q.oe.model_answer ?? '',
        ...(rubric.length ? { rubric } : {}),
        ...(q.oe.grader_tier ? { grader_tier: q.oe.grader_tier } : {}),
        ...(q.oe.min_response_chars != null
          ? { min_response_chars: q.oe.min_response_chars }
          : {}),
        ...(q.oe.max_response_chars != null
          ? { max_response_chars: q.oe.max_response_chars }
          : {}),
      },
      ...(q.oe.image_url ? { image_url: q.oe.image_url } : {}),
      ...(q.oe.answer_image_url
        ? { answer_image_url: q.oe.answer_image_url }
        : {}),
    };
    return content;
  }
  return null;
}
