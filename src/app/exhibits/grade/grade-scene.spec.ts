import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { KioskLanguage, provideKioskI18n } from '../../i18n/i18n';
import { SessionService } from '../../kiosk-api/session.service';
import type { PrewarmManifestWire } from '../../kiosk-api/manifest.service';
import { provideLive } from '../../live/live.providers';
import { LIVE_EXECUTORS, LiveAvailability, LiveService, type LiveExecutor } from '../../live/live.service';
import { KioskStore } from '../../shell/kiosk.store';
import { provideTourBeats } from '../../shell/tour/tour-beats';
import { quietBeats } from '../../shell/tour/tour.testing';
import { DashboardExhibit } from '../dashboard/dashboard-exhibit';
import { GRADE_LIVE_KEY, GradeExhibit } from './grade-exhibit';
import { GradeSceneComponent } from './grade-scene.component';
import { MINT, STRONG, STRONG_AI, STRONG_CRIT, STRONG_READ, TEST_SET, WEAK, WEAK_AI, WEAK_CRIT, WEAK_READ, gradeManifest, gradingRead } from './grade-world.testing';
import { VisitTally } from '../../shared/visit-tally';

// The grading exhibit (mockup SCENES.grade, reviewHTML and resultHTML, lines 5003, 4984 and 4994;
// K27, K57): the open question and its rubric from the published test set; a sample answer shows
// the grade the golden run prepared (no model call, K50); the visitor's own words go to the crew
// behind LIVE. The visitor reviews as the instructor: a stepper per criterion and the comment,
// then Approve and release, which stores the steppers' weighted total (production's own rule,
// scoring.py compute_composite, on the rubric's weights) and the comment with one instructor's note
// per changed criterion (the orchestrator's T3.9 b ruling A), approves, releases, and shows the
// grade read back.
describe('GradeSceneComponent', () => {
  let http: HttpTestingController;
  let fixture: ComponentFixture<GradeSceneComponent>;
  let el: HTMLElement;
  let grade: { resolve: (g: unknown) => void; reject: (e: Error) => void } | null;
  let pressed: unknown[];
  const exhibit = () => TestBed.inject(GradeExhibit);
  const SUB = (a: string, s: string) => `/api/v1/assessments/${a}/submissions/${s}`;

  async function settle(): Promise<void> {
    for (let i = 0; i < 6; i++) {
      await Promise.resolve();
      fixture.detectChanges();
    }
  }

  beforeEach(async () => {
    grade = null;
    pressed = [];
    const live: LiveExecutor = {
      run: (params: unknown) => {
        pressed.push(params);
        return new Promise((resolve, reject) => (grade = { resolve, reject }));
      },
    };
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        ...provideKioskI18n(),
        ...provideLive(),
        { provide: LIVE_EXECUTORS, useValue: { grade: live } },
        { provide: LiveAvailability, useValue: { text: signal(true).asReadonly(), picture: signal(true).asReadonly() } },
      ],
    });
    http = TestBed.inject(HttpTestingController);
    await TestBed.inject(KioskLanguage).ready();
  });

  afterEach(() => {
    TestBed.inject(LiveService).stopWaiting();
    exhibit().forget();
    TestBed.inject(SessionService).drop();
  });

  /** The exhibit on the given manifest and reads. */
  async function open(manifest: PrewarmManifestWire = gradeManifest(), reads = { s: STRONG_READ(), w: WEAK_READ() }, testSet: object = TEST_SET): Promise<void> {
    fixture = TestBed.createComponent(GradeSceneComponent);
    el = fixture.nativeElement as HTMLElement;
    fixture.detectChanges();
    http.expectOne('/api/v1/kiosk/prewarm/manifest').flush(manifest);
    (await vi.waitFor(() => http.expectOne('/api/v1/test-sets/ts-grade'))).flush(testSet);
    (await vi.waitFor(() => http.expectOne(`${SUB('as-s', 'sub-s')}/grading`))).flush(reads.s);
    (await vi.waitFor(() => http.expectOne(`${SUB('as-w', 'sub-w')}/grading`))).flush(reads.w);
    (await vi.waitFor(() => http.expectOne('/api/v1/kiosk/session'))).flush(MINT);
    await vi.waitFor(() => expect(exhibit().status()).toBe('ready'));
    await settle();
  }

  const text = (sel: string) => el.querySelector(sel)?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
  const texts = (sel: string) => Array.from(el.querySelectorAll(sel)).map((n) => n.textContent?.replace(/\s+/g, ' ').trim() ?? '');
  const click = async (sel: string, i = 0) => {
    (el.querySelectorAll(sel)[i] as HTMLElement).click();
    await settle();
  };
  const typeAnswer = async (value: string) => {
    const area = el.querySelector('textarea#gradetext') as HTMLTextAreaElement;
    area.value = value;
    area.dispatchEvent(new Event('input'));
    await settle();
  };
  const trace = () => Array.from(el.querySelectorAll('.acard > .mini-trace span')).map((n) => n.className);

  /** Approve and release, answering each call; returns the PATCH body, or null when none was sent. */
  async function release(a: string, s: string, readBack: object, patched = true, press = () => click('[data-act="release"]')): Promise<unknown> {
    await press();
    let body: unknown = null;
    if (patched) {
      const patch = await vi.waitFor(() => http.expectOne(`${SUB(a, s)}/grades`));
      body = patch.request.body;
      patch.flush({ submission_id: s, state: 'GRADED', review_status: 'PENDING_REVIEW', questions: [] });
    }
    (await vi.waitFor(() => http.expectOne(`${SUB(a, s)}/approve`))).flush({ submission_id: s, state: 'GRADED', review_status: 'APPROVED' });
    (await vi.waitFor(() => http.expectOne(`/api/v1/assessments/${a}/release-results`))).flush({ assessment_id: a, title: 'T', scheduled_open_at: 'x', scheduled_close_at: 'y', max_attempts: 1 });
    (await vi.waitFor(() => http.expectOne(`${SUB(a, s)}/grading`))).flush(readBack);
    await vi.waitFor(() => expect(exhibit().stage()).toBe('released'));
    await settle();
    return body;
  }

  it('shows the published question, its rubric, the sample answer, the picture with the AI mark, and no grade yet', async () => {
    await open();
    expect(text('.ex-head h2')).toBe('Get an answer graded');
    expect(text('.qcard p.q')).toBe('Why does Singapore also invest in NEWater and desalination?');
    expect(texts('.rubric > div span')).toEqual(['2061 agreement risk', 'Independence from rain and other countries', 'Trade-off']);
    expect((el.querySelector('textarea#gradetext') as HTMLTextAreaElement).value).toBe(STRONG);
    expect(el.querySelector('[data-act="sample"][data-s="strong"]')?.classList.contains('used')).toBe(true);
    expect(text('[data-act="submitGrade"]')).toBe('Submit for grading');
    expect(el.querySelector('.grade-fig img')?.getAttribute('src')).toBe('/p/taps.png');
    expect(text('.grade-fig .ai-mark')).toBe('Generated with AI');
    expect(text('.grade-fig figcaption')).toBe('Singapore’s four water taps in one imagined view, pictured by the image model.');
    expect(text('.grade-empty')).toContain('Your grade appears here');
    expect(trace()).toEqual(['', '', '']);
  });

  it('a stem of the mockup’s length keeps the mockup’s grading layout', async () => {
    await open();
    expect(el.querySelector('.exhibit')?.classList.contains('long-stem')).toBe(false);
  });

  it('a long stem sets the grading layout dense (K138 W2): the golden run’s question runs 319 characters, the mockup’s 59', async () => {
    const q = TEST_SET.questions[0];
    await open(gradeManifest(), { s: STRONG_READ(), w: WEAK_READ() }, { ...TEST_SET, questions: [{ ...q, payload_snapshot: { ...q.payload_snapshot, stem: 'x'.repeat(161) } }] });
    expect(el.querySelector('.exhibit')?.classList.contains('long-stem')).toBe(true);
  });

  it('a sample is put on review from the morning’s grade, with no call (K50): the crew’s criteria, steppers at its scores, its comment', async () => {
    await open();
    await click('[data-act="submitGrade"]');
    http.expectNone(() => true);
    expect(trace()).toEqual(['done', 'done', 'wait']);
    expect(el.querySelector('.grade-fig')).toBeNull();
    expect(texts('.crow > span:first-child')).toEqual(['2061 agreement risk', 'Independence from rain and other countries', 'Trade-off']);
    expect(texts('.crow .ai')).toEqual(['AI score 1/1', 'AI score 1/1', 'AI score 1/1']);
    expect(texts('.crow .val')).toEqual(['1/1', '1/1', '1/1']);
    expect((el.querySelector('[data-act="adj"][data-c="0"][data-d="1"]') as HTMLButtonElement).disabled).toBe(true);
    expect((el.querySelector('textarea#gradecomment') as HTMLTextAreaElement).value).toBe("The crew's comment on sub-s.");
    expect((el.querySelector('textarea#gradetext') as HTMLTextAreaElement).disabled).toBe(true);
    expect(text('[data-act="release"]')).toBe('Approve and release as the instructor');
    // W17 (K101): the grade on review is the morning's, so it says when it was prepared, before any release.
    expect(text('.review .stamp')).toBe('Prepared 20 Oct, 14:10');
    expect(el.querySelector('.review .stamp kiosk-prepared-info button[data-act="preparedInfo"]')).not.toBeNull();
  });

  describe('K173: the tour’s beats, on the strong sample only (F52: the weak one’s release embeds on Vertex)', () => {
    const RELEASED = () => gradingRead('sub-s', STRONG, STRONG_CRIT, STRONG_AI, { state: 'RELEASED', review: 'APPROVED' });

    it('G1 shows the strong sample from any answer on the card, and from a review it returns to the answer (no write)', async () => {
      await open();
      await click('[data-act="sample"]', 1);
      expect(exhibit().text()).toBe(WEAK);
      await exhibit().tourShow('answer', 'next');
      expect(exhibit().text()).toBe(STRONG);
      expect(exhibit().stage()).toBe('answer');
      exhibit().submitSample();
      expect(exhibit().stage()).toBe('review');
      await exhibit().tourShow('answer', 'back');
      expect(exhibit().stage()).toBe('answer');
      http.expectNone((r) => r.method !== 'GET');
    });

    it('G2 puts the strong sample’s prepared grade on review, with no call; G3 by Back writes nothing', async () => {
      await open();
      await exhibit().tourShow('review', 'next');
      expect(exhibit().stage()).toBe('review');
      expect(exhibit().review()?.submissionId).toBe('sub-s');
      expect(pressed).toEqual([]);
      await exhibit().tourShow('release', 'back');
      expect(exhibit().stage()).toBe('review');
      http.expectNone((r) => r.method !== 'GET');
    });

    it('G3 by Next approves and releases it; arriving again at G1, G2 or G3 shows it released and writes nothing', async () => {
      await open();
      await exhibit().tourShow('review', 'next');
      await release('as-s', 'sub-s', RELEASED(), false, async () => void exhibit().tourShow('release', 'next'));
      expect(exhibit().stage()).toBe('released');
      for (const [step, by] of [['answer', 'back'], ['review', 'back'], ['release', 'next'], ['review', 'next'], ['release', 'back']] as const) {
        await exhibit().tourShow(step, by);
        await settle();
        expect(exhibit().stage()).toBe('released');
      }
      http.expectNone((r) => r.method !== 'GET');
    });

    it('W100: tourReleased holds only while the strong sample shows released (G3 has nothing left to do)', async () => {
      await open();
      await exhibit().tourShow('review', 'next');
      expect(exhibit().tourShows('release')).toBe(true);
      expect(exhibit().tourReleased()).toBe(false);
      await release('as-s', 'sub-s', RELEASED(), false, async () => void exhibit().tourShow('release', 'next'));
      expect(exhibit().tourReleased()).toBe(true);
      await click('[data-act="sample"]', 1);
      expect(exhibit().tourReleased()).toBe(false);
    });

    it('W100: the weaker sample released is not G3’s release: G3 by Next would still put the strong one up', async () => {
      await open();
      await click('[data-act="sample"][data-s="weak"]');
      await click('[data-act="submitGrade"]');
      await release('as-w', 'sub-w', gradingRead('sub-w', WEAK, WEAK_CRIT, WEAK_AI, { state: 'RELEASED', review: 'APPROVED' }), false);
      expect(exhibit().stage()).toBe('released');
      expect(exhibit().tourReleased()).toBe(false);
    });

    it('G1 to G3 report whether their own view shows (Back’s own view first)', async () => {
      await open();
      await exhibit().tourShow('answer', 'next');
      expect(exhibit().tourShows('answer')).toBe(true);
      expect(exhibit().tourShows('review')).toBe(false);
      await click('[data-act="sample"]', 1);
      expect(exhibit().tourShows('answer')).toBe(false);
      await exhibit().tourShow('review', 'next');
      expect(exhibit().tourShows('review')).toBe(true);
    });
  });

  it('K173: Next puts the strong sample on review (no call), then approves and releases it, then leaves for the Engine Room', async () => {
    await open();
    TestBed.runInInjectionContext(() => provideTourBeats());
    const store = TestBed.inject(KioskStore);
    store.go('grade');
    store.next();
    await settle();
    expect(exhibit().stage()).toBe('review');
    expect(pressed).toEqual([]);
    await release('as-s', 'sub-s', gradingRead('sub-s', STRONG, STRONG_CRIT, STRONG_AI, { state: 'RELEASED', review: 'APPROVED' }), false, async () => {
      store.next();
      await settle();
    });
    expect(exhibit().stage()).toBe('released');
    expect(TestBed.inject(VisitTally).answers()).toBe(1);
    store.next();
    await settle();
    http.expectNone(`${SUB('as-s', 'sub-s')}/approve`);
    expect(store.scene()).toBe('engine');
  });

  it('Next never presses LIVE: the visitor’s own words are graded only by the LIVE button (K50); the tour’s G2 shows the strong sample', async () => {
    await open();
    TestBed.runInInjectionContext(() => provideTourBeats());
    await typeAnswer('Johor’s water ends in 2061, and NEWater needs no rain.');
    const store = TestBed.inject(KioskStore);
    store.go('grade');
    store.next();
    await settle();
    expect(grade).toBeNull();
    expect(pressed).toEqual([]);
    expect(exhibit().text()).toBe(STRONG);
    expect(exhibit().stage()).toBe('review');
    http.expectNone((r) => r.method !== 'GET');
  });

  it('K173: the keys are the tour’s: Back from the first beat goes to the assessment’s last (D2); Esc returns to the hall', async () => {
    await open();
    const shownBeats = quietBeats();
    const store = TestBed.inject(KioskStore);
    store.go('grade');
    store.back();
    await vi.waitFor(() => expect(store.scene()).toBe('dash'));
    expect(shownBeats).toEqual(['D2 back']);
    store.go('grade');
    store.escapeUp();
    expect(store.scene()).toBe('hall');
  });

  it('with no stepper changed, the total a release would store is the AI’s own, exactly, for both samples', async () => {
    await open();
    await click('[data-act="submitGrade"]');
    expect(exhibit().releaseTotal()).toBe(STRONG_AI);
    exhibit().again();
    await settle();
    await click('[data-act="sample"][data-s="weak"]');
    await click('[data-act="submitGrade"]');
    expect(exhibit().review()?.submissionId).toBe('sub-w');
    expect(exhibit().releaseTotal()).toBe(WEAK_AI);
  });

  it('the walk’s case: Trade-off stepped 1 to 0 on the strong sample stores the weighted 8, not the plain sum, with the note in the singular', async () => {
    await open();
    await click('[data-act="submitGrade"]');
    await click('[data-act="adj"][data-c="2"][data-d="-1"]');
    expect(texts('.crow .val')).toEqual(['1/1', '1/1', '0/1']);
    expect(texts('.crow .tag-adj')).toEqual(['adjusted by you']);
    const note = 'Instructor’s note: “Trade-off” changed from 1 mark to 0.';
    expect(texts('.rv-next')).toEqual([note]);
    expect(exhibit().releaseTotal()).toBe(8);
    const stored = `The crew's comment on sub-s. ${note}`;
    const body = await release('as-s', 'sub-s', gradingRead('sub-s', STRONG, STRONG_CRIT, STRONG_AI, { state: 'RELEASED', review: 'APPROVED', points: 8, comment: stored }));
    expect(body).toEqual({ question_edits: [{ test_set_question_id: 'tsq-g', points_earned: 8, comment: stored }] });
    expect(text('.result .score b')).toBe('8');
    expect(text('.score-src .stamp')).toBe('Prepared 20 Oct, 14:10');
    expect(el.querySelector('.score-src .stamp kiosk-prepared-info button[data-act="preparedInfo"]')).not.toBeNull();
    // W29: the circle holds the score alone; the stamp sits outside it, under it.
    expect(el.querySelector('.result .score .stamp')).toBeNull();
    expect(text('.result .score')).toBe('8out of 10');
    expect(el.querySelector('.result .score-col > .score + .score-src .stamp')).not.toBeNull();
    expect(texts('.crit > div b')).toEqual(['1/1', '1/1', '0/1']);
    expect(texts('.crit .tag-adj')).toEqual(['adjusted by you']);
    expect(text('.explain')).toBe(stored);
    expect(text('.rv-next')).toBe('The AI gave 10 of 10; your changes make the released grade 8.');
    expect(text('.badge.ok')).toBe('Released by you, acting as the instructor');
    expect(trace()).toEqual(['done', 'done', 'done']);
  });

  it('an edited comment keeps the notes: the stored comment is the visitor’s words, then one note per change', async () => {
    await open();
    await click('[data-act="submitGrade"]');
    await click('[data-act="adj"][data-c="1"][data-d="-1"]');
    const area = el.querySelector('textarea#gradecomment') as HTMLTextAreaElement;
    area.value = 'Well argued.';
    area.dispatchEvent(new Event('input'));
    await settle();
    const stored = 'Well argued. Instructor’s note: “Independence from rain and other countries” changed from 1 mark to 0.';
    const body = await release('as-s', 'sub-s', gradingRead('sub-s', STRONG, STRONG_CRIT, STRONG_AI, { state: 'RELEASED', review: 'APPROVED', points: 6, comment: stored }));
    expect(body).toEqual({ question_edits: [{ test_set_question_id: 'tsq-g', points_earned: 6, comment: stored }] });
  });

  it('the weaker sample’s 0.2 stepped up stores its weighted 4, noted in the plural', async () => {
    await open();
    await click('[data-act="sample"][data-s="weak"]');
    await click('[data-act="submitGrade"]');
    await click('[data-act="adj"][data-c="1"][data-d="1"]');
    expect(texts('.crow .val')).toEqual(['0/1', '1/1', '0/1']);
    const stored = "The crew's comment on sub-w. Instructor’s note: “Independence from rain and other countries” changed from 0.2 marks to 1.";
    const body = await release('as-w', 'sub-w', gradingRead('sub-w', WEAK, WEAK_CRIT, WEAK_AI, { state: 'RELEASED', review: 'APPROVED', points: 4, comment: stored }));
    expect(body).toEqual({ question_edits: [{ test_set_question_id: 'tsq-g', points_earned: 4, comment: stored }] });
    expect(text('.result ~ .rv-next')).toBe('The AI gave 0.8 of 10; your changes make the released grade 4.');
  });

  it('the weaker sample released as the AI graded it sends nothing and shows its 0.8', async () => {
    await open();
    await click('[data-act="sample"][data-s="weak"]');
    await click('[data-act="submitGrade"]');
    await release('as-w', 'sub-w', gradingRead('sub-w', WEAK, WEAK_CRIT, WEAK_AI, { state: 'RELEASED', review: 'APPROVED' }), false);
    http.expectNone(`${SUB('as-w', 'sub-w')}/grades`);
    expect(text('.result .score b')).toBe('0.8');
    expect(el.querySelector('.result ~ .rv-next')).toBeNull();
  });

  it('a stepper moved and moved back changes nothing: no note, and no score sent as the person’s', async () => {
    await open();
    await click('[data-act="submitGrade"]');
    await click('[data-act="adj"][data-c="0"][data-d="-1"]');
    await click('[data-act="adj"][data-c="0"][data-d="1"]');
    expect(exhibit().notes()).toEqual([]);
    expect(exhibit().releaseTotal()).toBe(STRONG_AI);
    await release('as-s', 'sub-s', gradingRead('sub-s', STRONG, STRONG_CRIT, STRONG_AI, { state: 'RELEASED', review: 'APPROVED' }), false);
    http.expectNone(`${SUB('as-s', 'sub-s')}/grades`);
  });

  it('a grade whose AI total does not follow its own rubric is never put on review, said loudly', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await open(gradeManifest(), { s: gradingRead('sub-s', STRONG, STRONG_CRIT, 9), w: WEAK_READ() });
    await click('[data-act="submitGrade"]');
    expect(exhibit().review()).toBeNull();
    expect(text('.qcard .msg-error')).not.toBe('');
    expect(error).toHaveBeenCalledWith(expect.stringContaining("the AI's 9 of 10 is not what its rubric gives (10)"));
    error.mockRestore();
  });

  it('a grade read with no rubric, or a criterion its rubric lacks, is never put on review, said loudly', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await open(gradeManifest(), { s: gradingRead('sub-s', STRONG, STRONG_CRIT, STRONG_AI, { rubric: null }), w: gradingRead('sub-w', WEAK, [...WEAK_CRIT, ['c9', 'Extra', 0, 1, 'x']], WEAK_AI) });
    await click('[data-act="submitGrade"]');
    expect(exhibit().review()).toBeNull();
    expect(error).toHaveBeenCalledWith(expect.stringContaining("sub-s's open answer carries no rubric"));
    await click('[data-act="sample"][data-s="weak"]');
    await click('[data-act="submitGrade"]');
    expect(exhibit().review()).toBeNull();
    expect(error).toHaveBeenCalledWith(expect.stringContaining("sub-w's criterion c9 is not in its rubric"));
    error.mockRestore();
  });

  it('a grade the person agrees with is approved as is: nothing is sent as the person’s, so it stays the AI’s', async () => {
    await open();
    await click('[data-act="submitGrade"]');
    await release('as-s', 'sub-s', gradingRead('sub-s', STRONG, STRONG_CRIT, STRONG_AI, { state: 'RELEASED', review: 'APPROVED' }), false);
    http.expectNone(`${SUB('as-s', 'sub-s')}/grades`);
    expect(text('.result .score b')).toBe('10');
    expect(el.querySelector('.crit .tag-adj')).toBeNull();
    expect(el.querySelector('.result ~ .rv-next')).toBeNull();
  });

  it('the weaker sample is its own answer and its own grade', async () => {
    await open();
    await click('[data-act="sample"][data-s="weak"]');
    expect((el.querySelector('textarea#gradetext') as HTMLTextAreaElement).value).toBe(WEAK);
    expect(el.querySelector('[data-act="sample"][data-s="weak"]')?.classList.contains('used')).toBe(true);
    await click('[data-act="submitGrade"]');
    expect(texts('.crow .val')).toEqual(['0/1', '0.2/1', '0/1']);
    expect((el.querySelector('textarea#gradecomment') as HTMLTextAreaElement).value).toBe("The crew's comment on sub-w.");
    expect(text('.review .stamp')).toBe('Prepared 20 Oct, 14:11');
  });

  it('a released sample shown again is the released grade, read back; the other sample can still be graded', async () => {
    await open();
    await click('[data-act="submitGrade"]');
    await release('as-s', 'sub-s', gradingRead('sub-s', STRONG, STRONG_CRIT, STRONG_AI, { state: 'RELEASED', review: 'APPROVED' }), false);
    await click('[data-act="sample"][data-s="weak"]');
    expect(exhibit().stage()).toBe('answer');
    expect(el.querySelector('[data-act="submitGrade"]')).not.toBeNull();
    await click('[data-act="sample"][data-s="strong"]');
    expect(exhibit().stage()).toBe('released');
    expect(text('.badge.ok')).toBe('Released by you, acting as the instructor');
    http.expectNone(() => true);
  });

  it('the visitor’s own words go to the crew behind LIVE on a fresh assessment, then on review and released as theirs', async () => {
    await open();
    await typeAnswer('Johor’s water ends in 2061, and NEWater needs no rain.');
    expect(el.querySelector('[data-act="submitGrade"]')).toBeNull();
    expect(text('.grade-go [data-act="live"] .live-label')).toBe('Grade my answer');
    await click('.grade-go [data-act="live"]');
    await vi.waitFor(() => expect(grade).not.toBeNull());
    expect(pressed).toEqual([
      { typed: { testSetId: 'ts-grade', title: 'Water for Life: open question', learnerGcid: 'g-visitor', testSetQuestionId: 'tsq-g', questionId: 'q-g', text: 'Johor’s water ends in 2061, and NEWater needs no rain.' } },
    ]);
    expect((el.querySelector('textarea#gradetext') as HTMLTextAreaElement).disabled).toBe(true);
    grade?.resolve({ assessmentId: 'as-t', submissionId: 'sub-t', detail: gradingRead('sub-t', 'Johor’s water ends in 2061, and NEWater needs no rain.', STRONG_CRIT.slice(0, 2).concat([['c3', 'Trade-off', 0, 1, 'No trade-off.']]), 8) });
    await vi.waitFor(() => expect(exhibit().stage()).toBe('review'));
    await settle();
    expect(texts('.crow .val')).toEqual(['1/1', '1/1', '0/1']);
    expect(exhibit().releaseTotal()).toBe(8);
    // W17: a grade made live says so on review too.
    expect(text('.review .stamp')).toBe('Graded live, just now');
    await release('as-t', 'sub-t', gradingRead('sub-t', 'x', STRONG_CRIT, 8, { state: 'RELEASED', review: 'APPROVED', points: 8 }), false);
    expect(text('.score-src .stamp')).toBe('Graded live, just now');
  });

  // W79: the outcome comes from the one LIVE door, not the row that pressed, so leaving the scene mid-call loses nothing.
  it('W79: a LIVE grade that comes back after the scene was left is on review when Grading opens again', async () => {
    const typed = 'Johor’s water ends in 2061, and NEWater needs no rain.';
    await open();
    await typeAnswer(typed);
    await click('.grade-go [data-act="live"]');
    await vi.waitFor(() => expect(grade).not.toBeNull());
    fixture.destroy();
    grade?.resolve({ assessmentId: 'as-t', submissionId: 'sub-t', detail: gradingRead('sub-t', typed, STRONG_CRIT.slice(0, 2).concat([['c3', 'Trade-off', 0, 1, 'No trade-off.']]), 8) });
    await vi.waitFor(() => expect(TestBed.inject(LiveService).state(GRADE_LIVE_KEY)()?.status).toBe('done'));
    fixture = TestBed.createComponent(GradeSceneComponent);
    el = fixture.nativeElement as HTMLElement;
    fixture.detectChanges();
    await settle();
    http.expectNone(() => true);
    expect(exhibit().stage()).toBe('review');
    expect(texts('.crow .val')).toEqual(['1/1', '1/1', '0/1']);
    expect(text('.review .stamp')).toBe('Graded live, just now');
  });

  it('K186: an answer graded live is never graded live again this demo session; a different answer is a new request', async () => {
    await open();
    await typeAnswer('First answer.');
    await click('.grade-go [data-act="live"]');
    await vi.waitFor(() => expect(grade).not.toBeNull());
    grade?.resolve({ assessmentId: 'as-t', submissionId: 'sub-t', detail: gradingRead('sub-t', 'First answer.', STRONG_CRIT, 10) });
    await vi.waitFor(() => expect(exhibit().stage()).toBe('review'));
    exhibit().again();
    await settle();
    expect(el.querySelector('.grade-go [data-act="live"]')).toBeNull();
    await typeAnswer('A second answer.');
    expect(text('.grade-go [data-act="live"] .live-label')).toBe('Grade my answer');
    await typeAnswer('First answer.');
    expect(el.querySelector('.grade-go [data-act="live"]')).toBeNull();
  });

  it('a LIVE grade that is late, failed or stopped says so; nothing is shown as graded', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await open();
    await typeAnswer('My own answer.');
    await click('.grade-go [data-act="live"]');
    await vi.waitFor(() => expect(grade).not.toBeNull());
    grade?.reject(new Error('the crew failed'));
    await vi.waitFor(() => expect(text('.qcard .msg-error')).toBe('The live grader failed. Try again, or grade a sample answer.'));
    expect(exhibit().stage()).toBe('answer');
    expect(el.querySelector('.grade-go .stamp.fallback')).toBeNull();
    grade = null;
    await click('.grade-go [data-act="live"]');
    await vi.waitFor(() => expect(grade).not.toBeNull());
    await click('.grade-go [data-act="liveCancel"]');
    await vi.waitFor(() => expect(text('.qcard .msg-error')).toBe('Stopped waiting. The grading crew may still finish; press LIVE to grade again.'));
    exhibit().onGradeOutcome({ status: 'missed', kind: 'grade', reason: 'late', ms: 45000 }, exhibit().liveParams()!);
    await settle();
    expect(text('.qcard .msg-error')).toBe('The live grader did not answer within 45 s. Try again, or grade a sample answer.');
    warn.mockRestore();
    error.mockRestore();
  });

  it('a release that fails says so and keeps the review to try again', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await open();
    await click('[data-act="submitGrade"]');
    await click('[data-act="release"]');
    (await vi.waitFor(() => http.expectOne(`${SUB('as-s', 'sub-s')}/approve`))).flush({ code: 'X' }, { status: 409, statusText: 'Conflict' });
    await vi.waitFor(() => expect(exhibit().failed()).toBe('release'));
    await settle();
    expect(exhibit().stage()).toBe('review');
    expect(text('.acard .msg-error')).not.toBe('');
    expect(error).toHaveBeenCalledWith(expect.stringContaining('could not be released'));
    error.mockRestore();
  });

  it('a sample whose grade is not waiting for the person says so loudly, never a review', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await open(gradeManifest(), { s: gradingRead('sub-s', STRONG, STRONG_CRIT, STRONG_AI, { state: 'GRADING', review: '' }), w: WEAK_READ() });
    await click('[data-act="submitGrade"]');
    expect(exhibit().stage()).toBe('answer');
    expect(text('.qcard .msg-error')).not.toBe('');
    expect(error).toHaveBeenCalledWith(expect.stringContaining('not graded and waiting for the person'));
    error.mockRestore();
  });

  it('a sample with no criterion scores cannot be reviewed, said loudly', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await open(gradeManifest(), { s: gradingRead('sub-s', STRONG, [], 0), w: WEAK_READ() });
    await click('[data-act="submitGrade"]');
    expect(exhibit().review()).toBeNull();
    expect(error).toHaveBeenCalledWith(expect.stringContaining('no criterion scores'));
    error.mockRestore();
  });

  it('a sample already released when read is shown as stored: the crew’s scores, no adjusted tag, no second review', async () => {
    const stored = gradingRead('sub-s', STRONG, STRONG_CRIT, STRONG_AI, { state: 'RELEASED', review: 'APPROVED', points: 9, comment: 'Stored comment.' });
    await open(gradeManifest(), { s: stored, w: WEAK_READ() });
    await click('[data-act="submitGrade"]');
    expect(exhibit().stage()).toBe('released');
    expect(text('.result .score b')).toBe('9');
    expect(texts('.crit > div b')).toEqual(['1/1', '1/1', '1/1']);
    expect(el.querySelector('.crit .tag-adj')).toBeNull();
    expect(text('.explain')).toBe('Stored comment.');
    expect(el.querySelector('[data-act="release"]')).toBeNull();
    http.expectNone(() => true);
  });

  it('a question with no recorded picture says so loudly and shows no figure', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const m = gradeManifest();
    const choices = { ...m.choices };
    delete (choices as Record<string, unknown>)['accept.water.q3'];
    await open({ ...m, choices });
    expect(el.querySelector('.grade-fig')).toBeNull();
    expect(text('.grade-empty')).toContain('Your grade appears here');
    expect(error).toHaveBeenCalledWith(expect.stringContaining('no accept choice records a picture for question q-g'));
    error.mockRestore();
  });

  it('samples graded on different questions fail the exhibit, said loudly', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const m = gradeManifest();
    const weak = m.choices['sample.weak'];
    fixture = TestBed.createComponent(GradeSceneComponent);
    el = fixture.nativeElement as HTMLElement;
    fixture.detectChanges();
    http.expectOne('/api/v1/kiosk/prewarm/manifest').flush({ ...m, choices: { ...m.choices, 'sample.weak': { ...weak, records: { ...(weak.records as object), test_set_question_id: 'tsq-other' } } } });
    await vi.waitFor(() => expect(exhibit().status()).toBe('failed'));
    expect(error).toHaveBeenCalledWith(expect.stringContaining('sample.weak is not graded on the same question'));
    error.mockRestore();
  });

  it('a typed answer emptied again leaves LIVE off until there are words to grade', async () => {
    await open();
    await typeAnswer('Mine.');
    expect((el.querySelector('.grade-go [data-act="live"]') as HTMLButtonElement).disabled).toBe(false);
    await typeAnswer('   ');
    expect((el.querySelector('.grade-go [data-act="live"]') as HTMLButtonElement).disabled).toBe(true);
    await typeAnswer(WEAK);
    expect(el.querySelector('[data-act="sample"][data-s="weak"]')?.classList.contains('used')).toBe(true);
    expect(el.querySelector('[data-act="submitGrade"]')).not.toBeNull();
  });

  describe('the visitor’s dashboard answer (dashToGrade, K57)', () => {
    const LINK = {
      bankKey: 'bank.water',
      assessmentId: 'as-water',
      submissionId: 'sub-water',
      testSetQuestionId: 'tsq-w3',
      text: 'Johor’s water ends in 2061.',
      title: 'Water for Life: Unit 1 quiz',
      question: { stem: 'Why does Singapore need four taps?', rubric: ['Names when Johor’s water ends'], picture: '/p/taps.png', captionKey: 'dbx.q3Cap' as const },
    };
    const dashRead = (over = {}) => ({ ...gradingRead('sub-water', LINK.text, STRONG_CRIT, STRONG_AI, over), questions: gradingRead('sub-water', LINK.text, STRONG_CRIT, STRONG_AI, over).questions.map((q) => ({ ...q, test_set_question_id: 'tsq-w3' })) });

    it('W27 (K159): a hawker answer is shown under ITS question, the teh tarik stem, rubric and picture, never the samples’ water question', async () => {
      const HAWKER = {
        ...LINK,
        bankKey: 'bank.hawker',
        assessmentId: 'as-hawker',
        submissionId: 'sub-hawker',
        testSetQuestionId: 'tsq-h3',
        text: 'It cools the tea.',
        title: 'Food Heritage: Unit 1 quiz',
        question: { stem: 'Why is teh tarik pulled from one mug to another?', rubric: ['Names the cooling', 'Names the froth'], picture: '/p/teh.png', captionKey: 'img.label' as const },
      };
      exhibit().fromDash(HAWKER);
      await open();
      expect(text('.qcard p.q')).toBe('Why is teh tarik pulled from one mug to another?');
      expect(texts('.qcard .rubric span')).toEqual(['Names the cooling', 'Names the froth']);
      expect(el.querySelector('.grade-fig img')?.getAttribute('src')).toBe('/p/teh.png');
      expect(el.querySelector('.qcard')?.textContent).not.toContain('four water sources');
      // The water caption ("Singapore’s four water taps…") belongs to water's picture only.
      expect(text('.grade-fig figcaption')).toBe('Picture for the question');
      expect(el.querySelector('.grade-fig img')?.getAttribute('alt')).toBe('Picture for the question');
    });

    it('shows the answer locked with no sample chips, and LIVE grades the held submission itself', async () => {
      exhibit().fromDash(LINK);
      await open();
      expect(text('.ex-head p')).toBe('Your answer from “Water for Life: Unit 1 quiz”. Press LIVE to have it graded; the grade goes back to your assessment.');
      const area = el.querySelector('textarea#gradetext') as HTMLTextAreaElement;
      expect(area.value).toBe(LINK.text);
      expect(area.disabled).toBe(true);
      expect(el.querySelector('[data-act="sample"]')).toBeNull();
      await click('.grade-go [data-act="live"]');
      await vi.waitFor(() => expect(grade).not.toBeNull());
      expect(pressed).toEqual([{ assessmentId: 'as-water', submissionId: 'sub-water' }]);
      grade?.resolve({ assessmentId: 'as-water', submissionId: 'sub-water', detail: dashRead() });
      await vi.waitFor(() => expect(exhibit().stage()).toBe('review'));
      expect(exhibit().review()?.testSetQuestionId).toBe('tsq-w3');
    });

    it('released, it offers See your results, which opens the dashboard’s results read again', async () => {
      const dash = TestBed.inject(DashboardExhibit);
      const seen = vi.spyOn(dash, 'seeResults').mockImplementation(() => undefined);
      exhibit().fromDash(LINK);
      await open();
      await click('.grade-go [data-act="live"]');
      await vi.waitFor(() => expect(grade).not.toBeNull());
      grade?.resolve({ assessmentId: 'as-water', submissionId: 'sub-water', detail: dashRead() });
      await vi.waitFor(() => expect(exhibit().stage()).toBe('review'));
      await settle();
      await release('as-water', 'sub-water', dashRead({ state: 'RELEASED', review: 'APPROVED' }), false);
      expect(text('.ex-head p')).toBe('Submit the sample answer, try a weaker one, or write your own.');
      expect(el.querySelector('[data-act="sample"]')).not.toBeNull();
      await click('[data-act="dbxSeeResults"]');
      expect(seen).toHaveBeenCalledWith('bank.water');
      expect(TestBed.inject(KioskStore).scene()).toBe('dash');
    });

    it('W79: a LIVE grade that comes back after the scene was left is the dashboard answer’s, never the strong sample’s, and is on review when the answer is handed over again', async () => {
      exhibit().fromDash(LINK);
      await open();
      await click('.grade-go [data-act="live"]');
      await vi.waitFor(() => expect(grade).not.toBeNull());
      fixture.destroy();
      grade?.resolve({ assessmentId: 'as-water', submissionId: 'sub-water', detail: dashRead() });
      await vi.waitFor(() => expect(TestBed.inject(LiveService).state(GRADE_LIVE_KEY)()?.status).toBe('done'));
      // Leaving put the strong sample back (K138 W8): the dashboard answer's grade must not land on it.
      expect(exhibit().source()).toEqual({ kind: 'sample', key: 'strong' });
      expect(exhibit().review()).toBeNull();
      exhibit().fromDash(LINK);
      fixture = TestBed.createComponent(GradeSceneComponent);
      el = fixture.nativeElement as HTMLElement;
      fixture.detectChanges();
      await settle();
      expect(exhibit().stage()).toBe('review');
      expect(exhibit().review()).toMatchObject({ assessmentId: 'as-water', submissionId: 'sub-water', testSetQuestionId: 'tsq-w3' });
      expect(el.querySelector('.grade-go [data-act="live"]')).toBeNull();
    });

    it('left without grading, the dashboard answer goes back to the dashboard: the hall’s Grading opens on the samples (K138 W8)', async () => {
      exhibit().fromDash(LINK);
      await open();
      expect(el.querySelector('[data-act="sample"]')).toBeNull();
      fixture.destroy();
      fixture = TestBed.createComponent(GradeSceneComponent);
      el = fixture.nativeElement as HTMLElement;
      fixture.detectChanges();
      await settle();
      http.expectNone(() => true);
      expect(exhibit().dash()).toBeNull();
      expect(text('.ex-head p')).toBe('Submit the sample answer, try a weaker one, or write your own.');
      expect((el.querySelector('textarea#gradetext') as HTMLTextAreaElement).value).toBe(STRONG);
      expect(el.querySelector('[data-act="sample"][data-s="strong"]')?.classList.contains('used')).toBe(true);
      expect(el.querySelector('[data-act="submitGrade"]')).not.toBeNull();
    });

    it('a sample chosen after the dashboard answer leaves it: the chips’ answers are graded as before', async () => {
      exhibit().fromDash(LINK);
      await open();
      exhibit().showSample('weak');
      await settle();
      expect(exhibit().dash()).toBeNull();
      expect((el.querySelector('textarea#gradetext') as HTMLTextAreaElement).value).toBe(WEAK);
      expect(el.querySelector('[data-act="submitGrade"]')).not.toBeNull();
    });
  });

  it('an exhibit that cannot be read says so, never an empty question', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    fixture = TestBed.createComponent(GradeSceneComponent);
    el = fixture.nativeElement as HTMLElement;
    fixture.detectChanges();
    http.expectOne('/api/v1/kiosk/prewarm/manifest').flush(gradeManifest());
    (await vi.waitFor(() => http.expectOne('/api/v1/test-sets/ts-grade'))).flush({ ...TEST_SET, questions: [] });
    await vi.waitFor(() => expect(exhibit().status()).toBe('failed'));
    await settle();
    expect(text('.exhibit .msg-error')).not.toBe('');
    expect(el.querySelector('.qcard')).toBeNull();
    expect(error).toHaveBeenCalledWith(expect.stringContaining('no published open question'));
    error.mockRestore();
  });
});
