import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { KioskLanguage, provideKioskI18n } from '../../i18n/i18n';
import { provideLive } from '../../live/live.providers';
import { LIVE_EXECUTORS, LiveAvailability, LiveService, type LiveExecutor } from '../../live/live.service';
import { CompanionsExhibit } from './companions-exhibit';
import { CompanionsSceneComponent } from './companions-scene.component';
import { ATOM_BODIES, DOSE_OPEN, DOSE_WIRE, GROWTH, IDS, MAPS, atomRead, doseManifest, events, growth, growthEvent, waterOnLastRung } from './companions-world.testing';
import { keepServedOrder } from '../../shared/visit-order.testing';

// Today's dose (mockup cxqDoseHTML, doseHTML and compDose, lines 3231, 3475 and 3256): the picked
// Companion's own goal's dose, ALWAYS opened with ?goal_id= (K127, T2.18), its cards in the read's
// order; each card's body from GET /api/atoms/{id} (F17: the dose's summary is the title, and its
// Companion name, quote and greeting are the legacy "Eira", never shown); the rail greets with the
// golden run's turn replayed (K49, no model call), and the LIVE greet press asks for a new one.
describe('CompanionsSceneComponent (today’s dose)', () => {
  let http: HttpTestingController;
  let fixture: ComponentFixture<CompanionsSceneComponent>;
  let el: HTMLElement;
  let greet: { resolve: (g: unknown) => void; reject: (e: Error) => void } | null;
  const DOSE = '/api/companion/daily-dose';
  const GREETING = '/api/companion/greeting';
  const exhibit = () => TestBed.inject(CompanionsExhibit);

  async function settle(): Promise<void> {
    for (let i = 0; i < 6; i++) {
      await Promise.resolve();
      fixture.detectChanges();
    }
  }

  beforeEach(async () => {
    greet = null;
    const live: LiveExecutor = { run: () => new Promise((resolve, reject) => (greet = { resolve, reject })) };
    TestBed.configureTestingModule({
      providers: [...keepServedOrder(), 
        provideHttpClient(),
        provideHttpClientTesting(),
        ...provideKioskI18n(),
        ...provideLive(),
        { provide: LIVE_EXECUTORS, useValue: { greet: live } },
        { provide: LiveAvailability, useValue: { text: signal(true).asReadonly(), picture: signal(true).asReadonly() } },
      ],
    });
    http = TestBed.inject(HttpTestingController);
    await TestBed.inject(KioskLanguage).ready();
    fixture = TestBed.createComponent(CompanionsSceneComponent);
    el = fixture.nativeElement as HTMLElement;
    fixture.detectChanges();
    http.expectOne('/api/v1/kiosk/prewarm/manifest').flush(doseManifest());
    const maps = { ...MAPS, [IDS.water]: waterOnLastRung() };
    for (const goal of [IDS.water, IDS.nature, IDS.hawker]) await vi.waitFor(() => http.expectOne(`/api/v1/me/maps/${goal}/graph`).flush(maps[goal]));
    for (const c of [IDS.pingu, IDS.nova, IDS.ember]) await vi.waitFor(() => http.expectOne(`/api/v1/me/companions/${c}/growth`).flush(GROWTH[c]));
    await vi.waitFor(() => expect(exhibit().status()).toBe('ready'));
    await settle();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    exhibit().forget();
    TestBed.inject(LiveService).endSession();
  });

  const text = (sel: string) => el.querySelector(sel)?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
  const texts = (sel: string) => Array.from(el.querySelectorAll(sel)).map((n) => n.textContent?.replace(/\s+/g, ' ').trim() ?? '');
  const click = async (sel: string) => {
    (el.querySelector(sel) as HTMLElement).click();
    await settle();
  };

  /**
   * Dose pressed: the read for the goal, every card's atom, and the prepared greeting's replay; with
   * `credit` (the visit's first dose), the ledger's first round lists the open's +2 on Pingu (W37).
   */
  async function openDose(goal: string = IDS.water, companion: string = IDS.pingu, turn: string | null = 'turn-pingu', failAtom?: string, credit = true): Promise<void> {
    await click('[data-act="ability"][data-ab="dose"]');
    const read = await vi.waitFor(() => http.expectOne((r) => r.url === DOSE));
    expect(read.request.params.get('goal_id')).toBe(goal);
    read.flush({ ...DOSE_WIRE, scope: { ...DOSE_WIRE.scope, goal_id: goal } });
    for (const c of DOSE_WIRE.atoms) {
      const r = await vi.waitFor(() => http.expectOne(`/api/atoms/${c.atomId}`));
      if (c.atomId === failAtom) r.flush({ code: 'INTERNAL' }, { status: 500, statusText: 'Server Error' });
      else r.flush(atomRead(c.atomId, c.title, ATOM_BODIES[c.atomId]));
    }
    if (turn) {
      const g = await vi.waitFor(() => http.expectOne(GREETING));
      expect(g.request.body).toEqual({ companion_id: companion, turn_id: turn });
      g.flush({ companion_id: companion, turn_id: turn, greeting: 'Good morning! Two cards push our march today.', model: 'gpt-oss:120b', replayed: true });
    }
    await vi.waitFor(() => expect(exhibit().dose()?.state).toBe('ready'));
    await settle();
    if (credit) {
      for (const c of [IDS.pingu, IDS.nova, IDS.ember]) {
        const rows = c === IDS.pingu ? [growthEvent('ev-open', 'daily_dose_open', 2, 34, 1, 1), DOSE_OPEN] : [];
        (await vi.waitFor(() => http.expectOne(`/api/v1/me/companions/${c}/growth-events`))).flush(events(...rows));
      }
      (await vi.waitFor(() => http.expectOne(`/api/v1/me/companions/${IDS.pingu}/growth`))).flush(growth(IDS.pingu, 'Pingu', 'penguin', 1, 34, 34, 50, 'flash-lite', ['cite_atom']));
      await settle();
    }
  }

  it('opens the picked Companion’s dose for its goal, in the read’s order, with bodies from the atom reads', async () => {
    await openDose();
    expect(el.querySelector('.comp-dose')).not.toBeNull();
    expect(el.querySelector('#complens')).toBeNull();
    expect(el.querySelector('[data-ab="dose"]')?.classList.contains('on')).toBe(true);
    expect(text('.cx-dose__title')).toBe('Today’s Daily Dose');
    expect(text('.cx-dose__date')).toBe('30 Oct 2026 · Singapore’s water');
    expect(texts('.cx-chips .cx-chipc')).toEqual(['20% Review', '60% New', '20% Stretch']);
    expect(texts('.cx-dose__stats b')[0]).toBe('+160 XP');
    // Production's formatHoursUntil: hours, minutes, seconds to the read's nextDoseAt (300 hours away from today in this fixture).
    expect(text('[data-cx-countdown]')).toMatch(/^\d{2,}:\d\d:\d\d$/);
    expect(texts('.cx-card__head > span')).toEqual(['New', 'Reservoirs', '+30 XP']);
    expect(text('.cx-card__title')).toBe('A reservoir in the city centre');
    expect(text('.cx-card__summary')).toBe(ATOM_BODIES['a-camp1']);
    expect(text('.cx-card__why')).toBe('Pingu marches on Reservoirs');
    expect(el.querySelectorAll('.cx-dots .cx-dot-btn').length).toBe(5);
    expect((el.querySelector('[data-act="cxDosePrev"]') as HTMLButtonElement).disabled).toBe(true);
    expect(text('.cx-rail__name')).toBe('Pingu');
    expect(text('.cx-rail__rank')).toBe('Stage 1');
    expect(text('.cx-rail__quote')).toBe('Good morning! Two cards push our march today.');
    expect(text('.cx-rail__ai')).toBe('Greeting written by AI');
    expect(text('.cx-rail [data-live] .stamp')).toBe('Prepared 20 Oct, 14:02');
    // K205 (W89): what the greeting draws on, in the Companion's own name, between the greeting and its LIVE row.
    expect(text('.cx-rail__why')).toBe(
      'Pingu remembers your goal, the weak spots it found in the papers you shared, and how much of your map you have won. Each greeting it writes starts from that.',
    );
    const why = el.querySelector('.cx-rail__why') as Element;
    expect((el.querySelector('.cx-rail__ai')?.compareDocumentPosition(why) ?? 0) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(why.compareDocumentPosition(el.querySelector('.cx-rail [data-live]') as Element) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(el.textContent).not.toMatch(/Eira/);
  });

  it('steps through the cards with Next, Previous and the dots, each with its own reason', async () => {
    await openDose();
    const why: string[] = [];
    for (let i = 0; i < 5; i++) {
      why.push(text('.cx-card__why'));
      if (i < 4) await click('[data-act="cxDoseNext"]');
    }
    expect(why).toEqual(['Pingu marches on Reservoirs', 'Pingu marches on Reservoirs', 'Due for review before it fades', 'A shaky spot on your map', 'Something new from your map']);
    expect((el.querySelector('[data-act="cxDoseNext"]') as HTMLButtonElement).disabled).toBe(true);
    expect(text('.cx-card__summary')).toBe(ATOM_BODIES['a-new']);
    await click('[data-act="cxDosePrev"]');
    expect(text('.cx-card__title')).toBe('Water from Johor');
    await click('.cx-dots .cx-dot-btn:nth-child(3)');
    expect(text('.cx-card__title')).toBe('The Four National Taps');
    expect(el.querySelector('.cx-dots .cx-dot-btn:nth-child(3)')?.getAttribute('aria-current')).toBe('true');
  });

  it('Play on a campaign card opens production’s campaign practice on the march (the Quiz ability)', async () => {
    await openDose();
    await click('.cx-card [data-act="cxDosePlay"]');
    expect(exhibit().view()).toBe('quiz');
    await vi.waitFor(() => http.expectOne((r) => r.url === `/api/v1/me/goals/${IDS.water}/campaign/questions`));
  });

  it('reads each Companion’s dose once a visit: back to the map and Dose again makes no second read', async () => {
    await openDose();
    await click('[data-act="ability"][data-ab="suggest"]');
    await vi.waitFor(() => http.expectOne((r) => r.url === '/api/v1/me/concept-graph/suggestions').flush({ suggestions: [] }));
    await settle();
    await click('[data-act="ability"][data-ab="dose"]');
    http.expectNone((r) => r.url === DOSE);
    http.expectNone(GREETING);
    expect(text('.cx-card__title')).toBe('A reservoir in the city centre');
  });

  it('W37: the visit’s first dose credits +2 by event; the ledger is read until it lists it, then the sheet shows it', async () => {
    await openDose(IDS.water, IDS.pingu, 'turn-pingu', undefined, false);
    expect(text('.cx-tile:nth-child(3) dd')).toBe('32');
    // The credit lands by event, so the first round may not list it yet.
    for (const c of [IDS.pingu, IDS.nova, IDS.ember]) (await vi.waitFor(() => http.expectOne(`/api/v1/me/companions/${c}/growth-events`))).flush(events(DOSE_OPEN));
    await settle();
    for (const c of [IDS.pingu, IDS.nova, IDS.ember]) {
      const rows = c === IDS.pingu ? [growthEvent('ev-open', 'daily_dose_open', 2, 34, 1, 1), DOSE_OPEN] : [];
      (await vi.waitFor(() => http.expectOne(`/api/v1/me/companions/${c}/growth-events`), { timeout: 3000 })).flush(events(...rows));
    }
    (await vi.waitFor(() => http.expectOne(`/api/v1/me/companions/${IDS.pingu}/growth`))).flush(growth(IDS.pingu, 'Pingu', 'penguin', 1, 34, 34, 50, 'flash-lite', ['cite_atom']));
    await settle();
    expect(text('.cx-tile:nth-child(3) dd')).toBe('34');
    expect(text('.cx-exp__num')).toBe('34 / 50 EXP');
    // The cap is 2 a day (growth/curve.go): another Companion’s dose this visit earns nothing, so nothing is read.
    exhibit().select(IDS.nova);
    await settle();
    await openDose(IDS.nature, IDS.nova, 'turn-nova', undefined, false);
    await new Promise((resolve) => setTimeout(resolve, 50));
    http.expectNone((r) => r.url.endsWith('/growth-events'));
  }, 10000);

  it('another Companion’s dose is its own goal’s, with its own greeting', async () => {
    exhibit().select(IDS.nova);
    await settle();
    await openDose(IDS.nature, IDS.nova, 'turn-nova');
    expect(text('.cx-rail__name')).toBe('Nova');
    expect(text('.cx-dose__date')).toBe('30 Oct 2026 · City in Nature');
    expect(text('.cx-rail__why')).toMatch(/^Nova remembers your goal, /);
  });

  it('K205: in Chinese the caption names the Companion too', async () => {
    await TestBed.inject(KioskLanguage).setLang('zh');
    await openDose();
    expect(text('.cx-rail__why')).toBe('Pingu 记得你的学习目标、它在你分享的试卷里发现的薄弱点，以及你已经拿下了多少地图。它写的每一句问候都从这些出发。');
  });

  it('a Companion with no prepared greeting says so loudly and shows no quote', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    exhibit().select(IDS.ember);
    await settle();
    await openDose(IDS.hawker, IDS.ember, null);
    http.expectNone(GREETING);
    expect(error).toHaveBeenCalledWith(expect.stringContaining(`no prepared greeting for ${IDS.ember}`));
    expect(el.querySelector('.cx-rail__quote')).toBeNull();
    expect(el.querySelector('.cx-rail [data-live] .stamp')).toBeNull();
  });

  it('a missed LIVE greeting keeps the prepared one, labelled, and may be tried again until a live one replaces the quote; then the button is gone (K186)', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await openDose();
    await click('.cx-rail [data-act="live"]');
    await vi.waitFor(() => expect(greet).not.toBeNull());
    greet?.reject(new Error('the model failed'));
    await vi.waitFor(() => expect(text('.cx-rail [data-live] .stamp.fallback')).not.toBe(''));
    expect(text('.cx-rail__quote')).toBe('Good morning! Two cards push our march today.');
    expect(text('.cx-rail [data-act="live"] .live-label')).toBe('Try again');
    greet = null as typeof greet;
    await click('.cx-rail [data-act="live"]');
    await vi.waitFor(() => expect(greet).not.toBeNull());
    greet?.resolve({ greeting: 'Hi again! Ready for Reservoirs?', model: 'gpt-oss:120b', turnId: 't-live' });
    await vi.waitFor(() => expect(text('.cx-rail__quote')).toBe('Hi again! Ready for Reservoirs?'));
    expect(text('.cx-rail [data-live] .stamp')).toBe('Live, just now');
    expect(el.querySelector('.cx-rail [data-act="live"]')).toBeNull();
  });

  // W79: the outcome comes from the one LIVE door, not the row that pressed, so leaving mid-call loses nothing.
  it('W79: a LIVE greeting answered after the Companion was left shows when its dose opens again', async () => {
    await openDose();
    await click('.cx-rail [data-act="live"]');
    await vi.waitFor(() => expect(greet).not.toBeNull());
    await click(`[data-act="mate"][data-id="${IDS.nova}"]`);
    expect(el.querySelector('.cx-rail')).toBeNull();
    greet?.resolve({ greeting: 'Hi again! Ready for Reservoirs?', model: 'gpt-oss:120b', turnId: 't-live' });
    await vi.waitFor(() => expect(TestBed.inject(LiveService).state(`greet:comp:${IDS.pingu}`)()?.status).toBe('done'));
    await click(`[data-act="mate"][data-id="${IDS.pingu}"]`);
    await click('[data-act="ability"][data-ab="dose"]');
    expect(text('.cx-rail__quote')).toBe('Hi again! Ready for Reservoirs?');
    expect(text('.cx-rail [data-live] .stamp')).toBe('Live, just now');
    expect(el.querySelector('.cx-rail [data-act="live"]')).toBeNull();
  });

  it('a dose read that fails says so on the dose, never an empty dose', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await click('[data-act="ability"][data-ab="dose"]');
    (await vi.waitFor(() => http.expectOne((r) => r.url === DOSE))).flush({ code: 'INTERNAL' }, { status: 500, statusText: 'Server Error' });
    await vi.waitFor(() => expect(exhibit().dose()?.state).toBe('failed'));
    await settle();
    expect(text('.comp-dose .msg-error')).not.toBe('');
    expect(el.querySelector('.cx-card')).toBeNull();
    expect(error).toHaveBeenCalledWith(expect.stringContaining('/api/companion/daily-dose?goal_id='));
  });

  it('a card whose atom cannot be read says so on that card, never the dose’s summary (F17)', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await openDose(IDS.water, IDS.pingu, 'turn-pingu', 'a-camp1');
    expect(text('.cx-card__title')).toBe('A reservoir in the city centre');
    expect(el.querySelector('.cx-card__summary')).toBeNull();
    expect(text('.cx-card .msg-error')).not.toBe('');
    expect(error).toHaveBeenCalledWith(expect.stringContaining('/api/atoms/a-camp1'));
    await click('[data-act="cxDoseNext"]');
    expect(text('.cx-card__summary')).toBe(ATOM_BODIES['a-camp2']);
  });
});
