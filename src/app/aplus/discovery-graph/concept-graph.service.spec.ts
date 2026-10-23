import { firstValueFrom } from 'rxjs';
import { TestBed } from '@angular/core/testing';
import {
  provideHttpClientTesting,
  HttpTestingController,
} from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';

import { environment } from '../../../environments/environment';
import { ConceptGraphService } from './concept-graph.service';
import type { ConceptGraph } from './concept-graph.model';

const BFF = environment.bffBaseUrl;
const BASE = `${BFF}/api/v1/me/concept-graph`;

describe('ConceptGraphService', () => {
  let service: ConceptGraphService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(ConceptGraphService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('getGraph GETs the concept-graph and emits it', async () => {
    const graph: ConceptGraph = {
      concepts: [{ conceptId: 'c1', title: 'Fractions', atomRefs: ['a1'] }],
      edges: [
        {
          edgeId: 'e1',
          sourceConceptId: 'c1',
          targetConceptId: 'c2',
          class: 'hierarchy',
          provenance: 'learner_authored',
        },
      ],
    };
    const promise = firstValueFrom(service.getGraph());

    const req = httpMock.expectOne(BASE);
    expect(req.request.method).toBe('GET');
    req.flush(graph);

    expect(await promise).toEqual(graph);
  });

  it('getGraph fails loud: the HTTP error propagates to the subscriber', async () => {
    const promise = firstValueFrom(service.getGraph());
    httpMock.expectOne(BASE).flush('boom', {
      status: 500,
      statusText: 'Server Error',
    });
    await expect(promise).rejects.toBeTruthy();
  });

  it('createConcept POSTs the body and returns the concept DTO', async () => {
    const promise = firstValueFrom(
      service.createConcept({ title: 'Ratios', atomRefs: ['a1', 'a2'] }),
    );

    const req = httpMock.expectOne(`${BASE}/concepts`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ title: 'Ratios', atomRefs: ['a1', 'a2'] });
    req.flush({
      conceptId: 'c9',
      title: 'Ratios',
      atomRefs: ['a1', 'a2'],
      provenance: 'learner_authored',
      createdAt: '2026-07-01T00:00:00Z',
    });

    expect((await promise).conceptId).toBe('c9');
  });

  it('patchConcept PATCHes the encoded concept id with the delta body', async () => {
    const promise = firstValueFrom(
      service.patchConcept('c 9', { addAtomRefs: ['a3'] }),
    );

    const req = httpMock.expectOne(`${BASE}/concepts/c%209`);
    expect(req.request.method).toBe('PATCH');
    expect(req.request.body).toEqual({ addAtomRefs: ['a3'] });
    req.flush({
      conceptId: 'c 9',
      title: 'Ratios',
      atomRefs: ['a1', 'a3'],
      provenance: 'learner_authored',
      createdAt: '2026-07-01T00:00:00Z',
    });

    expect((await promise).atomRefs).toContain('a3');
  });

  it('deleteConcept DELETEs the encoded concept id', async () => {
    const promise = firstValueFrom(service.deleteConcept('c1'));

    const req = httpMock.expectOne(`${BASE}/concepts/c1`);
    expect(req.request.method).toBe('DELETE');
    req.flush(null);

    await promise;
  });

  it('createEdge POSTs the edge body and returns the edge DTO', async () => {
    const promise = firstValueFrom(
      service.createEdge({
        sourceConceptId: 'c1',
        targetConceptId: 'c2',
        class: 'hierarchy',
      }),
    );

    const req = httpMock.expectOne(`${BASE}/edges`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({
      sourceConceptId: 'c1',
      targetConceptId: 'c2',
      class: 'hierarchy',
    });
    req.flush({
      edgeId: 'e5',
      sourceConceptId: 'c1',
      targetConceptId: 'c2',
      class: 'hierarchy',
      provenance: 'learner_authored',
    });

    expect((await promise).edgeId).toBe('e5');
  });

  it('deleteEdge DELETEs the encoded edge id', async () => {
    const promise = firstValueFrom(service.deleteEdge('e5'));

    const req = httpMock.expectOne(`${BASE}/edges/e5`);
    expect(req.request.method).toBe('DELETE');
    req.flush(null);

    await promise;
  });

  it('reroot POSTs the new root id and returns the flip summary', async () => {
    const promise = firstValueFrom(service.reroot({ newRootId: 'c2' }));

    const req = httpMock.expectOne(`${BASE}/reroot`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ newRootId: 'c2' });
    req.flush({ newRootId: 'c2', changed: true, edgesFlipped: 3 });

    const result = await promise;
    expect(result.changed).toBe(true);
    expect(result.edgesFlipped).toBe(3);
  });

  // ── Familiar suggestions (ADR-212 WS-4) ────────────────────────────

  it('getSuggestions GETs the pending suggestions list', async () => {
    const promise = firstValueFrom(service.getSuggestions());

    const req = httpMock.expectOne(`${BASE}/suggestions`);
    expect(req.request.method).toBe('GET');
    req.flush({
      suggestions: [
        {
          suggestionId: 's1',
          kind: 'concept',
          status: 'pending',
          title: 'Prime Numbers',
          rationale: 'Sits beside Fractions',
        },
      ],
    });

    expect((await promise).suggestions).toHaveLength(1);
  });

  it('scopes the suggestions GET to the goal map and focal (bug #19)', () => {
    service.getSuggestions('focal-1', 'goal-scrum').subscribe();

    const req = httpMock.expectOne(
      (r) =>
        r.url === `${BASE}/suggestions` &&
        r.params.get('goalId') === 'goal-scrum' &&
        r.params.get('focalConceptId') === 'focal-1',
    );
    expect(req.request.method).toBe('GET');
    req.flush({ suggestions: [] });
  });

  it('generateSuggestions POSTs the request and returns the 202 handle', async () => {
    const promise = firstValueFrom(
      service.generateSuggestions({ focalConceptId: 'c1', goalId: 'goal-1' }),
    );

    const req = httpMock.expectOne(`${BASE}/suggestions/generate`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ focalConceptId: 'c1', goalId: 'goal-1' });
    req.flush({ status: 'requested', requestId: 'r1', focalConceptId: 'c1' });

    expect((await promise).status).toBe('requested');
  });

  it('acceptSuggestion POSTs to the encoded accept path', async () => {
    const promise = firstValueFrom(service.acceptSuggestion('s 1'));

    const req = httpMock.expectOne(`${BASE}/suggestions/s%201/accept`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({});
    req.flush({ suggestionId: 's 1', kind: 'concept', status: 'accepted' });

    expect((await promise).status).toBe('accepted');
  });

  it('dismissSuggestion POSTs to the encoded dismiss path', async () => {
    const promise = firstValueFrom(service.dismissSuggestion('s2'));

    const req = httpMock.expectOne(`${BASE}/suggestions/s2/dismiss`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({});
    req.flush({ suggestionId: 's2', kind: 'edge', status: 'dismissed' });

    expect((await promise).status).toBe('dismissed');
  });
});
