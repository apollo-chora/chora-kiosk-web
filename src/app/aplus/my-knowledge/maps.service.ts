/**
 * MapsService: "My Knowledge" Atlas provider (WS-B: CHO-2005, epic CHO-2004).
 *
 * Wired LIVE to the gateway BFF (chora-web/CLAUDE.md §3: `BffClientService` is
 * the sole HTTP adapter; it prepends the gateway base URL):
 *   GET  /api/v1/me/maps                → { items: MapCard[] }  (the Atlas list)
 *   GET  /api/v1/me/maps/{goalId}/graph → the map graph (L1, WS-C)
 *
 * "＋ New map" is a 2-step create (both endpoints already ship):
 *   1. POST /api/v1/me/concept-graph/concepts { title } → ConceptDto (the root)
 *   2. POST /api/v1/me/goals { kind:'curiosity', rootConceptId, northStarNote }
 * chained via `switchMap` so the goal always carries the freshly-minted root
 * concept id: the two calls are never fired in parallel.
 *
 * Fail-loud (GoalService precedent): the list resolves to a discriminated
 * `MapsState` carrying an i18n error KEY (never a raw BE body, Security);
 * `createMap` returns the raw Observable so the caller renders 4xx/5xx inline
 * and never fabricates success.
 */
import { Injectable, computed, inject, signal } from '@angular/core';
import { Observable, catchError, map, of, switchMap, take } from 'rxjs';

import { BffClientService } from '../../core/services/bff-client.service';
import { ConceptGraphService } from '../discovery-graph/concept-graph.service';
import { GoalService } from '../dashboard/goal/goal.service';
import type { GoalDTO } from '../dashboard/goal/goal.model';
import type {
  LegacyClusterCard,
  MapCard,
  MapGraph,
  MapsResponse,
  MapsState,
} from './maps.model';

/**
 * chora-consumption speaks Companion on the wire (ADR-254 D9): a map card and a
 * map graph carry `attachedCompanionId`, and the graph also carries
 * `attachedCompanionName` for the campaign HUD. The canvas speaks Familiar in
 * its own model, so the two names meet here at the adapter boundary.
 */
interface MapCardWire extends Omit<MapCard, 'attachedFamiliarId'> {
  readonly attachedCompanionId?: string;
}

interface MapGraphWire
  extends Omit<MapGraph, 'attachedFamiliarId' | 'attachedFamiliarName'> {
  readonly attachedCompanionId?: string;
  readonly attachedCompanionName?: string;
}

function wireToCard(wire: MapCardWire): MapCard {
  const { attachedCompanionId, ...rest } = wire;
  return attachedCompanionId === undefined
    ? (rest as MapCard)
    : { ...(rest as MapCard), attachedFamiliarId: attachedCompanionId };
}

function wireToGraph(wire: MapGraphWire): MapGraph {
  const { attachedCompanionId, attachedCompanionName, ...rest } = wire;
  const graph = rest as MapGraph;
  return {
    ...graph,
    ...(attachedCompanionId === undefined
      ? {}
      : { attachedFamiliarId: attachedCompanionId }),
    ...(attachedCompanionName === undefined
      ? {}
      : { attachedFamiliarName: attachedCompanionName }),
  };
}

@Injectable({ providedIn: 'root' })
export class MapsService {
  private readonly bff = inject(BffClientService);
  private readonly conceptGraph = inject(ConceptGraphService);
  private readonly goalService = inject(GoalService);

  private static readonly BASE = '/api/v1/me/maps';

  private readonly _state = signal<MapsState>({ status: 'loading' });
  readonly state = this._state.asReadonly();

  /** Every map in the success payload, else empty (loading / error). */
  readonly maps = computed<readonly MapCard[]>(() => {
    const s = this._state();
    return s.status === 'success' ? s.maps : [];
  });

  /**
   * Retired ADR-143 fog clusters the learner can re-project into maps (ADR-223).
   * Empty until loaded; fail-soft: a clusters error never breaks the Atlas.
   */
  private readonly _legacyClusters = signal<readonly LegacyClusterCard[]>([]);
  readonly legacyClusters = this._legacyClusters.asReadonly();

  /** GET the Atlas list and publish to `state`. Idempotent (refresh / retry). */
  load(): void {
    this._state.set({ status: 'loading' });
    this.bff
      .get<MapsResponse>(MapsService.BASE)
      .pipe(
        take(1),
        map(
          (res): MapsState => ({
            status: 'success',
            maps: (res.items ?? []).map((m) =>
              wireToCard(m as unknown as MapCardWire),
            ),
          }),
        ),
        catchError(() =>
          of<MapsState>({ status: 'error', errorKey: 'aplus.knowledge.error' }),
        ),
      )
      .subscribe((s) => this._state.set(s));
  }

  /**
   * One-shot Atlas fetch as a raw Observable: distinct from `load()`, which
   * publishes into the `state` signal. Used by callers that need the map list
   * imperatively, e.g. the marketplace free-claim lane resolving a target map
   * to bind a Familiar to (CHO-2034). Fail-loud: a fetch error propagates.
   */
  listMaps(): Observable<readonly MapCard[]> {
    return this.bff
      .get<MapsResponse>(MapsService.BASE)
      .pipe(
        take(1),
        map((res) =>
          (res.items ?? []).map((m) => wireToCard(m as unknown as MapCardWire)),
        ),
      );
  }

  /**
   * GET the learner's un-projected fog clusters (ADR-143) so the Atlas can offer
   * them for re-projection (ADR-223). Fail-soft: a clusters error leaves the
   * legacy section empty and never breaks the maps Atlas.
   */
  loadLegacyClusters(): void {
    this.bff
      .get<{
        data?: { clusters?: readonly { clusterId: string; seedTopic: string }[] };
      }>('/api/v1/me/knowledge-graph/clusters')
      .pipe(
        take(1),
        map((env) =>
          (env.data?.clusters ?? []).map(
            (c): LegacyClusterCard => ({
              clusterId: c.clusterId,
              seedTopic: c.seedTopic,
            }),
          ),
        ),
        catchError(() => of<LegacyClusterCard[]>([])),
      )
      .subscribe((cs) => this._legacyClusters.set(cs));
  }

  /**
   * Re-project a retired fog cluster into a sovereign map (ADR-223). Resolves to
   * the new map's `goalId`. Raw Observable: the Atlas renders its own inline
   * error and navigates on success.
   */
  convertCluster(clusterId: string): Observable<string> {
    return this.bff
      .post<{ data?: { goalId?: string } }>(
        `/api/v1/me/knowledge-graph/clusters/${encodeURIComponent(clusterId)}/convert`,
        {},
      )
      .pipe(
        take(1),
        map((env) => env.data?.goalId ?? ''),
      );
  }

  /**
   * Create a new map: mint a root `ConceptNode`, then a curiosity `Goal` rooted
   * on it. Returns the created Goal so the caller refreshes via `load()`. The
   * two BFF calls are chained (`switchMap`) so the goal always carries a real
   * `rootConceptId`; a concept-create failure short-circuits before the goal.
   */
  createMap(name: string): Observable<GoalDTO> {
    return this.conceptGraph.createConcept({ title: name }).pipe(
      switchMap((concept) =>
        this.goalService.create({
          kind: 'curiosity',
          rootConceptId: concept.conceptId,
          northStarNote: name,
        }),
      ),
    );
  }

  /**
   * Soft-delete a whole map. A map IS a Goal (ADR-214), so the delete goes
   * through the goals route: delegate to `GoalService` (mirrors how `createMap`
   * delegates the goal-create). Raw Observable; the Atlas renders its own inline
   * error and refreshes via `load()` on success. NEVER hard-delete (server soft).
   */
  deleteMap(goalId: string): Observable<void> {
    return this.goalService.delete(goalId);
  }

  /**
   * GET the graph behind one map (L1, WS-C). Raw Observable: the L1 canvas
   * renders its own honest loading/error. Not used by the Atlas.
   */
  getGraph(goalId: string): Observable<MapGraph> {
    return this.bff
      .get<MapGraphWire>(
        `${MapsService.BASE}/${encodeURIComponent(goalId)}/graph`,
      )
      .pipe(map(wireToGraph));
  }
}
