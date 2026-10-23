import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { KioskLanguage, provideKioskI18n } from '../../i18n/i18n';
import { provideLive } from '../../live/live.providers';
import { SessionService } from '../../kiosk-api/session.service';
import { KioskStore } from '../../shell/kiosk.store';
import { provideTourBeats } from '../../shell/tour/tour-beats';
import { DashboardExhibit } from './dashboard-exhibit';
import { DashboardSceneComponent } from './dashboard-scene.component';
import { MINT, NATURE_QS, READS, WATER_MAP, WATER_QS, created, dashManifest, graded, takeRead } from './dashboard-world.testing';
import { VisitTally } from '../../shared/visit-tally';
import { VisitOrder } from '../../shared/visit-order';
import { OrderSource } from '../../shared/visit-order.testing';

// Sitting the assessment (mockup dashTake, dashQuestionHTML, dashSubmit and dashResultsHTML, lines
// 5407, 5319, 5444 and 5360; K55, K57, K79): Take creates the visitor's assessment on the bank's test
// set and starts the one attempt; one question a screen; Submit saves the answers and submits, which
// marks the multiple choice by rules at once and holds the open answer for the grading exhibit (K57);
// the marks come from the instructor's grading read, the key and its explanation from the test set.
describe('DashboardSceneComponent (sitting the assessment)', () => {
  let http: HttpTestingController;
  let fixture: ComponentFixture<DashboardSceneComponent>;
  let el: HTMLElement;
  const exhibit = () => TestBed.inject(DashboardExhibit);

  async function settle(): Promise<void> {
    for (let i = 0; i < 6; i++) {
      await Promise.resolve();
      fixture.detectChanges();
    }
  }

  const order = new OrderSource();

  beforeEach(async () => {
    order.keep();
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting(), ...provideKioskI18n(), ...provideLive(), ...order.providers] });
    http = TestBed.inject(HttpTestingController);
    await TestBed.inject(KioskLanguage).ready();
    fixture = TestBed.createComponent(DashboardSceneComponent);
    el = fixture.nativeElement as HTMLElement;
    fixture.detectChanges();
    http.expectOne('/api/v1/kiosk/prewarm/manifest').flush(dashManifest());
    (await vi.waitFor(() => http.expectOne('/api/v1/me/maps/g-water/graph'))).flush(WATER_MAP);
    (await vi.waitFor(() => http.expectOne('/api/me/dashboard'))).flush({ currentStreakDays: 6, streak: { current_streak_days: 6 } });
    (await vi.waitFor(() => http.expectOne('/api/v1/me/mana'))).flush({ gcid: 'g', balance_units: 1240 });
    for (const [b, ts] of [['b-water', 'ts-water'], ['b-nature', 'ts-nature'], ['b-hawker', 'ts-hawker']]) {
      (await vi.waitFor(() => http.expectOne(`/api/v1/question-banks/${b}`))).flush(READS[b]);
      (await vi.waitFor(() => http.expectOne(`/api/v1/test-sets/${ts}`))).flush(READS[ts]);
    }
    await vi.waitFor(() => expect(exhibit().status()).toBe('ready'));
    await settle();
  });

  afterEach(() => {
    exhibit().forget();
    TestBed.inject(SessionService).drop();
  });

  const text = (sel: string) => el.querySelector(sel)?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
  const texts = (sel: string) => Array.from(el.querySelectorAll(sel)).map((n) => n.textContent?.replace(/\s+/g, ' ').trim() ?? '');
  const click = async (sel: string, i = 0) => {
    (el.querySelectorAll(sel)[i] as HTMLElement).click();
    await settle();
  };

  /** Pick the bank, press Take: the mint, the create, the start and the take read. */
  async function take(bank: 'water' | 'nature', qs = bank === 'water' ? WATER_QS : NATURE_QS, served = takeRead(`as-${bank}`, '', qs)): Promise<void> {
    const title = bank === 'water' ? 'Water for Life: Unit 1 quiz' : 'Nature Ranger: Unit 1 quiz';
    await click(`.db-bank[data-id="bank.${bank}"]`);
    await click('[data-act="dbxTake"]');
    (await vi.waitFor(() => http.expectOne('/api/v1/kiosk/session'))).flush(MINT);
    const create = await vi.waitFor(() => http.expectOne('/api/v1/assessments'));
    expect(create.request.body).toEqual({ test_set_id: `ts-${bank}`, title_override: title, invited_gcids: ['g-visitor'], max_attempts: 1, shuffle_mcq_options: true });
    create.flush(created(`as-${bank}`, title), { status: 201, statusText: 'Created' });
    (await vi.waitFor(() => http.expectOne(`/api/v1/me/assessments/as-${bank}/submissions`))).flush({ submission_id: `sub-${bank}`, attempt_number: 1, opens_at: 'x', closes_at: 'y', time_limit_seconds: 0 }, { status: 201, statusText: 'Created' });
    (await vi.waitFor(() => http.expectOne(`/api/v1/me/assessments/as-${bank}`))).flush({ ...served, title });
    await vi.waitFor(() => expect(exhibit().attempt()?.status).toBe('in_progress'));
    await settle();
  }

  it('Take creates the visitor’s assessment on the bank’s test set, starts the attempt and shows question 1', async () => {
    await take('water');
    expect(text('.ex-head h2')).toBe('Sitting the assessment');
    expect(el.querySelector('.db-banks')).toBeNull();
    expect(text('.dbx-head .db-chip')).toBe('In progress');
    expect(text('.dbx-title h3')).toBe('Water for Life: Unit 1 quiz');
    expect(text('.dbx-title span')).toBe('3 questions · Window: 30 Oct, 10:00 to 31 Oct, 10:00');
    expect(text('.dbx-prog')).toBe('Question 1 of 3');
    expect(text('.dbx-stem')).toBe('What is NEWater?');
    expect(texts('.dbx-opts .opt')).toEqual(['AOne', 'BTwo']);
    expect(texts('.dbx-nav button')).toEqual(['Back to the banks', 'Next question']);
  });

  it('W26 (K161): each multiple-choice question says, while it is sat, that its marking is by rules; the open one keeps its own note', async () => {
    await take('water');
    const NOTE = 'Marked by rules, not AI: the answer key was written with this question when it was generated, so the same answer always gets the same mark. Only open answers go to the grading crew.';
    expect(text('.dbx-mcq-note')).toBe(NOTE);
    expect(el.querySelector('.dbx-mcq-note kiosk-icon')).not.toBeNull();
    await TestBed.inject(KioskLanguage).setLang('zh');
    await settle();
    expect(text('.dbx-mcq-note')).toBe('按规则评分，不用 AI：答案在生成这道题时就一并写好了，所以同样的答案总是得到同样的分数。只有开放题才交给评分团队。');
    await TestBed.inject(KioskLanguage).setLang('en');
    for (let i = 0; i < 2; i++) await click('[data-act="dbxNext"]');
    expect(el.querySelector('#dbxtext')).not.toBeNull();
    expect(el.querySelector('.dbx-mcq-note')).toBeNull();
  });

  it('answers carry over Back and Next; Submit saves them, submits and holds the open answer (K57); the marks come from the grading read', async () => {
    await take('water');
    await click('.dbx-opts .opt', 1);
    expect(el.querySelector('.dbx-opts .opt.sel')?.getAttribute('aria-checked')).toBe('true');
    await click('[data-act="dbxNext"]');
    await click('.dbx-opts .opt', 0);
    await click('[data-act="dbxPrev"]');
    expect(el.querySelectorAll('.dbx-opts .opt.sel').length).toBe(1);
    await click('[data-act="dbxNext"]');
    await click('[data-act="dbxNext"]');
    const area = el.querySelector('textarea#dbxtext') as HTMLTextAreaElement;
    area.value = 'Four taps spread the risk.';
    area.dispatchEvent(new Event('input'));
    await settle();
    await click('[data-act="dbxSubmit"]');
    const save = await vi.waitFor(() => http.expectOne('/api/v1/me/assessments/as-water/submissions/sub-water'));
    expect(save.request.body).toEqual({
      answers: [
        { test_set_question_id: 'tsq-w1', question_id: 'q-w1', question_type: 'mcq', mcq_choice_id: 'tsq-w1-o2' },
        { test_set_question_id: 'tsq-w2', question_id: 'q-w2', question_type: 'mcq', mcq_choice_id: 'tsq-w2-o1' },
        { test_set_question_id: 'tsq-w3', question_id: 'q-w3', question_type: 'oe', oe_response_text: 'Four taps spread the risk.' },
      ],
    });
    save.flush({ submission_id: 'sub-water', state: 'IN_PROGRESS', answers: [] });
    (await vi.waitFor(() => http.expectOne('/api/v1/me/assessments/as-water/submissions/sub-water/submit'))).flush({ submission_id: 'sub-water', state: 'SUBMITTED', grading_job_id: '', grading_eta_seconds: 0, grading_held: true }, { status: 202, statusText: 'Accepted' });
    (await vi.waitFor(() => http.expectOne('/api/v1/assessments/as-water/submissions/sub-water/grading'))).flush(graded([{ tsq: 'tsq-w1', correct: true, choice: 'tsq-w1-o2' }, { tsq: 'tsq-w2', correct: false, choice: 'tsq-w2-o1' }]));
    await vi.waitFor(() => expect(exhibit().attempt()?.status).toBe('submitted'));
    await settle();
    expect(text('.ex-head p')).toBe('Submitted. Here is how each answer was marked.');
    // The crews timeline counts the multiple-choice answers submitted (mockup dbSubmit, line 5454).
    expect(TestBed.inject(VisitTally).answers()).toBe(2);
    expect(text('.dbx-head .db-chip')).toBe('Submitted');
    expect(el.querySelector('.dbx-prog')).toBeNull();
    expect(texts('.dbx-sum > *')).toEqual(['Multiple choice: 10 of 20 points', 'The open question, worth 10, is marked separately.']);
    expect(texts('.dbx-res .dbx-out')).toEqual(['Correct · 10 pts', 'Not quite · 0 pts', 'Not graded yet']);
    expect(texts('.dbx-res .dbx-key')).toEqual(['Answer: B, Two']);
    expect(texts('.dbx-res .dbx-why')).toEqual(['Why What is NEWater?', 'Why Which stage removes the finest particles?', 'Held until you send it to the grading crew.']);
    expect(text('.dbx-narr h3')).toBe('Two ways to mark an answer');
    expect(el.querySelector('.dbx-narr .dbx-way.oe')).not.toBeNull();
    expect(el.querySelector('.dbx-narr .dbx-kiosk')).not.toBeNull();
  });

  it('K149 (dashboard): the take shows this visit’s drawn order, answers by option id, and the results letter the key in that order', async () => {
    // Delivery's per-learner shuffle (K145) is one order for the kiosk's one learner, the same for every
    // visitor, so the take and the results draw the visit's own order over it.
    order.drawFrom(7);
    await take('nature');
    expect(texts('.dbx-opts .opt')).toEqual(['ATwo', 'BOne']);
    await click('.dbx-opts .opt', 1);
    for (let i = 1; i < 3; i++) {
      await click('[data-act="dbxNext"]');
      await click('.dbx-opts .opt', 0);
    }
    await click('[data-act="dbxPrev"]');
    await click('[data-act="dbxPrev"]');
    // Back shows the same order within the visit.
    expect(texts('.dbx-opts .opt')).toEqual(['ATwo', 'BOne']);
    await click('[data-act="dbxNext"]');
    await click('[data-act="dbxNext"]');
    await click('[data-act="dbxSubmit"]');
    const save = await vi.waitFor(() => http.expectOne('/api/v1/me/assessments/as-nature/submissions/sub-nature'));
    expect((save.request.body as { answers: { test_set_question_id: string; mcq_choice_id?: string }[] }).answers.find((x) => x.test_set_question_id === 'tsq-n1')).toMatchObject({ mcq_choice_id: 'tsq-n1-o1' });
    save.flush({});
    (await vi.waitFor(() => http.expectOne('/api/v1/me/assessments/as-nature/submissions/sub-nature/submit'))).flush({ submission_id: 'sub-nature', state: 'GRADED', grading_job_id: '' });
    (await vi.waitFor(() => http.expectOne('/api/v1/assessments/as-nature/submissions/sub-nature/grading'))).flush(graded([{ tsq: 'tsq-n1', correct: false, choice: 'tsq-n1-o1' }, { tsq: 'tsq-n2', correct: true, choice: 'tsq-n2-o2' }, { tsq: 'tsq-n3', correct: true, choice: 'tsq-n3-o2' }]));
    await vi.waitFor(() => expect(exhibit().attempt()?.status).toBe('submitted'));
    await settle();
    // The key, Two, stood at A in this visit's take, so the results say A.
    expect(texts('.dbx-res .dbx-key')).toEqual(['Answer: A, Two']);
  });

  it('K149 (dashboard): the end of a visit forgets the order, so the next draws its own (the session end calls forget, app.spec)', async () => {
    order.drawFrom(7);
    await take('nature');
    expect(texts('.dbx-opts .opt')).toEqual(['ATwo', 'BOne']);
    TestBed.inject(VisitOrder).forget();
    order.keep();
    await click('[data-act="dbxNext"]');
    await click('[data-act="dbxPrev"]');
    expect(texts('.dbx-opts .opt')).toEqual(['AOne', 'BTwo']);
  });

  it('K79: a multiple-choice-only bank is graded at Submit and shows its total', async () => {
    await take('nature');
    for (let i = 0; i < 3; i++) {
      await click('.dbx-opts .opt', i === 2 ? 0 : 1);
      if (i < 2) await click('[data-act="dbxNext"]');
    }
    await click('[data-act="dbxSubmit"]');
    (await vi.waitFor(() => http.expectOne('/api/v1/me/assessments/as-nature/submissions/sub-nature'))).flush({});
    (await vi.waitFor(() => http.expectOne('/api/v1/me/assessments/as-nature/submissions/sub-nature/submit'))).flush({ submission_id: 'sub-nature', state: 'GRADED', grading_job_id: '' });
    (await vi.waitFor(() => http.expectOne('/api/v1/assessments/as-nature/submissions/sub-nature/grading'))).flush(graded([{ tsq: 'tsq-n1', correct: true, choice: 'tsq-n1-o2' }, { tsq: 'tsq-n2', correct: true, choice: 'tsq-n2-o2' }, { tsq: 'tsq-n3', correct: false, choice: 'tsq-n3-o1' }]));
    await vi.waitFor(() => expect(exhibit().attempt()?.status).toBe('submitted'));
    await settle();
    expect(text('.dbx-head .db-chip')).toBe('Graded');
    expect(texts('.dbx-sum > *')).toEqual(['Total: 20 of 30 points']);
    expect(text('.dbx-narr h3')).toBe('How your answers were marked');
    expect(el.querySelector('.dbx-narr .dbx-way.oe')).toBeNull();
    expect(el.querySelector('.dbx-narr .dbx-kiosk')).toBeNull();
    // A submitted take: its results' link returns to the banks (the keys are the tour's, K173).
    await click('[data-act="dbxList"]');
    expect(exhibit().mode()).toBe('list');
  });

  it('K173: in a take the keys are the tour’s (Next to D2, the water bank’s list, the take kept); its own buttons step its questions', async () => {
    TestBed.runInInjectionContext(() => provideTourBeats());
    const store = TestBed.inject(KioskStore);
    await take('water');
    store.go('dash');
    await click('[data-act="dbxNext"]');
    expect(text('.dbx-prog')).toBe('Question 2 of 3');
    await click('[data-act="dbxPrev"]');
    expect(text('.dbx-prog')).toBe('Question 1 of 3');
    store.next();
    await settle();
    expect(exhibit().mode()).toBe('list');
    expect(exhibit().picked()?.key).toBe('bank.water');
    expect(text('[data-act="dbxOpen"]')).toBe('Continue the assessment');
    store.escapeUp();
    expect(store.scene()).toBe('hall');
  });

  it('W14: the visit’s picks survive Back to the banks and Continue, and Submit saves them', async () => {
    await take('nature');
    await click('.dbx-opts .opt', 1);
    await click('[data-act="dbxPrev"]');
    expect(exhibit().mode()).toBe('list');
    expect(text('.db-act [data-act="dbxOpen"]')).toBe('Continue the assessment');
    await click('[data-act="dbxOpen"]');
    expect(text('.dbx-prog')).toBe('Question 1 of 3');
    expect(el.querySelector('.dbx-opts .opt.sel')).toBe(el.querySelectorAll('.dbx-opts .opt')[1]);
    await click('[data-act="dbxNext"]');
    await click('.dbx-opts .opt', 0);
    await click('[data-act="dbxNext"]');
    await click('.dbx-opts .opt', 0);
    await click('[data-act="dbxSubmit"]');
    const save = await vi.waitFor(() => http.expectOne('/api/v1/me/assessments/as-nature/submissions/sub-nature'));
    expect((save.request.body as { answers: unknown[] }).answers.length).toBe(3);
  });

  it('W14: Submit with questions not answered warns first and sends nothing; the line follows the answers', async () => {
    await take('nature');
    await click('.dbx-opts .opt', 1);
    await click('[data-act="dbxNext"]');
    await click('[data-act="dbxNext"]');
    expect(text('[data-act="dbxSubmit"]')).toBe('Submit');
    expect(el.querySelector('.dbx-unanswered')).toBeNull();
    await click('[data-act="dbxSubmit"]');
    http.expectNone(() => true);
    expect(exhibit().attempt()?.status).toBe('in_progress');
    expect(text('.dbx-unanswered')).toBe('2 of 3 questions are not answered yet. If you submit now, each scores 0.');
    expect(text('[data-act="dbxSubmit"]')).toBe('Submit anyway');
    await click('.dbx-opts .opt', 0);
    expect(text('.dbx-unanswered')).toBe('1 of 3 questions are not answered yet. If you submit now, each scores 0.');
    await click('[data-act="dbxPrev"]');
    await click('.dbx-opts .opt', 0);
    await click('[data-act="dbxNext"]');
    // Every question answered: no line, and Submit is plain again.
    expect(el.querySelector('.dbx-unanswered')).toBeNull();
    expect(text('[data-act="dbxSubmit"]')).toBe('Submit');
  });

  it('W14 in Chinese: the warning and Submit anyway', async () => {
    await TestBed.inject(KioskLanguage).setLang('zh');
    await take('nature');
    await click('[data-act="dbxNext"]');
    await click('[data-act="dbxNext"]');
    await click('[data-act="dbxSubmit"]');
    http.expectNone(() => true);
    expect(text('.dbx-unanswered')).toBe('还有 3 道题未作答（共 3 道）。现在提交，每道未作答的题记 0 分。');
    expect(text('[data-act="dbxSubmit"]')).toBe('仍然提交');
  });

  it('nothing answered: Submit warns, Submit anyway sends no save, every row Not answered, and back on the list the window, 1 / 1 and See your results', async () => {
    await take('nature');
    await click('[data-act="dbxNext"]');
    await click('[data-act="dbxNext"]');
    await click('[data-act="dbxSubmit"]');
    http.expectNone(() => true);
    await click('[data-act="dbxSubmit"]');
    (await vi.waitFor(() => http.expectOne('/api/v1/me/assessments/as-nature/submissions/sub-nature/submit'))).flush({ submission_id: 'sub-nature', state: 'GRADED', grading_job_id: '' });
    http.expectNone((r) => r.method === 'PATCH');
    (await vi.waitFor(() => http.expectOne('/api/v1/assessments/as-nature/submissions/sub-nature/grading'))).flush(graded([]));
    await vi.waitFor(() => expect(exhibit().attempt()?.status).toBe('submitted'));
    await settle();
    expect(new Set(texts('.dbx-res .dbx-out'))).toEqual(new Set(['Not answered · 0 pts']));
    expect(TestBed.inject(VisitTally).answers()).toBe(0);
    expect(texts('.dbx-sum > *')).toEqual(['Total: 0 of 30 points']);
    await click('[data-act="dbxList"]');
    expect(texts('.db-meta dt')).toEqual(['Window', 'Questions', 'Total points', 'Attempts']);
    expect(texts('.db-meta dd')).toEqual(['30 Oct, 10:00 to 31 Oct, 10:00', '3', '30', '1 / 1']);
    expect(text('.db-act [data-act="dbxOpen"]')).toBe('See your results');
    expect(text('.db-act .db-note')).toBe('You have used your one attempt.');
    expect(el.querySelectorAll('.db-flow span.on').length).toBe(4);
    await click('[data-act="dbxOpen"]');
    expect(texts('.dbx-sum > *')).toEqual(['Total: 0 of 30 points']);
    http.expectNone(() => true);
  });

  it('a refused create says so and leaves Take to press again; nothing half made is kept', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await click('.db-bank[data-id="bank.water"]');
    await click('[data-act="dbxTake"]');
    (await vi.waitFor(() => http.expectOne('/api/v1/kiosk/session'))).flush(MINT);
    (await vi.waitFor(() => http.expectOne('/api/v1/assessments'))).flush({ code: 'DELIVERY_TEST_SET_NOT_PUBLISHED' }, { status: 409, statusText: 'Conflict' });
    await vi.waitFor(() => expect(exhibit().busy()).toBeNull());
    await settle();
    expect(text('.db-act .msg-error')).not.toBe('');
    expect(text('.db-act [data-act="dbxTake"]')).toBe('Take this assessment');
    expect(error).toHaveBeenCalledWith(expect.stringContaining('DELIVERY_TEST_SET_NOT_PUBLISHED'));
    error.mockRestore();
  });

  it('a second press while Take runs makes no second assessment', async () => {
    await click('.db-bank[data-id="bank.water"]');
    const first = exhibit().take();
    void exhibit().take();
    exhibit().pick('bank.nature');
    expect(exhibit().picked()?.key).toBe('bank.water');
    (await vi.waitFor(() => http.expectOne('/api/v1/kiosk/session'))).flush(MINT);
    (await vi.waitFor(() => http.expectOne('/api/v1/assessments'))).flush(created('as-water', 'Water for Life: Unit 1 quiz'), { status: 201, statusText: 'Created' });
    (await vi.waitFor(() => http.expectOne('/api/v1/me/assessments/as-water/submissions'))).flush({ submission_id: 'sub-water', attempt_number: 1 }, { status: 201, statusText: 'Created' });
    (await vi.waitFor(() => http.expectOne('/api/v1/me/assessments/as-water'))).flush(takeRead('as-water', 'Water for Life: Unit 1 quiz', WATER_QS));
    await first;
    http.expectNone('/api/v1/assessments');
    expect(exhibit().mode()).toBe('take');
  });

  it('a take whose start failed is finished on the next press, never made twice', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await click('.db-bank[data-id="bank.water"]');
    await click('[data-act="dbxTake"]');
    (await vi.waitFor(() => http.expectOne('/api/v1/kiosk/session'))).flush(MINT);
    (await vi.waitFor(() => http.expectOne('/api/v1/assessments'))).flush(created('as-water', 'Water for Life: Unit 1 quiz'), { status: 201, statusText: 'Created' });
    (await vi.waitFor(() => http.expectOne('/api/v1/me/assessments/as-water/submissions'))).flush({ code: 'INTERNAL' }, { status: 502, statusText: 'Bad Gateway' });
    await vi.waitFor(() => expect(exhibit().failed()).toBe('take'));
    await settle();
    expect(text('.db-act .msg-error')).not.toBe('');
    await click('[data-act="dbxTake"]');
    http.expectNone('/api/v1/assessments');
    (await vi.waitFor(() => http.expectOne('/api/v1/me/assessments/as-water/submissions'))).flush({ submission_id: 'sub-water', attempt_number: 1 }, { status: 201, statusText: 'Created' });
    (await vi.waitFor(() => http.expectOne('/api/v1/me/assessments/as-water'))).flush(takeRead('as-water', 'Water for Life: Unit 1 quiz', WATER_QS));
    await vi.waitFor(() => expect(exhibit().attempt()?.status).toBe('in_progress'));
    expect(exhibit().failed()).toBeNull();
    expect(error).toHaveBeenCalledWith(expect.stringContaining('could not be taken'));
    error.mockRestore();
  });

  it('a failed submit says so on the question, keeps the answers, and the next press sends them again', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await take('nature');
    await click('.dbx-opts .opt', 1);
    await click('[data-act="dbxNext"]');
    await click('[data-act="dbxNext"]');
    // W14: two questions are unanswered, so the first press only warns; Submit anyway sends.
    await click('[data-act="dbxSubmit"]');
    await click('[data-act="dbxSubmit"]');
    (await vi.waitFor(() => http.expectOne('/api/v1/me/assessments/as-nature/submissions/sub-nature'))).flush({});
    (await vi.waitFor(() => http.expectOne('/api/v1/me/assessments/as-nature/submissions/sub-nature/submit'))).flush({ code: 'GATEWAY_TIMEOUT' }, { status: 504, statusText: 'Gateway Timeout' });
    await vi.waitFor(() => expect(exhibit().failed()).toBe('submit'));
    await settle();
    expect(exhibit().attempt()?.status).toBe('in_progress');
    expect(text('.dbx-main .msg-error')).not.toBe('');
    expect(exhibit().attempt()?.answers.get('tsq-n1')).toBe('tsq-n1-o2');
    await click('[data-act="dbxSubmit"]');
    const save = await vi.waitFor(() => http.expectOne('/api/v1/me/assessments/as-nature/submissions/sub-nature'));
    expect(save.request.body).toEqual({ answers: [{ test_set_question_id: 'tsq-n1', question_id: 'q-n1', question_type: 'mcq', mcq_choice_id: 'tsq-n1-o2' }] });
    save.flush({});
    (await vi.waitFor(() => http.expectOne('/api/v1/me/assessments/as-nature/submissions/sub-nature/submit'))).flush({ submission_id: 'sub-nature', state: 'GRADED', grading_job_id: '' });
    (await vi.waitFor(() => http.expectOne('/api/v1/assessments/as-nature/submissions/sub-nature/grading'))).flush(graded([{ tsq: 'tsq-n1', correct: true, choice: 'tsq-n1-o2' }]));
    await vi.waitFor(() => expect(exhibit().attempt()?.status).toBe('submitted'));
    expect(exhibit().failed()).toBeNull();
    expect(error).toHaveBeenCalledWith(expect.stringContaining('could not be submitted'));
    error.mockRestore();
  });

  it('a create that outlives its visit (a reset) writes nothing', async () => {
    await click('.db-bank[data-id="bank.water"]');
    await click('[data-act="dbxTake"]');
    (await vi.waitFor(() => http.expectOne('/api/v1/kiosk/session'))).flush(MINT);
    const create = await vi.waitFor(() => http.expectOne('/api/v1/assessments'));
    exhibit().forget();
    create.flush(created('as-water', 'Water for Life: Unit 1 quiz'), { status: 201, statusText: 'Created' });
    await settle();
    http.expectNone('/api/v1/me/assessments/as-water/submissions');
    expect(exhibit().attempt()).toBeNull();
    expect(exhibit().busy()).toBeNull();
  });
});
