import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { KioskLanguage, provideKioskI18n } from '../../i18n/i18n';
import { provideLive } from '../../live/live.providers';
import { LiveService } from '../../live/live.service';
import { CompanionsExhibit, GROWTH_POLL_MS, GROWTH_POLL_TRIES } from './companions-exhibit';
import { CompanionsSceneComponent } from './companions-scene.component';
import { ATOM_BODIES, DOSE_WIRE, GROWTH, IDS, MAPS, atomRead, doseManifest, events, growth, growthEvent, waterOnLastRung } from './companions-world.testing';
import { VisitTally } from '../../shared/visit-tally';
import { OrderSource } from '../../shared/visit-order.testing';

// The dose's quick check (mockup cxqPanelHTML and cxqAnswer, lines 3196 and 3288): Play on a card
// that is not a campaign card opens its quiz from the atom read's question; an answer is
// production's attempt (start, then submit), graded by rule on the server, which answers only
// is_correct (F17). The answer credits the ACTIVE Companion through Pub/Sub (atom_session: 3 EXP
// right, 1 wrong), which is not always the dose's own (K102): the ledgers say which, and the quiz
// names it. No learner XP is credited by an answer, so none is claimed.
describe('CompanionsSceneComponent (the dose’s quick check, K102)', () => {
  let http: HttpTestingController;
  let fixture: ComponentFixture<CompanionsSceneComponent>;
  let el: HTMLElement;
  const exhibit = () => TestBed.inject(CompanionsExhibit);
  const ROSTER = [IDS.pingu, IDS.nova, IDS.ember];
  /** Pingu's total once the visit's first dose open is credited (32 + 2, W37). */
  const OPENED = GROWTH[IDS.pingu].data.expCumulative + 2;

  async function settle(): Promise<void> {
    for (let i = 0; i < 6; i++) {
      await Promise.resolve();
      fixture.detectChanges();
    }
  }

  const order = new OrderSource();

  beforeEach(async () => {
    order.keep();
    TestBed.configureTestingModule({ providers: [...order.providers, provideHttpClient(), provideHttpClientTesting(), ...provideKioskI18n(), ...provideLive()] });
    http = TestBed.inject(HttpTestingController);
    await TestBed.inject(KioskLanguage).ready();
    fixture = TestBed.createComponent(CompanionsSceneComponent);
    el = fixture.nativeElement as HTMLElement;
    fixture.detectChanges();
    http.expectOne('/api/v1/kiosk/prewarm/manifest').flush(doseManifest());
    const maps = { ...MAPS, [IDS.water]: waterOnLastRung() };
    for (const goal of [IDS.water, IDS.nature, IDS.hawker]) await vi.waitFor(() => http.expectOne(`/api/v1/me/maps/${goal}/graph`).flush(maps[goal]));
    for (const c of ROSTER) await vi.waitFor(() => http.expectOne(`/api/v1/me/companions/${c}/growth`).flush(GROWTH[c]));
    await vi.waitFor(() => expect(exhibit().status()).toBe('ready'));
    await settle();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    exhibit().forget();
    TestBed.inject(LiveService).endSession();
  });

  const text = (sel: string) => el.querySelector(sel)?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
  const click = async (sel: string, i = 0) => {
    (el.querySelectorAll(sel)[i] as HTMLElement).click();
    await settle();
  };

  /** The picked Companion's dose opened, then stepped to card `index` and its Play pressed. */
  async function playCard(index: number, goal: string = IDS.water, companion: string = IDS.pingu, turn = 'turn-pingu'): Promise<void> {
    await click('[data-act="ability"][data-ab="dose"]');
    (await vi.waitFor(() => http.expectOne((r) => r.url === '/api/companion/daily-dose' && r.params.get('goal_id') === goal))).flush(DOSE_WIRE);
    for (const c of DOSE_WIRE.atoms) (await vi.waitFor(() => http.expectOne(`/api/atoms/${c.atomId}`))).flush(atomRead(c.atomId, c.title, ATOM_BODIES[c.atomId]));
    (await vi.waitFor(() => http.expectOne('/api/companion/greeting'))).flush({ companion_id: companion, turn_id: turn, greeting: 'Hello!', model: 'm', replayed: true });
    await vi.waitFor(() => expect(exhibit().dose()?.state).toBe('ready'));
    await settle();
    // W37: the visit's first dose credits the active Companion (Pingu) +2 by event, and its sheet is read again.
    for (const c of ROSTER) {
      const rows = c === IDS.pingu ? [growthEvent('ev-open', 'daily_dose_open', 2, OPENED, 1, 1)] : [];
      (await vi.waitFor(() => http.expectOne(`/api/v1/me/companions/${c}/growth-events`))).flush(events(...rows));
    }
    (await vi.waitFor(() => http.expectOne(`/api/v1/me/companions/${IDS.pingu}/growth`))).flush(growth(IDS.pingu, 'Pingu', 'penguin', 1, OPENED, OPENED, 50, 'flash-lite', ['cite_atom']));
    await settle();
    await click(`.cx-dots .cx-dot-btn`, index);
    await click('.cx-card [data-act="cxDosePlay"]');
  }

  /** One answer through production's attempt: start, then submit, graded `correct`. */
  async function answer(atomId: string, option: number, correct: boolean): Promise<string> {
    await click('.cxq [data-act="cxqAnswer"]', option);
    const start = await vi.waitFor(() => http.expectOne(`/api/atoms/${atomId}/session`));
    expect(start.request.body).toEqual({});
    start.flush({ session_id: `s-${atomId}`, tenant_id: 't', learner_gcid: 'g', atom_id: atomId, status: 'in_progress', hints_used: 0, answer_count: 0, started_at: '2026-10-30T02:00:00Z' });
    const sub = await vi.waitFor(() => http.expectOne(`/api/atoms/${atomId}/session/submit`));
    expect(sub.request.body).toMatchObject({ session_id: `s-${atomId}`, selected_option_id: `${atomId}-o${option + 1}` });
    expect(sub.request.body.answer_id).toMatch(/^[0-9a-f-]{36}$/);
    sub.flush({ session_id: `s-${atomId}`, status: 'completed', is_correct: correct, duplicate: false, hints_used: 0, answer_count: 1, paths_advanced: 0, paths_completed: 0 });
    await settle();
    return sub.request.body.answer_id as string;
  }

  /** One round of the ledger poll: every Companion's ledger read, `credit` on the one that got it. */
  async function ledgers(credit: { companion: string; delta: number } | null): Promise<void> {
    for (const c of ROSTER) {
      const total = c === IDS.pingu ? OPENED : GROWTH[c].data.expCumulative;
      const rows = credit && credit.companion === c ? [growthEvent(`ev-${c}`, 'atom_session', credit.delta, total + credit.delta, 1, 1)] : [];
      (await vi.waitFor(() => http.expectOne(`/api/v1/me/companions/${c}/growth-events`))).flush(events(...rows, growthEvent('old', 'daily_dose_open', 2, total, 1, 1)));
    }
    await settle();
  }

  it('K149: the quick check shows its options in this visit’s drawn order, and answers by the option clicked', async () => {
    order.drawFrom(7);
    await playCard(2);
    const shownTexts = () => Array.from(el.querySelectorAll('.cxq [data-act="cxqAnswer"]')).map((b) => b.lastElementChild?.textContent);
    const drawn = shownTexts();
    expect(drawn).not.toEqual(['The first', 'The second', 'The third']);
    expect([...drawn].sort()).toEqual(['The first', 'The second', 'The third']);
    const atomId = DOSE_WIRE.atoms[2].atomId;
    const first = ['The first', 'The second', 'The third'].indexOf(drawn[0] as string) + 1;
    await click('.cxq [data-act="cxqAnswer"]', 0);
    (await vi.waitFor(() => http.expectOne(`/api/atoms/${atomId}/session`))).flush({ session_id: `s-${atomId}`, tenant_id: 't', learner_gcid: 'g', atom_id: atomId, status: 'in_progress', hints_used: 0, answer_count: 0, started_at: '2026-10-30T02:00:00Z' });
    const sub = await vi.waitFor(() => http.expectOne(`/api/atoms/${atomId}/session/submit`));
    expect(sub.request.body).toMatchObject({ selected_option_id: `${atomId}-o${first}` });
    expect(shownTexts()).toEqual(drawn);
  });

  it('Play on the review card opens its quick check from the atom’s own question, and nothing is called until an answer', async () => {
    await playCard(2);
    expect(el.querySelector('.cx-stack')).toBeNull();
    expect(text('.cxq .cx-card__head .cx-cat')).toBe('Review');
    expect(text('.cxq__kicker')).toBe('Quick check on “The Four National Taps”');
    expect(text('.cxq__stem')).toBe('Which is true of The Four National Taps?');
    expect(Array.from(el.querySelectorAll('.cxq [data-act="cxqAnswer"]')).map((b) => [b.querySelector('.mk')?.textContent, b.lastElementChild?.textContent])).toEqual([
      ['A', 'The first'],
      ['B', 'The second'],
      ['C', 'The third'],
    ]);
    expect(text('.cxq__verdict')).toBe('Marked instantly by rules on Chora’s server; no AI marks multiple choice.');
    http.expectNone((r) => r.url.includes('/session'));
  });

  it('a right answer is graded on the server and names the Companion the ledger credited, with its EXP', async () => {
    await playCard(2);
    await answer('a-rev', 1, true);
    expect(TestBed.inject(VisitTally).answers()).toBe(1);
    expect(text('.cxq .verdict b')).toBe('Correct.');
    expect(text('.cxq .verdict')).toContain('Because of The Four National Taps.');
    expect(el.querySelectorAll('.cxq .opt.right').length).toBe(1);
    expect(el.querySelector('.cxq__exp')).toBeNull();
    await ledgers({ companion: IDS.pingu, delta: 3 });
    (await vi.waitFor(() => http.expectOne(`/api/v1/me/companions/${IDS.pingu}/growth`))).flush(growth(IDS.pingu, 'Pingu', 'penguin', 1, OPENED + 3, OPENED + 3, 50, 'flash-lite', ['cite_atom']));
    await vi.waitFor(() => expect(text('.cxq__exp')).toBe('+3 EXP for Pingu'));
    expect(text('.cx-tiles .cx-tile:nth-child(3) dd')).toBe('37');
    expect(el.textContent).not.toMatch(/XP earned/);
  });

  it('K102: on Nova’s dose the credit lands on the active Companion, and the quiz names Pingu, not Nova', async () => {
    exhibit().select(IDS.nova);
    await settle();
    await playCard(3, IDS.nature, IDS.nova, 'turn-nova');
    await answer('a-str', 1, true);
    await ledgers({ companion: IDS.pingu, delta: 3 });
    (await vi.waitFor(() => http.expectOne(`/api/v1/me/companions/${IDS.pingu}/growth`))).flush(growth(IDS.pingu, 'Pingu', 'penguin', 1, OPENED + 3, OPENED + 3, 50, 'flash-lite', ['cite_atom']));
    await vi.waitFor(() => expect(text('.cxq__exp')).toBe('+3 EXP for Pingu'));
    expect(text('.cx-tiles .cx-tile:nth-child(3) dd')).toBe('118');
    expect(exhibit().roster().find((c) => c.id === IDS.pingu)?.growth.expCumulative).toBe(37);
  });

  it('a wrong answer is marked a miss, with the 1 EXP production credits for trying; the card then reads Answered', async () => {
    await playCard(3);
    await answer('a-str', 0, false);
    expect(text('.cxq .verdict b')).toBe('Not quite.');
    expect(el.querySelectorAll('.cxq .opt.miss').length).toBe(1);
    expect(el.querySelector('.cxq .opt.right')).toBeNull();
    await ledgers({ companion: IDS.pingu, delta: 1 });
    (await vi.waitFor(() => http.expectOne(`/api/v1/me/companions/${IDS.pingu}/growth`))).flush(growth(IDS.pingu, 'Pingu', 'penguin', 1, OPENED + 1, OPENED + 1, 50, 'flash-lite', ['cite_atom']));
    await vi.waitFor(() => expect(text('.cxq__exp')).toBe('+1 EXP for Pingu'));
    await click('[data-act="cxqBack"]');
    expect(text('.cx-card__xp')).toBe('Answered');
    expect(text('.cx-card [data-act="cxDosePlay"]')).toBe('See your answer');
    await click('.cx-card [data-act="cxDosePlay"]');
    expect(text('.cxq .verdict b')).toBe('Not quite.');
    http.expectNone((r) => r.url.includes('/session'));
  });

  it('one answer per card: a second click while it is checking or after it is graded calls nothing', async () => {
    await playCard(2);
    await click('.cxq [data-act="cxqAnswer"]', 0);
    await click('.cxq [data-act="cxqAnswer"]', 1);
    expect(http.match('/api/atoms/a-rev/session').length).toBe(1);
  });

  it('a refused grade says so on the quiz and reads no ledger', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await playCard(2);
    await click('.cxq [data-act="cxqAnswer"]', 1);
    (await vi.waitFor(() => http.expectOne('/api/atoms/a-rev/session'))).flush({ session_id: 's-1', atom_id: 'a-rev', status: 'in_progress' });
    (await vi.waitFor(() => http.expectOne('/api/atoms/a-rev/session/submit'))).flush({ code: 'ATOM_NOT_GRADEABLE', message: 'no key' }, { status: 422, statusText: 'Unprocessable' });
    await settle();
    expect(text('.cxq .msg-error')).not.toBe('');
    expect(error).toHaveBeenCalledWith(expect.stringContaining('ATOM_NOT_GRADEABLE'));
    http.expectNone((r) => r.url.endsWith('/growth-events'));
    expect(TestBed.inject(VisitTally).answers()).toBe(0);
  });

  it('Next card moves on and closes the quiz; moving between cards closes it too', async () => {
    await playCard(2);
    await answer('a-rev', 1, true);
    await ledgers({ companion: IDS.pingu, delta: 3 });
    (await vi.waitFor(() => http.expectOne(`/api/v1/me/companions/${IDS.pingu}/growth`))).flush(growth(IDS.pingu, 'Pingu', 'penguin', 1, OPENED + 3, OPENED + 3, 50, 'flash-lite', ['cite_atom']));
    await vi.waitFor(() => expect(text('.cxq__exp')).toBe('+3 EXP for Pingu'));
    await click('[data-act="cxqNext"]');
    expect(el.querySelector('.cxq')).toBeNull();
    expect(text('.cx-card__title')).toBe('Water from Johor');
    await click('.cx-card [data-act="cxDosePlay"]');
    expect(el.querySelector('.cxq')).not.toBeNull();
    await click('[data-act="cxqBack"]');
    expect(el.querySelector('.cxq')).toBeNull();
  });

  it('when no ledger shows the credit in time, the quiz names no Companion and says so loudly', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    await playCard(2);
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    await answer('a-rev', 1, true);
    for (let i = 0; i < GROWTH_POLL_TRIES; i++) {
      await ledgers(null);
      await vi.advanceTimersByTimeAsync(GROWTH_POLL_MS);
    }
    await settle();
    http.expectNone((r) => r.url.endsWith('/growth-events') || r.url.endsWith('/growth'));
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('atom_session'));
    expect(el.querySelector('.cxq__exp')).toBeNull();
    expect(text('.cxq .verdict b')).toBe('Correct.');
  });
});
