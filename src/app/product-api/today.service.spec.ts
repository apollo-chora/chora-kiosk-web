import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { TodayService } from './today.service';

// The dashboard's today strip (K131), on the two reads D8 opened at the edge (07083b1d2, GET only):
// production's composed GET /api/me/dashboard for the streak (its streak object is ABSENT when the
// streak part failed: unknown, never 0) and GET /api/v1/me/mana for the balance (identity's body).
describe('TodayService', () => {
  let svc: TodayService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    svc = TestBed.inject(TodayService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('reads the streak from the dashboard’s streak object, not its flattened count', async () => {
    const p = svc.streakDays();
    http.expectOne('/api/me/dashboard').flush({ currentStreakDays: 99, streak: { current_streak_days: 6, last_completion_at: '2026-10-29T01:00:00Z' }, partial: false });
    expect(await p).toBe(6);
  });

  it('a dashboard whose streak part failed reads as unknown (null), never 0, and names the failure', async () => {
    const p = svc.streakDays();
    http.expectOne('/api/me/dashboard').flush({ currentStreakDays: 0, partial: true, part_errors: { streak: 'UPSTREAM_TIMEOUT' } });
    await expect(p).rejects.toThrow(/streak.*UPSTREAM_TIMEOUT/);
  });

  it('reads the mana balance', async () => {
    const p = svc.manaBalance();
    http.expectOne('/api/v1/me/mana').flush({ gcid: 'g', balance_units: 1240, lifetime_earned: 2000, lifetime_spent: 760, subsidy_breakdown: [] });
    expect(await p).toBe(1240);
  });

  it('a balance that is not a number is an error, never a 0', async () => {
    const p = svc.manaBalance();
    http.expectOne('/api/v1/me/mana').flush({ gcid: 'g' });
    await expect(p).rejects.toThrow(/balance_units/);
  });
});
