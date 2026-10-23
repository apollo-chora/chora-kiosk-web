import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  provideHttpClientTesting,
  HttpTestingController,
} from '@angular/common/http/testing';

import { environment } from '../../../environments/environment';
import { MapsService } from './maps.service';
import type { MapCard } from './maps.model';

const BFF = environment.bffBaseUrl;
const MAPS = `${BFF}/api/v1/me/maps`;
const CONCEPTS = `${BFF}/api/v1/me/concept-graph/concepts`;
const GOALS = `${BFF}/api/v1/me/goals`;

function makeCard(over: Partial<MapCard> = {}): MapCard {
  return {
    goalId: 'goal-1',
    title: 'Scrum',
    northStarNote: 'Agile & teams',
    rootConceptId: 'c-1',
    kind: 'curiosity',
    status: 'active',
    conceptCount: 12,
    shakyCount: 3,
    masteredCount: 2,
    createdAt: '2026-07-01T00:00:00Z',
    updatedAt: '2026-07-02T00:00:00Z',
    ...over,
  };
}

describe('MapsService', () => {
  let service: MapsService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(MapsService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('loads the atlas and exposes maps on success', () => {
    service.load();
    const req = httpMock.expectOne(MAPS);
    expect(req.request.method).toBe('GET');
    req.flush({ items: [makeCard(), makeCard({ goalId: 'goal-2' })] });

    expect(service.state().status).toBe('success');
    expect(service.maps()).toHaveLength(2);
    expect(service.maps()[0].goalId).toBe('goal-1');
  });

  it('loads un-projected fog clusters as legacy cards (ADR-223)', () => {
    service.loadLegacyClusters();
    const req = httpMock.expectOne(`${BFF}/api/v1/me/knowledge-graph/clusters`);
    expect(req.request.method).toBe('GET');
    req.flush({ data: { clusters: [{ clusterId: 'k-1', seedTopic: 'agile' }] } });
    expect(service.legacyClusters()).toHaveLength(1);
    expect(service.legacyClusters()[0].clusterId).toBe('k-1');
    expect(service.legacyClusters()[0].seedTopic).toBe('agile');
  });

  it('leaves legacy clusters empty when the clusters read fails (fail-soft)', () => {
    service.loadLegacyClusters();
    httpMock
      .expectOne(`${BFF}/api/v1/me/knowledge-graph/clusters`)
      .flush('boom', { status: 500, statusText: 'err' });
    expect(service.legacyClusters()).toHaveLength(0);
  });

  it('convertCluster POSTs convert and resolves the new goalId', () => {
    let goalId = '';
    service.convertCluster('k-9').subscribe((id) => (goalId = id));
    const req = httpMock.expectOne(
      `${BFF}/api/v1/me/knowledge-graph/clusters/k-9/convert`,
    );
    expect(req.request.method).toBe('POST');
    req.flush({ data: { goalId: 'goal-42' } });
    expect(goalId).toBe('goal-42');
  });

  it('treats a missing items array as an empty atlas', () => {
    service.load();
    httpMock.expectOne(MAPS).flush({});
    expect(service.state().status).toBe('success');
    expect(service.maps()).toEqual([]);
  });

  it('fails loud with an i18n error key on a load error', () => {
    service.load();
    httpMock
      .expectOne(MAPS)
      .flush('boom', { status: 500, statusText: 'Server Error' });

    const s = service.state();
    expect(s.status).toBe('error');
    if (s.status === 'error') {
      expect(s.errorKey).toBe('aplus.knowledge.error');
    }
    expect(service.maps()).toEqual([]);
  });

  it('createMap chains create-concept → create-goal carrying the root concept id', () => {
    const emitted: string[] = [];
    service
      .createMap('Photosynthesis')
      .subscribe((goal) => emitted.push(goal.goalId));

    // 1. mint the root concept
    const conceptReq = httpMock.expectOne(CONCEPTS);
    expect(conceptReq.request.method).toBe('POST');
    expect(conceptReq.request.body).toEqual({ title: 'Photosynthesis' });
    conceptReq.flush({
      conceptId: 'concept-99',
      title: 'Photosynthesis',
      atomRefs: [],
      provenance: 'learner_authored',
      createdAt: '2026-07-02T00:00:00Z',
    });

    // 2. create the curiosity goal rooted on the freshly-minted concept
    const goalReq = httpMock.expectOne(GOALS);
    expect(goalReq.request.method).toBe('POST');
    expect(goalReq.request.body).toEqual({
      kind: 'curiosity',
      rootConceptId: 'concept-99',
      northStarNote: 'Photosynthesis',
    });
    goalReq.flush({
      goalId: 'goal-9',
      kind: 'curiosity',
      conceptSet: [],
      status: 'active',
      northStarNote: 'Photosynthesis',
      createdAt: '2026-07-02T00:00:00Z',
      updatedAt: '2026-07-02T00:00:00Z',
    });

    expect(emitted).toEqual(['goal-9']);
  });

  it('does not fire the goal request when concept creation fails', () => {
    let errored = false;
    service.createMap('Broken').subscribe({ error: () => (errored = true) });
    httpMock
      .expectOne(CONCEPTS)
      .flush('nope', { status: 500, statusText: 'Server Error' });
    httpMock.expectNone(GOALS);
    expect(errored).toBe(true);
  });

  it('getGraph GETs the per-map graph endpoint', () => {
    service.getGraph('goal-1').subscribe();
    const req = httpMock.expectOne(`${MAPS}/goal-1/graph`);
    expect(req.request.method).toBe('GET');
    req.flush({ concepts: [], edges: [] });
  });

  it('deleteMap DELETEs the goal (a map is a Goal: /me/goals/{id})', () => {
    let done = false;
    service.deleteMap('goal-7').subscribe(() => (done = true));
    const req = httpMock.expectOne(
      (r) => r.url === `${GOALS}/goal-7` && r.method === 'DELETE',
    );
    req.flush(null, { status: 204, statusText: 'No Content' });
    expect(done).toBe(true);
  });

  // ── listMaps (CHO-2034): one-shot Atlas fetch as a raw Observable (used by
  // the marketplace free-claim lane to resolve a target map). Distinct from
  // load(), which publishes to the state signal. ──

  it('listMaps GETs the atlas and resolves the raw MapCard[] without touching the state signal', () => {
    let captured: unknown = null;
    service.listMaps().subscribe((m) => (captured = m));
    const req = httpMock.expectOne(MAPS);
    expect(req.request.method).toBe('GET');
    req.flush({ items: [makeCard(), makeCard({ goalId: 'goal-2' })] });
    const list = captured as readonly MapCard[];
    expect(list).toHaveLength(2);
    expect(list[0].goalId).toBe('goal-1');
    // one-shot: it must NOT publish success into the state signal (stays initial).
    expect(service.state().status).toBe('loading');
  });

  it('listMaps treats a missing items array as an empty list', () => {
    let captured: unknown = null;
    service.listMaps().subscribe((m) => (captured = m));
    httpMock.expectOne(MAPS).flush({});
    expect(captured).toEqual([]);
  });
});

/**
 * chora-consumption renamed Familiar to Companion on the wire (7c8a20bbd,
 * ADR-254 D9): the map read now carries `attachedCompanionId` and
 * `attachedCompanionName`. The canvas keeps its own vocabulary, so the
 * translation belongs here at the adapter boundary. Without it the campaign HUD
 * cannot name the marcher and the Companion gate never opens.
 */
describe('MapsService companion wire contract', () => {
  let service: MapsService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(MapsService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('getGraph reads the companion id and name off the wire', () => {
    let graph: { attachedFamiliarId?: string; attachedFamiliarName?: string } | undefined;
    service.getGraph('goal-1').subscribe((g) => (graph = g));
    httpMock.expectOne(`${MAPS}/goal-1/graph`).flush({
      goalId: 'goal-1',
      title: 'Software Design',
      rootConceptId: 'c-1',
      attachedCompanionId: 'comp-1',
      attachedCompanionName: 'Vesper',
      concepts: [],
      edges: [],
    });

    expect(graph?.attachedFamiliarId).toBe('comp-1');
    expect(graph?.attachedFamiliarName).toBe('Vesper');
  });

  it('the atlas list reads the companion id off the wire', () => {
    service.load();
    httpMock
      .expectOne(MAPS)
      .flush({ items: [{ ...makeCard(), attachedCompanionId: 'comp-1' }] });

    expect(service.maps()[0].attachedFamiliarId).toBe('comp-1');
  });
});
