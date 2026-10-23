import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { RESET_PHASES, RESET_POLL_MS, ResetService, ResetStatus } from './reset.service';

const URL_ = '/api/v1/kiosk/reset';

// The conductor's reset body (services/chora-kiosk-conductor/API.md section 5).
function status(phase: number, over: Partial<ResetStatus> = {}): ResetStatus {
  const ids = RESET_PHASES;
  return {
    reset_id: '0192f3c4-8b1e-7a3d-9c55-2f6e1b7d4a10',
    state: phase < 4 ? 'running' : 'done',
    phase: phase < 4 ? ids[phase] : null,
    phases: ids.map((id, i) => ({
      id,
      state: i < phase ? 'done' : i === phase ? 'running' : 'pending',
      started_at: null,
      finished_at: null,
    })),
    started_at: '2026-10-20T06:31:21Z',
    finished_at: phase < 4 ? null : '2026-10-20T06:31:52Z',
    took_s: phase < 4 ? null : 31,
    estimate_s: 31,
    failed_phase: null,
    failed_step: null,
    ...over,
  };
}

function setup() {
  TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
  return { reset: TestBed.inject(ResetService), backend: TestBed.inject(HttpTestingController) };
}

describe('ResetService: stop, restore, start (ADR-260 D9, K70, K112)', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("knows the conductor's four phases, in order", () => {
    expect([...RESET_PHASES]).toEqual(['pausing', 'restoring_data', 'clearing_queues_and_pictures', 'starting']);
  });

  it('starts a reset and follows it phase by phase until done', async () => {
    const { reset, backend } = setup();
    const p = reset.start();
    const post = backend.expectOne((r) => r.method === 'POST' && r.url === URL_);
    expect(post.request.body).toEqual({});
    post.flush(status(0), { status: 202, statusText: 'Accepted' });
    await vi.advanceTimersByTimeAsync(0);
    expect(reset.status()?.phase).toBe('pausing');
    for (const ph of [1, 2, 3]) {
      await vi.advanceTimersByTimeAsync(RESET_POLL_MS);
      backend.expectOne((r) => r.method === 'GET').flush(status(ph));
      await vi.advanceTimersByTimeAsync(0);
      expect(reset.status()?.phase).toBe(RESET_PHASES[ph]);
    }
    await vi.advanceTimersByTimeAsync(RESET_POLL_MS);
    backend.expectOne((r) => r.method === 'GET').flush(status(4));
    const final = await p;
    expect(final.state).toBe('done');
    expect(reset.running()).toBe(false);
    backend.verify();
  });

  it('a failed reset stops loudly and stays failed, naming the step', async () => {
    const { reset, backend } = setup();
    const errors: string[] = [];
    vi.spyOn(console, 'error').mockImplementation((...a: unknown[]) => void errors.push(a.join(' ')));
    const p = reset.start();
    backend.expectOne((r) => r.method === 'POST').flush(status(0));
    await vi.advanceTimersByTimeAsync(RESET_POLL_MS);
    backend
      .expectOne((r) => r.method === 'GET')
      .flush(status(1, { state: 'failed', phase: null, failed_phase: 'restoring_data', failed_step: 'guard_marker' }));
    const final = await p;
    expect(final.state).toBe('failed');
    expect(reset.status()?.failed_step).toBe('guard_marker');
    expect(errors.join('\n')).toMatch(/\[kiosk\] the reset failed at restoring_data \(guard_marker\)/);
    await vi.advanceTimersByTimeAsync(RESET_POLL_MS * 3);
    backend.expectNone(URL_);
    vi.restoreAllMocks();
  });

  it('a second press while one runs joins it', async () => {
    const { reset, backend } = setup();
    const a = reset.start();
    expect(reset.start()).toBe(a);
    backend.expectOne((r) => r.method === 'POST').flush(status(4));
    await a;
  });

  it('a refused start is a failed reset with no phases, never a quiet return to the start screen', async () => {
    const { reset, backend } = setup();
    const errors: string[] = [];
    vi.spyOn(console, 'error').mockImplementation((...a: unknown[]) => void errors.push(a.join(' ')));
    const p = reset.start();
    backend.expectOne((r) => r.method === 'POST').flush({}, { status: 500, statusText: 'Internal' });
    const final = await p;
    expect(final.state).toBe('failed');
    expect(reset.unreachable()).toBe(true);
    expect(errors.join('\n')).toMatch(/\[kiosk\] the reset could not be started: 500/);
    vi.restoreAllMocks();
  });

  it('a conductor that stops answering mid-reset reads as failed, not as done', async () => {
    const { reset, backend } = setup();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const p = reset.start();
    backend.expectOne((r) => r.method === 'POST').flush(status(0));
    await vi.advanceTimersByTimeAsync(RESET_POLL_MS);
    backend.expectOne((r) => r.method === 'GET').error(new ProgressEvent('error'));
    const final = await p;
    expect(final.state).toBe('failed');
    expect(reset.unreachable()).toBe(true);
    vi.restoreAllMocks();
  });

  it("follows the conductor's phase list as sent: three known phases are fine", async () => {
    const { reset, backend } = setup();
    const p = reset.start();
    const three = status(4);
    backend.expectOne((r) => r.method === 'POST').flush({ ...three, phases: three.phases.slice(0, 3) });
    const final = await p;
    expect(final.state).toBe('done');
    expect(reset.status()?.phases.map((x) => x.id)).toEqual(['pausing', 'restoring_data', 'clearing_queues_and_pictures']);
  });

  it('refuses a phase it has no words for, loudly, rather than showing a blank line', async () => {
    const { reset, backend } = setup();
    const errors: string[] = [];
    vi.spyOn(console, 'error').mockImplementation((...a: unknown[]) => void errors.push(a.join(' ')));
    const p = reset.start();
    const odd = status(0);
    backend
      .expectOne((r) => r.method === 'POST')
      .flush({ ...odd, phases: [...odd.phases, { id: 'warming_caches', state: 'pending', started_at: null, finished_at: null }] });
    const final = await p;
    expect(final.state).toBe('failed');
    expect(errors.join('\n')).toMatch(/unknown reset phase warming_caches/);
    vi.restoreAllMocks();
  });
});
