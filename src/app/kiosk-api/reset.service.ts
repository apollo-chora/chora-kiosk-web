import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';

/**
 * The per-visit reset (ADR-260 D9, K70, K112; conductor API.md section 5): stop, restore
 * the prepared start, start again. POST returns at once; the waiting card follows GET
 * phase by phase. A failed reset stops at its failed step and stays failed: no visit
 * starts on a partial restore.
 */
export const RESET_PHASES = ['pausing', 'restoring_data', 'clearing_queues_and_pictures', 'starting'] as const;
export type ResetPhaseId = (typeof RESET_PHASES)[number];

export interface ResetPhase {
  readonly id: ResetPhaseId;
  readonly state: 'pending' | 'running' | 'done' | 'failed';
  readonly started_at: string | null;
  readonly finished_at: string | null;
}

export interface ResetStatus {
  readonly reset_id: string;
  readonly state: 'running' | 'done' | 'failed';
  readonly phase: ResetPhaseId | null;
  readonly phases: readonly ResetPhase[];
  readonly started_at: string;
  readonly finished_at: string | null;
  readonly took_s: number | null;
  readonly estimate_s: number | null;
  readonly failed_phase: ResetPhaseId | null;
  readonly failed_step: string | null;
}

/** A reset kiosk-web could not start or follow: shown as failed, with no phases to tick. */
const UNREACHABLE: ResetStatus = {
  reset_id: '',
  state: 'failed',
  phase: null,
  phases: [],
  started_at: '',
  finished_at: null,
  took_s: null,
  estimate_s: null,
  failed_phase: null,
  failed_step: null,
};

const RESET_URL = '/api/v1/kiosk/reset';
export const RESET_POLL_MS = 1000;

@Injectable({ providedIn: 'root' })
export class ResetService {
  private readonly http = inject(HttpClient);
  private readonly last = signal<ResetStatus | null>(null);
  private readonly lost = signal(false);
  private inflight: Promise<ResetStatus> | null = null;

  /** The reset as last read, or null before one was started. */
  readonly status = this.last.asReadonly();
  /** True when the conductor could not be reached to start or follow the reset. */
  readonly unreachable = this.lost.asReadonly();
  readonly running = computed(() => this.last()?.state === 'running');

  start(): Promise<ResetStatus> {
    if (!this.inflight) {
      this.inflight = this.run().finally(() => {
        this.inflight = null;
      });
    }
    return this.inflight;
  }

  private async run(): Promise<ResetStatus> {
    this.lost.set(false);
    let s: ResetStatus;
    try {
      s = this.checked(await firstValueFrom(this.http.post<ResetStatus>(RESET_URL, {})));
    } catch (err: unknown) {
      return this.lose('the reset could not be started', err);
    }
    this.last.set(s);
    while (s.state === 'running') {
      await new Promise((resolve) => setTimeout(resolve, RESET_POLL_MS));
      try {
        s = this.checked(await firstValueFrom(this.http.get<ResetStatus>(RESET_URL)));
      } catch (err: unknown) {
        return this.lose('the reset could not be followed', err);
      }
      this.last.set(s);
    }
    if (s.state === 'failed') {
      console.error(`[kiosk] the reset failed at ${s.failed_phase ?? 'an unnamed phase'} (${s.failed_step ?? 'no step named'})`);
    }
    return s;
  }

  private checked(s: ResetStatus): ResetStatus {
    for (const p of s.phases) {
      if (!(RESET_PHASES as readonly string[]).includes(p.id)) throw new Error(`unknown reset phase ${p.id}`);
    }
    return s;
  }

  private lose(what: string, err: unknown): ResetStatus {
    const detail = err instanceof HttpErrorResponse ? `${err.status} ${err.statusText}` : err instanceof Error ? err.message : String(err);
    console.error(`[kiosk] ${what}: ${detail}`);
    this.lost.set(true);
    this.last.set(UNREACHABLE);
    return UNREACHABLE;
  }
}
