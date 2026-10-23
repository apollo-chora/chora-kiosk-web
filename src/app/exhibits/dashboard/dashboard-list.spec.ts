import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { KioskLanguage, provideKioskI18n } from '../../i18n/i18n';
import { provideLive } from '../../live/live.providers';
import { DashboardExhibit } from './dashboard-exhibit';
import { DashboardSceneComponent } from './dashboard-scene.component';
import { READS, WATER_MAP, dashManifest } from './dashboard-world.testing';

// The learner's dashboard (mockup SCENES.dash, dashTodayHTML, dashBanksHTML and dashAssessHTML,
// lines 5392, 5567, 5216 and 5241; K55, K79): the three question banks the golden run made, each
// with the published test set it feeds, read from the product by the manifest's ids. The grading
// sample's own bank is not one of them. Before Take the card shows no window and no attempts (Q2 A:
// the assessment, its window and its attempts exist only once the visitor takes it).
describe('DashboardSceneComponent (the banks and the assessment each feeds)', () => {
  let http: HttpTestingController;
  let fixture: ComponentFixture<DashboardSceneComponent>;
  let el: HTMLElement;

  async function settle(): Promise<void> {
    for (let i = 0; i < 6; i++) {
      await Promise.resolve();
      fixture.detectChanges();
    }
  }

  async function shown(failBank?: string, streak: object | null = { current_streak_days: 6 }, mana = 1240): Promise<void> {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting(), ...provideKioskI18n(), ...provideLive()] });
    http = TestBed.inject(HttpTestingController);
    await TestBed.inject(KioskLanguage).ready();
    fixture = TestBed.createComponent(DashboardSceneComponent);
    el = fixture.nativeElement as HTMLElement;
    fixture.detectChanges();
    http.expectOne('/api/v1/kiosk/prewarm/manifest').flush(dashManifest());
    (await vi.waitFor(() => http.expectOne('/api/v1/me/maps/g-water/graph'))).flush(WATER_MAP);
    (await vi.waitFor(() => http.expectOne('/api/me/dashboard'))).flush(streak ? { currentStreakDays: 6, streak } : { currentStreakDays: 0, partial: true, part_errors: { streak: 'UPSTREAM_TIMEOUT' } });
    (await vi.waitFor(() => http.expectOne('/api/v1/me/mana'))).flush({ gcid: 'g', balance_units: mana, lifetime_earned: 1500, lifetime_spent: 260, subsidy_breakdown: [] });
    for (const [b, ts] of [['b-water', 'ts-water'], ['b-nature', 'ts-nature'], ['b-hawker', 'ts-hawker']]) {
      const r = await vi.waitFor(() => http.expectOne(`/api/v1/question-banks/${b}`));
      if (b === failBank) {
        r.flush({ code: 'INTERNAL' }, { status: 500, statusText: 'Server Error' });
        return;
      }
      r.flush(READS[b]);
      (await vi.waitFor(() => http.expectOne(`/api/v1/test-sets/${ts}`))).flush(READS[ts]);
    }
    await vi.waitFor(() => expect(TestBed.inject(DashboardExhibit).status()).toBe('ready'));
    await settle();
  }

  afterEach(() => TestBed.inject(DashboardExhibit).forget());

  const text = (sel: string) => el.querySelector(sel)?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
  const texts = (sel: string) => Array.from(el.querySelectorAll(sel)).map((n) => n.textContent?.replace(/\s+/g, ' ').trim() ?? '');
  const click = async (sel: string) => {
    (el.querySelector(sel) as HTMLElement).click();
    await settle();
  };

  describe('K173: the tour’s beats', () => {
    it('D1: the dashboard with no bank picked, whatever bank a free click picked', async () => {
      await shown();
      await click('.db-bank[data-id="bank.nature"]');
      await TestBed.inject(DashboardExhibit).tourShow(null);
      await settle();
      expect(TestBed.inject(DashboardExhibit).picked()).toBeNull();
      expect(text('.db-assess .db-empty')).toBe('Pick a question bank on the left to see the assessment it feeds.');
    });

    it('D2: the water bank’s questions, shown and never sat (no assessment is created)', async () => {
      await shown();
      await TestBed.inject(DashboardExhibit).tourShow('bank.water');
      await settle();
      expect(TestBed.inject(DashboardExhibit).picked()?.key).toBe('bank.water');
      expect(TestBed.inject(DashboardExhibit).mode()).toBe('list');
      expect(el.querySelectorAll('.db-assess .db-qs .db-q').length).toBe(3);
      http.expectNone((r) => r.method === 'POST');
    });
  });

  it('lists the three learner banks by their reads, never the grading sample’s bank, and the goal from its map', async () => {
    await shown();
    expect(text('.ex-head h2')).toBe('A learner’s dashboard');
    expect(texts('.db-today .db-stat .lbl')).toEqual(['Goal', 'Streak', 'Mana']);
    expect(texts('.db-today .db-stat .val')).toEqual(['Singapore’s water', '6 days', '1,240']);
    // W43 (K172): one plain line under the balance names what spends mana here (the two debits the ledger verified).
    expect(text('.db-today .db-stat .db-mana-note')).toBe('In this demo, a LIVE press for fresh ideas spends 100 and “Keep and continue” in step 4 spends 20.');
    expect(text('.db-today .db-active')).toBe('Active');
    expect(texts('.db-bank b')).toEqual(['Singapore’s water', 'City in Nature', 'Hawker culture']);
    expect(texts('.db-bank .meta')).toEqual(['3 questions · feeds 1 assessment', '3 questions · feeds 1 assessment', '3 questions · feeds 1 assessment']);
    expect(texts('.db-bank .tag')).toEqual(['Holds the step 4 question']);
    expect(el.querySelector('.db-bank[data-id="bank.water"]')?.classList.contains('db-hint')).toBe(true);
    http.expectNone('/api/v1/question-banks/b-grade');
    expect(text('.db-assess .db-empty')).toBe('Pick a question bank on the left to see the assessment it feeds.');
    expect(el.querySelectorAll('.db-flow span.on').length).toBe(0);
  });

  it('the water bank’s card: its test set’s title, counts and points, each question with its source, and no window or attempts before Take', async () => {
    await shown();
    await click('.db-bank[data-id="bank.water"]');
    expect(el.querySelector('.db-bank[data-id="bank.water"]')?.getAttribute('aria-pressed')).toBe('true');
    expect(el.querySelectorAll('.db-flow span.on').length).toBe(3);
    expect(text('.db-assess .db-chip')).toBe('Not started');
    expect(text('.db-assess .db-title h3')).toBe('Water for Life: Unit 1 quiz');
    expect(texts('.db-meta dt')).toEqual(['Questions', 'Total points']);
    expect(texts('.db-meta dd')).toEqual(['3', '30']);
    expect(texts('.db-q .stem')).toEqual(['What is NEWater?', 'Which stage removes the finest particles?', 'Why does Singapore need four taps?']);
    expect(texts('.db-q .tags span:first-child')).toEqual(['Multiple choice', 'Multiple choice', 'Open-ended']);
    expect(texts('.db-q .tags span:last-child')).toEqual([
      'Drafted by the writer AI, kept by a teacher',
      'Prepared 20 Oct, 13:58 from the AI draft',
      'The question in “Get an answer graded”',
    ]);
    expect(el.querySelectorAll('.db-q .tags kiosk-prepared-info button[data-act="preparedInfo"]')).toHaveLength(1);
    // K159 (W27): which banks hold pictures, from the accepts and copies that made their questions.
    expect(TestBed.inject(DashboardExhibit).banks().map((b) => [b.key, b.pictures])).toEqual([
      ['bank.water', true],
      ['bank.nature', false],
      ['bank.hawker', true],
    ]);
    expect(texts('.db-q .pts')).toEqual(['10 pts', '10 pts', '10 pts']);
    expect(text('.db-act [data-act="dbxTake"]')).toBe('Take this assessment');
    expect(text('.db-act .stamp')).toBe('In Chora, your instructor invites you; here you can take it straight away.');
    expect(el.textContent).not.toMatch(/Two|is_correct|Why What/);
  });

  it('City in Nature and Hawker culture: three multiple-choice questions, each drafted by the writer AI (K79)', async () => {
    await shown();
    await click('.db-bank[data-id="bank.nature"]');
    expect(text('.db-assess .db-title h3')).toBe('Nature Ranger: Unit 1 quiz');
    expect(texts('.db-q .tags span:first-child')).toEqual(['Multiple choice', 'Multiple choice', 'Multiple choice']);
    expect(new Set(texts('.db-q .tags span:last-child'))).toEqual(new Set(['Drafted by the writer AI, kept by a teacher']));
    await click('.db-bank[data-id="bank.hawker"]');
    expect(text('.db-assess .db-title h3')).toBe('Food Heritage: Unit 1 quiz');
  });

  it('a streak the dashboard could not read shows no streak tile, never a 0, and says so (K131)', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await shown(undefined, null);
    expect(texts('.db-today .db-stat .lbl')).toEqual(['Goal', 'Mana']);
    expect(error).toHaveBeenCalledWith(expect.stringContaining('UPSTREAM_TIMEOUT'));
    error.mockRestore();
  });

  it('a wallet with nothing in it shows 0 mana (a missing wallet reads as zeros, not as an error)', async () => {
    await shown(undefined, { current_streak_days: 0 }, 0);
    expect(texts('.db-today .db-stat .val')).toEqual(['Singapore’s water', '0 days', '0']);
  });

  it('a bank that cannot be read fails the dashboard loudly, never a shorter list', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await shown('b-nature');
    await vi.waitFor(() => expect(TestBed.inject(DashboardExhibit).status()).toBe('failed'));
    await settle();
    expect(el.querySelector('.db-bank')).toBeNull();
    expect(text('.msg-error')).not.toBe('');
    expect(error).toHaveBeenCalledWith(expect.stringContaining('/api/v1/question-banks/b-nature'));
    error.mockRestore();
  });
});
