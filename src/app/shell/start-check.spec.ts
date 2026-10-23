import { TestBed } from '@angular/core/testing';

import { ReadinessService } from '../kiosk-api/readiness.service';
import { FRESH_MS, REFRESH_MS, StartCheck } from './start-check';

// K164 W31 (the owner, 19 Oct): "Start in English" waited about 2 s with no feedback, the K151 read
// (2,142 ms measured). While the start screen shows, the answer to "did a demo session start since the
// last reset?" is read in the background and kept fresh, so a click can act at once; an answer older
// than FRESH_MS is never used, and a story start by this tab voids it.
describe('StartCheck (K164 W31)', () => {
  let reads: { resolve: (v: boolean) => void; reject: (e: Error) => void }[];
  let check: StartCheck;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-20T06:00:00Z'));
    reads = [];
    TestBed.configureTestingModule({
      providers: [{ provide: ReadinessService, useValue: { sessionStartedSinceReset: () => new Promise<boolean>((resolve, reject) => reads.push({ resolve, reject })) } }],
    });
    check = TestBed.inject(StartCheck);
  });
  afterEach(() => vi.useRealTimers());

  it('watching reads at once, then again REFRESH_MS after each answer lands, until it stops', async () => {
    const stop = check.watch();
    expect(reads).toHaveLength(1);
    reads[0].resolve(false);
    await vi.advanceTimersByTimeAsync(REFRESH_MS - 1);
    expect(reads).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(reads).toHaveLength(2);
    stop();
    reads[1].resolve(false);
    await vi.advanceTimersByTimeAsync(REFRESH_MS * 3);
    expect(reads).toHaveLength(2);
  });

  it('a fresh answer is used at once, with no read; one older than FRESH_MS (from its request) is not', async () => {
    const stop = check.watch();
    await vi.advanceTimersByTimeAsync(1500);
    reads[0].resolve(true);
    await vi.advanceTimersByTimeAsync(0);
    expect(check.fresh()).toBe(true);
    await expect(check.ask()).resolves.toBe(true);
    expect(reads).toHaveLength(1);
    stop();
    await vi.advanceTimersByTimeAsync(FRESH_MS - 1500 + 1);
    expect(check.fresh()).toBe(false);
    const asked = check.ask();
    expect(reads).toHaveLength(2);
    reads[1].resolve(false);
    await expect(asked).resolves.toBe(false);
  });

  it('between the watch’s reads (REFRESH_MS outlasts FRESH_MS) a click finds no fresh answer and none out: it starts a read at once', async () => {
    check.watch();
    reads[0].resolve(false);
    await vi.advanceTimersByTimeAsync(FRESH_MS + 1);
    expect([check.fresh(), reads.length]).toEqual([false, 1]);
    const asked = check.ask();
    expect(reads).toHaveLength(2);
    reads[1].resolve(true);
    await expect(asked).resolves.toBe(true);
    // The watch's own next read comes REFRESH_MS after its last answer, not on top of the click's.
    await vi.advanceTimersByTimeAsync(REFRESH_MS - FRESH_MS - 2);
    expect(reads).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(2);
    expect(reads).toHaveLength(3);
  });

  it('a click while a read is out waits for that read, never a second one', async () => {
    check.watch();
    const asked = check.ask();
    expect(reads).toHaveLength(1);
    reads[0].resolve(true);
    await expect(asked).resolves.toBe(true);
  });

  it('a story start by this tab voids the answer, and a read already out cannot bring it back', async () => {
    check.watch();
    reads[0].resolve(false);
    await vi.advanceTimersByTimeAsync(REFRESH_MS);
    expect(reads).toHaveLength(2);
    check.invalidate();
    expect(check.fresh()).toBe(false);
    reads[1].resolve(false);
    await vi.advanceTimersByTimeAsync(0);
    expect(check.fresh()).toBe(false);
  });

  it('a failed read rejects the click that waits on it (the store then asks, K151), and the watch reads again', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    check.watch();
    const asked = check.ask();
    reads[0].reject(new Error('conductor down'));
    await expect(asked).rejects.toThrow('conductor down');
    expect(check.fresh()).toBe(false);
    await vi.advanceTimersByTimeAsync(REFRESH_MS);
    expect(reads).toHaveLength(2);
    expect(String(warn.mock.calls[0]?.[0])).toContain('conductor down');
    warn.mockRestore();
  });
});
