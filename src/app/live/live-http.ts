import {
  HttpClient,
  HttpContext,
  HttpContextToken,
  HttpErrorResponse,
  HttpInterceptorFn,
  HttpRequest,
} from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, Subscription, throwError } from 'rxjs';

/**
 * Only the LIVE service calls a model (ADR-259 D9 rule 4, D11). This file holds the
 * enforcement: modelCallGuard refuses any model-calling route unless the request carries
 * LIVE_CALL, and the token is set only by LiveHttp, the client the LIVE executors use.
 * The token is not exported, so no other code can set it.
 */
const LIVE_CALL = new HttpContextToken<boolean>(() => false);
/** A prepared greeting replays the golden run's turn on the greeting route with no model call (K49). */
const REPLAY = new HttpContextToken<boolean>(() => false);

interface Route {
  readonly method: string;
  readonly path: RegExp;
}

const GREETING: Route = { method: 'POST', path: /^\/api\/companion\/greeting$/ };

/** Routes that start a model call. Reads (polling a job, reading a set) are not here. */
const MODEL_CALL_ROUTES: readonly Route[] = [
  // words (K35): a new ai_draft job
  { method: 'POST', path: /^\/api\/atoms\/[^/]+\/question-jobs$/ },
  // picture (K113)
  { method: 'POST', path: /^\/api\/atoms\/[^/]+\/question-jobs\/[^/]+\/regenerate-image$/ },
  // q (K103): a fresh campaign set beside the prepared one
  { method: 'POST', path: /^\/api\/v1\/me\/goals\/[^/]+\/campaign\/questions\/fresh$/ },
  // sugg (K51)
  { method: 'POST', path: /^\/api\/v1\/me\/concept-graph\/suggestions\/generate$/ },
  // greet (K49): a fresh turn calls the Companion's model; a known turn replays
  GREETING,
  // grade (K57): the learner's own grading request starts the grading crew
  { method: 'POST', path: /^\/api\/v1\/me\/assessments\/[^/]+\/submissions\/[^/]+\/request-grading$/ },
  // weak (K158): an upload starts the weakness analyser (its extractor and diagnoser)
  { method: 'POST', path: /^\/api\/v1\/me\/growth-edges\/uploads$/ },
];

/** Routes that call a model which the kiosk never calls, through any client. */
const NEVER_CALLED: readonly (Route & { why: string })[] = [
  { method: 'GET', path: /^\/api\/companion\/daily-dose\/ai$/, why: 'K49: the greeting uses the kiosk greeting call' },
  { method: 'POST', path: /^\/api\/atoms\/ai-assist$/, why: 'the author drawer path; the kiosk drafts through question-jobs' },
  { method: 'POST', path: /^\/api\/atoms\/[^/]+\/questions\/[^/]+\/ai-model-answer-jobs$/, why: 'no model answers in the kiosk' },
  // T3.4 census of the edge's kiosk allowlist: reachable under /api/v1/me/companions/, each starts the explorer.
  { method: 'POST', path: /^\/api\/v1\/me\/companions\/[^/]+\/skills\/[^/]+\/invoke$/, why: 'a Companion suggests only through suggestions/generate (K51)' },
  { method: 'POST', path: /^\/api\/v1\/me\/companions\/[^/]+\/ceremony\/edge-scout$/, why: 'no ceremony scout in the kiosk' },
];

/**
 * Routes the kiosk calls only with some bodies: `refused` names why a body is never sent, or null.
 * A review is only ever confirmed, with no outputs: a reiterate runs the diagnoser again and an
 * output runs another agent (K158 D4, D7). Refused through any client, as NEVER_CALLED is.
 */
const BODY_RULES: readonly (Route & { refused(body: unknown): string | null })[] = [
  {
    method: 'POST',
    path: /^\/api\/v1\/me\/growth-edges\/uploads\/[^/]+\/resume$/,
    refused: (body) => {
      const b = (body && typeof body === 'object' ? body : {}) as { action?: unknown; selected_outputs?: unknown };
      if (b.action !== 'confirm') return `K158 D7: a review is only confirmed, never ${String(b.action ?? 'sent without an action')} (a reiterate is another model call)`;
      if (!Array.isArray(b.selected_outputs) || b.selected_outputs.length > 0) return 'K158 D4: a review names its outputs, and asks for none';
      return null;
    },
  },
  {
    method: 'POST',
    path: /^\/api\/v1\/me\/growth-edges\/uploads$/,
    refused: (body) =>
      body instanceof FormData && (body.has('requested_outputs') || body.has('selected_outputs')) ? 'K158 D4: an upload asks for no outputs' : null,
  },
];

/** The path of a relative, absolute or protocol-relative URL, without query or fragment. */
function pathOf(url: string): string {
  return url.replace(/^(?:[a-z][a-z0-9+.-]*:)?\/\/[^/?#]*/i, '').split(/[?#]/)[0];
}

function matches<R extends Route>(routes: readonly R[], req: HttpRequest<unknown>, path: string): R | undefined {
  return routes.find((r) => r.method === req.method && r.path.test(path));
}

export const modelCallGuard: HttpInterceptorFn = (req, next) => {
  const path = pathOf(req.url);
  const never = matches(NEVER_CALLED, req, path)?.why ?? matches(BODY_RULES, req, path)?.refused(req.body);
  if (never) {
    const msg = `[kiosk] ${req.method} ${req.url} is never called by the kiosk (${never})`;
    console.error(msg);
    return throwError(() => new Error(msg));
  }
  const replayOfGreeting = req.context.get(REPLAY) && matches([GREETING], req, path);
  if (matches(MODEL_CALL_ROUTES, req, path) && !req.context.get(LIVE_CALL) && !replayOfGreeting) {
    const msg = `[kiosk] a model call outside the LIVE service: ${req.method} ${req.url}`;
    console.error(msg);
    return throwError(() => new Error(msg));
  }
  return next(req);
};

/**
 * The HTTP client the LIVE executors use: it marks every request as a LIVE call, turns it
 * into a promise, and cancels it on the wire when the signal aborts (a late or stopped press).
 */
@Injectable({ providedIn: 'root' })
export class LiveHttp {
  private readonly http = inject(HttpClient);

  get<T>(url: string, signal: AbortSignal): Promise<T> {
    return this.send('GET', url, undefined, signal);
  }

  post<T>(url: string, body: unknown, signal: AbortSignal): Promise<T> {
    return this.send('POST', url, body, signal);
  }

  patch<T>(url: string, body: unknown, signal: AbortSignal): Promise<T> {
    return this.send('PATCH', url, body, signal);
  }

  /** A same-origin file's bytes (a prepared paper the LIVE upload sends, K158). */
  blob(url: string, signal: AbortSignal): Promise<Blob> {
    return this.send('GET', url, undefined, signal, undefined, 'blob');
  }

  /**
   * A prepared greeting: the golden run's turn id, replayed with no model call (K49). Allowed
   * on the greeting route only; the caller must check the answer says `replayed`.
   */
  replay<T>(url: string, body: unknown, signal: AbortSignal): Promise<T> {
    return this.send('POST', url, body, signal, new HttpContext().set(REPLAY, true));
  }

  private send<T>(
    method: string,
    url: string,
    body: unknown,
    signal: AbortSignal,
    context = new HttpContext().set(LIVE_CALL, true),
    responseType: 'json' | 'blob' = 'json',
  ): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      if (signal.aborted) {
        reject(new Error(`aborted: ${String(signal.reason)}`));
        return;
      }
      const request$ = this.http.request(method, url, { body, context, responseType }) as Observable<T>;
      // Declared before subscribing: a refusal by the guard arrives synchronously.
      let sub: Subscription | undefined;
      const onAbort = () => {
        sub?.unsubscribe();
        reject(new Error(`aborted: ${String(signal.reason)}`));
      };
      signal.addEventListener('abort', onAbort, { once: true });
      sub = request$.subscribe({
        next: (value) => resolve(value),
        error: (err: unknown) => {
          signal.removeEventListener('abort', onAbort);
          if (err instanceof HttpErrorResponse) reject(new Error(`${method} ${url}: ${err.status} ${err.statusText}${refusal(err.error)}`));
          else reject(err instanceof Error ? err : new Error(String(err)));
        },
        complete: () => signal.removeEventListener('abort', onAbort),
      });
    });
  }
}

/** A refusal's own code and message (creation's top-level {code, message}, or the edge's {error: {code, message}}), so a log names it. */
function refusal(body: unknown): string {
  if (!body || typeof body !== 'object') return '';
  const b = body as { code?: unknown; message?: unknown; error?: unknown };
  const e = (typeof b.code === 'string' ? b : b.error && typeof b.error === 'object' ? b.error : null) as { code?: unknown; message?: unknown } | null;
  if (!e || typeof e.code !== 'string') return '';
  return ` ${e.code}${typeof e.message === 'string' && e.message ? `: ${e.message}` : ''}`;
}
