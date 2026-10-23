/**
 * ConceptGraphService: chora-gateway client for the learner-sovereign
 * Discovery concept graph (ADR-212). Wired through `BffClientService` per
 * chora-web/CLAUDE.md §3 (the sole HTTP adapter; it prepends the gateway
 * base URL).
 *
 * Fail-loud: every method returns the raw Observable so subscribers see the
 * real gateway error (BFF unreachable / 4xx / 5xx). No fixtures, no
 * in-memory fallback: the callers render honest loading/error/empty states.
 *
 * FE-facing paths (gateway → chora-consumption `/v1/me/concept-graph/*`):
 *   GET    /api/v1/me/concept-graph
 *   POST   /api/v1/me/concept-graph/concepts
 *   PATCH  /api/v1/me/concept-graph/concepts/{conceptId}
 *   DELETE /api/v1/me/concept-graph/concepts/{conceptId}
 *   POST   /api/v1/me/concept-graph/edges
 *   DELETE /api/v1/me/concept-graph/edges/{edgeId}
 *   POST   /api/v1/me/concept-graph/reroot
 *   GET    /api/v1/me/concept-graph/suggestions
 *   POST   /api/v1/me/concept-graph/suggestions/generate
 *   POST   /api/v1/me/concept-graph/suggestions/{id}/accept
 *   POST   /api/v1/me/concept-graph/suggestions/{id}/dismiss
 */
import { HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { BffClientService } from '../../core/services/bff-client.service';
import type {
  ConceptDto,
  ConceptEdge,
  ConceptGraph,
  ConceptSuggestion,
  CreateConceptRequest,
  CreateEdgeRequest,
  GenerateSuggestionsRequest,
  GenerateSuggestionsResult,
  PatchConceptRequest,
  RerootRequest,
  RerootResult,
  SuggestionList,
} from './concept-graph.model';

const BASE = '/api/v1/me/concept-graph';

@Injectable({ providedIn: 'root' })
export class ConceptGraphService {
  private readonly bff = inject(BffClientService);

  /** GET the full graph (concepts + edges). */
  getGraph(): Observable<ConceptGraph> {
    return this.bff.get<ConceptGraph>(BASE);
  }

  /** POST a new concept (optionally seeded from atoms). Returns the DTO (201). */
  createConcept(request: CreateConceptRequest): Observable<ConceptDto> {
    return this.bff.post<ConceptDto>(`${BASE}/concepts`, request);
  }

  /** PATCH a concept: rename and/or add/remove atom refs. Returns the DTO. */
  patchConcept(
    conceptId: string,
    request: PatchConceptRequest,
  ): Observable<ConceptDto> {
    return this.bff.patch<ConceptDto>(
      `${BASE}/concepts/${encodeURIComponent(conceptId)}`,
      request,
    );
  }

  /** DELETE a concept (soft-delete server-side). 204 → void. */
  deleteConcept(conceptId: string): Observable<void> {
    return this.bff.delete<void>(
      `${BASE}/concepts/${encodeURIComponent(conceptId)}`,
    );
  }

  /** POST a new edge between two concepts. Returns the edge DTO (201). */
  createEdge(request: CreateEdgeRequest): Observable<ConceptEdge> {
    return this.bff.post<ConceptEdge>(`${BASE}/edges`, request);
  }

  /** DELETE an edge. 204 → void. */
  deleteEdge(edgeId: string): Observable<void> {
    return this.bff.delete<void>(
      `${BASE}/edges/${encodeURIComponent(edgeId)}`,
    );
  }

  /** POST a re-root: make `newRootId` the map root. Returns the flip summary. */
  reroot(request: RerootRequest): Observable<RerootResult> {
    return this.bff.post<RerootResult>(`${BASE}/reroot`, request);
  }

  // ── Familiar suggestions (ADR-212 WS-4) ─────────────────────────────

  /** GET the learner's PENDING suggestions (accepted/dismissed filtered out). */
  getSuggestions(
    focalConceptId?: string,
    goalId?: string,
  ): Observable<SuggestionList> {
    // Scope the list to the goal MAP (bug #19) so a sibling goal's fog (e.g. a
    // Photosynthesis "NEW LINK") never bleeds onto another map, and further to
    // the focal concept (a node only shows suggestions generated for it or
    // whole-map ones). The BE hard-scopes on `?goalId=` (subtree fence) and
    // narrows on `?focalConceptId=`; both omitted = all pending (unrooted graph).
    let params = new HttpParams();
    if (goalId) params = params.set('goalId', goalId);
    if (focalConceptId) params = params.set('focalConceptId', focalConceptId);
    return this.bff.get<SuggestionList>(`${BASE}/suggestions`, params);
  }

  /**
   * POST a fire-and-forget generation request (202). Suggestions arrive
   * asynchronously: poll `getSuggestions()` afterwards to pick them up.
   */
  generateSuggestions(
    request: GenerateSuggestionsRequest,
  ): Observable<GenerateSuggestionsResult> {
    return this.bff.post<GenerateSuggestionsResult>(
      `${BASE}/suggestions/generate`,
      request,
    );
  }

  /** POST accept: mints a real ConceptNode/Edge server-side. Returns the suggestion. */
  acceptSuggestion(suggestionId: string): Observable<ConceptSuggestion> {
    return this.bff.post<ConceptSuggestion>(
      `${BASE}/suggestions/${encodeURIComponent(suggestionId)}/accept`,
      {},
    );
  }

  /** POST dismiss: marks the suggestion dismissed. Returns the suggestion. */
  dismissSuggestion(suggestionId: string): Observable<ConceptSuggestion> {
    return this.bff.post<ConceptSuggestion>(
      `${BASE}/suggestions/${encodeURIComponent(suggestionId)}/dismiss`,
      {},
    );
  }
}
