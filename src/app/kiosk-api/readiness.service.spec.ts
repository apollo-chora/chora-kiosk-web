import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { LiveAvailability } from '../live/live.service';
import { READINESS_POLL_MS, Readiness, ReadinessService } from './readiness.service';
import { readinessExample } from './readiness.testing';

const URL_ = '/api/v1/kiosk/readiness';

// The conductor's readiness body (services/chora-kiosk-conductor/API.md section 3), as a check left it.
const body = (over: Partial<Readiness> = {}): Readiness => readinessExample({ snapshot: { state: 'ok', prepared_at: '2026-10-20T06:02:00Z', restored_at: null, marker: 'match' }, last_reset: null, ...over });

function setup() {
  TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
  return { svc: TestBed.inject(ReadinessService), backend: TestBed.inject(HttpTestingController) };
}

describe('ReadinessService: the opening check, read from the conductor', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('LIVE is off until the readiness has been read (fail closed)', () => {
    const { svc } = setup();
    expect(svc.readiness()).toBeNull();
    expect(svc.text()).toBe(false);
    expect(svc.picture()).toBe(false);
  });

  it('serves as the LIVE availability: text and picture follow live.*.on', async () => {
    const { svc, backend } = setup();
    const p = svc.load();
    backend.expectOne(URL_).flush(body({ live: { text: { on: true, off_reason: null }, picture: { on: false, off_reason: 'picture_cap_spent' }, reader: { on: true, off_reason: null } } }));
    await p;
    expect(svc.text()).toBe(true);
    expect(svc.picture()).toBe(false);
    expect(svc.readiness()?.live.picture.off_reason).toBe('picture_cap_spent');
    expect(svc.unreachable()).toBe(false);
  });

  it('K158 D8: the weakness analyser follows live.reader alone, off until the first read', async () => {
    const { svc, backend } = setup();
    expect(svc.reader()).toBe(false);
    const p = svc.load();
    backend.expectOne(URL_).flush(
      body({ live: { text: { on: false, off_reason: 'ollama_fails' }, picture: { on: false, off_reason: 'ollama_fails' }, reader: { on: true, off_reason: null } } }),
    );
    await p;
    expect(svc.reader()).toBe(true);
    expect(svc.text()).toBe(false);
  });

  it('K158 D8: a reader the conductor reports off is off, with its reason (no_reader_tier first)', async () => {
    const { svc, backend } = setup();
    const p = svc.load();
    backend.expectOne(URL_).flush(body({ live: { text: { on: true, off_reason: null }, picture: { on: true, off_reason: null }, reader: { on: false, off_reason: 'no_reader_tier' } } }));
    await p;
    expect(svc.reader()).toBe(false);
    expect(svc.text()).toBe(true);
    expect(svc.readiness()?.live.reader.off_reason).toBe('no_reader_tier');
  });

  it('K158 D8: a readiness with no live.reader (a conductor older than the reader tier) keeps the analyser off and says so loudly', async () => {
    const { svc, backend } = setup();
    const errors: string[] = [];
    vi.spyOn(console, 'error').mockImplementation((...a: unknown[]) => void errors.push(a.join(' ')));
    const r = body();
    const p = svc.load();
    backend.expectOne(URL_).flush({ ...r, live: { text: r.live.text, picture: r.live.picture } });
    await p;
    expect(svc.reader()).toBe(false);
    expect(svc.text()).toBe(true);
    expect(errors.join('\n')).toMatch(/\[kiosk\] the readiness read carries no live\.reader: the weakness analyser's LIVE stays off/);
    vi.restoreAllMocks();
  });

  it('K177: Save follows live.save alone (a failing reader or picture leaves it on), off until the first read', async () => {
    const { svc, backend } = setup();
    expect(svc.save()).toBe(false);
    const p = svc.load();
    backend.expectOne(URL_).flush(
      body({ live: { text: { on: true, off_reason: null }, picture: { on: false, off_reason: 'vertex_fails' }, reader: { on: false, off_reason: 'vertex_fails' }, save: { on: true, off_reason: null } } }),
    );
    await p;
    expect(svc.save()).toBe(true);
    expect(svc.reader()).toBe(false);
  });

  it('K177: a Save the conductor reports off is off, with its reason', async () => {
    const { svc, backend } = setup();
    const p = svc.load();
    backend.expectOne(URL_).flush(body({ live: { text: { on: true, off_reason: null }, picture: { on: true, off_reason: null }, reader: { on: true, off_reason: null }, save: { on: false, off_reason: 'internet_down' } } }));
    await p;
    expect(svc.save()).toBe(false);
    expect(svc.readiness()?.live.save?.off_reason).toBe('internet_down');
  });

  it('K177: a readiness with no live.save (a conductor older than K177) keeps Save off and says so loudly', async () => {
    const { svc, backend } = setup();
    const errors: string[] = [];
    vi.spyOn(console, 'error').mockImplementation((...a: unknown[]) => void errors.push(a.join(' ')));
    const r = body();
    const p = svc.load();
    backend.expectOne(URL_).flush({ ...r, live: { text: r.live.text, picture: r.live.picture, reader: r.live.reader } });
    await p;
    expect(svc.save()).toBe(false);
    expect(svc.reader()).toBe(true);
    expect(errors.join('\n')).toMatch(/\[kiosk\] the readiness read carries no live\.save: the marked test's Save stays off/);
    vi.restoreAllMocks();
  });

  it('K158 D8: a failed read after a good one turns the reader off too', async () => {
    const { svc, backend } = setup();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    let p = svc.load();
    backend.expectOne(URL_).flush(body());
    await p;
    expect(svc.reader()).toBe(true);
    p = svc.load();
    backend.expectOne(URL_).error(new ProgressEvent('error'));
    await p;
    expect(svc.reader()).toBe(false);
    vi.restoreAllMocks();
  });

  it('an unreachable conductor turns LIVE off and says so, loudly', async () => {
    const { svc, backend } = setup();
    const errors: string[] = [];
    vi.spyOn(console, 'error').mockImplementation((...a: unknown[]) => void errors.push(a.join(' ')));
    const p = svc.load();
    backend.expectOne(URL_).flush({ error: { code: 'NOT_READY' } }, { status: 503, statusText: 'Service Unavailable' });
    await p;
    expect(svc.unreachable()).toBe(true);
    expect(svc.text()).toBe(false);
    expect(errors.join('\n')).toMatch(/\[kiosk\] readiness could not be read: .*503/);
    vi.restoreAllMocks();
  });

  it('a failed read after a good one does not keep the stale LIVE on', async () => {
    const { svc, backend } = setup();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    let p = svc.load();
    backend.expectOne(URL_).flush(body());
    await p;
    expect(svc.text()).toBe(true);
    p = svc.load();
    backend.expectOne(URL_).error(new ProgressEvent('error'));
    await p;
    expect(svc.text()).toBe(false);
    vi.restoreAllMocks();
  });

  it('"Check again" starts the opening check and polls until it has passed or failed', async () => {
    const { svc, backend } = setup();
    const p = svc.checkAgain();
    const post = backend.expectOne((r) => r.method === 'POST' && r.url === URL_);
    post.flush(body({ opening_check: { state: 'running', checked_at: null } }), { status: 202, statusText: 'Accepted' });
    await vi.advanceTimersByTimeAsync(0);
    expect(svc.checking()).toBe(true);
    await vi.advanceTimersByTimeAsync(READINESS_POLL_MS);
    backend.expectOne((r) => r.method === 'GET').flush(body({ opening_check: { state: 'running', checked_at: null } }));
    await vi.advanceTimersByTimeAsync(READINESS_POLL_MS);
    backend
      .expectOne((r) => r.method === 'GET')
      .flush(body({ opening_check: { state: 'failed', checked_at: '2026-10-20T07:00:00Z' }, live: { text: { on: false, off_reason: 'ollama_fails' }, picture: { on: false, off_reason: 'ollama_fails' }, reader: { on: true, off_reason: null } } }));
    await p;
    expect(svc.checking()).toBe(false);
    expect(svc.readiness()?.opening_check.state).toBe('failed');
    expect(svc.text()).toBe(false);
    backend.verify();
  });

  it('a second "Check again" while one runs joins it instead of starting another', async () => {
    const { svc, backend } = setup();
    const a = svc.checkAgain();
    const b = svc.checkAgain();
    expect(b).toBe(a);
    backend.expectOne((r) => r.method === 'POST').flush(body());
    await a;
  });

  it('a "Check again" the conductor refuses ends the check and reports it', async () => {
    const { svc, backend } = setup();
    const errors: string[] = [];
    vi.spyOn(console, 'error').mockImplementation((...x: unknown[]) => void errors.push(x.join(' ')));
    const p = svc.checkAgain();
    backend.expectOne((r) => r.method === 'POST').flush({}, { status: 500, statusText: 'Internal' });
    await p;
    expect(svc.checking()).toBe(false);
    expect(svc.unreachable()).toBe(true);
    expect(errors.join('\n')).toMatch(/\[kiosk\] the opening check could not be started: .*500/);
    vi.restoreAllMocks();
  });

  it('is what the LIVE service reads its availability from', () => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), { provide: LiveAvailability, useExisting: ReadinessService }],
    });
    expect(TestBed.inject(LiveAvailability)).toBe(TestBed.inject(ReadinessService));
  });

  it('K151: reads afresh whether a demo session started since the last reset', async () => {
    const { svc, backend } = setup();
    const asked = svc.sessionStartedSinceReset();
    backend.expectOne(URL_).flush(body({ session_started_since_reset: true }));
    expect(await asked).toBe(true);
    const again = svc.sessionStartedSinceReset();
    backend.expectOne(URL_).flush(body({ session_started_since_reset: false }));
    expect(await again).toBe(false);
  });

  it('K151: a readiness without the flag, or no readiness at all, cannot answer: refused loudly, never read as false', async () => {
    const { svc, backend } = setup();
    const missing = svc.sessionStartedSinceReset();
    const { session_started_since_reset: _drop, ...older } = body();
    backend.expectOne(URL_).flush(older);
    await expect(missing).rejects.toThrow(/carries no session_started_since_reset/);
    const down = svc.sessionStartedSinceReset();
    backend.expectOne(URL_).flush({ error: { code: 'NOT_READY' } }, { status: 503, statusText: 'Service Unavailable' });
    await expect(down).rejects.toThrow();
  });
});
