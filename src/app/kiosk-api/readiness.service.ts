import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { LiveAvailability } from '../live/live.service';

/**
 * The conductor's readiness (services/chora-kiosk-conductor/API.md section 3, fixed at 9562d818b).
 * GET never calls a model; POST is the presenter's "Check again", which starts the opening check
 * (ADR-260 D6), or joins the one running, and is polled until it has passed or failed. This
 * service is also the LIVE availability: LIVE is on per kind only while the last read says so,
 * and off until a read succeeds (K65, K106). A value the conductor could not read is null.
 */
export type RowState = 'ok' | 'warn' | 'fail';
export type ProviderState = 'works' | 'fails' | 'unchecked';
export type ProviderName = 'ollama' | 'vertex';
/** Why a LIVE kind is off: the first that holds, in this order (API.md section 3, ruled 18 Oct; the reader's K158 D8). */
export type LiveOffReason =
  | 'no_reader_tier'
  | 'model_gateway_down'
  | 'not_checked'
  | 'internet_down'
  | 'ollama_fails'
  | 'vertex_fails'
  | 'key_changed'
  | 'picture_cap_spent';
/** A failed reset's step (API.md section 5). */
export type ResetStepId =
  | 'stop_containers'
  | 'guard_dsn'
  | 'guard_marker'
  | 'guard_tenant'
  | 'restore_database'
  | 'grant_connect'
  | 'rebootstrap_emulator'
  | 'restore_blob_root'
  | 'start_containers'
  | 'readiness';

export interface Readiness {
  readonly generated_at: string;
  readonly overall: 'ready' | 'degraded' | 'not_ready' | 'resetting';
  /** K151: a demo session started since the last reset restored the stack (conductor API.md section 3). */
  readonly session_started_since_reset: boolean;
  readonly live: {
    readonly text: { readonly on: boolean; readonly off_reason: LiveOffReason | null };
    readonly picture: { readonly on: boolean; readonly off_reason: LiveOffReason | null };
    /** K158 D8: the weakness analyser's LIVE, the models file's reader tier alone (text does not count it). */
    readonly reader: { readonly on: boolean; readonly off_reason: LiveOffReason | null };
    /** K177: the marked test's Save, the embedding tier alone (a conductor older than K177 sends none). */
    readonly save?: { readonly on: boolean; readonly off_reason: LiveOffReason | null };
  };
  readonly opening_check: { readonly state: 'never_run' | 'running' | 'passed' | 'failed'; readonly checked_at: string | null };
  /** `running` and `expected` are null when the Docker proxy's list could not be read. */
  readonly services: { readonly state: RowState; readonly running: number | null; readonly expected: number | null; readonly down: readonly string[] };
  readonly snapshot: {
    readonly state: RowState;
    readonly prepared_at: string | null;
    readonly restored_at: string | null;
    readonly marker: 'match' | 'mismatch' | 'missing' | 'unknown';
  };
  /** `{}` when the gateway's models read failed. */
  readonly providers: Readonly<Partial<Record<ProviderName, ProviderState>>>;
  readonly text_models: Readonly<Record<string, ProviderState>>;
  readonly internet: 'up' | 'down' | 'unchecked';
  /** null when the picture meter's read failed. */
  readonly pictures: { readonly day: string; readonly used: number; readonly cap: number } | null;
  readonly model_config: {
    readonly state: 'valid' | 'unavailable';
    readonly roles: Readonly<Record<string, { readonly provider: string; readonly model: string }>>;
  };
  readonly last_reset: {
    readonly outcome: 'done' | 'failed';
    readonly finished_at: string;
    readonly took_s: number;
    readonly failed_phase: string | null;
    readonly failed_step: ResetStepId | null;
  } | null;
  readonly disk: { readonly state: RowState; readonly free_percent: number | null };
  /** `headroom_mib`: the measured containers' caps less their use, spare under the caps (never "free memory"). */
  readonly memory: { readonly state: RowState; readonly headroom_mib: number | null; readonly unmeasured: readonly string[] };
  readonly ports: { readonly state: RowState; readonly published: number };
  readonly databases: { readonly state: RowState };
  readonly telemetry: 'none_by_design';
}

const READINESS_URL = '/api/v1/kiosk/readiness';
export const READINESS_POLL_MS = 1500;

@Injectable({ providedIn: 'root' })
export class ReadinessService implements LiveAvailability {
  private readonly http = inject(HttpClient);
  private readonly last = signal<Readiness | null>(null);
  private readonly failedRead = signal(false);
  private readonly running = signal(false);
  private check: Promise<void> | null = null;

  /** The last readiness read, or null before the first good read. */
  readonly readiness = this.last.asReadonly();
  /** True when the last read or "Check again" failed: the board says so and LIVE is off. */
  readonly unreachable = this.failedRead.asReadonly();
  /** True while a "Check again" is running. */
  readonly checking = this.running.asReadonly();

  readonly text = computed(() => !this.failedRead() && (this.last()?.live.text.on ?? false));
  readonly picture = computed(() => !this.failedRead() && (this.last()?.live.picture.on ?? false));
  /** A conductor older than the reader tier sends no live.reader: the analyser stays off (take() says so). */
  readonly reader = computed(() => !this.failedRead() && (this.last()?.live.reader?.on ?? false));
  /** K177: the marked test's Save follows live.save alone; a conductor older than K177 sends none, so Save stays off (take() says so). */
  readonly save = computed(() => !this.failedRead() && (this.last()?.live.save?.on ?? false));

  /** Reads the last known state; never starts a check. */
  async load(): Promise<void> {
    try {
      this.take(await firstValueFrom(this.http.get<Readiness>(READINESS_URL)));
    } catch (err: unknown) {
      this.fail('readiness could not be read', err);
    }
  }

  /**
   * K151: read afresh, before a visitor's start is recorded, whether a previous demo session changed
   * the stack since its last reset. A read that fails, or carries no flag, cannot answer: it throws.
   */
  async sessionStartedSinceReset(): Promise<boolean> {
    const r = await firstValueFrom(this.http.get<Readiness>(READINESS_URL));
    this.take(r);
    if (typeof r.session_started_since_reset !== 'boolean') throw new Error('[kiosk] the readiness read carries no session_started_since_reset');
    return r.session_started_since_reset;
  }

  /** The presenter's "Check again": start the opening check, then poll until it ends. */
  checkAgain(): Promise<void> {
    if (!this.check) {
      this.check = this.runCheck().finally(() => {
        this.check = null;
        this.running.set(false);
      });
    }
    return this.check;
  }

  private async runCheck(): Promise<void> {
    this.running.set(true);
    let r: Readiness;
    try {
      r = await firstValueFrom(this.http.post<Readiness>(READINESS_URL, {}));
    } catch (err: unknown) {
      this.fail('the opening check could not be started', err);
      return;
    }
    this.take(r);
    while (r.opening_check.state === 'running') {
      await new Promise((resolve) => setTimeout(resolve, READINESS_POLL_MS));
      try {
        r = await firstValueFrom(this.http.get<Readiness>(READINESS_URL));
      } catch (err: unknown) {
        this.fail('readiness could not be read', err);
        return;
      }
      this.take(r);
    }
  }

  private take(r: Readiness): void {
    if (!r.live.reader) console.error("[kiosk] the readiness read carries no live.reader: the weakness analyser's LIVE stays off");
    if (!r.live.save) console.error("[kiosk] the readiness read carries no live.save: the marked test's Save stays off");
    this.last.set(r);
    this.failedRead.set(false);
  }

  private fail(what: string, err: unknown): void {
    this.failedRead.set(true);
    const detail = err instanceof HttpErrorResponse ? `${err.status} ${err.statusText}` : String(err);
    console.error(`[kiosk] ${what}: ${detail}`);
  }
}
