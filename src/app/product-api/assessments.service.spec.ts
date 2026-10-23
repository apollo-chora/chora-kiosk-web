import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { AssessmentsService } from './assessments.service';
import recorded from './take-nature.recorded.json';

// The dashboard's assessments (K55, K79, K57) on production's routes, in the order a take needs:
// the bank and its published test set (creation), then delivery's create (no window: now to +24 h,
// assessment_handler.go:155-175, 270-278), the learner's start, the take read, the answers PATCH,
// the submit (202 grading_held under K57, :1226) and the instructor's grading read, the only read
// that carries the marks before a release (grading_review_handler.go:140-185).
describe('AssessmentsService', () => {
  let svc: AssessmentsService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    svc = TestBed.inject(AssessmentsService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('reads a bank by its id, in production’s mapping', async () => {
    const p = svc.bank('b-water');
    http.expectOne('/api/v1/question-banks/b-water').flush({ question_bank_id: 'b-water', tenant_id: 't', owner_gcid: 'g', name: 'Singapore’s water', visibility: 'PRIVATE', created_at: 'x', updated_at: 'x', items: [] });
    expect((await p).name).toBe('Singapore’s water');
  });

  it('reads a test set with its questions in display order, whatever order storage returns', async () => {
    const p = svc.testSet('ts-1');
    const q = (id: string, order: number, type: 'mcq' | 'oe') => ({ test_set_question_id: id, test_set_id: 'ts-1', question_id: `q-${id}`, question_atom_id: 'a', question_type: type, points: 10, display_order: order, added_at: 'x' });
    http.expectOne('/api/v1/test-sets/ts-1').flush({ test_set_id: 'ts-1', title: 'Water quiz', total_points: 30, question_count: 3, state: 'PUBLISHED', questions: [q('c', 3, 'oe'), q('a', 1, 'mcq'), q('b', 2, 'mcq')] });
    const ts = await p;
    expect([ts.title, ts.questions.map((x) => x.test_set_question_id)]).toEqual(['Water quiz', ['a', 'b', 'c']]);
  });

  it('creates the assessment for the visitor with the test set’s title, one attempt and no window', async () => {
    const p = svc.create({ testSetId: 'ts-1', title: 'Water quiz', learnerGcid: 'g-1' });
    const req = http.expectOne('/api/v1/assessments');
    // K145: delivery shuffles each learner's options only when asked (an omitted field is off).
    expect([req.request.method, req.request.body]).toEqual(['POST', { test_set_id: 'ts-1', title_override: 'Water quiz', invited_gcids: ['g-1'], max_attempts: 1, shuffle_mcq_options: true }]);
    req.flush({ assessment_id: 'as-1', title: 'Water quiz', scheduled_open_at: '2026-10-30T02:00:00Z', scheduled_close_at: '2026-10-31T02:00:00Z', max_attempts: 1 }, { status: 201, statusText: 'Created' });
    expect((await p).assessment_id).toBe('as-1');
  });

  it('starts the learner’s attempt with an empty body, and reads the take in display order', async () => {
    const started = svc.start('as-1');
    const s = http.expectOne('/api/v1/me/assessments/as-1/submissions');
    expect([s.request.method, s.request.body]).toEqual(['POST', {}]);
    s.flush({ submission_id: 'sub-1', attempt_number: 1, opens_at: 'x', closes_at: 'y', time_limit_seconds: 0 }, { status: 201, statusText: 'Created' });
    expect((await started).submission_id).toBe('sub-1');
    const take = svc.take('as-1');
    const lq = (id: string, order: number) => ({ test_set_question_id: id, question_id: `q-${id}`, question_type: 'mcq', display_order: order, prompt: { stem: id, options: [{ option_id: `${id}-1`, label: 'A', text: 'One' }] } });
    http.expectOne('/api/v1/me/assessments/as-1').flush({ assessment_id: 'as-1', title: 'Water quiz', max_attempts: 1, learner_attempt_count: 1, questions: [lq('b', 2), lq('a', 1)] });
    expect((await take).questions.map((x) => x.test_set_question_id)).toEqual(['a', 'b']);
  });

  it('saves the answers, refusing an empty list (the server answers 400), then submits', async () => {
    await expect(svc.save('as-1', 'sub-1', [])).rejects.toThrow(/no answers/);
    const saved = svc.save('as-1', 'sub-1', [{ test_set_question_id: 'a', question_id: 'q-a', question_type: 'mcq', mcq_choice_id: 'a-1' }]);
    const patch = http.expectOne('/api/v1/me/assessments/as-1/submissions/sub-1');
    expect([patch.request.method, patch.request.body]).toEqual(['PATCH', { answers: [{ test_set_question_id: 'a', question_id: 'q-a', question_type: 'mcq', mcq_choice_id: 'a-1' }] }]);
    patch.flush({ submission_id: 'sub-1', state: 'IN_PROGRESS', answers: [] });
    await saved;
    const sent = svc.submit('as-1', 'sub-1');
    const sub = http.expectOne('/api/v1/me/assessments/as-1/submissions/sub-1/submit');
    expect([sub.request.method, sub.request.body]).toEqual(['POST', {}]);
    sub.flush({ submission_id: 'sub-1', state: 'SUBMITTED', grading_job_id: '', grading_eta_seconds: 0, grading_held: true }, { status: 202, statusText: 'Accepted' });
    expect(await sent).toMatchObject({ state: 'SUBMITTED', grading_held: true });
  });

  it('reads the marks from the instructor’s grading read', async () => {
    const p = svc.grading('as-1', 'sub-1');
    http.expectOne('/api/v1/assessments/as-1/submissions/sub-1/grading').flush({ submission_id: 'sub-1', state: 'SUBMITTED', questions: [{ test_set_question_id: 'a', question_type: 'mcq', points_earned: 10, points_possible: 10, correct: true, learner_answer: { mcq_choice_id: 'a-1' } }] });
    const g = await p;
    expect(g.questions[0]).toMatchObject({ test_set_question_id: 'a', correct: true, points_earned: 10 });
  });

  it('reads an open answer’s grade for review: the crew’s criteria, the comment and its graded time', async () => {
    const p = svc.grading('as-s', 'sub-s');
    http.expectOne('/api/v1/assessments/as-s/submissions/sub-s/grading').flush({
      submission_id: 'sub-s',
      state: 'GRADED',
      review_status: 'PENDING_REVIEW',
      total_points_earned: 9,
      total_points_possible: 10,
      questions: [
        {
          test_set_question_id: 'tsq-g',
          question_type: 'oe',
          points_earned: 9,
          points_possible: 10,
          ai_points_earned: 9,
          comment: 'Clear on the risk.',
          ai_comment: 'Clear on the risk.',
          score_provenance: 'AI',
          oe_graded_at: '2026-10-20T06:10:00Z',
          learner_answer: { oe_response_text: 'The 2061 agreement ends.' },
          criterion_scores: [{ criterion_id: 'c1', title: 'Names the risk', score: 4, max_score: 4, feedback: 'Names 2061.' }],
        },
      ],
    });
    const g = await p;
    expect(g.review_status).toBe('PENDING_REVIEW');
    expect(g.questions[0].criterion_scores?.[0]).toEqual({ criterion_id: 'c1', title: 'Names the risk', score: 4, max_score: 4, feedback: 'Names 2061.' });
  });

  it('the person’s review sends only what changed (an unchanged field keeps its AI provenance), then approve and release', async () => {
    const e = svc.editGrade('as-s', 'sub-s', { testSetQuestionId: 'tsq-g', pointsEarned: 7 });
    const patch = http.expectOne('/api/v1/assessments/as-s/submissions/sub-s/grades');
    expect(patch.request.method).toBe('PATCH');
    expect(patch.request.body).toEqual({ question_edits: [{ test_set_question_id: 'tsq-g', points_earned: 7 }] });
    patch.flush({ submission_id: 'sub-s', state: 'GRADED', review_status: 'PENDING_REVIEW', questions: [] });
    await e;
    const c = svc.editGrade('as-s', 'sub-s', { testSetQuestionId: 'tsq-g', comment: 'Good. Instructor’s note.' });
    const comment = http.expectOne('/api/v1/assessments/as-s/submissions/sub-s/grades');
    expect(comment.request.body).toEqual({ question_edits: [{ test_set_question_id: 'tsq-g', comment: 'Good. Instructor’s note.' }] });
    comment.flush({ submission_id: 'sub-s', state: 'GRADED', questions: [] });
    await c;
    await expect(svc.editGrade('as-s', 'sub-s', { testSetQuestionId: 'tsq-g' })).rejects.toThrow(/nothing changed/);
    const a = svc.approve('as-s', 'sub-s');
    const approve = http.expectOne('/api/v1/assessments/as-s/submissions/sub-s/approve');
    expect(approve.request.method).toBe('POST');
    approve.flush({ submission_id: 'sub-s', state: 'GRADED', review_status: 'APPROVED' });
    await expect(a).resolves.toMatchObject({ review_status: 'APPROVED' });
    const r = svc.release('as-s');
    const release = http.expectOne('/api/v1/assessments/as-s/release-results');
    expect(release.request.method).toBe('POST');
    expect(release.request.body).toEqual({});
    release.flush({ assessment_id: 'as-s', title: 'T', state: 'RELEASED', scheduled_open_at: 'x', scheduled_close_at: 'y', max_attempts: 1 });
    await expect(r).resolves.toMatchObject({ assessment_id: 'as-s' });
  });

  it('an approve that answers with the review still pending is an error, never read as approved', async () => {
    const a = svc.approve('as-s', 'sub-s');
    http.expectOne('/api/v1/assessments/as-s/submissions/sub-s/approve').flush({ submission_id: 'sub-s', state: 'GRADED', review_status: 'PENDING_REVIEW' });
    await expect(a).rejects.toThrow(/PENDING_REVIEW/);
  });

  it('a refused call is a loud error naming the call and its code', async () => {
    const p = svc.start('as-1');
    http.expectOne('/api/v1/me/assessments/as-1/submissions').flush({ code: 'DELIVERY_LEARNER_NOT_IN_COHORT', message: 'not invited' }, { status: 403, statusText: 'Forbidden' });
    await expect(p).rejects.toThrow(/POST \/api\/v1\/me\/assessments\/as-1\/submissions: 403 DELIVERY_LEARNER_NOT_IN_COHORT/);
  });

  it('answers that lack their ids are errors, never read as a take', async () => {
    const c = svc.create({ testSetId: 'ts-1', title: 'T', learnerGcid: 'g' });
    http.expectOne('/api/v1/assessments').flush({ title: 'T' }, { status: 201, statusText: 'Created' });
    await expect(c).rejects.toThrow(/no assessment_id/);
    const s = svc.start('as-1');
    http.expectOne('/api/v1/me/assessments/as-1/submissions').flush({ attempt_number: 1 }, { status: 201, statusText: 'Created' });
    await expect(s).rejects.toThrow(/no submission_id/);
  });

  it('K145 contract: the recorded take of a shuffled assessment reads as served, every option where delivery put it', async () => {
    // Recorded on chora-kiosk (19 Oct 04:41 UTC) after a create with shuffle_mcq_options true: delivery
    // reorders per learner, so one of the nature bank's three questions comes back out of stored order.
    const take = svc.take(recorded.take.assessment_id);
    http.expectOne(`/api/v1/me/assessments/${recorded.take.assessment_id}`).flush(recorded.take);
    const read = await take;
    const stored = new Map(recorded.test_set.questions.map((q) => [q.test_set_question_id, (q.payload_snapshot.options ?? []).map((o) => o.option_id)]));
    const served = read.questions.map((q) => (typeof q.prompt === 'string' ? [] : ('options' in q.prompt ? (q.prompt.options ?? []) : []).map((o) => o.option_id)));
    expect(served).toEqual(recorded.take.questions.map((q) => q.prompt.options.map((o) => o.option_id)));
    expect(read.questions.filter((q, i) => served[i].join() !== (stored.get(q.test_set_question_id) ?? []).join())).toHaveLength(1);
    for (const [i, q] of read.questions.entries()) expect([...served[i]].sort()).toEqual([...(stored.get(q.test_set_question_id) ?? [])].sort());
    expect(recorded.created.shuffle_mcq_options).toBe(true);
  });
});
