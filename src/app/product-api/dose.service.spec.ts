import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { DOSE_WIRE } from '../exhibits/companions/companions-world.testing';
import { DoseService } from './dose.service';

// A goal's daily dose (K127, T2.18): GET /api/companion/daily-dose?goal_id=, ALWAYS scoped to the
// Companion's goal. The gateway forwards consumption's body as it is (phyllis.go GetDailyDose,
// classify): the FE atoms[] in the read's order, and the legacy entries[] whose dose_reason says why
// each card is there (companion_handlers.go composeFEAtoms builds atoms[i] from entries[i]).
describe('DoseService', () => {
  let svc: DoseService;
  let http: HttpTestingController;
  const URL = '/api/companion/daily-dose';

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    svc = TestBed.inject(DoseService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('opens the goal’s dose and keeps the read’s order, each card with its reason', async () => {
    const p = svc.open('g-water');
    const req = http.expectOne((r) => r.url === URL);
    expect([req.request.method, req.request.params.get('goal_id'), req.request.params.keys()]).toEqual(['GET', 'g-water', ['goal_id']]);
    req.flush(DOSE_WIRE);
    const d = await p;
    expect(d.cards.map((c) => [c.atomId, c.category, c.reason, c.xp])).toEqual([
      ['a-camp1', 'new', 'campaign', 30],
      ['a-camp2', 'new', 'campaign', 30],
      ['a-rev', 'review', 'ebbinghaus_review', 20],
      ['a-str', 'stretch', 'weakness', 50],
      ['a-new', 'new', 'fresh', 30],
    ]);
    expect([d.doseId, d.servedOn, d.totalXp, d.composition]).toEqual(['dose-1', '2026-10-30', 160, { reviewPercent: 20, newPercent: 60, stretchPercent: 20 }]);
    expect(d.cards[0]).toMatchObject({ title: 'A reservoir in the city centre', topic: 'Reservoirs' });
    // F17: nothing of the legacy in-memory Companion (name, quote, templated greeting) is kept.
    expect(JSON.stringify(d)).not.toMatch(/Eira/);
  });

  it('never opens an unscoped dose (T2.18)', async () => {
    await expect(svc.open('')).rejects.toThrow(/goal/);
    await expect(svc.open('  ')).rejects.toThrow(/goal/);
    http.expectNone((r) => r.url === URL);
  });

  it('cards and reasons that disagree are a loud error, never a guessed pairing', async () => {
    const p = svc.open('g-water');
    http.expectOne((r) => r.url === URL).flush({ ...DOSE_WIRE, entries: [...DOSE_WIRE.entries].reverse() });
    await expect(p).rejects.toThrow(/a-new.*a-camp1|card 1/);
  });

  it('a dose with no cards is an error', async () => {
    const p = svc.open('g-water');
    http.expectOne((r) => r.url === URL).flush({ ...DOSE_WIRE, atoms: [], entries: [] });
    await expect(p).rejects.toThrow(/no cards/);
  });

  it('a refused read is a loud error naming the call', async () => {
    const p = svc.open('g-x');
    http.expectOne((r) => r.url === URL).flush({ code: 'INTERNAL' }, { status: 500, statusText: 'Server Error' });
    await expect(p).rejects.toThrow(/GET \/api\/companion\/daily-dose\?goal_id=g-x/);
  });
});
