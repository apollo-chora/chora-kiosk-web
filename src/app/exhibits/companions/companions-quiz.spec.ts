import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { signal, type Provider } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { parseCampaignQuestions } from '../../aplus/daily-dose/campaign-practice/campaign-practice.service';
import { KioskLanguage, provideKioskI18n } from '../../i18n/i18n';
import { provideLive } from '../../live/live.providers';
import { LIVE_EXECUTORS, LiveAvailability, LiveService } from '../../live/live.service';
import { CompanionsExhibit } from './companions-exhibit';
import { CompanionsSceneComponent } from './companions-scene.component';
import { GROWTH, IDS, MAPS, MARCH, PINGU_AFTER, PINGU_LOADOUT, SERVED_RES, events, growthEvent, quizManifest, waterOnLastRung } from './companions-world.testing';
import { VisitTally } from '../../shared/visit-tally';
import LONG_SET from './serve-res-r6.recorded.json';
import { keepServedOrder, seededRandom } from '../../shared/visit-order.testing';
import { VISIT_RANDOM } from '../../shared/visit-order';

// The Quiz ability (mockup compAbility('quiz'), compQuizHTML and compAnswer, lines 4911, 4857, 4927):
// production's campaign practice on the march at its current rung, served only when the golden run
// prepared that (concept, rung) (h3 = A: a serve miss would start a generation no LIVE button
// pressed); a right answer on the last rung wins the hex, and the map and the Companion's growth are
// read again (its credits land through Pub/Sub; no HTTP route sets EXP; the wait is in companions-stage-up.spec.ts).
describe('CompanionsSceneComponent (the Quiz ability)', () => {
  let http: HttpTestingController;
  let fixture: ComponentFixture<CompanionsSceneComponent>;
  let el: HTMLElement;

  async function settle(): Promise<void> {
    for (let i = 0; i < 4; i++) {
      await Promise.resolve();
      fixture.detectChanges();
    }
  }

  /** `seed`: K149's draw from a seeded source; without one, the options keep the serve door's order. */
  async function shown(withSet = true, seed?: number, extra: Provider[] = []): Promise<void> {
    const order = seed === undefined ? keepServedOrder() : [{ provide: VISIT_RANDOM, useValue: seededRandom(seed) }];
    TestBed.configureTestingModule({ providers: [...order, provideHttpClient(), provideHttpClientTesting(), ...provideKioskI18n(), ...provideLive(), ...extra] });
    http = TestBed.inject(HttpTestingController);
    await TestBed.inject(KioskLanguage).ready();
    fixture = TestBed.createComponent(CompanionsSceneComponent);
    el = fixture.nativeElement as HTMLElement;
    fixture.detectChanges();
    http.expectOne('/api/v1/kiosk/prewarm/manifest').flush(quizManifest(withSet));
    const maps = { ...MAPS, [IDS.water]: waterOnLastRung() };
    for (const goal of [IDS.water, IDS.nature, IDS.hawker]) await vi.waitFor(() => http.expectOne(`/api/v1/me/maps/${goal}/graph`).flush(maps[goal]));
    for (const c of [IDS.pingu, IDS.nova, IDS.ember]) await vi.waitFor(() => http.expectOne(`/api/v1/me/companions/${c}/growth`).flush(GROWTH[c]));
    await vi.waitFor(() => expect(TestBed.inject(CompanionsExhibit).status()).toBe('ready'));
    await settle();
    (el.querySelector('[data-act="ability"][data-ab="quiz"]') as HTMLElement).click();
    await settle();
  }

  afterEach(() => {
    TestBed.inject(CompanionsExhibit).forget();
    TestBed.inject(LiveService).endSession();
  });

  it('a long question sets the drawer dense, one option a row, so all four can show (D8’s stack walk en-28, ruling (a))', async () => {
    await shown();
    // The golden run's own rung-6 Reservoirs question, recorded from the stack: a 278-character stem and
    // options of 105 to 176 characters, against the mockup's one-line question and short options.
    const serve = await vi.waitFor(() => http.expectOne((r) => r.url === `/api/v1/me/goals/${IDS.water}/campaign/questions`));
    serve.flush({ ...LONG_SET, concept_id: MARCH });
    await vi.waitFor(() => expect(TestBed.inject(CompanionsExhibit).quiz().state).toBe('ready'));
    await settle();
    expect(text('#panel .q-stem')).toBe(LONG_SET.questions.candidates[0].stem);
    expect(el.querySelectorAll('#panel .opts .opt')).toHaveLength(4);
    expect(el.querySelector('#panel .kd-body')?.classList.contains('long-q')).toBe(true);
    // en-28 ruling (A): the dense drawer still hid option D's first line by 45 px, so a long question
    // drops the quiz's top note (63 px); the ladder still shows the rung, the verdict what counted.
    expect(el.querySelector('#panel .tier.t1')).toBeNull();
    expect(el.querySelector('#panel kiosk-ladder')).not.toBeNull();
  });

  const text = (sel: string) => el.querySelector(sel)?.textContent?.replace(/\s+/g, ' ').trim() ?? '';

  it('W23: the story’s two badges say who wrote and who checked the question, after it as in step 3, a long question too', async () => {
    await shown();
    (await vi.waitFor(() => http.expectOne((r) => r.url === `/api/v1/me/goals/${IDS.water}/campaign/questions`))).flush({ ...LONG_SET, concept_id: MARCH });
    await vi.waitFor(() => expect(TestBed.inject(CompanionsExhibit).quiz().state).toBe('ready'));
    await settle();
    expect([...el.querySelectorAll('#panel .badges .badge')].map((b) => b.textContent?.trim())).toEqual(['Written for you by the writer AI', 'Checked by a second AI']);
    const badges = el.querySelector('#panel .badges') as Element;
    const lastOption = [...el.querySelectorAll('#panel .opts .opt')].at(-1) as Element;
    expect(lastOption.compareDocumentPosition(badges) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(el.querySelector('#panel')?.textContent).not.toContain('critic AI');
  });

  it('W24: the drawer tab is the story’s "Overview", and a right answer that does not win counts as the story does', async () => {
    await shown();
    (await vi.waitFor(() => http.expectOne((r) => r.url === `/api/v1/me/goals/${IDS.water}/campaign/questions`))).flush(SERVED_RES);
    await vi.waitFor(() => expect(TestBed.inject(CompanionsExhibit).quiz().state).toBe('ready'));
    await settle();
    expect(text('#panel .kd-tabs button.on')).toBe('Overview');
    expect(el.querySelector('#panel .tier.t1')?.textContent).not.toContain('critic AI');
    (el.querySelectorAll('#panel [data-act="answer"]')[1] as HTMLElement).click();
    const post = await vi.waitFor(() => http.expectOne(`/api/v1/me/goals/${IDS.water}/campaign/questions/answer`));
    post.flush({ correct: true, rung: 6, is_refresher: false, counted: true, cleared_rung: null, won: false, paced_today: false, rungs_cleared: 5, current_rung_correct: 1, needed_correct: 2, retention_r: 1, correct_option_id: post.request.body.selected_option_id, explainer: 'The catchment keeps the water clean.' });
    await vi.waitFor(() => expect(TestBed.inject(CompanionsExhibit).quizAnswer().state).toBe('done'));
    await settle();
    // W22: "Correct." then a space before the explanation, as the story's verdict reads.
    expect(text('#panel .verdict')).toMatch(/^Correct\. The catchment keeps the water clean\./);
    expect(text('#panel .tier.t3 .camp-line')).toBe('1 of 2 correct on this rung');
  });

  it('K149: the quiz shows its options in this visit’s drawn order, and answers by the option clicked', async () => {
    await shown(true, 11);
    const serve = await vi.waitFor(() => http.expectOne((r) => r.url === `/api/v1/me/goals/${IDS.water}/campaign/questions`));
    serve.flush({ ...LONG_SET, concept_id: MARCH });
    await vi.waitFor(() => expect(TestBed.inject(CompanionsExhibit).quiz().state).toBe('ready'));
    await settle();
    const served = LONG_SET.questions.candidates[0].options.map((o) => o.option_id);
    const labels = new Map(LONG_SET.questions.candidates[0].options.map((o) => [o.label, o.option_id]));
    const drawn = [...el.querySelectorAll('#panel .opts .opt')].map((o) => labels.get(o.lastElementChild?.textContent?.trim() ?? ''));
    expect(drawn).not.toEqual(served);
    expect([...drawn].sort()).toEqual([...served].sort());
    (el.querySelectorAll('#panel [data-act="answer"]')[0] as HTMLElement).click();
    const post = await vi.waitFor(() => http.expectOne(`/api/v1/me/goals/${IDS.water}/campaign/questions/answer`));
    expect(post.request.body).toMatchObject({ selected_option_id: drawn[0] });
  });

  it('serves the prepared set for the march at its rung; a right answer wins the hex and reads the map and growth again', async () => {
    await shown();
    const serve = await vi.waitFor(() => http.expectOne((r) => r.url === `/api/v1/me/goals/${IDS.water}/campaign/questions`));
    expect([serve.request.params.get('concept_id'), serve.request.params.get('rung')]).toEqual([MARCH, '6']);
    serve.flush(SERVED_RES);
    await vi.waitFor(() => expect(TestBed.inject(CompanionsExhibit).quiz().state).toBe('ready'));
    await settle();
    expect(el.querySelector('[data-act="ability"][data-ab="quiz"]')?.classList.contains('on')).toBe(true);
    expect(text('#panel .kd-title')).toBe('Reservoirs');
    expect(text('#panel .camp-line')).toContain('one more wins this hex');
    // The ladder as the mockup paints it (line 4111): cleared rungs on, the rung being climbed now.
    const pills = [...el.querySelectorAll('#panel .ladder .rungpill')];
    expect(pills.map((p) => (p.classList.contains('on') ? 'on' : p.classList.contains('now') ? 'now' : ''))).toEqual(['on', 'on', 'on', 'on', 'on', 'now']);
    expect(text('#panel .q-stem')).toBe('Design a way to keep a reservoir clean.');
    // A question of the mockup's length keeps the mockup's drawer (en-28's dense variant is for long ones only).
    expect(el.querySelector('#panel .kd-body')?.classList.contains('long-q')).toBe(false);
    expect(TestBed.inject(CompanionsExhibit).lensFocusId()).toBe(MARCH);
    const reveal = vi.spyOn(Element.prototype, 'scrollIntoView');
    (el.querySelectorAll('#panel [data-act="answer"]')[1] as HTMLElement).click();
    const post = await vi.waitFor(() => http.expectOne(`/api/v1/me/goals/${IDS.water}/campaign/questions/answer`));
    expect(post.request.body).toMatchObject({ concept_id: MARCH, rung: 6, question_index: 0 });
    post.flush({ correct: true, rung: 6, is_refresher: false, counted: true, cleared_rung: 6, won: true, paced_today: false, rungs_cleared: 6, current_rung_correct: 0, needed_correct: 2, retention_r: 1, correct_option_id: post.request.body.selected_option_id, explainer: 'The catchment keeps the water clean.' });
    await vi.waitFor(() => http.expectOne(`/api/v1/me/maps/${IDS.water}/graph`).flush(waterOnLastRung(true)));
    await vi.waitFor(() => http.expectOne(`/api/v1/me/companions/${IDS.pingu}/growth-events`).flush(events(growthEvent('w', 'campaign_node_won', 25, 65, 1, 2), growthEvent('r', 'campaign_rung_cleared', 8, 40, 1, 1))));
    await vi.waitFor(() => http.expectOne(`/api/v1/me/companions/${IDS.pingu}/growth`).flush(PINGU_AFTER));
    await vi.waitFor(() => http.expectOne(`/api/v1/me/companions/${IDS.pingu}/skills`).flush(PINGU_LOADOUT));
    await vi.waitFor(() => expect(TestBed.inject(CompanionsExhibit).selected()?.growth.growthStage).toBe(2));
    await settle();
    expect(text('#panel .verdict b')).toBe('Correct.');
    // K138 W4: the drawer body shows about 442 of its 724 px, so the verdict and the win scroll into view.
    expect(reveal.mock.contexts).toContain(el.querySelector('#panel .verdict'));
    expect(reveal.mock.contexts).toContain(el.querySelector('#panel .won-banner'));
    expect(reveal).toHaveBeenCalledWith({ block: 'nearest' });
    reveal.mockRestore();
    expect(el.querySelector('#panel [data-live^="q:"]')).toBeNull();
    expect(text('.cx-tiles .cx-tile dd')).toBe('2');
    expect(text('.comp-hud .hud-won')).toBe('1 of 2 hexes won');
    expect(TestBed.inject(VisitTally).answers()).toBe(1);
  });

  // The LIVE q row (mockup compQuizHTML liveRowHTML('q:...'), K103): "Write a new question" makes a
  // fresh set beside the prepared one; its question replaces the prepared one and its answer names
  // the fresh set; a missed press leaves the prepared question (K45).
  async function served(extra: Provider[] = []): Promise<void> {
    await shown(true, undefined, extra);
    (await vi.waitFor(() => http.expectOne((r) => r.url === `/api/v1/me/goals/${IDS.water}/campaign/questions`))).flush(SERVED_RES);
    await vi.waitFor(() => expect(TestBed.inject(CompanionsExhibit).quiz().state).toBe('ready'));
    await settle();
  }
  const FRESH = parseCampaignQuestions({ candidates: [{ question_type: 'mcq', stem: 'Why does Singapore protect its catchments?', options: [{ option_id: 'f-a', label: 'To keep water clean' }, { option_id: 'f-b', label: 'For parking' }] }] })[0];
  const freshDone = { status: 'done' as const, kind: 'q' as const, ms: 30000, at: new Date('2026-10-30T02:10:00Z'), result: { freshSetId: 'fs-1', conceptId: MARCH, conceptKey: 'reservoirs', rung: 6, questions: [FRESH], traceId: null, trace: null, critic: { accepted: true } } };

  it('carries the LIVE q row on the march at its rung, stamped with the prepared set’s own time', async () => {
    await served();
    expect(el.querySelector('#panel kiosk-live-row .live-row')?.getAttribute('data-live')).toBe(`q:comp:${MARCH}`);
    expect(text('#panel [data-live] .stamp')).toBe('Prepared 20 Oct, 13:44');
  });

  it('a LIVE question replaces the prepared one, and its answer names the fresh set', async () => {
    await served();
    TestBed.inject(CompanionsExhibit).onQOutcome(MARCH, freshDone);
    await settle();
    expect(text('#panel .q-stem')).toBe('Why does Singapore protect its catchments?');
    (el.querySelectorAll('#panel [data-act="answer"]')[0] as HTMLElement).click();
    const post = await vi.waitFor(() => http.expectOne(`/api/v1/me/goals/${IDS.water}/campaign/questions/answer`));
    expect(post.request.body).toMatchObject({ concept_id: MARCH, rung: 6, selected_option_id: 'f-a', fresh_set_id: 'fs-1' });
  });

  // W79: the outcome comes from the one LIVE door, so a question written after the quiz was left still shows.
  it('W79: a LIVE question answered after the Companion was left shows when the quiz opens again, and its answer names the fresh set', async () => {
    let answer: ((r: unknown) => void) | undefined;
    await served([
      { provide: LIVE_EXECUTORS, useValue: { q: { run: () => new Promise((resolve) => (answer = resolve)) } } },
      { provide: LiveAvailability, useValue: { text: signal(true).asReadonly(), picture: signal(true).asReadonly(), reader: signal(true).asReadonly() } },
    ]);
    (el.querySelector('#panel kiosk-live-row [data-act="live"]') as HTMLElement).click();
    await vi.waitFor(() => expect(answer).toBeTypeOf('function'));
    TestBed.inject(CompanionsExhibit).select(IDS.nova);
    await settle();
    expect(el.querySelector('#panel .q-stem')).toBeNull();
    answer?.(freshDone.result);
    await vi.waitFor(() => expect(TestBed.inject(LiveService).state(`q:comp:${MARCH}`)()?.status).toBe('done'));
    TestBed.inject(CompanionsExhibit).select(IDS.pingu);
    await settle();
    (el.querySelector('[data-act="ability"][data-ab="quiz"]') as HTMLElement).click();
    await vi.waitFor(() => expect(TestBed.inject(CompanionsExhibit).quiz().state).toBe('ready'));
    await settle();
    http.expectNone((r) => r.url === `/api/v1/me/goals/${IDS.water}/campaign/questions`);
    expect(text('#panel .q-stem')).toBe('Why does Singapore protect its catchments?');
    expect(text('#panel [data-live] .stamp')).toBe('Live, just now');
    (el.querySelectorAll('#panel [data-act="answer"]')[0] as HTMLElement).click();
    const post = await vi.waitFor(() => http.expectOne(`/api/v1/me/goals/${IDS.water}/campaign/questions/answer`));
    expect(post.request.body).toMatchObject({ concept_id: MARCH, rung: 6, selected_option_id: 'f-a', fresh_set_id: 'fs-1' });
  });

  it('a missed LIVE press leaves the prepared question, and its answer names no fresh set', async () => {
    await served();
    TestBed.inject(CompanionsExhibit).onQOutcome(MARCH, { status: 'missed', kind: 'q', reason: 'late', ms: 45000 });
    await settle();
    expect(text('#panel .q-stem')).toBe('Design a way to keep a reservoir clean.');
    (el.querySelectorAll('#panel [data-act="answer"]')[1] as HTMLElement).click();
    const post = await vi.waitFor(() => http.expectOne(`/api/v1/me/goals/${IDS.water}/campaign/questions/answer`));
    expect(post.request.body.fresh_set_id).toBeUndefined();
  });

  it('a march the golden run prepared no set for makes no serve call (h3 = A)', async () => {
    await shown(false);
    await settle();
    http.expectNone((r) => r.url.includes('/campaign/questions'));
    expect(text('#panel .q-stem')).toBe('No prepared question for this idea in the demo.');
  });
});
