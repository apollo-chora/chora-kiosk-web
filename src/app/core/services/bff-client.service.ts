import { Injectable, inject } from '@angular/core';
import {
  HttpClient,
  HttpHeaders,
  HttpParams,
  HttpResponse,
} from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

/**
 * BFF HTTP adapter: sole HTTP surface for chora-web (CLAUDE.md §3).
 *
 * All methods accept an optional `options` bag with `headers` so callers
 * can attach contract-mandated request headers (e.g. `Idempotency-Key`
 * per `learner-economy.yaml`) without bypassing the BFF base-URL wrap.
 */
@Injectable({ providedIn: 'root' })
export class BffClientService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = environment.bffBaseUrl;

  get<T>(
    path: string,
    params?: HttpParams,
    options?: { headers?: HttpHeaders },
  ): Observable<T> {
    return this.http.get<T>(`${this.baseUrl}${path}`, {
      params,
      headers: options?.headers,
    });
  }

  /**
   * Authenticated binary GET: for file downloads (CSV / NDJSON export, PDF
   * receipts, …). Routes through `HttpClient` so `authInterceptor` attaches
   * the in-memory Bearer token; a raw `<a href>`/`window.open` navigation
   * would bypass the interceptor and the gateway rejects it with 401
   * `missing_bearer`. Callers turn the Blob into a download via
   * `URL.createObjectURL`.
   */
  getBlob(
    path: string,
    params?: HttpParams,
    options?: { headers?: HttpHeaders },
  ): Observable<Blob> {
    return this.http.get(`${this.baseUrl}${path}`, {
      params,
      headers: options?.headers,
      responseType: 'blob',
    });
  }

  /**
   * Authenticated binary GET that exposes the full `HttpResponse` so the
   * caller can branch on the status code: needed where one endpoint returns
   * EITHER a streamed file (200) OR a JSON job handle (202), e.g. the
   * async-at-scale transaction export (ADR-205 D5). The 202 body is JSON
   * carried as a Blob; read it with `body.text()` then `JSON.parse`.
   */
  getBlobResponse(
    path: string,
    params?: HttpParams,
    options?: { headers?: HttpHeaders },
  ): Observable<HttpResponse<Blob>> {
    return this.http.get(`${this.baseUrl}${path}`, {
      params,
      headers: options?.headers,
      responseType: 'blob',
      observe: 'response',
    });
  }

  post<T>(
    path: string,
    body: unknown,
    options?: { headers?: HttpHeaders },
  ): Observable<T> {
    return this.http.post<T>(`${this.baseUrl}${path}`, body, {
      headers: options?.headers,
    });
  }

  put<T>(
    path: string,
    body: unknown,
    options?: { headers?: HttpHeaders },
  ): Observable<T> {
    return this.http.put<T>(`${this.baseUrl}${path}`, body, {
      headers: options?.headers,
    });
  }

  patch<T>(
    path: string,
    body: unknown,
    options?: { headers?: HttpHeaders },
  ): Observable<T> {
    return this.http.patch<T>(`${this.baseUrl}${path}`, body, {
      headers: options?.headers,
    });
  }

  delete<T>(
    path: string,
    options?: { headers?: HttpHeaders },
  ): Observable<T> {
    return this.http.delete<T>(`${this.baseUrl}${path}`, {
      headers: options?.headers,
    });
  }
}
