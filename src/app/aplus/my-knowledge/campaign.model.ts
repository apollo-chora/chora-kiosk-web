/**
 * Familiar Campaign models (WS-C7: CHO-2086, ADR-227 D15/D16).
 *
 * The campaign is a projection over the map's concept graph: per-node ladder
 * state (rungs 1..6) painted as fog / frontier / province on the fisheye lens.
 * Wire shapes mirror the BE exactly (no synthetic fields): the map read's
 * `campaign` block is camelCase (it rides `GET /api/v1/me/maps/{id}/graph`);
 * the question-lane doors are snake_case (the WS-C3 practice-lane contract).
 *
 * Rung positions are the ORIGINAL-Bloom ladder (1 knowledge … 6 synthesis);
 * the FE renders revised-Bloom copy via `CAMPAIGN_RUNG_LABEL_KEYS` (D6: two
 * vocabularies, one mapping, confined to i18n).
 */

/** Per-node ladder state (`campaign.nodes[conceptId]`); an ABSENT key means
 *  unstarted frontier territory (rungs 0, no cooling). */
export interface CampaignNodeState {
  readonly rungsCleared: number;
  readonly currentRungCorrect: number;
  readonly wonAt?: string;
  /** D8 refresh-gate: unwon, climbing, and retention has gone cold. */
  readonly cooling: boolean;
  /** D7 pacing: the ladder already advanced today (UTC). */
  readonly advancedToday: boolean;
}

/** The map read's goal-level campaign block (absent = no campaign surface:
 *  rootless goal or fail-soft read degradation; render the base map). */
export interface MapCampaign {
  readonly focusConceptId?: string;
  readonly campaignSealedAt?: string;
  readonly frontierTotal: number;
  readonly frontierWon: number;
  /** Frontier verified empty (seal CTA); re-seal caps stay server-side 409s. */
  readonly canSeal: boolean;
  readonly nodes: Readonly<Record<string, CampaignNodeState>>;
}

/** A face-down fog hex: a PENDING concept suggestion anchored to its focal
 *  map node (projected from `ConceptSuggestion` by the canvas). */
export interface FogGhost {
  readonly suggestionId: string;
  readonly title: string;
  readonly focalConceptId: string;
}

/** `POST /me/goals/{id}/campaign/seal` success body. */
export interface CampaignSealResult {
  readonly goalId: string;
  readonly sealedAt: string;
  readonly isReseal: boolean;
  readonly nodesWon: number;
  readonly personalCompletedAt?: string;
}

/** `GET /me/goals/{id}/campaign/questions` body (snake_case wire).
 *  `tap_capped` = the explicit-tap daily generation budget is spent (the
 *  automatic dose-march has its OWN separate budget); the FE shows an honest
 *  resets-tomorrow message rather than a vague empty miss. */
export interface CampaignQuestionsResponse {
  readonly status: 'ready' | 'none' | 'idle' | 'requested' | 'failed' | 'tap_capped';
  readonly concept_id: string;
  readonly concept_key: string;
  readonly rung: number;
  /** BatchCandidatePayload JSON verbatim when status = ready. */
  readonly questions?: unknown;
  readonly source?: string;
  readonly failure_reason?: string;
}

/** `POST /me/goals/{id}/campaign/questions/answer` request (snake_case wire). */
export interface CampaignAnswerRequest {
  readonly concept_id: string;
  readonly rung: number;
  readonly question_index: number;
  readonly selected_option_id: string;
}

/** Answer verdict + ladder outcome: grading is SERVER-side only. */
export interface CampaignAnswerResult {
  readonly correct: boolean;
  readonly rung: number;
  readonly is_refresher: boolean;
  readonly counted: boolean;
  readonly cleared_rung: number;
  readonly won: boolean;
  readonly paced_today: boolean;
  readonly rungs_cleared: number;
  readonly current_rung_correct: number;
  readonly needed_correct: number;
  readonly retention_r: number;
  /** Post-grade reveal: the pre-grade serve is sanitised (no answer key, no
   *  explainer), so the correct option + its explainer arrive HERE, after the
   *  server grades. Absent when the stored payload carries none. */
  readonly correct_option_id?: string;
  readonly explainer?: string;
}

/** Ladder height (D6): winning a node = clearing all 6 rungs. */
export const CAMPAIGN_TOTAL_RUNGS = 6;

/** Rung position (1..6, original-Bloom wire) → revised-Bloom i18n label key. */
export const CAMPAIGN_RUNG_LABEL_KEYS: Readonly<Record<number, string>> = {
  1: 'aplus.knowledge.campaign_rung_1',
  2: 'aplus.knowledge.campaign_rung_2',
  3: 'aplus.knowledge.campaign_rung_3',
  4: 'aplus.knowledge.campaign_rung_4',
  5: 'aplus.knowledge.campaign_rung_5',
  6: 'aplus.knowledge.campaign_rung_6',
};
