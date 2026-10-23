import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { ProductApiError } from './product-api-error';
import { QuestionJobsService } from './question-jobs.service';

// Steps 4a and 4b read the prepared drafts and keep the visitor's version (K56, K113):
// creation's question-jobs read and accept (API-CONTRACT.md section 2, h4). Only reads and
// the accept: a new draft or a regenerate is a model call and goes through the LIVE service.
const JOB = '/api/atoms/atom-1/question-jobs/job-1';

function setup() {
  TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
  return { jobs: TestBed.inject(QuestionJobsService), backend: TestBed.inject(HttpTestingController) };
}

describe('QuestionJobsService', () => {
  it('reads a job and finds one draft by its id, with its picture and the gs:// name the picture chain needs', async () => {
    const { jobs, backend } = setup();
    const p = jobs.read('atom-1', 'job-1');
    backend.expectOne(JOB).flush({
      job_id: 'job-1', atom_id: 'atom-1', status: 'succeeded', mana_charged: 10, created_at: '2026-10-20T05:47:20Z', completed_at: '2026-10-20T05:48:03Z',
      candidate_questions: [
        { draft_id: 'd-1', type: 'mcq', prompt: 'Which stage destroys germs?', mcq_payload: { options: [{ option_id: 'o1', label: 'UV disinfection', is_correct: true, explainer: '' }] }, image_url: '/blobs/q/1.png', image_gcs_uri: 'gs://chora-kiosk-media/q/1.png' },
      ],
      pipeline_trace: [{ name: 'generate', status: 'COMPLETED' }],
    });
    const job = await p;
    expect(job.status).toBe('succeeded');
    const draft = jobs.draft(job, 'd-1');
    expect(draft.prompt).toBe('Which stage destroys germs?');
    expect(draft.image_gcs_uri).toBe('gs://chora-kiosk-media/q/1.png');
  });

  it('a draft the job does not hold is a loud failure, never another draft', async () => {
    const { jobs, backend } = setup();
    const p = jobs.read('atom-1', 'job-1');
    backend.expectOne(JOB).flush({ job_id: 'job-1', atom_id: 'atom-1', status: 'succeeded', created_at: 'x', candidate_questions: [{ draft_id: 'd-2', type: 'mcq', prompt: 'Q' }] });
    const job = await p;
    expect(() => jobs.draft(job, 'd-1')).toThrow(/job job-1 holds no draft d-1/);
  });

  it('keeps a version: accepts the draft with its words and the picture on screen (K56, K113)', async () => {
    const { jobs, backend } = setup();
    const p = jobs.accept('atom-1', 'job-1', { accepted_candidates: [{ draft_id: 'd-1', image_url: '/blobs/q/3.png' }] });
    const req = backend.expectOne(`${JOB}/accept`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ accepted_candidates: [{ draft_id: 'd-1', image_url: '/blobs/q/3.png' }] });
    req.flush({ persisted: [{ id: 'q-1' }], mana_debited: 0 });
    await expect(p).resolves.toEqual({ persisted: [{ id: 'q-1' }], mana_debited: 0 });
  });

  it('reports creation’s {code, message} as a typed error', async () => {
    const { jobs, backend } = setup();
    const p = jobs.accept('atom-1', 'job-1', { accepted_candidates: [{ draft_id: 'd-1' }] });
    backend.expectOne(`${JOB}/accept`).flush({ code: 'CREATION_JOB_NOT_REVIEWABLE', message: 'job is not in review' }, { status: 409, statusText: 'Conflict' });
    const err = await p.catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ProductApiError);
    expect(err).toMatchObject({ status: 409, code: 'CREATION_JOB_NOT_REVIEWABLE' });
    expect((err as Error).message).toMatch(/POST \/api\/atoms\/atom-1\/question-jobs\/job-1\/accept: 409 CREATION_JOB_NOT_REVIEWABLE/);
  });
});
