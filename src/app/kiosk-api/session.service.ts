import { HttpBackend, HttpClient, HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { catchError, firstValueFrom, from, switchMap, throwError } from 'rxjs';

/**
 * The kiosk session (ADR-259 D2; conductor API.md section 2): a standard Chora session
 * JWT for the one prepared identity, minted with no sign-in. kiosk-web keeps it in memory
 * only, mints it when it first needs one, renews it a minute before it expires, and drops
 * it at the reset so each visitor starts on a fresh session.
 */
interface MintResponse {
  readonly access_token: string;
  readonly token_type: string;
  readonly expires_in: number;
  readonly gcid: string;
  readonly tenant_id: string;
  readonly roles: readonly string[];
}

const MINT_URL = '/api/v1/kiosk/session';
export const SESSION_REFRESH_MARGIN_MS = 60_000;

@Injectable({ providedIn: 'root' })
export class SessionService {
  // The mint bypasses the interceptors: it is the call that makes the token they add.
  private readonly http = new HttpClient(inject(HttpBackend));
  private token: string | null = null;
  private expiresAt = 0;
  private gcid: string | null = null;
  private inflight: Promise<string> | null = null;

  /** A token that is good for at least another minute, minted if needed. */
  ensure(): Promise<string> {
    if (this.token && this.expiresAt - SESSION_REFRESH_MARGIN_MS > Date.now()) return Promise.resolve(this.token);
    if (!this.inflight) {
      this.inflight = this.mint().finally(() => {
        this.inflight = null;
      });
    }
    return this.inflight;
  }

  /** The learner the session acts as (the mint's gcid): the assessment create invites it (K55). */
  async learnerGcid(): Promise<string> {
    await this.ensure();
    return this.gcid as string;
  }

  /** Forget the session (the reset, or a 401). */
  drop(): void {
    this.token = null;
    this.expiresAt = 0;
    this.gcid = null;
  }

  private async mint(): Promise<string> {
    let r: MintResponse;
    try {
      r = await firstValueFrom(this.http.post<MintResponse>(MINT_URL, {}));
    } catch (err: unknown) {
      const detail = err instanceof HttpErrorResponse ? `${err.status} ${err.statusText}` : String(err);
      throw new Error(`[kiosk] the kiosk session could not be minted: ${detail}`);
    }
    if (r.token_type !== 'Bearer' || typeof r.access_token !== 'string' || !r.access_token) {
      throw new Error(`[kiosk] the kiosk session answer is not a bearer token (${String(r.token_type)})`);
    }
    if (!(r.expires_in > 0)) throw new Error(`[kiosk] the kiosk session has no lifetime (${String(r.expires_in)})`);
    if (typeof r.gcid !== 'string' || !r.gcid.trim()) throw new Error('[kiosk] the kiosk session names no learner (no gcid)');
    this.gcid = r.gcid;
    this.token = r.access_token;
    this.expiresAt = Date.now() + r.expires_in * 1000;
    return this.token;
  }
}

const API_PATH = /^(?:[a-z][a-z0-9+.-]*:)?(?:\/\/[^/?#]*)?\/(?:api|bff)\//i;

/** Adds the kiosk session to every call to the product API and the BFF. */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  if (!API_PATH.test(req.url)) return next(req);
  const session = inject(SessionService);
  return from(session.ensure()).pipe(
    switchMap((token) => next(req.clone({ setHeaders: { Authorization: `Bearer ${token}` } }))),
    catchError((err: unknown) => {
      if (err instanceof HttpErrorResponse && err.status === 401) session.drop();
      return throwError(() => err);
    }),
  );
};
