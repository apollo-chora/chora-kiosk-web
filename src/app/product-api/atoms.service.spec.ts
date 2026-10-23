import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { atomRead } from '../exhibits/companions/companions-world.testing';
import { AtomsService } from './atoms.service';

// One atom, as production's atom player reads it (atomic-session.service.ts load):
// GET /api/atoms/{atomId} answers {atom} (phyllis.go GetAtom; the answer key stripped). The dose
// card's body comes from here, never from the dose read's summary, which is the title (F17).
describe('AtomsService', () => {
  let svc: AtomsService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    svc = TestBed.inject(AtomsService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('reads the atom out of its envelope', async () => {
    const p = svc.read('a-rev');
    const req = http.expectOne('/api/atoms/a-rev');
    expect(req.request.method).toBe('GET');
    req.flush(atomRead('a-rev', 'The Four National Taps', 'Singapore draws its water from four sources.'));
    const a = await p;
    expect([a.atom_id, a.title, a.body]).toEqual(['a-rev', 'The Four National Taps', 'Singapore draws its water from four sources.']);
  });

  it('a body without its atom is an error', async () => {
    const p = svc.read('a-rev');
    http.expectOne('/api/atoms/a-rev').flush({ atom_id: 'a-rev' });
    await expect(p).rejects.toThrow(/no \{atom\} envelope/);
  });

  // The attempt (atomic-session.service.ts start and submit): the start POST has no body (the
  // gateway takes the atom from the path); the submit carries {session_id, answer_id,
  // selected_option_id} and is graded by rule from consumption's atom_index (me_handlers.go).
  it('starts an attempt with an empty body and submits one answer to it', async () => {
    const started = svc.start('a-rev');
    const s = http.expectOne('/api/atoms/a-rev/session');
    expect([s.request.method, s.request.body]).toEqual(['POST', {}]);
    s.flush({ session_id: 's-1', tenant_id: 't', learner_gcid: 'g', atom_id: 'a-rev', status: 'in_progress', hints_used: 0, answer_count: 0, started_at: '2026-10-30T02:00:00Z' });
    expect((await started).session_id).toBe('s-1');
    const graded = svc.submit('a-rev', { session_id: 's-1', answer_id: 'ans-1', selected_option_id: 'o-2' });
    const sub = http.expectOne('/api/atoms/a-rev/session/submit');
    expect([sub.request.method, sub.request.body]).toEqual(['POST', { session_id: 's-1', answer_id: 'ans-1', selected_option_id: 'o-2' }]);
    sub.flush({ session_id: 's-1', status: 'completed', is_correct: true, duplicate: false, hints_used: 0, answer_count: 1, paths_advanced: 0, paths_completed: 0 });
    expect((await graded).is_correct).toBe(true);
  });

  it('a start with no session id, or a grade with no verdict, is an error', async () => {
    const started = svc.start('a-rev');
    http.expectOne('/api/atoms/a-rev/session').flush({ status: 'in_progress' });
    await expect(started).rejects.toThrow(/no session_id/);
    const graded = svc.submit('a-rev', { session_id: 's-1', answer_id: 'a', selected_option_id: 'o' });
    http.expectOne('/api/atoms/a-rev/session/submit').flush({ session_id: 's-1', status: 'completed' });
    await expect(graded).rejects.toThrow(/no is_correct/);
  });

  it('a refused submit is a loud error naming the call and its code', async () => {
    const graded = svc.submit('a-rev', { session_id: 's-1', answer_id: 'a', selected_option_id: 'o' });
    http.expectOne('/api/atoms/a-rev/session/submit').flush({ code: 'ATOM_NOT_GRADEABLE', message: 'no key' }, { status: 422, statusText: 'Unprocessable' });
    await expect(graded).rejects.toThrow(/POST \/api\/atoms\/a-rev\/session\/submit: 422 ATOM_NOT_GRADEABLE/);
  });

  it('a refused read is a loud error naming the call', async () => {
    const p = svc.read('a-x');
    http.expectOne('/api/atoms/a-x').flush({ code: 'NOT_FOUND' }, { status: 404, statusText: 'Not Found' });
    await expect(p).rejects.toThrow(/GET \/api\/atoms\/a-x/);
  });
});
