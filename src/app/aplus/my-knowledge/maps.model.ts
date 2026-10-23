/**
 * "My Knowledge" Atlas models (WS-B: CHO-2005, epic CHO-2004).
 *
 * A Map = a Goal (ADR-214: `Goal.RootConceptID` is the map's evolving root).
 * The Atlas (L0 home) lists the learner's maps as summary cards. The read-model
 * is owned by chora-consumption and exposed through the gateway BFF at
 * `GET /api/v1/me/maps`. camelCase on the wire; `readonly` + thin: only what
 * the endpoint returns (no synthetic fields, per the chora-web no-stubs mandate).
 */

import type { ConceptGraph } from '../discovery-graph/concept-graph.model';
import type { MapCampaign } from './campaign.model';

/**
 * One map summary card. `title` is the map's ROOT-concept title; a rootless /
 * freshly-created map may send `title: ""` with zero counts (the card then
 * falls back to `northStarNote`, then an "Untitled map" label). `shakyCount` /
 * `masteredCount` are the terrain roll-up over the map's concepts.
 */
export interface MapCard {
  readonly goalId: string;
  readonly title: string;
  readonly northStarNote: string;
  readonly rootConceptId?: string;
  readonly kind: string;
  readonly status: string;
  readonly attachedFamiliarId?: string;
  readonly conceptCount: number;
  readonly shakyCount: number;
  readonly masteredCount: number;
  readonly createdAt: string;
  readonly updatedAt: string;
}

/** Wire shape of `GET /api/v1/me/maps`. */
export interface MapsResponse {
  readonly items: MapCard[];
}

/**
 * A retired ADR-143 fog "MapCluster" the learner can re-project into a sovereign
 * map (ADR-223). Surfaced in the Atlas as a "legacy map: convert" card; on
 * convert the cluster mints a Goal and drops off this list (it is never
 * hard-deleted). `seedTopic` is the cluster's curiosity seed: the card title.
 */
export interface LegacyClusterCard {
  readonly clusterId: string;
  readonly seedTopic: string;
}

/**
 * Fail-loud async state for the Atlas list (discriminated union per the
 * chora-web `AsyncState<T>` pattern). `errorKey` is an i18n key, never a raw
 * BE body (Security).
 */
export type MapsState =
  | { readonly status: 'loading' }
  | { readonly status: 'success'; readonly maps: readonly MapCard[] }
  | { readonly status: 'error'; readonly errorKey: string };

/**
 * The graph behind one map (L1, consumed by WS-C: NOT the Atlas). A map's
 * graph is a sovereign concept graph (design §3): the painted `{concepts,
 * edges}` (the SAME shape the `/concept-graph` read serves) PLUS the map's
 * own identity: `goalId`, the root-concept `title`, and the explicit
 * `rootConceptId` (ADR-214 D1, the fisheye's `explicitRootId`). `rootConceptId`
 * is omitted for a rootless / freshly-created map. Exposed at
 * `GET /api/v1/me/maps/{goalId}/graph`; the typed seam WS-C builds L1 on.
 */
export interface MapGraph extends ConceptGraph {
  readonly goalId: string;
  readonly title: string;
  readonly rootConceptId?: string;
  /**
   * The Familiar designated for this map (ADR-212 D5, 0..1 per map). Absent when
   * no Familiar is attached (the zero-Familiar base loop is first-class). Read
   * by the WS-D Familiar/Mastery lenses; the map-graph read paints it goal-level.
   */
  readonly attachedFamiliarId?: string;
  /**
   * The bound Familiar's learner-safe display name (CHO-2109). Absent when no
   * Familiar is attached or the name could not be resolved (fail-soft): the
   * campaign HUD then falls back to neutral march copy.
   */
  readonly attachedFamiliarName?: string;
  /**
   * When the learner marked this map "done for me": the ADR-213 PERSONAL axis
   * (self-declared, NOT an operator-verified credential). ISO-8601; absent when
   * the map is not personally completed. Flipped via `PATCH /me/goals/{id}`
   * with `{ personalComplete }` from the Mastery lens.
   */
  readonly personalCompletedAt?: string;
  /**
   * The Familiar campaign projection over this map's concept graph (WS-C7:
   * CHO-2086, ADR-227 D15/D16). Present whenever the goal has a root; ABSENT for
   * a rootless goal or a fail-soft read degradation (render the base map with no
   * campaign chrome). Per-node ladder state (fog / frontier / province) rides in
   * `campaign.nodes`; the goal-level frontier tally + seal gate ride at the top.
   */
  readonly campaign?: MapCampaign;
}
