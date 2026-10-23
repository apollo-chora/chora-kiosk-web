import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import type { AtomAttempt, LearningAtom, LearningAtomEnvelope, SubmissionResult } from '../aplus/atomic-session/atomic-session.model';
import { ProductApiError } from './product-api-error';

/**
 * One atom as production's atom player reads it (atomic-session.service.ts load): GET
 * /api/atoms/{atomId}, which the gateway answers {atom} with the answer key stripped (phyllis.go
 * GetAtom). The dose card's body comes from here (F17: the dose read's summary is the title).
 * An answer is production's attempt: start (no body; the gateway takes the atom from the path),
 * then one submit graded by rule from consumption's atom_index (me_handlers.go).
 */
@Injectable({ providedIn: 'root' })
export class AtomsService {
  private readonly http = inject(HttpClient);

  async read(atomId: string): Promise<LearningAtom> {
    const url = `/api/atoms/${encodeURIComponent(atomId)}`;
    let body: LearningAtomEnvelope;
    try {
      body = await firstValueFrom(this.http.get<LearningAtomEnvelope>(url));
    } catch (err: unknown) {
      throw ProductApiError.from('GET', url, err);
    }
    if (!body?.atom) throw new Error(`[kiosk] GET ${url} answered with no {atom} envelope`);
    return body.atom;
  }

  async start(atomId: string): Promise<AtomAttempt> {
    const url = `/api/atoms/${encodeURIComponent(atomId)}/session`;
    const session = await this.post<AtomAttempt>(url, {});
    if (!session?.session_id) throw new Error(`[kiosk] POST ${url} answered with no session_id`);
    return session;
  }

  async submit(atomId: string, answer: { readonly session_id: string; readonly answer_id: string; readonly selected_option_id: string }): Promise<SubmissionResult> {
    const url = `/api/atoms/${encodeURIComponent(atomId)}/session/submit`;
    const result = await this.post<SubmissionResult>(url, answer);
    if (typeof result?.is_correct !== 'boolean') throw new Error(`[kiosk] POST ${url} answered with no is_correct`);
    return result;
  }

  private async post<T>(url: string, body: unknown): Promise<T> {
    try {
      return await firstValueFrom(this.http.post<T>(url, body));
    } catch (err: unknown) {
      throw ProductApiError.from('POST', url, err);
    }
  }
}
