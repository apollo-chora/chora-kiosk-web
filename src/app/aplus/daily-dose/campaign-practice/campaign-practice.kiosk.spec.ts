import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { CampaignPracticeError, CampaignPracticeService } from './campaign-practice.service';

// What the kiosk adds to production's campaign client (T3.6): the story asks for an explicit
// rung (the prepared set sits at rungs cleared plus one, PREPARED-CHOICES.md 5.2), and an
// answer to a LIVE question names its fresh set (Q-fresh, K103, API-CONTRACT.md section 5).
describe('CampaignPracticeService, kiosk additions', () => {
  let service: CampaignPracticeService;
  let backend: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    service = TestBed.inject(CampaignPracticeService);
    backend = TestBed.inject(HttpTestingController);
  });

  afterEach(() => backend.verify());

  it('asks for an explicit rung when given one', () => {
    service.load('goal-1', 'res', 6).subscribe();
    const req = backend.expectOne((r) => r.url === '/api/v1/me/goals/goal-1/campaign/questions');
    expect(req.request.params.get('concept_id')).toBe('res');
    expect(req.request.params.get('rung')).toBe('6');
    req.flush({ status: 'requested', concept_id: 'res', concept_key: 'reservoirs', rung: 6 });
  });

  it('leaves the rung to the serve decision when none is given (production behaviour)', () => {
    service.load('goal-1', 'res').subscribe();
    const req = backend.expectOne((r) => r.url === '/api/v1/me/goals/goal-1/campaign/questions');
    expect(req.request.params.has('rung')).toBe(false);
    req.flush({ status: 'none', concept_id: 'res', concept_key: 'reservoirs', rung: 1 });
  });

  it('names the fresh set an answer grades against (Q-fresh)', () => {
    service.answer('goal-1', { concept_id: 'res', rung: 6, question_index: 0, selected_option_id: 'o1', fresh_set_id: 'fresh-1' }).subscribe();
    const req = backend.expectOne('/api/v1/me/goals/goal-1/campaign/questions/answer');
    expect(req.request.body).toEqual({ concept_id: 'res', rung: 6, question_index: 0, selected_option_id: 'o1', fresh_set_id: 'fresh-1' });
    req.flush({});
  });

  it('a FRESH_SET_MISMATCH is a typed error, never a silent grade against the prepared key', () => {
    let err: CampaignPracticeError | undefined;
    service
      .answer('goal-1', { concept_id: 'res', rung: 6, question_index: 0, selected_option_id: 'o1', fresh_set_id: 'fresh-x' })
      .subscribe({ error: (e: unknown) => (err = e as CampaignPracticeError) });
    backend
      .expectOne('/api/v1/me/goals/goal-1/campaign/questions/answer')
      .flush({ code: 'FRESH_SET_MISMATCH', message: 'the fresh set belongs to another node or rung' }, { status: 409, statusText: 'Conflict' });
    expect(err).toBeInstanceOf(CampaignPracticeError);
    expect(err?.code).toBe('FRESH_SET_MISMATCH');
  });

  it('a network failure (status 0) is a typed error too', () => {
    let err: CampaignPracticeError | undefined;
    service.load('goal-1', 'res').subscribe({ error: (e: unknown) => (err = e as CampaignPracticeError) });
    backend
      .expectOne((r) => r.url === '/api/v1/me/goals/goal-1/campaign/questions')
      .error(new ProgressEvent('error'), { status: 0, statusText: 'Unknown Error' });
    expect(err?.status).toBe(0);
    expect(err?.code).toBe('UNKNOWN');
  });
});
