import { Injectable, InjectionToken, Signal, computed, inject, signal } from '@angular/core';

import { aborted } from './abortable';
import { LiveHttp } from './live-http';
import { LIVE_KINDS, LiveKind, LiveProvider, LiveStageId } from './live-kinds';

/**
 * The LIVE service (T3.4): the one function the build puts in place of the mockup's
 * liveCall() (ADR-259 D11). Every model call the kiosk makes goes through press():
 *
 * - one call at a time (K86);
 * - each kind's budget, 20 s or 45 s (K48); past it the press is a miss, labelled late,
 *   and the screen falls back to its prepared result (K45) or, for typed input, fails
 *   loudly (D9 rule 3);
 * - off per provider when the opening check did not find it working, and only then: a
 *   failed press never turns a kind off (K65, K106);
 * - the crew's stages tick off as the executor reports them, never on a timer (K48);
 * - the press is stamped as done just now (D9 rule 5).
 *
 * The executors (one per kind, ./kinds/) make the HTTP calls through LiveHttp, the only
 * client allowed to reach a model-calling route (live-http.ts).
 */

export type LiveKey = string;

export interface LiveStageView {
  readonly id: LiveStageId;
  readonly state: 'pending' | 'running' | 'done';
}

export type LiveOutcome<R = unknown> =
  | { readonly status: 'done'; readonly kind: LiveKind; readonly result: R; readonly ms: number; readonly at: Date }
  | { readonly status: 'missed'; readonly kind: LiveKind; readonly reason: 'late' | 'failed'; readonly ms: number }
  | { readonly status: 'stopped' };

export type LiveState =
  | {
      readonly status: 'calling';
      readonly kind: LiveKind;
      readonly startedAt: number;
      readonly stages: readonly LiveStageView[];
    }
  | Exclude<LiveOutcome, { status: 'stopped' }>;

/** Why a kind cannot be pressed now: not built yet, off at the opening check, or another call running. */
export type LiveOffReason = 'not_wired' | 'off' | 'busy';

export interface LiveRunContext {
  readonly kind: LiveKind;
  /** Aborted when the press is late, stopped, or the demo session ends. */
  readonly signal: AbortSignal;
  readonly http: LiveHttp;
  /** Reports that a worker of this kind's crew has finished. */
  stage(id: LiveStageId, state: 'done'): void;
}

export interface LiveExecutor<P = unknown, R = unknown> {
  run(params: P, ctx: LiveRunContext): Promise<R>;
  /** The workers this press will run, when they depend on it (K150: a direct picture edit has no writer); default the kind's. */
  stagesFor?(params: P): readonly LiveStageId[];
  /** The demo session ends: forget whatever the executor kept for it (K144's unshown runs). */
  endSession?(): void;
}

/** Hears a press's outcome with the params it was pressed with (LiveService.onOutcome). */
export type LiveListener = (key: LiveKey, o: LiveOutcome, params: unknown) => void;

/** The executors that are built, by kind. A kind with none is off and says so. */
export const LIVE_EXECUTORS = new InjectionToken<Partial<Record<LiveKind, LiveExecutor>>>('LIVE_EXECUTORS');

/** What the opening check found working (the conductor's readiness, `live.text.on`, `live.picture.on`, `live.reader.on`). */
export abstract class LiveAvailability {
  abstract readonly text: Signal<boolean>;
  abstract readonly picture: Signal<boolean>;
  /** K158 D8: the weakness analyser's reader tier. */
  abstract readonly reader: Signal<boolean>;
}

@Injectable({ providedIn: 'root' })
export class LiveService {
  private readonly executors = inject(LIVE_EXECUTORS);
  private readonly availability = inject(LiveAvailability);
  private readonly http = inject(LiveHttp);

  private readonly states = signal<ReadonlyMap<LiveKey, LiveState>>(new Map());
  private readonly stateViews = new Map<LiveKey, Signal<LiveState | undefined>>();
  private readonly offViews = new Map<LiveKind, Signal<LiveOffReason | null>>();
  private readonly busyKey = signal<LiveKey | null>(null);
  /** K186: each subject's live result this demo session, by `<kind>:<subject>` (a key's last part), on every exhibit. */
  private readonly spent = signal<ReadonlyMap<string, Date>>(new Map());
  private readonly spentViews = new Map<LiveKey, Signal<Date | null>>();
  private readonly listeners = new Set<LiveListener>();
  private readonly pressCount = signal(0);
  private readonly manualOff = signal(false);
  private current: { key: LiveKey; ac: AbortController; params: unknown } | null = null;

  /** The key of the press now running, if any. */
  readonly busy = this.busyKey.asReadonly();
  /** LIVE presses in this demo session (the crews timeline's tally, D9 rule 7). */
  readonly presses = this.pressCount.asReadonly();
  /** True while the presenter has turned live calls off for a bad network (K19). */
  readonly presenterOff = this.manualOff.asReadonly();

  setPresenterOff(off: boolean): void {
    this.manualOff.set(off);
  }

  state(key: LiveKey): Signal<LiveState | undefined> {
    let view = this.stateViews.get(key);
    if (!view) {
      view = computed(() => this.states().get(key));
      this.stateViews.set(key, view);
    }
    return view;
  }

  /**
   * K186: when this key's subject got its live result this demo session, on any exhibit (the story's
   * fresh ideas for an idea spend the atlas's and Companions' button for it); null while it has none.
   */
  spentAt(key: LiveKey): Signal<Date | null> {
    let view = this.spentViews.get(key);
    if (!view) {
      const subject = subjectOf(key);
      view = computed(() => this.spent().get(subject) ?? null);
      this.spentViews.set(key, view);
    }
    return view;
  }

  /**
   * Gap (a), W79: every press's live result or miss, with the press's own params, delivered whether or
   * not the row that pressed is still on screen (a screen left mid-call destroys its row). The params
   * say which answer or change it was for. Returns the unsubscribe.
   */
  onOutcome(fn: LiveListener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  whyOff(kind: LiveKind): Signal<LiveOffReason | null> {
    let view = this.offViews.get(kind);
    if (!view) {
      view = computed(() => {
        if (!this.executors[kind]) return 'not_wired';
        if (this.manualOff() || !this.providersOn(kind)) return 'off';
        if (this.busyKey() !== null) return 'busy';
        return null;
      });
      this.offViews.set(kind, view);
    }
    return view;
  }

  canPress(kind: LiveKind): Signal<boolean> {
    const why = this.whyOff(kind);
    return computed(() => why() === null);
  }

  async press<R = unknown>(key: LiveKey, kind: LiveKind, params: unknown): Promise<LiveOutcome<R>> {
    if (!key.startsWith(`${kind}:`)) throw new Error(`[kiosk] LIVE key ${key} does not belong to kind ${kind}`);
    const executor = this.executors[kind];
    if (!executor) throw new Error(`[kiosk] LIVE ${kind} is not wired`);
    if (this.busyKey() !== null) throw new Error(`[kiosk] another LIVE call is running (${this.busyKey()})`);
    // K186: no "Do it again". A new request on the same row (K189: a new typed change) clears the key first.
    if (this.states().get(key)?.status === 'done' || this.spent().has(subjectOf(key))) {
      throw new Error(`[kiosk] LIVE ${key} already has its live result this demo session (K186)`);
    }
    if (this.manualOff()) throw new Error(`[kiosk] LIVE ${kind} is off: the presenter turned live calls off`);
    if (!this.providersOn(kind)) {
      throw new Error(`[kiosk] LIVE ${kind} is off: the opening check did not find ${this.offProviders(kind).join(' and ')} working`);
    }

    const spec = LIVE_KINDS[kind];
    const stages = executor.stagesFor?.(params) ?? spec.stages;
    const unknown = stages.filter((id) => !spec.stages.includes(id));
    if (unknown.length || stages.length === 0) throw new Error(`[kiosk] LIVE ${kind} has no stages ${unknown.join(', ') || '(none named)'}`);
    const ac = new AbortController();
    const startedAt = Date.now();
    this.current = { key, ac, params };
    this.busyKey.set(key);
    this.pressCount.update((n) => n + 1);
    this.put(key, {
      status: 'calling',
      kind,
      startedAt,
      stages: stages.map((id, i) => ({ id, state: i === 0 ? 'running' : 'pending' })),
    });
    const timer = setTimeout(() => ac.abort('late'), spec.limitMs);
    const ctx: LiveRunContext = {
      kind,
      signal: ac.signal,
      http: this.http,
      stage: (id) => this.markStage(key, kind, ac, id),
    };

    try {
      const result = (await Promise.race([executor.run(params, ctx), aborted(ac.signal)])) as R;
      if (!this.owns(ac)) return { status: 'stopped' };
      const done: LiveOutcome<R> = { status: 'done', kind, result, ms: Date.now() - startedAt, at: new Date() };
      this.put(key, done);
      this.spent.update((m) => new Map(m).set(subjectOf(key), done.at));
      this.tell(key, done, params);
      return done;
    } catch (err: unknown) {
      if (!this.owns(ac) || ac.signal.reason === 'stopped') return { status: 'stopped' };
      const ms = Date.now() - startedAt;
      const late = ac.signal.reason === 'late';
      if (late) console.warn(`[kiosk] LIVE ${key} did not answer within ${spec.limitMs} ms`);
      else console.error(`[kiosk] LIVE ${key} failed: ${err instanceof Error ? err.message : String(err)}`);
      const missed: LiveOutcome<R> = { status: 'missed', kind, reason: late ? 'late' : 'failed', ms };
      this.put(key, missed);
      this.tell(key, missed, params);
      return missed;
    } finally {
      clearTimeout(timer);
      if (this.owns(ac)) {
        this.current = null;
        this.busyKey.set(null);
      }
    }
  }

  /** "Stop waiting": the screen stops waiting (there is no cancel route for a running job). */
  stopWaiting(): void {
    const cur = this.current;
    if (!cur) return;
    this.current = null;
    this.busyKey.set(null);
    this.drop(cur.key);
    cur.ac.abort('stopped');
    // W79: the visitor stopped waiting on the screen that pressed, which may say so (Grading does).
    this.tell(cur.key, { status: 'stopped' }, cur.params);
  }

  /**
   * The screen moved on from a finished result (a prepared change replaced it, or a new typed change or
   * answer is a new request, K189): its row forgets it and its subject may be pressed again. A running call stays.
   */
  clear(key: LiveKey): void {
    if (this.states().get(key)?.status === 'calling') return;
    this.drop(key);
    const subject = subjectOf(key);
    if (this.spent().has(subject)) {
      this.spent.update((m) => {
        const next = new Map(m);
        next.delete(subject);
        return next;
      });
    }
  }

  /** The demo session ends: let any call go and forget every LIVE result. */
  endSession(): void {
    const cur = this.current;
    this.current = null;
    this.busyKey.set(null);
    this.states.set(new Map());
    this.spent.set(new Map());
    this.pressCount.set(0);
    for (const executor of Object.values(this.executors)) executor?.endSession?.();
    cur?.ac.abort('stopped');
  }

  private tell(key: LiveKey, o: LiveOutcome, params: unknown): void {
    for (const fn of this.listeners) fn(key, o, params);
  }

  private providersOn(kind: LiveKind): boolean {
    return this.offProviders(kind).length === 0;
  }

  private offProviders(kind: LiveKind): LiveProvider[] {
    return LIVE_KINDS[kind].providers.filter((p) => !this.availability[p]());
  }

  private owns(ac: AbortController): boolean {
    return this.current?.ac === ac;
  }

  private markStage(key: LiveKey, kind: LiveKind, ac: AbortController, id: LiveStageId): void {
    if (!LIVE_KINDS[kind].stages.includes(id)) throw new Error(`[kiosk] LIVE ${kind} has no stage ${id}`);
    const now = this.states().get(key);
    if (!this.owns(ac) || now?.status !== 'calling') return;
    // The press's own stages (stagesFor), in their order.
    const at = now.stages.findIndex((s) => s.id === id);
    if (at < 0) throw new Error(`[kiosk] LIVE ${key} runs no stage ${id}`);
    const stages = now.stages.map((s, i): LiveStageView => {
      if (i === at) return { id: s.id, state: 'done' };
      if (s.state === 'pending' && i === at + 1) return { id: s.id, state: 'running' };
      return s;
    });
    this.put(key, { ...now, stages });
  }

  private put(key: LiveKey, state: LiveState): void {
    this.states.update((m) => new Map(m).set(key, state));
  }

  private drop(key: LiveKey): void {
    this.states.update((m) => {
      const next = new Map(m);
      next.delete(key);
      return next;
    });
  }
}

/** A key's subject, `<kind>:<subject>`: its kind and its last part (`sugg:water:c1` is `sugg:c1`). */
function subjectOf(key: LiveKey): string {
  return `${key.slice(0, key.indexOf(':'))}:${key.slice(key.lastIndexOf(':') + 1)}`;
}
