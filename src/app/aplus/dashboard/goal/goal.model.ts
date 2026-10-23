/**
 * Learner-owned Goal: FE model (ADR-204 §2/§3/§10, lens half of Slice G).
 *
 * The Goal aggregate is owned by chora-consumption and exposed to A+ via the
 * gateway BFF at `/api/v1/me/goals`. A learner holds a small set of Goals; the
 * BE derives a single `primaryLens` ('curiosity' | 'credential') from them that
 * drives the dashboard's adaptive lead (ADR-204 §3: DERIVED, never a toggle).
 *
 * Wire shape is camelCase (the gateway serialises it so). Mirrors the pinned
 * contract verbatim: no synthesised fields (chora-web no-stubs rule).
 */

/** A Goal's kind. `curiosity` needs no target; the rest REQUIRE a target. */
export type GoalKind =
  | 'curiosity'
  | 'cert'
  | 'course'
  | 'path'
  | 'theme_mastery'
  | 'edge';

export type GoalStatus = 'active' | 'achieved' | 'maintenance' | 'retired';

/** The BE-derived adaptive lens. Defaults to `curiosity` everywhere it is
 *  absent so the dashboard degrades gracefully (ADR-204 §3). */
export type PrimaryLens = 'curiosity' | 'credential';

/** Kinds that REQUIRE a `choraTargetRef` per the pinned contract. */
export const CREDENTIAL_GOAL_KINDS: readonly GoalKind[] = [
  'cert',
  'course',
  'path',
  'theme_mastery',
  'edge',
];

/** True when the kind must carry a `choraTargetRef` (everything but curiosity). */
export function kindRequiresTarget(kind: GoalKind): boolean {
  return CREDENTIAL_GOAL_KINDS.includes(kind);
}

export interface GoalDTO {
  readonly goalId: string;
  readonly kind: GoalKind;
  /** Opaque ref to the targeted cert/course/path/theme/edge. Absent for curiosity. */
  readonly choraTargetRef?: string;
  readonly conceptSet: string[];
  readonly status: GoalStatus;
  readonly northStarNote: string;
  /** Set when a Familiar is attached to this Goal (attach UI is deferred). */
  readonly attachedFamiliarId?: string;
  readonly createdAt: string;
  readonly updatedAt: string;

  // ── Verified-progress (CHO-1921) ──────────────────────────────────────
  // The BE now derives REAL, mastery-backed progress over the goal's concept
  // set (NOT a faked %). All three are OPTIONAL: older payloads omit them and
  // concept-less curiosity goals send `totalConcepts: 0` (progress is N/A there
  //: the today-bar then hides the ring rather than showing a 0% one).
  /** Integer 0-100: verified mastery progress toward the goal's concepts. */
  readonly progressPercent?: number;
  /** Count of the goal's concepts the learner has verifiably mastered. */
  readonly masteredConcepts?: number;
  /** Total concepts in the goal's set (0 ⇒ no concept set ⇒ progress is N/A). */
  readonly totalConcepts?: number;
}

/** Wire shape of `GET /api/v1/me/goals`. */
export interface GoalsResponse {
  readonly items: GoalDTO[];
  readonly primaryLens: PrimaryLens;
}

/** Body of `POST /api/v1/me/goals`. */
export interface CreateGoalRequest {
  readonly kind: GoalKind;
  readonly choraTargetRef?: string;
  readonly conceptSet?: string[];
  readonly northStarNote?: string;
  /**
   * The map's explicit root concept (ADR-214). Sent when a map is created from
   * the "My Knowledge" Atlas: the caller mints a root `ConceptNode` first, then
   * creates the curiosity Goal rooted on it (2-step create, WS-B).
   */
  readonly rootConceptId?: string;
}

/** Body of `PATCH /api/v1/me/goals/{id}`: the mutable Goal fields. */
export interface UpdateGoalPatch {
  readonly status?: GoalStatus;
  readonly northStarNote?: string;
  readonly choraTargetRef?: string;
  readonly conceptSet?: string[];
  /**
   * Attach a Familiar to this map (the goal familiar bond, ADR-212 D5). Sent by
   * the WS-E Familiar lens "summon". Mutually exclusive with `detachFamiliar`
   * (the BE 400s if both are set): the caller must detach before re-attaching.
   */
  readonly attachedFamiliarId?: string;
  /**
   * Clear the map's Familiar bond (ADR-212 D5). Sent by the WS-E Familiar lens
   * "dismiss". The BE fails-loud (409) if no Familiar is attached.
   */
  readonly detachFamiliar?: boolean;
  /**
   * Re-anchor the map's root concept (ADR-214 D1: "goal evolution =
   * re-rooting"). Sent by the WS-C map canvas AFTER a successful concept-graph
   * reroot, so the Goal's root follows the map's new root in lock-step.
   */
  readonly rootConceptId?: string;
  /**
   * The learner's PERSONAL "done for me" axis (ADR-213: distinct from any
   * operator-verified credential). `true` marks the map personally complete,
   * `false` re-opens it. Sent by the WS-D Mastery lens; the BE stamps/clears
   * `personalCompletedAt` on the Goal.
   */
  readonly personalComplete?: boolean;
}

/**
 * Discriminated create/update failure for fail-loud inline messaging in the
 * picker. The BE is the validator of record (it returns 422 INVALID_GOAL for a
 * credential goal with no target): the picker surfaces that honestly rather
 * than swallowing it.
 */
export type GoalMutationError =
  | { readonly kind: 'invalid_goal' } // 400 / 422 INVALID_GOAL
  | { readonly kind: 'service_unavailable' } // 502 / 503
  | { readonly kind: 'unknown'; readonly message: string };

/** Map a create/update HTTP failure to a discriminated FE error. */
export function mapGoalMutationError(err: unknown): GoalMutationError {
  const status =
    err && typeof err === 'object' && 'status' in err
      ? (err as { status: number }).status
      : 0;
  if (status === 400 || status === 422) return { kind: 'invalid_goal' };
  if (status === 502 || status === 503) return { kind: 'service_unavailable' };
  const message =
    err && typeof err === 'object' && 'message' in err
      ? String((err as { message: unknown }).message)
      : 'Unknown error';
  return { kind: 'unknown', message };
}

/**
 * Discriminated load state for the goals list. Mirrors the fail-loud
 * `AsyncState<T>` pattern used across chora-web (see `dashboard.model.ts`).
 * `error` is an i18n key, never a raw BE body.
 */
export type GoalsState =
  | { readonly status: 'loading' }
  | {
      readonly status: 'success';
      readonly items: readonly GoalDTO[];
      readonly primaryLens: PrimaryLens;
    }
  | { readonly status: 'error'; readonly error: string };
