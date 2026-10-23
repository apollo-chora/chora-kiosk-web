import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { KioskLanguage, provideKioskI18n } from '../../i18n/i18n';
import { SessionService } from '../../kiosk-api/session.service';
import { provideLive } from '../../live/live.providers';
import { KioskStore } from '../../shell/kiosk.store';
import { GradeExhibit } from '../grade/grade-exhibit';
import { DashboardExhibit } from './dashboard-exhibit';
import { DashboardSceneComponent } from './dashboard-scene.component';
import { HAWKER_QS, MINT, READS, WATER_MAP, WATER_QS, created, dashManifest, graded, takeRead } from './dashboard-world.testing';

// From the dashboard's results to the grading exhibit (mockup dashResultsHTML, dashToGrade and
// dashSeeResults, lines 5360, 5462 and 5889; K57): the visitor's held open answer goes to the
// grading exhibit, where LIVE grades it; with no answer written, a sample is shown graded there.
// Back on the dashboard, the open answer is read again from the product: released, it shows its
// grade and the assessment's total; never by comparing text.
describe('DashboardSceneComponent (to the grading exhibit and back)', () => {
  let http: HttpTestingController;
  let fixture: ComponentFixture<DashboardSceneComponent>;
  let el: HTMLElement;
  const exhibit = () => TestBed.inject(DashboardExhibit);
  const GRADING = '/api/v1/assessments/as-water/submissions/sub-water/grading';

  async function settle(): Promise<void> {
    for (let i = 0; i < 6; i++) {
      await Promise.resolve();
      fixture.detectChanges();
    }
  }

  beforeEach(async () => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting(), ...provideKioskI18n(), ...provideLive()] });
    http = TestBed.inject(HttpTestingController);
    await TestBed.inject(KioskLanguage).ready();
    fixture = TestBed.createComponent(DashboardSceneComponent);
    el = fixture.nativeElement as HTMLElement;
    fixture.detectChanges();
    http.expectOne('/api/v1/kiosk/prewarm/manifest').flush(dashManifest());
    (await vi.waitFor(() => http.expectOne('/api/v1/me/maps/g-water/graph'))).flush(WATER_MAP);
    (await vi.waitFor(() => http.expectOne('/api/me/dashboard'))).flush({ streak: { current_streak_days: 6 } });
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
    TestBed.inject(GradeExhibit).forget();
    TestBed.inject(SessionService).drop();
  });

  const text = (sel: string) => el.querySelector(sel)?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
  const texts = (sel: string) => Array.from(el.querySelectorAll(sel)).map((n) => n.textContent?.replace(/\s+/g, ' ').trim() ?? '');
  const click = async (sel: string, i = 0) => {
    (el.querySelectorAll(sel)[i] as HTMLElement).click();
    await settle();
  };

  /** Sit the water assessment: B on question 1, nothing on question 2, the open answer as given; submit. */
  async function sitWater(answer: string): Promise<void> {
    await click('.db-bank[data-id="bank.water"]');
    await click('[data-act="dbxTake"]');
    (await vi.waitFor(() => http.expectOne('/api/v1/kiosk/session'))).flush(MINT);
    (await vi.waitFor(() => http.expectOne('/api/v1/assessments'))).flush(created('as-water', 'Water for Life: Unit 1 quiz'), { status: 201, statusText: 'Created' });
    (await vi.waitFor(() => http.expectOne('/api/v1/me/assessments/as-water/submissions'))).flush({ submission_id: 'sub-water', attempt_number: 1 }, { status: 201, statusText: 'Created' });
    (await vi.waitFor(() => http.expectOne('/api/v1/me/assessments/as-water'))).flush(takeRead('as-water', 'Water for Life: Unit 1 quiz', WATER_QS));
    await vi.waitFor(() => expect(exhibit().attempt()?.status).toBe('in_progress'));
    await settle();
    await click('.dbx-opts .opt', 1);
    await click('[data-act="dbxNext"]');
    await click('[data-act="dbxNext"]');
    if (answer) {
      const area = el.querySelector('textarea#dbxtext') as HTMLTextAreaElement;
      area.value = answer;
      area.dispatchEvent(new Event('input'));
      await settle();
    }
    // W14: question 2 is unanswered, so the first press only warns; Submit anyway sends.
    await click('[data-act="dbxSubmit"]');
    expect(el.querySelector('.dbx-unanswered')).not.toBeNull();
    await click('[data-act="dbxSubmit"]');
    (await vi.waitFor(() => http.expectOne('/api/v1/me/assessments/as-water/submissions/sub-water'))).flush({});
    (await vi.waitFor(() => http.expectOne('/api/v1/me/assessments/as-water/submissions/sub-water/submit'))).flush(
      answer ? { submission_id: 'sub-water', state: 'SUBMITTED', grading_job_id: '', grading_held: true } : { submission_id: 'sub-water', state: 'GRADED', grading_job_id: '' },
      { status: 202, statusText: 'Accepted' },
    );
    (await vi.waitFor(() => http.expectOne(GRADING))).flush(graded([{ tsq: 'tsq-w1', correct: true, choice: 'tsq-w1-o2' }]));
    await vi.waitFor(() => expect(exhibit().attempt()?.status).toBe('submitted'));
    await settle();
  }

  /** Sit the hawker assessment (K159: water's mix): A on 1 and 2, the open answer as given; submit. */
  async function sitHawker(answer: string): Promise<void> {
    await click('.db-bank[data-id="bank.hawker"]');
    await click('[data-act="dbxTake"]');
    (await vi.waitFor(() => http.expectOne('/api/v1/kiosk/session'))).flush(MINT);
    (await vi.waitFor(() => http.expectOne('/api/v1/assessments'))).flush(created('as-hawker', 'Food Heritage: Unit 1 quiz'), { status: 201, statusText: 'Created' });
    (await vi.waitFor(() => http.expectOne('/api/v1/me/assessments/as-hawker/submissions'))).flush({ submission_id: 'sub-hawker', attempt_number: 1 }, { status: 201, statusText: 'Created' });
    (await vi.waitFor(() => http.expectOne('/api/v1/me/assessments/as-hawker'))).flush(takeRead('as-hawker', 'Food Heritage: Unit 1 quiz', HAWKER_QS));
    await vi.waitFor(() => expect(exhibit().attempt()?.status).toBe('in_progress'));
    await settle();
    await click('.dbx-opts .opt', 0);
    await click('[data-act="dbxNext"]');
    await click('.dbx-opts .opt', 0);
    await click('[data-act="dbxNext"]');
    if (answer) {
      const area = el.querySelector('textarea#dbxtext') as HTMLTextAreaElement;
      area.value = answer;
      area.dispatchEvent(new Event('input'));
      await settle();
    }
    await click('[data-act="dbxSubmit"]');
    if (!answer) await click('[data-act="dbxSubmit"]');
    (await vi.waitFor(() => http.expectOne('/api/v1/me/assessments/as-hawker/submissions/sub-hawker'))).flush({});
    (await vi.waitFor(() => http.expectOne('/api/v1/me/assessments/as-hawker/submissions/sub-hawker/submit'))).flush(
      answer ? { submission_id: 'sub-hawker', state: 'SUBMITTED', grading_job_id: '', grading_held: true } : { submission_id: 'sub-hawker', state: 'GRADED', grading_job_id: '' },
      { status: 202, statusText: 'Accepted' },
    );
    (await vi.waitFor(() => http.expectOne('/api/v1/assessments/as-hawker/submissions/sub-hawker/grading'))).flush(graded([{ tsq: 'tsq-h1', correct: true, choice: 'tsq-h1-o1' }]));
    await vi.waitFor(() => expect(exhibit().attempt()?.status).toBe('submitted'));
    await settle();
  }

  it('W27 (K159): a hawker open answer goes to Grading with its OWN question: the teh tarik stem, its rubric and its picture', async () => {
    await sitHawker('It cools the tea and makes it frothy.');
    expect(text('[data-act="dbxToGrade"]')).toBe('Send my answer to “Get an answer graded”');
    await click('[data-act="dbxToGrade"]');
    const g = TestBed.inject(GradeExhibit);
    expect(g.dash()).toMatchObject({ bankKey: 'bank.hawker', testSetQuestionId: 'tsq-h3', title: 'Food Heritage: Unit 1 quiz' });
    expect(g.question()).toMatchObject({
      testSetQuestionId: 'tsq-h3',
      stem: 'Why is teh tarik pulled from one mug to another?',
      rubric: ['Names the cooling', 'Names the froth', 'Ties it to the stall'],
      picture: '/p/teh.png',
      captionKey: 'img.label',
    });
  });

  it('W27: with a hawker open answer left empty there is no graded sample to see (the samples answer water’s question)', async () => {
    await sitHawker('');
    expect(el.querySelector('[data-act="dbxToGrade"]')).toBeNull();
  });

  it('the held open answer goes to the grading exhibit with its submission: Send my answer', async () => {
    await sitWater('Johor’s water ends in 2061.');
    expect(text('[data-act="dbxToGrade"]')).toBe('Send my answer to “Get an answer graded”');
    await click('[data-act="dbxToGrade"]');
    const g = TestBed.inject(GradeExhibit);
    expect(g.source()).toEqual({ kind: 'dash' });
    expect(g.dash()).toEqual({
      bankKey: 'bank.water',
      assessmentId: 'as-water',
      submissionId: 'sub-water',
      testSetQuestionId: 'tsq-w3',
      text: 'Johor’s water ends in 2061.',
      title: 'Water for Life: Unit 1 quiz',
      question: { stem: 'Why does Singapore need four taps?', rubric: ['Names when Johor’s water ends', 'Names a source that needs no rain', 'Explains the balance'], picture: '/p/taps.png', captionKey: 'dbx.q3Cap' },
    });
    expect(TestBed.inject(KioskStore).scene()).toBe('grade');
  });

  it('with no open answer written, the grading exhibit shows a sample answer graded', async () => {
    await sitWater('');
    expect(text('[data-act="dbxToGrade"]')).toBe('See a sample answer graded in “Get an answer graded”');
    await click('[data-act="dbxToGrade"]');
    const g = TestBed.inject(GradeExhibit);
    expect(g.source()).toEqual({ kind: 'sample', key: 'strong' });
    expect(g.dash()).toBeNull();
    expect(TestBed.inject(KioskStore).scene()).toBe('grade');
  });

  it('back on the results, the open answer is read again: released, its grade and the assessment’s total show, and the hand-off is gone', async () => {
    await sitWater('Johor’s water ends in 2061.');
    await click('[data-act="dbxList"]');
    await click('[data-act="dbxOpen"]');
    const reread = await vi.waitFor(() => http.expectOne(GRADING));
    reread.flush({
      submission_id: 'sub-water',
      state: 'RELEASED',
      review_status: 'APPROVED',
      questions: [
        { test_set_question_id: 'tsq-w1', question_type: 'mcq', points_earned: 10, points_possible: 10, correct: true, learner_answer: { mcq_choice_id: 'tsq-w1-o2' } },
        { test_set_question_id: 'tsq-w3', question_type: 'oe', points_earned: 8, points_possible: 10, learner_answer: { oe_response_text: 'Johor’s water ends in 2061.' } },
      ],
    });
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(texts('.dbx-res .dbx-out').at(-1)).toBe('Graded: 8 of 10');
    });
    await settle();
    expect(texts('.dbx-sum > *')).toEqual(['Total: 18 of 30 points', 'Multiple choice: 10 of 20 points']);
    expect(texts('.dbx-res .dbx-out')).toEqual(['Correct · 10 pts', 'Not answered · 0 pts', 'Graded: 8 of 10']);
    expect(texts('.dbx-res .dbx-why').at(-1)).toBe('Released by you, acting as the instructor');
    expect(text('.dbx-head .db-chip')).toBe('Graded');
    expect(el.querySelector('[data-act="dbxToGrade"]')).toBeNull();
    expect(el.querySelector('.dbx-narr .dbx-kiosk')).toBeNull();
  });

  it('a re-read that fails keeps the marks it had, said loudly', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await sitWater('Johor’s water ends in 2061.');
    await click('[data-act="dbxList"]');
    await click('[data-act="dbxOpen"]');
    (await vi.waitFor(() => http.expectOne(GRADING))).flush({ code: 'X' }, { status: 502, statusText: 'Bad Gateway' });
    await vi.waitFor(() => expect(error).toHaveBeenCalledWith(expect.stringContaining('could not be read again')));
    await settle();
    expect(texts('.dbx-res .dbx-out').at(-1)).toBe('Not graded yet');
    expect(el.querySelector('[data-act="dbxToGrade"]')).not.toBeNull();
    error.mockRestore();
  });

  it('See your results from the grading exhibit opens the bank’s results, read again', async () => {
    await sitWater('Johor’s water ends in 2061.');
    await click('[data-act="dbxList"]');
    await click('.db-bank[data-id="bank.nature"]');
    exhibit().seeResults('bank.water');
    await settle();
    expect(exhibit().picked()?.key).toBe('bank.water');
    expect(exhibit().mode()).toBe('take');
    (await vi.waitFor(() => http.expectOne(GRADING))).flush(graded([{ tsq: 'tsq-w1', correct: true, choice: 'tsq-w1-o2' }]));
  });
});
