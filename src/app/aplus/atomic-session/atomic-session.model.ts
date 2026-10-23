/**
 * Atomic Session model: A+ Phyllis demo Step 7 (atom playback).
 *
 * Wired LIVE 2026-05-15 (post chora-creation `AtomRepository` RLS fix
 * `827deff6`) to the real BFF endpoints:
 *   GET  /api/atoms/{atomId}                        → chora-gateway → chora-creation
 *   POST /api/atoms/{atomId}/session                → chora-gateway → chora-consumption
 *   POST /api/atoms/{atomId}/session/submit         → chora-gateway → chora-consumption
 *
 * WS-0b A16 (commit 37d182f8) added `question_payload` (unified
 * discriminated envelope: MCQQuestionPayload | OEQuestionPayload) to
 * `GET /api/atoms/{atomId}`. WS-1 restores MCQ/OE interactive rendering
 * using this payload. Legacy `mcq_payload` / `oe_payload` shims remain on
 * the wire for backwards compat: new code SHOULD prefer `question_payload`.
 *
 * Contract ref: chora-contracts/openapi/gateway.yaml §LearningAtom /
 * §QuestionPayload / §MCQQuestionPayload / §OEQuestionPayload.
 *
 * Eira's right-rail hint stays on the existing real `ActiveFamiliarService`
 * (no `/api/familiar/me` change in this wiring).
 */

/** Atom-type discriminant on the real wire DTO. */
export type AtomType = 'outline' | 'mcq' | 'essay';

// ── Unified question_payload (WS-0b A16) ─────────────────────────────────────

/**
 * MCQ option as returned within `question_payload.options[]`.
 *
 * Per `feedback_mcq_option_naming`: `marker` (A/B/C/D) is POSITIONAL and
 * auto-computed at render time: NEVER stored or carried on the wire.
 * `label` / `text` is the author-typed answer choice content (e.g. "Newton").
 * `explainer` is the post-release reveal: OMITTED in learner mode.
 */
export interface McqOption {
  readonly option_id: string;
  /** Author-typed answer choice text (canonical per feedback_mcq_option_naming). */
  readonly label?: string;
  /** Alias for `label`: cross-endpoint symmetry field. */
  readonly text?: string;
  /** Post-grade reveal: omitted in learner mode by BFF. */
  readonly explainer?: string;
}

/**
 * MCQ question payload as returned by `GET /api/atoms/{atomId}?mode=learner`
 * (the default). `correct_option_id` is ONLY present when `?mode=author` +
 * caller holds `author`/`instructor` tenant role: stripped by BFF otherwise.
 *
 * Required fields (per OpenAPI schema): `type`, `question_id`, `options`, `xp_on_correct`.
 */
export interface McqQuestionPayload {
  readonly type: 'mcq';
  readonly question_id: string;
  readonly prompt?: string;
  readonly options: readonly McqOption[];
  /** ID of correct option: present in author mode only. */
  readonly correct_option_id?: string;
  readonly xp_on_correct: number;
  readonly timer_seconds?: number;
  /**
   * QUESTION/STEM illustration URL (CHO-1638). Signed + learner-safe: the
   * chora-creation learner projection surfaces ONLY the question image here;
   * the model-answer illustration is NEVER projected to a learner pre-grade
   * (Security-wins), so there is no `answer_image_url` on this payload.
   */
  readonly image_url?: string;
}

/**
 * OE rubric criterion. Learner-safe: description + weight_percent only.
 * `model_answer` is always stripped from learner projection.
 *
 * Required fields: `criterion_id`, `description`, `weight_percent`.
 */
export interface OeRubricCriterion {
  readonly criterion_id: string;
  readonly description: string;
  readonly weight_percent: number;
}

export interface OeRubric {
  readonly criteria: readonly OeRubricCriterion[];
}

/**
 * OE question payload. `rubric` IS surfaced in learner mode (WS-0b behavior
 * change: `model_answer` is stripped; criteria are learner-safe).
 * Required fields: `type`, `question_id`, `max_score`.
 */
export interface OeQuestionPayload {
  readonly type: 'oe';
  readonly question_id: string;
  readonly prompt?: string;
  readonly rubric?: OeRubric;
  readonly max_score: number;
  readonly timer_seconds?: number;
}

/** Discriminated union for the new unified question_payload field. */
export type QuestionPayload = McqQuestionPayload | OeQuestionPayload;

// ── Question-type helper ──────────────────────────────────────────────────────

/**
 * Derive the question render mode from the atom envelope.
 *
 * - `'mcq'`         : atom has `question_payload.type === 'mcq'`
 * - `'oe'`          : atom has `question_payload.type === 'oe'`
 * - `'reading-only'`: atom has a body but no `question_payload` (valid render mode)
 * - `null`          : atom is missing (should not happen in success state)
 */
export function getQuestionType(
  atom: Pick<LearningAtom, 'question_payload' | 'body'> | null,
): 'mcq' | 'oe' | 'reading-only' | null {
  if (!atom) return null;
  if (atom.question_payload?.type === 'mcq') return 'mcq';
  if (atom.question_payload?.type === 'oe') return 'oe';
  if (atom.body) return 'reading-only';
  return null;
}

// ── Legacy shims (kept for backwards compat: prefer question_payload) ────────

/**
 * Legacy MCQ payload (pre-A16 field): kept for backwards compat.
 * New consumers SHOULD use `question_payload` instead.
 */
export interface AtomMcqOption {
  readonly option_id: string;
  readonly label: string;
  readonly text?: string;
}

export interface AtomMcqPayload {
  readonly prompt: string;
  readonly options: readonly AtomMcqOption[];
  readonly question_id?: string;
}

/**
 * Legacy OE payload (pre-A16 field): kept for backwards compat.
 */
export interface AtomOeRubricCriterion {
  readonly criterion_id: string;
  readonly title: string;
  readonly description?: string;
  readonly weight?: number;
}

export interface AtomOePayload {
  readonly prompt?: string;
  readonly model_answer?: string;
  readonly rubric?: readonly AtomOeRubricCriterion[];
  readonly grader_tier?: 'T1' | 'T2';
  readonly min_response_chars?: number;
  readonly max_response_chars?: number;
  readonly question_id?: string;
}

/**
 * Real wire DTO for `GET /api/atoms/{atomId}`.
 *
 * The endpoint envelope is `{atom: LearningAtom, session_error?: string}`:
 * the `session_error` indicator surfaces when a side-load on the atom
 * fails (e.g. the fog-orchestrator stitched chain is degraded); it does
 * NOT block the atom render and the FE just notes it in a partial-banner.
 *
 * WS-0b A16 added `question_payload` (unified discriminated envelope).
 * New consumers SHOULD prefer `question_payload` over the legacy
 * `mcq_payload` / `oe_payload` shim fields.
 */
export interface LearningAtom {
  /** Atom aggregate id (UUIDv7). */
  readonly atom_id: string;
  /**
   * Atom render-mode discriminant. Wave-1 seeded set covers 3 types:
   * `outline` (text-reading), `mcq` (multiple-choice), `essay` (long-form).
   */
  readonly atom_type: AtomType;
  /** Atom content body: text description shown in the reading view. */
  readonly body: string;
  /** Parent course aggregate id (UUIDv7). */
  readonly course_id: string;
  /** Author GCID (UUIDv7): opaque, not a display field. */
  readonly gcid: string;
  /** Owning tenant aggregate id (UUIDv7): RLS-narrowed. */
  readonly tenant_id: string;
  /**
   * Atom delivery mode. `straight-up` = linear cert path; `discovery` =
   * curiosity-driven graph mode per ADR-143.
   */
  readonly mode: string;
  /** Difficulty 1-5 (1 = easiest). */
  readonly difficulty: number;
  /** Append-only revision counter: AtomRevision aggregate state. */
  readonly revision: number;
  /** Publishing status: `published`, `draft`, etc. */
  readonly status: string;
  /** Discovery tags. */
  readonly tags: readonly string[];
  /** ISO-8601 UTC. */
  readonly created_at: string;
  /** ISO-8601 UTC. */
  readonly updated_at: string;
  /** Display title. */
  readonly title: string;
  /**
   * Unified question payload: WS-0b A16 contract expansion.
   * Discriminated by `type: 'mcq' | 'oe'`. Preferred over legacy shims.
   * `correct_option_id` (MCQ) omitted in learner mode; present in author mode.
   * OE `rubric` criteria ARE surfaced in learner mode (model_answer stripped).
   */
  readonly question_payload?: QuestionPayload;
  /**
   * Legacy MCQ payload shim: pre-A16. Kept for backwards compat.
   * New consumers SHOULD use `question_payload` instead.
   */
  readonly mcq_payload?: AtomMcqPayload;
  /** Legacy OE payload shim: pre-A16. Kept for backwards compat. */
  readonly oe_payload?: AtomOePayload;
}

/** Envelope returned by `GET /api/atoms/{atomId}`. */
export interface LearningAtomEnvelope {
  readonly atom: LearningAtom;
  /**
   * Non-fatal side-load failure indicator (e.g. fog-orchestrator
   * unavailable). When present the atom is still valid; the FE shows a
   * partial-notice without blocking the reading view.
   */
  readonly session_error?: string;
}

/**
 * Real wire DTO for `POST /api/atoms/{atomId}/session` (no body).
 * The gateway synthesises the atom_id from the path and proxies to
 * `chora-consumption POST /v1/me/atom-sessions` → 201.
 */
export interface AtomAttempt {
  /** Session aggregate id (UUIDv7). */
  readonly session_id: string;
  /** Tenant aggregate id (UUIDv7). */
  readonly tenant_id: string;
  /** Learner GCID (UUIDv7). */
  readonly learner_gcid: string;
  /** Atom aggregate id (UUIDv7). */
  readonly atom_id: string;
  /**
   * Lifecycle state. Known: `started`. The chora-consumption canonical
   * sequence is `started → in_progress → submitted → graded`.
   */
  readonly status: string;
  /** Hints used in this session (Familiar-driven). */
  readonly hints_used: number;
  /** Answers submitted so far. */
  readonly answer_count: number;
  /** ISO-8601 UTC. */
  readonly started_at: string;
}

/**
 * Real wire DTO for `POST /api/atoms/{atomId}/session/submit`: verified
 * 200 LIVE 2026-05-15 after INFRA-3 closed (`docs/m13/handoff-to-infra-
 * claude-2026-05-14.md` §8 + commit `4dbd1003` edge-verified):
 *   `{session_id, status, is_correct, duplicate, hints_used, answer_count,
 *     paths_advanced, paths_completed}`.
 * The earlier wave-2 fields (`atomic_session_id`, `state`,
 * `selected_option_id`, `explanation`, `xp_earned`) are NOT in the real
 * response: they were speculative and have been removed per user
 * guidance "if contract overlaps, refactor to align with BE". When the
 * BE rolls out the post-grade enrichment (explanation + xp_earned), the
 * model expands; until then we mirror the wire honestly.
 */
export interface SubmissionResult {
  /** The AtomAttempt id this answer was submitted against. */
  readonly session_id: string;
  /**
   * Lifecycle state after the answer was recorded. Observed values:
   * `in_progress` (more answers expected on this session). Other known
   * lifecycle values per chora-consumption: `submitted`, `graded`.
   */
  readonly status: string;
  /** Whether the answer was correct (auto-graded path). */
  readonly is_correct: boolean;
  /** True iff this submission was a duplicate of a previous answer in the same session. */
  readonly duplicate: boolean;
  /** Hint uses on this session so far. */
  readonly hints_used: number;
  /** Total answers submitted in this session so far (post-this-call). */
  readonly answer_count: number;
  /** LearningPath progress steps advanced by this answer (server-driven). */
  readonly paths_advanced: number;
  /** LearningPath progress steps completed by this answer (server-driven). */
  readonly paths_completed: number;
  /**
   * Campaign ladder outcome when this answer folded into today's KG campaign
   * hex (CHO-2315). Present ONLY when the answer credited a campaign, so the
   * dose player can render won / cleared / paced / counted feedback the same
   * way the hex-tap practice lane does, instead of advancing silently.
   */
  readonly campaign?: SubmissionCampaignOutcome;
}

/** The campaign side of a graded dose answer (CHO-2315, ADR-227 D6/D7). */
export interface SubmissionCampaignOutcome {
  readonly concept_id: string;
  readonly concept_key: string;
  readonly rung: number;
  /** The rung this answer cleared (0 = none). */
  readonly cleared_rung: number;
  /** The answer completed the ladder (6/6). */
  readonly won: boolean;
  /** Threshold met, but the D7 daily pacing held the clear until tomorrow. */
  readonly paced_today: boolean;
  /** A correct answer advanced the current-rung counter. */
  readonly counted: boolean;
  /** The answer landed on an already-cleared rung (retention refresh). */
  readonly is_refresher: boolean;
}

// ── AsyncState discriminated unions (fail-loud per chora-web CLAUDE.md §3) ──

/** Atom-load state for the reading view. */
export type AtomAttemptLoadState =
  | { readonly status: 'loading' }
  | {
      readonly status: 'success';
      readonly atom: LearningAtom;
      /** Non-fatal partial-load indicator from the envelope. */
      readonly partial: string | null;
    }
  | { readonly status: 'error'; readonly error: string };

/** Session-start state for the "Start session" CTA. */
export type AtomAttemptStartState =
  | { readonly status: 'idle' }
  | { readonly status: 'starting' }
  | { readonly status: 'started'; readonly session: AtomAttempt }
  | { readonly status: 'error'; readonly error: string };

/** Submission state for the (Cloud-Armor-blocked) submit CTA. */
export type AtomAttemptSubmitState =
  | { readonly status: 'idle' }
  | { readonly status: 'submitting' }
  | { readonly status: 'graded'; readonly result: SubmissionResult }
  | { readonly status: 'error'; readonly error: string };
