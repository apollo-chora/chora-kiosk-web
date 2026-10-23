import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';

import { SESSION_REFRESH_MARGIN_MS, SessionService, authInterceptor } from './session.service';

const MINT = '/api/v1/kiosk/session';

// The conductor's session body (services/chora-kiosk-conductor/API.md section 2).
const minted = (token: string, expiresIn = 3600) => ({
  access_token: token,
  token_type: 'Bearer',
  expires_in: expiresIn,
  gcid: '01a1411f-7f22-76c6-ab1d-362dddc20413',
  tenant_id: '01a1411f-7f20-7834-bdd5-6f80318297bf',
  roles: ['learner', 'author', 'instructor', 'auditor'],
});

function setup() {
  TestBed.configureTestingModule({
    providers: [provideHttpClient(withInterceptors([authInterceptor])), provideHttpClientTesting()],
  });
  return {
    session: TestBed.inject(SessionService),
    http: TestBed.inject(HttpClient),
    backend: TestBed.inject(HttpTestingController),
  };
}

describe('SessionService and authInterceptor: the sign-in-free kiosk session (ADR-259 D2)', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  // The learner the kiosk session acts as: the assessment create invites it (K55), and only the
  // mint names it (no world key carries the GCID).
  it('names the learner the session acts as, from the mint; a reset forgets it', async () => {
    const { session, backend } = setup();
    const g = session.learnerGcid();
    backend.expectOne(MINT).flush(minted('t1'));
    await expect(g).resolves.toBe('01a1411f-7f22-76c6-ab1d-362dddc20413');
    session.drop();
    const again = session.learnerGcid();
    backend.expectOne(MINT).flush({ ...minted('t2'), gcid: '01a1411f-7f22-76c6-ab1d-000000000002' });
    await expect(again).resolves.toBe('01a1411f-7f22-76c6-ab1d-000000000002');
  });

  it('a mint that names no learner is refused', async () => {
    const { session, backend } = setup();
    const g = session.learnerGcid();
    backend.expectOne(MINT).flush({ ...minted('t1'), gcid: '' });
    await expect(g).rejects.toThrow(/names no learner/);
  });

  it('mints a session with no body and no Authorization header', async () => {
    const { session, backend } = setup();
    const p = session.ensure();
    const req = backend.expectOne(MINT);
    expect(req.request.method).toBe('POST');
    expect(req.request.headers.has('Authorization')).toBe(false);
    expect(req.request.body).toEqual({});
    req.flush(minted('t1'));
    await expect(p).resolves.toBe('t1');
  });

  it('adds the bearer token to API and BFF calls, minting it first when needed', async () => {
    const { http, backend } = setup();
    const p = firstValueFrom(http.get('/api/v1/me/goals'));
    await vi.advanceTimersByTimeAsync(0);
    backend.expectOne(MINT).flush(minted('t1'));
    await vi.advanceTimersByTimeAsync(0);
    const req = backend.expectOne('/api/v1/me/goals');
    expect(req.request.headers.get('Authorization')).toBe('Bearer t1');
    req.flush([]);
    await p;
    const q = firstValueFrom(http.get('/bff/oplus/governance'));
    await vi.advanceTimersByTimeAsync(0);
    expect(backend.expectOne('/bff/oplus/governance').request.headers.get('Authorization')).toBe('Bearer t1');
    backend.verify();
    void q;
  });

  it('leaves non-API requests alone', async () => {
    const { http, backend } = setup();
    const p = firstValueFrom(http.get('/media/inter.woff2', { responseType: 'text' }));
    const req = backend.expectOne('/media/inter.woff2');
    expect(req.request.headers.has('Authorization')).toBe(false);
    req.flush('');
    await p;
  });

  it('shares one mint between calls made at the same time', async () => {
    const { session, backend } = setup();
    const a = session.ensure();
    const b = session.ensure();
    backend.expectOne(MINT).flush(minted('t1'));
    await expect(Promise.all([a, b])).resolves.toEqual(['t1', 't1']);
  });

  it('mints again shortly before the token expires', async () => {
    const { session, backend } = setup();
    let p = session.ensure();
    backend.expectOne(MINT).flush(minted('t1', 3600));
    await p;
    vi.advanceTimersByTime(3600_000 - SESSION_REFRESH_MARGIN_MS - 1);
    await expect(session.ensure()).resolves.toBe('t1');
    vi.advanceTimersByTime(2);
    p = session.ensure();
    backend.expectOne(MINT).flush(minted('t2', 3600));
    await expect(p).resolves.toBe('t2');
  });

  it('drop() forgets the token, so the next visitor gets a new session', async () => {
    const { session, backend } = setup();
    let p = session.ensure();
    backend.expectOne(MINT).flush(minted('t1'));
    await p;
    session.drop();
    p = session.ensure();
    backend.expectOne(MINT).flush(minted('t2'));
    await expect(p).resolves.toBe('t2');
  });

  it('a refused mint is an error the caller sees (503 while a reset runs)', async () => {
    const { http, backend } = setup();
    const p = firstValueFrom(http.get('/api/v1/me/goals'));
    await vi.advanceTimersByTimeAsync(0);
    backend.expectOne(MINT).flush({ error: { code: 'NOT_READY' } }, { status: 503, statusText: 'Service Unavailable' });
    await expect(p).rejects.toThrow(/kiosk session could not be minted: 503/);
    backend.expectNone('/api/v1/me/goals');
  });

  it('a 401 drops the token so the next call mints a fresh one', async () => {
    const { session, http, backend } = setup();
    const s = session.ensure();
    backend.expectOne(MINT).flush(minted('t1'));
    await s;
    const p = firstValueFrom(http.get('/api/v1/me/goals'));
    await vi.advanceTimersByTimeAsync(0);
    backend.expectOne('/api/v1/me/goals').flush({}, { status: 401, statusText: 'Unauthorized' });
    await expect(p).rejects.toBeTruthy();
    const again = session.ensure();
    backend.expectOne(MINT).flush(minted('t2'));
    await expect(again).resolves.toBe('t2');
  });

  it('refuses a mint answer that is not a bearer token', async () => {
    const { session, backend } = setup();
    const p = session.ensure();
    backend.expectOne(MINT).flush({ ...minted('t1'), token_type: 'Basic' });
    await expect(p).rejects.toThrow(/not a bearer token/);
  });
});
