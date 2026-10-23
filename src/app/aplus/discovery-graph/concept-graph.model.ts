/**
 * Learner-sovereign Discovery concept-graph models (ADR-212).
 *
 * A node is a learner-created `ConceptNode`: a named idea referencing
 * 0..N LearningAtoms (`atomRefs`). Edges are learner-authored: `hierarchy`
 * (source = parent → target = child) or `lateral`. The learner owns the
 * shape: concepts organise atoms, the hierarchy is re-rootable, and each
 * map carries one designated Familiar (familiar-per-map).
 *
 * These interfaces mirror the FE-facing gateway contract exactly: the
 * gateway maps `/api/v1/me/concept-graph/*` → chora-consumption
 * `/v1/me/concept-graph/*`. camelCase on the wire; `readonly` + thin
 * (only what the endpoint returns: no synthetic fields, per the
 * no-stubs / fail-loud mandate).
 */

/** Edge semantics. `hierarchy` is directional (source parent → target child). */
export type EdgeClass = 'hierarchy' | 'lateral';

/**
 * Read-time weakness overlay painted onto a concept (WS-A1, "My Knowledge"
 * unification: feeds the Shaky lens). Present only when the concept's title
 * slug-matches one of the learner's ACTIVE Growth Edges; `strength` is the
 * shaky heat and `isDue` the orthogonal Ebbinghaus due-⏰. Mirrors the gateway
 * `growthEdge` shape verbatim (camelCase, thin: no synthesised fields).
 */
export interface ConceptGrowthEdge {
  readonly edgeId: string;
  readonly conceptKey: string;
  readonly strength: number;
  readonly isDue?: boolean;
  readonly retentionScore?: number;
}

/**
 * A learner-created concept referencing 0..N atoms.
 *
 * `provenance` + the read-time overlay (`growthEdge` / `mastered`) are all
 * OPTIONAL: the base `/concept-graph` read omits them on older payloads, and
 * only the painted map-graph read (WS-A1) sets them. `provenance` is one of
 * `learner_authored` | `familiar_suggested_accepted` | `system_derived`
 * (ADR-212 D4: drives the ● you / ✨ Familiar badge).
 */
export interface ConceptNode {
  readonly conceptId: string;
  readonly title: string;
  readonly atomRefs: readonly string[];
  readonly provenance?: string;
  readonly growthEdge?: ConceptGrowthEdge;
  readonly mastered?: boolean;
  /**
   * Ceremony learning-edge intent (CHO-2038): `remediate` (a weakness to shore
   * up) or `explore` (an adjacent curiosity the learner chose to pursue). Absent
   * on a plain concept. Drives the "Both, labelled" chip in the node drawer and
   * folds a `remediate` node into the Shaky paint (it needs no evidenced
   * `growthEdge` to read shaky: it complements that overlay).
   */
  readonly intent?: ConceptIntent;
  /**
   * The learner's per-concept objective / sub-goal (ADR-247, CHO-2328): a short
   * free-text "what am I trying to achieve with this concept". `""` (or absent)
   * when unset. `subGoalProvenance` records who set it
   * (`learner_authored` | `familiar_suggested_accepted` | `system_derived`, or
   * `""`), driving the drawer's you / Companion provenance pill. Optional: the
   * base `/concept-graph` read omits both; the painted map-graph read carries
   * them.
   */
  readonly subGoal?: string;
  readonly subGoalProvenance?: string;
}

/** A ceremony learning-edge label (CHO-2038). */
export type ConceptIntent = 'remediate' | 'explore';

/** A learner-authored edge between two concepts. */
export interface ConceptEdge {
  readonly edgeId: string;
  readonly sourceConceptId: string;
  readonly targetConceptId: string;
  readonly class: EdgeClass;
  readonly provenance: string;
}

/** GET /concept-graph response. */
export interface ConceptGraph {
  readonly concepts: readonly ConceptNode[];
  readonly edges: readonly ConceptEdge[];
}

/** POST /concept-graph/concepts request body. */
export interface CreateConceptRequest {
  readonly title: string;
  readonly atomRefs?: readonly string[];
}

/** Concept DTO returned by POST (201) and PATCH (200). */
export interface ConceptDto {
  readonly conceptId: string;
  readonly title: string;
  readonly atomRefs: readonly string[];
  readonly provenance: string;
  readonly createdAt: string;
  /**
   * The concept's objective / sub-goal + its provenance (ADR-247, CHO-2328).
   * A PATCH carrying `subGoal` echoes them back so the caller can splice the
   * saved value (and the provenance the server assigned) into local state
   * without a full reload. Optional; older payloads omit them.
   */
  readonly subGoal?: string;
  readonly subGoalProvenance?: string;
}

/** PATCH /concept-graph/concepts/{conceptId} request body. */
export interface PatchConceptRequest {
  readonly title?: string;
  readonly addAtomRefs?: readonly string[];
  readonly removeAtomRefs?: readonly string[];
  /**
   * Set the concept's objective / sub-goal (ADR-247, CHO-2328). A supplied
   * `""` CLEARS it; omitting the field leaves it unchanged.
   */
  readonly subGoal?: string;
}

/** POST /concept-graph/edges request body. */
export interface CreateEdgeRequest {
  readonly sourceConceptId: string;
  readonly targetConceptId: string;
  readonly class: EdgeClass;
}

/** POST /concept-graph/reroot request body. */
export interface RerootRequest {
  readonly newRootId: string;
}

/** POST /concept-graph/reroot response body. */
export interface RerootResult {
  readonly newRootId: string;
  readonly changed: boolean;
  readonly edgesFlipped: number;
}

/**
 * Fail-loud async state for the concept graph (discriminated union per the
 * coding-angular real-wiring pattern). `error` is an i18n key.
 */
export type ConceptGraphState =
  | { readonly status: 'loading' }
  | { readonly status: 'success'; readonly graph: ConceptGraph }
  | { readonly status: 'error'; readonly error: string };

// ── Familiar suggestions (ADR-212 WS-4) ──────────────────────────────────

/** What a Familiar can propose: a new `concept` or a new `edge`. */
export type SuggestionKind = 'concept' | 'edge';

/** Lifecycle of a suggestion. Only `pending` is ever listed by GET. */
export type SuggestionStatus = 'pending' | 'accepted' | 'dismissed';

/**
 * A Familiar-proposed addition to the learner's map. Arrives asynchronously:
 * the learner requests generation, the fog LLM proposes concepts/edges, and
 * each lands here as `pending` until the learner accepts (which mints a real
 * `ConceptNode`/`ConceptEdge` server-side) or dismisses it.
 *
 * Thin, camelCase mirror of the gateway contract: a `concept` carries
 * `title`/`atomRefs`; an `edge` carries `sourceConceptId`/`targetConceptId`/
 * `class`. Everything past id/kind/status is optional (the endpoint only
 * returns what a given kind needs).
 */
export interface ConceptSuggestion {
  readonly suggestionId: string;
  readonly kind: SuggestionKind;
  readonly status: SuggestionStatus;
  readonly title?: string;
  readonly atomRefs?: readonly string[];
  readonly sourceConceptId?: string;
  readonly targetConceptId?: string;
  readonly class?: EdgeClass;
  readonly rationale?: string;
  readonly modelId?: string;
  readonly createdAt?: string;
  /**
   * The map node this suggestion fans around (WS-C7 fog ghosts). Optional: the
   * whole-map list omits it on suggestions with no focal, and the BE list DTO
   * must emit it for per-node ghost placement (escalated: `suggestionDTO` +
   * `toSuggestionDTO` in chora-consumption owe the `focalConceptId` field).
   */
  readonly focalConceptId?: string;
  /** The map (= Goal, ADR-214) the suggestion belongs to (WS-C7). */
  readonly goalId?: string;
}

/** GET /concept-graph/suggestions response (pending only). */
export interface SuggestionList {
  readonly suggestions: readonly ConceptSuggestion[];
}

/** POST /concept-graph/suggestions/generate request body. */
export interface GenerateSuggestionsRequest {
  readonly focalConceptId?: string;
  /** The map (= a Goal, ADR-214) to seed fog generation from. */
  readonly goalId?: string;
}

/** POST /concept-graph/suggestions/generate response (202: fire-and-forget). */
export interface GenerateSuggestionsResult {
  readonly status: string;
  readonly requestId: string;
  readonly focalConceptId: string;
}
