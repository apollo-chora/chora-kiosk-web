import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  provideHttpClientTesting,
  HttpTestingController,
} from '@angular/common/http/testing';

import { GoalService } from './goal.service';
import {
  GoalDTO,
  GoalsResponse,
  kindRequiresTarget,
  mapGoalMutationError,
} from './goal.model';

// KIOSK: the product API is same-origin (ADR-260 D2); production's spec names api.chora.site.
const BASE = '/api/v1/me/goals';

function goalFixture(over: Partial<GoalDTO> = {}): GoalDTO {
  return {
    goalId: 'g1',
    kind: 'curiosity',
    conceptSet: ['fractions'],
    status: 'active',
    northStarNote: 'I want to help my kid with homework',
    createdAt: '2026-06-20T00:00:00Z',
    updatedAt: '2026-06-20T00:00:00Z',
    ...over,
  };
}

describe('GoalService', () => {
  let service: GoalService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(GoalService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  // ── Graceful defaults (lens half of Slice G: never break the dashboard) ──
  it('defaults primaryLens to curiosity and activeGoal to null before load', () => {
    // No HTTP issued: a freshly-injected service is in the loading state.
    expect(service.primaryLens()).toBe('curiosity');
    expect(service.activeGoal()).toBeNull();
    expect(service.goals()).toEqual([]);
  });

  it('load() GETs the goals BFF path and publishes success state', () => {
    service.load();
    const req = http.expectOne((r) => r.url === BASE && r.method === 'GET');
    const body: GoalsResponse = {
      items: [goalFixture()],
      primaryLens: 'credential',
    };
    req.flush(body);
    expect(service.primaryLens()).toBe('credential');
    expect(service.activeGoal()?.goalId).toBe('g1');
    expect(service.goals().length).toBe(1);
  });

  it('threads verified-progress (percent/mastered/total) through load() unchanged', () => {
    // CHO-1921: the BE adds REAL mastery-backed progress to the Goal wire shape.
    // The service passes items through verbatim: assert the new fields survive.
    service.load();
    http.expectOne(BASE).flush({
      items: [
        goalFixture({
          goalId: 'g-prog',
          kind: 'cert',
          choraTargetRef: 'cert:csm',
          progressPercent: 50,
          masteredConcepts: 3,
          totalConcepts: 6,
        }),
      ],
      primaryLens: 'credential',
    } satisfies GoalsResponse);
    const g = service.activeGoal();
    expect(g?.progressPercent).toBe(50);
    expect(g?.masteredConcepts).toBe(3);
    expect(g?.totalConcepts).toBe(6);
  });

  it('activeGoal prefers an active goal over maintenance/achieved', () => {
    service.load();
    http.expectOne(BASE).flush({
      items: [
        goalFixture({ goalId: 'g-ach', status: 'achieved' }),
        goalFixture({ goalId: 'g-act', status: 'active' }),
        goalFixture({ goalId: 'g-mnt', status: 'maintenance' }),
      ],
      primaryLens: 'curiosity',
    } satisfies GoalsResponse);
    expect(service.activeGoal()?.goalId).toBe('g-act');
  });

  it('activeGoal falls back to maintenance then achieved, excludes retired', () => {
    service.load();
    http.expectOne(BASE).flush({
      items: [
        goalFixture({ goalId: 'g-ret', status: 'retired' }),
        goalFixture({ goalId: 'g-ach', status: 'achieved' }),
        goalFixture({ goalId: 'g-mnt', status: 'maintenance' }),
      ],
      primaryLens: 'curiosity',
    } satisfies GoalsResponse);
    expect(service.activeGoal()?.goalId).toBe('g-mnt');
  });

  it('activeGoal is null when every goal is retired', () => {
    service.load();
    http.expectOne(BASE).flush({
      items: [goalFixture({ goalId: 'g-ret', status: 'retired' })],
      primaryLens: 'curiosity',
    } satisfies GoalsResponse);
    expect(service.activeGoal()).toBeNull();
  });

  it('defaults a missing primaryLens to curiosity (defensive)', () => {
    service.load();
    // BE omits primaryLens entirely: must not blow up the dashboard.
    http.expectOne(BASE).flush({ items: [] } as unknown as GoalsResponse);
    expect(service.primaryLens()).toBe('curiosity');
    expect(service.goals()).toEqual([]);
  });

  it('on a 5xx error the state is error but the lens degrades to curiosity', () => {
    service.load();
    http
      .expectOne(BASE)
      .flush('boom', { status: 503, statusText: 'Service Unavailable' });
    const s = service.state();
    expect(s.status).toBe('error');
    if (s.status === 'error') {
      expect(s.error).toBe('aplus.dashboard.goal.error_upstream');
    }
    // Graceful: the dashboard still derives a curiosity layout + no active goal.
    expect(service.primaryLens()).toBe('curiosity');
    expect(service.activeGoal()).toBeNull();
  });

  it('maps a 401/403 GET error to the unauthorised key', () => {
    service.load();
    http
      .expectOne(BASE)
      .flush('no', { status: 403, statusText: 'Forbidden' });
    const s = service.state();
    expect(s.status === 'error' && s.error).toBe(
      'aplus.dashboard.goal.error_unauthorised',
    );
  });

  it('load() is idempotent: a second call refetches', () => {
    service.load();
    http.expectOne(BASE).flush({ items: [], primaryLens: 'curiosity' });
    service.load();
    http.expectOne(BASE).flush({
      items: [goalFixture()],
      primaryLens: 'curiosity',
    });
    expect(service.goals().length).toBe(1);
  });

  // ── Mutations ──────────────────────────────────────────────────────────
  it('create() POSTs the request body and returns the created goal', () => {
    let created: GoalDTO | undefined;
    service
      .create({ kind: 'curiosity', conceptSet: ['fractions'] })
      .subscribe((g) => (created = g));
    const req = http.expectOne((r) => r.url === BASE && r.method === 'POST');
    expect(req.request.body).toEqual({
      kind: 'curiosity',
      conceptSet: ['fractions'],
    });
    req.flush(goalFixture({ goalId: 'g-new' }));
    expect(created?.goalId).toBe('g-new');
  });

  it('create() forwards a credential goal target verbatim', () => {
    service
      .create({ kind: 'cert', choraTargetRef: 'cert:csm' })
      .subscribe();
    const req = http.expectOne((r) => r.url === BASE && r.method === 'POST');
    expect(req.request.body).toEqual({ kind: 'cert', choraTargetRef: 'cert:csm' });
    req.flush(goalFixture({ goalId: 'g-cert', kind: 'cert' }));
  });

  it('update() PATCHes goals/{id} and returns the updated goal', () => {
    let updated: GoalDTO | undefined;
    service
      .update('g1', { status: 'achieved' })
      .subscribe((g) => (updated = g));
    const req = http.expectOne(
      (r) => r.url === `${BASE}/g1` && r.method === 'PATCH',
    );
    expect(req.request.body).toEqual({ status: 'achieved' });
    req.flush(goalFixture({ goalId: 'g1', status: 'achieved' }));
    expect(updated?.status).toBe('achieved');
  });

  it('delete() DELETEs goals/{id} (map soft-delete)', () => {
    let done = false;
    service.delete('g1').subscribe(() => (done = true));
    const req = http.expectOne(
      (r) => r.url === `${BASE}/g1` && r.method === 'DELETE',
    );
    req.flush(null, { status: 204, statusText: 'No Content' });
    expect(done).toBe(true);
  });
});

// ── Pure helpers (no TestBed) ──────────────────────────────────────────────
describe('kindRequiresTarget', () => {
  it('curiosity does NOT require a target', () => {
    expect(kindRequiresTarget('curiosity')).toBe(false);
  });

  it('every credential kind REQUIRES a target', () => {
    for (const k of ['cert', 'course', 'path', 'theme_mastery', 'edge'] as const) {
      expect(kindRequiresTarget(k)).toBe(true);
    }
  });
});

describe('mapGoalMutationError', () => {
  it('maps 422 INVALID_GOAL to invalid_goal', () => {
    expect(mapGoalMutationError({ status: 422 }).kind).toBe('invalid_goal');
  });

  it('maps 400 to invalid_goal', () => {
    expect(mapGoalMutationError({ status: 400 }).kind).toBe('invalid_goal');
  });

  it('maps 502/503 to service_unavailable', () => {
    expect(mapGoalMutationError({ status: 502 }).kind).toBe('service_unavailable');
    expect(mapGoalMutationError({ status: 503 }).kind).toBe('service_unavailable');
  });

  it('maps anything else to unknown', () => {
    const e = mapGoalMutationError({ status: 418, message: 'teapot' });
    expect(e.kind).toBe('unknown');
  });
});

/**
 * The service renamed Familiar to Companion on the wire (chora-consumption
 * 7c8a20bbd, ADR-254 D9): a goal now carries `attachedCompanionId` and a PATCH
 * takes `attachedCompanionId` / `detachCompanion`. The A+ model keeps its own
 * vocabulary, so the translation belongs here at the adapter boundary.
 */
describe('GoalService companion wire contract', () => {
  let service: GoalService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(GoalService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('reads attachedCompanionId from the wire into attachedFamiliarId', () => {
    service.load();
    const req = http.expectOne(BASE);
    req.flush({
      items: [{ ...goalFixture(), attachedCompanionId: 'comp-1' }],
      primaryLens: 'curiosity',
    });
    expect(service.goals()[0].attachedFamiliarId).toBe('comp-1');
  });

  it('sends attachedCompanionId when summoning', () => {
    service.update('g1', { attachedFamiliarId: 'comp-1' }).subscribe();
    const req = http.expectOne(`${BASE}/g1`);
    expect(req.request.body).toEqual({ attachedCompanionId: 'comp-1' });
    req.flush(goalFixture());
  });

  it('sends detachCompanion when dismissing', () => {
    service.update('g1', { detachFamiliar: true }).subscribe();
    const req = http.expectOne(`${BASE}/g1`);
    expect(req.request.body).toEqual({ detachCompanion: true });
    req.flush(goalFixture());
  });

  it('leaves an unrelated patch field untouched', () => {
    service.update('g1', { status: 'achieved' }).subscribe();
    const req = http.expectOne(`${BASE}/g1`);
    expect(req.request.body).toEqual({ status: 'achieved' });
    req.flush(goalFixture());
  });
});
