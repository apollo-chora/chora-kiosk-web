import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom, type Observable } from 'rxjs';

import type {
  AutosaveAnswerInput,
  LearnerAssessmentDetail,
  SubmissionStartedResponse,
  SubmissionSubmittedResponse,
} from '../aplus/me-assessments/me-assessments.model';
import { mapBackendQuestionBank, type BackendQuestionBank, type QuestionBank } from '../aplus/question-banks/question-banks.model';
import type { TestSetWithQuestions } from '../aplus/test-set-editor/test-set-editor.model';
import { ProductApiError } from './product-api-error';

/** The created assessment (delivery assessmentDTO, assessment_handler.go:1636-1676), the fields the dashboard reads. */
export interface CreatedAssessment {
  readonly assessment_id: string;
  readonly title: string;
  readonly scheduled_open_at: string;
  readonly scheduled_close_at: string;
  readonly max_attempts: number;
}

/** K57: the submit of a held open answer says so (assessment_handler.go:1218-1228); production's model predates it. */
export type SubmitAnswer = SubmissionSubmittedResponse & { readonly grading_held?: boolean };

/** One criterion as the grading crew scored it (assessment_handler.go projectCriterionScores, :1930-1962). */
export interface CriterionScore {
  readonly criterion_id?: string;
  readonly title?: string;
  readonly score?: number;
  readonly max_score?: number;
  readonly feedback?: string | null;
}

/** One rubric criterion as the grading read projects the test set's snapshot (grading_review_handler.go:99-107). */
export interface RubricRow {
  readonly criterion_id?: string;
  readonly description?: string;
  readonly weight?: number;
}

/**
 * One graded row of the instructor's grading read (grading_review_handler.go:158-232). An open
 * answer also carries the crew's grade: its criteria, the comment (current and the AI's), whose
 * score and comment it is, the time it was graded (D8-b), and the rubric it was graded on.
 */
export interface GradedRow {
  readonly test_set_question_id: string;
  readonly question_id?: string;
  readonly question_type: 'mcq' | 'oe';
  readonly points_earned: number;
  readonly points_possible: number;
  readonly correct?: boolean;
  readonly learner_answer?: { readonly mcq_choice_id?: string; readonly oe_response_text?: string };
  readonly ai_points_earned?: number;
  readonly comment?: string;
  readonly ai_comment?: string;
  readonly score_provenance?: string;
  readonly comment_provenance?: string;
  readonly oe_graded_at?: string;
  readonly rubric?: readonly RubricRow[];
  readonly criterion_scores?: readonly CriterionScore[];
}

/** The instructor's grading read: `state` GRADED with `review_status` PENDING_REVIEW waits for the person (K27). */
export interface GradingRead {
  readonly submission_id: string;
  readonly state: string;
  readonly review_status?: string;
  readonly total_points_earned?: number;
  readonly total_points_possible?: number;
  readonly questions: readonly GradedRow[];
}

/** The person's review of one open answer: only a changed field is sent (production's R+ review sends diffs too). */
export interface GradeEdit {
  readonly testSetQuestionId: string;
  readonly pointsEarned?: number;
  readonly comment?: string;
}

/**
 * The dashboard's assessments (K55, K79, K57) on production's routes. Production's own clients are
 * signal-and-subscribe page services (me-assessments.service.ts, the R+ create, the grading review);
 * a take needs ordered awaits (create, start, take; save, submit, the grading read), so this adapter
 * calls the same paths with production's models and fails loud on an answer it cannot read.
 */
@Injectable({ providedIn: 'root' })
export class AssessmentsService {
  private readonly http = inject(HttpClient);

  async bank(bankId: string): Promise<QuestionBank> {
    const url = `/api/v1/question-banks/${encodeURIComponent(bankId)}`;
    return mapBackendQuestionBank(await this.call('GET', url, this.http.get<BackendQuestionBank>(url)));
  }

  /** The published test set the bank assembled, its questions in display order (storage order is not). */
  async testSet(testSetId: string): Promise<TestSetWithQuestions> {
    const url = `/api/v1/test-sets/${encodeURIComponent(testSetId)}`;
    const ts = await this.call('GET', url, this.http.get<TestSetWithQuestions>(url));
    return { ...ts, questions: [...(ts.questions ?? [])].sort((a, b) => a.display_order - b.display_order) };
  }

  /**
   * Delivery's create, sent with no window (now to +24 h) and one attempt, inviting the visitor (K55),
   * with delivery's per-learner option shuffle on (K145; omitted, it is off and every visitor sees the
   * stored order, where the AI writers put the answer first). Grading goes by option id.
   */
  async create(req: { readonly testSetId: string; readonly title: string; readonly learnerGcid: string }): Promise<CreatedAssessment> {
    const url = '/api/v1/assessments';
    const body = { test_set_id: req.testSetId, title_override: req.title, invited_gcids: [req.learnerGcid], max_attempts: 1, shuffle_mcq_options: true };
    const a = await this.call('POST', url, this.http.post<CreatedAssessment>(url, body));
    if (!a?.assessment_id) throw new Error(`[kiosk] POST ${url} answered with no assessment_id`);
    return a;
  }

  async start(assessmentId: string): Promise<SubmissionStartedResponse> {
    const url = `/api/v1/me/assessments/${encodeURIComponent(assessmentId)}/submissions`;
    const s = await this.call('POST', url, this.http.post<SubmissionStartedResponse>(url, {}));
    if (!s?.submission_id) throw new Error(`[kiosk] POST ${url} answered with no submission_id`);
    return s;
  }

  /** The learner's take: the questions with no key, in display order. */
  async take(assessmentId: string): Promise<LearnerAssessmentDetail> {
    const url = `/api/v1/me/assessments/${encodeURIComponent(assessmentId)}`;
    const d = await this.call('GET', url, this.http.get<LearnerAssessmentDetail>(url));
    return { ...d, questions: [...(d.questions ?? [])].sort((a, b) => a.display_order - b.display_order) };
  }

  /** The answers so far (each replaces its question's earlier one); an empty list is the server's 400, so it is refused here. */
  async save(assessmentId: string, submissionId: string, answers: readonly (AutosaveAnswerInput & { readonly question_type: 'mcq' | 'oe' })[]): Promise<void> {
    const url = `/api/v1/me/assessments/${encodeURIComponent(assessmentId)}/submissions/${encodeURIComponent(submissionId)}`;
    if (answers.length === 0) throw new Error(`[kiosk] PATCH ${url} with no answers: the server refuses an empty list`);
    await this.call('PATCH', url, this.http.patch(url, { answers }));
  }

  async submit(assessmentId: string, submissionId: string): Promise<SubmitAnswer> {
    const url = `/api/v1/me/assessments/${encodeURIComponent(assessmentId)}/submissions/${encodeURIComponent(submissionId)}/submit`;
    return this.call('POST', url, this.http.post<SubmitAnswer>(url, {}));
  }

  /** The marks before a release: only the instructor's grading read carries them (the kiosk identity holds the role). */
  async grading(assessmentId: string, submissionId: string): Promise<GradingRead> {
    const url = `/api/v1/assessments/${encodeURIComponent(assessmentId)}/submissions/${encodeURIComponent(submissionId)}/grading`;
    const g = await this.call('GET', url, this.http.get<GradingRead>(url));
    return { ...g, questions: g?.questions ?? [] };
  }

  /**
   * The review's edits (PATCH .../grades, grading_review_handler.go:270-318). A field sent becomes
   * the person's (provenance HUMAN) even with the AI's value, so the caller sends only what
   * changed; an edit that changes nothing is refused here (the server answers 400).
   */
  async editGrade(assessmentId: string, submissionId: string, edit: GradeEdit): Promise<GradingRead> {
    const url = `${this.subPath(assessmentId, submissionId)}/grades`;
    if (edit.pointsEarned === undefined && edit.comment === undefined) throw new Error(`[kiosk] PATCH ${url} with nothing changed: approve as is instead`);
    const e = {
      test_set_question_id: edit.testSetQuestionId,
      ...(edit.pointsEarned === undefined ? {} : { points_earned: edit.pointsEarned }),
      ...(edit.comment === undefined ? {} : { comment: edit.comment }),
    };
    return this.call('PATCH', url, this.http.patch<GradingRead>(url, { question_edits: [e] }));
  }

  /** Approve the grade (:351-384): approval does not release. */
  async approve(assessmentId: string, submissionId: string): Promise<{ readonly submission_id: string; readonly state: string; readonly review_status: string }> {
    const url = `${this.subPath(assessmentId, submissionId)}/approve`;
    const a = await this.call('POST', url, this.http.post<{ submission_id: string; state: string; review_status: string }>(url, {}));
    if (a?.review_status !== 'APPROVED') throw new Error(`[kiosk] POST ${url} answered review_status ${String(a?.review_status)}, not APPROVED`);
    return a;
  }

  /** Release the results (assessment-wide, assessment_handler.go:692-731): the learner's result shows the grade. */
  async release(assessmentId: string): Promise<CreatedAssessment> {
    const url = `/api/v1/assessments/${encodeURIComponent(assessmentId)}/release-results`;
    return this.call('POST', url, this.http.post<CreatedAssessment>(url, {}));
  }

  private subPath(assessmentId: string, submissionId: string): string {
    return `/api/v1/assessments/${encodeURIComponent(assessmentId)}/submissions/${encodeURIComponent(submissionId)}`;
  }

  private async call<T>(method: string, url: string, req: Observable<T>): Promise<T> {
    try {
      return await firstValueFrom(req);
    } catch (err: unknown) {
      throw ProductApiError.from(method, url, err);
    }
  }
}
