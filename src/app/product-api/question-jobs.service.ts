import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import type {
  AcceptGenerationJobRequest,
  AcceptGenerationJobResponse,
  QuestionDraftCandidate,
  QuestionGenerationJob,
} from '../aplus/atom-authoring/atom-authoring.model';
import { ProductApiError } from './product-api-error';

/**
 * Steps 4a and 4b (K35, K56, K113): creation's question-jobs read and accept, the two calls of
 * production's AtomAuthoringService (pollGenerationJob, acceptGenerationJob) the kiosk makes.
 * Starting a draft or a regenerate is a model call: those go through the LIVE service only.
 */

/** A draft as creation serves it today: production's model plus the picture's gs:// name (V2). */
export interface KioskDraftCandidate extends QuestionDraftCandidate {
  readonly image_gcs_uri?: string;
  readonly answer_image_gcs_uri?: string;
}

export interface KioskQuestionJob extends Omit<QuestionGenerationJob, 'candidate_questions'> {
  readonly candidate_questions?: readonly KioskDraftCandidate[];
}

@Injectable({ providedIn: 'root' })
export class QuestionJobsService {
  private readonly http = inject(HttpClient);

  async read(atomId: string, jobId: string): Promise<KioskQuestionJob> {
    const url = jobUrl(atomId, jobId);
    try {
      return await firstValueFrom(this.http.get<KioskQuestionJob>(url));
    } catch (err: unknown) {
      throw ProductApiError.from('GET', url, err);
    }
  }

  /** The job's draft with this id; any other draft is never shown in its place. */
  draft(job: KioskQuestionJob, draftId: string): KioskDraftCandidate {
    const draft = job.candidate_questions?.find((c) => c.draft_id === draftId);
    if (!draft) throw new Error(`[kiosk] job ${job.job_id} holds no draft ${draftId}`);
    return draft;
  }

  async accept(atomId: string, jobId: string, request: AcceptGenerationJobRequest): Promise<AcceptGenerationJobResponse> {
    const url = `${jobUrl(atomId, jobId)}/accept`;
    try {
      return await firstValueFrom(this.http.post<AcceptGenerationJobResponse>(url, request));
    } catch (err: unknown) {
      throw ProductApiError.from('POST', url, err);
    }
  }
}

function jobUrl(atomId: string, jobId: string): string {
  return `/api/atoms/${encodeURIComponent(atomId)}/question-jobs/${encodeURIComponent(jobId)}`;
}
