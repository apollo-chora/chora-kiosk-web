import { Injectable, inject } from '@angular/core';

import { ReadinessService } from '../kiosk-api/readiness.service';

/** How long an answer stands, counted from the moment its request went out (K164). */
export const FRESH_MS = 5000;
/**
 * How long after an answer lands the watch asks again. Each readiness read writes about 12.8 KB to the
 * conductor's log and compose keeps 3 x 10 MB per container, so a read every 15 s keeps about 10 hours
 * of its history (orchestrator, 19 Oct); a click between reads starts its own read at once.
 */
export const REFRESH_MS = 15000;

/**
 * K164 W31: K151's question, "did a demo session start on this stack since its last reset?", answered
 * ahead of the click. While the start screen shows it reads the conductor in the background and keeps
 * the answer fresh, so "Start" acts at once (the read took 2,142 ms on 19 Oct). An answer older than
 * FRESH_MS is never used (a click then starts a read at once, or waits on the one already out, never
 * a second), and a story start by this tab voids it, so a stale "no" can never skip the
 * K151 prompt; a failed read rejects, and the store then asks (K151's safe default).
 */
@Injectable({ providedIn: 'root' })
export class StartCheck {
  private readonly readiness = inject(ReadinessService);
  private answer: { readonly value: boolean; readonly at: number } | null = null;
  private inflight: Promise<boolean> | null = null;
  /** Bumped by invalidate: a read sent before it never refills the answer. */
  private epoch = 0;
  private watching = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;

  /** A usable answer exists now. */
  fresh(): boolean {
    return !!this.answer && Date.now() - this.answer.at <= FRESH_MS;
  }

  /** The answer for a click: the fresh one at once, else the read already out, else a new read. */
  ask(): Promise<boolean> {
    if (this.fresh()) return Promise.resolve((this.answer as { value: boolean }).value);
    return this.inflight ?? this.read();
  }

  /** This tab started the story: the answer no longer describes the stack. */
  invalidate(): void {
    this.answer = null;
    this.epoch++;
  }

  /** Keeps the answer fresh while the start screen shows; returns the function that stops it. */
  watch(): () => void {
    const me = ++this.watching;
    const loop = (): void => {
      if (me !== this.watching) return;
      (this.inflight ?? this.read())
        .catch((err: unknown) => console.warn(`[kiosk] the start screen's K151 pre-check failed: ${err instanceof Error ? err.message : String(err)}; a click will ask the conductor again`))
        .finally(() => {
          if (me === this.watching) this.timer = setTimeout(loop, REFRESH_MS);
        });
    };
    loop();
    return () => {
      if (me !== this.watching) return;
      this.watching++;
      if (this.timer) clearTimeout(this.timer);
      this.timer = null;
    };
  }

  private read(): Promise<boolean> {
    const at = Date.now();
    const epoch = this.epoch;
    const p = this.readiness.sessionStartedSinceReset().then(
      (value) => {
        if (epoch === this.epoch) this.answer = { value, at };
        return value;
      },
      (err: unknown) => {
        if (epoch === this.epoch) this.answer = null;
        throw err;
      },
    );
    this.inflight = p;
    const clear = (): void => {
      if (this.inflight === p) this.inflight = null;
    };
    p.then(clear, clear);
    return p;
  }
}
