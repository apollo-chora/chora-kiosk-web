import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { CompanionsService } from './companions.service';

// A Companion's growth (K38, K102): GET /api/v1/me/companions/{id}/growth, which the gateway's
// companion bridge serves from consumption with its keys camelCased and wrapped in {data}
// (companionbridge.go GetCompanionGrowth, classifyWithEnvelope; companion_growth_handlers.go).
describe('CompanionsService', () => {
  let svc: CompanionsService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    svc = TestBed.inject(CompanionsService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  const GROWTH = {
    companionId: 'c-pingu',
    growthStage: 1,
    stageName: 'Hatchling',
    displayName: 'Pingu',
    species: 'penguin',
    shinyVariant: false,
    expCurrent: 32,
    expNextThreshold: 50,
    expCumulative: 32,
    effectiveLlmTier: 'flash-lite',
    effectiveMaxOutputTokens: 1024,
    unlockedTools: ['concept_lookup'],
    ahaMomentConsumed: false,
    lastStageUpAt: null,
  };

  it('reads a Companion’s growth through the bridge’s {data} envelope', async () => {
    const p = svc.growth('c-pingu');
    const req = http.expectOne('/api/v1/me/companions/c-pingu/growth');
    expect(req.request.method).toBe('GET');
    req.flush({ data: GROWTH });
    const g = await p;
    expect([g.growthStage, g.species, g.expCumulative, g.unlockedTools]).toEqual([1, 'penguin', 32, ['concept_lookup']]);
  });

  it('a refused read is a loud error naming the call', async () => {
    const p = svc.growth('c-x');
    http.expectOne('/api/v1/me/companions/c-x/growth').flush({ error: { code: 'COMPANION_NOT_FOUND', message: 'no such companion' } }, { status: 404, statusText: 'Not Found' });
    await expect(p).rejects.toThrow(/GET \/api\/v1\/me\/companions\/c-x\/growth/);
  });

  it('a body without its envelope is an error, never read as a Companion', async () => {
    const p = svc.growth('c-pingu');
    http.expectOne('/api/v1/me/companions/c-pingu/growth').flush(GROWTH);
    await expect(p).rejects.toThrow(/no \{data\} envelope/);
  });

  // The EXP ledger, newest first (companion_growth_handlers.go eventRecordResp; the bridge's
  // ListGrowthEvents camelCases it and wraps it in {data}): each credit with its source.
  it('reads the growth events through the {data} envelope, in the wire spelling production normalises', async () => {
    const p = svc.growthEvents('c-pingu');
    const req = http.expectOne('/api/v1/me/companions/c-pingu/growth-events');
    expect(req.request.method).toBe('GET');
    req.flush({
      data: {
        events: [
          { growthEventId: 'ev-2', source: 'campaign_node_won', expDelta: 25, expTotalAfter: 65, dailyCapHit: false, triggeredStageUp: true, stageBefore: 1, stageAfter: 2, awardedAt: '2026-10-30T02:05:01Z' },
          { growthEventId: 'ev-1', source: 'campaign_rung_cleared', expDelta: 8, expTotalAfter: 40, dailyCapHit: false, triggeredStageUp: false, stageBefore: 1, stageAfter: 1, awardedAt: '2026-10-30T02:05:00Z' },
        ],
      },
    });
    const page = await p;
    expect(page.events.map((e) => [e.eventId, e.source, e.expDelta, e.expCumulativeAfter, e.stageAfter])).toEqual([
      ['ev-2', 'campaign_node_won', 25, 65, 2],
      ['ev-1', 'campaign_rung_cleared', 8, 40, 1],
    ]);
  });

  it('growth events without their envelope are an error', async () => {
    const p = svc.growthEvents('c-pingu');
    http.expectOne('/api/v1/me/companions/c-pingu/growth-events').flush({ events: [] });
    await expect(p).rejects.toThrow(/no \{data\} envelope/);
  });

  it('a refused events read is a loud error naming the call', async () => {
    const p = svc.growthEvents('c-x');
    http.expectOne('/api/v1/me/companions/c-x/growth-events').flush({ error: { code: 'INTERNAL' } }, { status: 500, statusText: 'Server Error' });
    await expect(p).rejects.toThrow(/GET \/api\/v1\/me\/companions\/c-x\/growth-events/);
  });

  // The loadout (companion_skill_grant_handler.go loadoutResp): UNWRAPPED, like production's
  // getLoadout; its slots and the grants that woke at a stage are the stage-up's reveals.
  it('reads the loadout unwrapped, keyed by the Companion', async () => {
    const p = svc.loadout('c-pingu');
    const req = http.expectOne('/api/v1/me/companions/c-pingu/skills');
    expect(req.request.method).toBe('GET');
    req.flush({
      companionId: 'c-pingu',
      skillGrants: ['progress_mirror', 'explain_anew'],
      equippedSkills: [],
      grants: [
        { skillKey: 'progress_mirror', skillKind: 'craft', slotCost: 0, equipped: true, unlockedVia: 'species_path', unlockedAtStage: 1, catalogueActive: true },
        { skillKey: 'explain_anew', skillKind: 'active', slotCost: 1, equipped: false, unlockedVia: 'species_path', unlockedAtStage: 2, catalogueActive: true },
      ],
      skillSlotsUnlocked: 3,
      slotsUsed: 0,
      evolutionTier: 'flash-lite',
      growthStage: 2,
    });
    const l = await p;
    expect([l.familiarId, l.skillSlotsUnlocked, l.grants.map((g) => [g.skillKey, g.unlockedAtStage])]).toEqual(['c-pingu', 3, [['progress_mirror', 1], ['explain_anew', 2]]]);
  });

  it('a loadout with no slots count is an error, never a sheet of zero slots', async () => {
    const p = svc.loadout('c-pingu');
    http.expectOne('/api/v1/me/companions/c-pingu/skills').flush({ companionId: 'c-pingu', grants: [] });
    await expect(p).rejects.toThrow(/skillSlotsUnlocked/);
  });

  it('a refused loadout read is a loud error naming the call', async () => {
    const p = svc.loadout('c-x');
    http.expectOne('/api/v1/me/companions/c-x/skills').flush({ error: { code: 'COMPANION_NOT_FOUND' } }, { status: 404, statusText: 'Not Found' });
    await expect(p).rejects.toThrow(/GET \/api\/v1\/me\/companions\/c-x\/skills/);
  });
});
