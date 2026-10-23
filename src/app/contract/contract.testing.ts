/// <reference types="vite/client" />
import { HttpTestingController, TestRequest } from '@angular/common/http/testing';
import { Observable, firstValueFrom, isObservable } from 'rxjs';

/**
 * The contract harness (W68, T3.3). tools/contract/record.mjs records, read only, what the running
 * stack answers to each GET kiosk-web's API clients send (one file per read in ./recorded/, see
 * plan.json); a contract spec replays a recording through the real client as the answer to the one
 * GET it sends, so the client is tested against the stack's own answer, not a shape built from the
 * client's reading. Only recordings made through the kiosk edge count.
 */
export const RECORDING_FORMAT = 'chora-kiosk/contract-recording/v1';
export const KIOSK_EDGE = 'http://127.0.0.1:18080';

export interface ContractRecording {
  readonly contract: typeof RECORDING_FORMAT;
  readonly route: string;
  /** The world key or prepared choice the read was made for; null for a route read once. */
  readonly key: string | null;
  /** Every key whose read is this same URL. */
  readonly keys: readonly string[];
  readonly method: 'GET';
  /** The plan's path template. */
  readonly path: string;
  /** The path and query as sent. */
  readonly url: string;
  readonly recorded_at: string;
  readonly edge: string;
  readonly manifest_commit: string | null;
  readonly prepared_at: string | null;
  readonly status: number;
  readonly body: unknown;
}

const nameOf = (r: Pick<ContractRecording, 'route' | 'key'>): string => (r.key ? `${r.route} ${r.key}` : r.route);

/** A recording's own rules: a 2xx answer to a GET under /api/, made through the kiosk edge. */
export function checkRecording(r: ContractRecording): ContractRecording {
  const name = nameOf(r);
  if (r.contract !== RECORDING_FORMAT) throw new Error(`${name}: not a contract recording (${String(r.contract)})`);
  if (r.method !== 'GET') throw new Error(`${name}: only GET answers are recorded (${String(r.method)})`);
  if (!(r.status >= 200 && r.status <= 299)) throw new Error(`${name}: status ${r.status} is not a 2xx answer`);
  if (typeof r.url !== 'string' || !r.url.startsWith('/api/')) throw new Error(`${name}: the url is a path under /api/ (${String(r.url)})`);
  if (r.edge !== KIOSK_EDGE) {
    throw new Error(`${name}: recorded from ${r.edge}, not the kiosk edge ${KIOSK_EDGE} (a dry run against the fixture server is not the stack’s contract)`);
  }
  return r;
}

/** Every recording in a set of files, each checked and in the file its route and key name; none is an empty list. */
export function allRecordings(files: Readonly<Record<string, unknown>>): ContractRecording[] {
  return Object.entries(files).map(([file, value]) => {
    const r = checkRecording(value as ContractRecording);
    const expected = `${r.key ? `${r.route}.${r.key}` : r.route}.json`;
    if (file.split('/').pop() !== expected) throw new Error(`${file} holds ${nameOf(r)}: a recording sits in <route>.<key>.json`);
    return r;
  });
}

/** One route's recordings from a set of files, every file checked first; none is a loud failure. */
export function recordingsOf(files: Readonly<Record<string, unknown>>, route: string): ContractRecording[] {
  const mine = allRecordings(files)
    .filter((r) => r.route === route)
    .sort((a, b) => (a.key ?? '').localeCompare(b.key ?? ''));
  if (mine.length === 0) throw new Error(`no recording of ${route}: record the stack with tools/contract/record.mjs (on the orchestrator’s go, W68)`);
  return mine;
}

/** The committed recordings' files (tools/contract/record.mjs writes them, W68). */
export const RECORDED: Readonly<Record<string, unknown>> = import.meta.glob('./recorded/*.json', { eager: true, import: 'default' });

/** The committed recordings of one route. */
export function recorded(route: string): ContractRecording[] {
  return recordingsOf(RECORDED, route);
}

function sameUrl(a: string, b: string): boolean {
  const ua = new URL(a, 'http://kiosk.invalid');
  const ub = new URL(b, 'http://kiosk.invalid');
  const query = (u: URL) => [...u.searchParams.entries()].map(([k, v]) => `${k}=${v}`).sort().join('&');
  return ua.pathname === ub.pathname && query(ua) === query(ub);
}

const TURNS = 50;

/**
 * A write the client sends before its recorded GET (a LIVE press's POST, the reset's start): the
 * recorder never records a write, so the spec plants its answer and names it as planted.
 */
export interface PlantedWrite {
  readonly method: 'POST' | 'PATCH';
  readonly url: string;
  readonly body: unknown;
}

export interface ReplayOptions {
  /** The writes the client sends first, in order, each answered with its planted body. */
  readonly before?: readonly PlantedWrite[];
  /** Runs each turn the client has sent nothing (default: one microtask); a polling client's timers move here. */
  readonly idle?: () => Promise<unknown>;
}

type Outcome<T> = { ok: true; value: T } | { ok: false; error: unknown } | null;

/**
 * Replays one recording through a client call: the client must send exactly the planted writes, then
 * exactly the recorded GET, which is answered with the recorded status and body; the call's own result
 * (or its refusal) comes back. A client that asks again after its answer, or never finishes, fails.
 */
export async function replay<T>(http: HttpTestingController, rec: ContractRecording, call: () => Promise<T> | Observable<T>, options: ReplayOptions = {}): Promise<T> {
  checkRecording(rec);
  const name = nameOf(rec);
  const idle = options.idle ?? (() => Promise.resolve());
  const made = call();
  const pending = isObservable(made) ? firstValueFrom(made) : made;
  let outcome: Outcome<T> = null;
  const settled = pending.then(
    (value) => (outcome = { ok: true, value }),
    (error: unknown) => (outcome = { ok: false, error }),
  );
  const current = () => outcome as Outcome<T>;
  const next = async (): Promise<TestRequest[]> => {
    let sent: TestRequest[] = [];
    for (let i = 0; i < TURNS && sent.length === 0 && current() === null; i += 1) {
      sent = http.match(() => true);
      if (sent.length === 0) await idle();
    }
    return sent;
  };
  const expected = [...(options.before ?? []).map((w) => ({ ...w, planted: true })), { method: rec.method, url: rec.url, body: rec.body, planted: false }];
  for (const want of expected) {
    const sent = await next();
    const label = `${want.method} ${want.url}${want.planted ? ' (a planted write)' : ''}`;
    if (sent.length === 0) {
      const early = current();
      if (early && !early.ok) throw early.error;
      throw new Error(`${name}: the client sent no request${want.planted ? `; it was to send ${label} first` : ''}`);
    }
    if (sent.length > 1) throw new Error(`${name}: the client sent ${sent.length} requests at once: ${sent.map((s) => `${s.request.method} ${s.request.urlWithParams}`).join(', ')}`);
    const [req] = sent;
    if (req.request.method !== want.method || !sameUrl(req.request.urlWithParams, want.url)) {
      throw new Error(`${name}: the client sent ${req.request.method} ${req.request.urlWithParams}, not ${label}`);
    }
    if (want.planted) req.flush(want.body as Parameters<TestRequest['flush']>[0]);
    else req.flush(rec.body as Parameters<TestRequest['flush']>[0], { status: rec.status, statusText: 'OK' });
  }
  const after = await next();
  if (after.length > 0) {
    throw new Error(`${name}: the client sent ${after.map((s) => `${s.request.method} ${s.request.urlWithParams}`).join(', ')} after its answer, and only the recorded GET is answered`);
  }
  const done = current();
  if (!done) throw new Error(`${name}: the client did not finish after its answer`);
  await settled;
  if (!done.ok) throw done.error;
  return done.value;
}
