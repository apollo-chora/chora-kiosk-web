import { HttpErrorResponse } from '@angular/common/http';

/**
 * A failed product API call, typed: the HTTP status and the service's code (consumption,
 * creation and delivery answer errors as a flat `{code, message}`). The message names the call,
 * for the console; screens choose their own words by the code.
 */
export class ProductApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'ProductApiError';
  }

  static from(method: string, url: string, err: unknown): ProductApiError {
    if (!(err instanceof HttpErrorResponse)) {
      return new ProductApiError(0, 'UNKNOWN', `${method} ${url}: ${err instanceof Error ? err.message : String(err)}`);
    }
    const body = err.error && typeof err.error === 'object' ? (err.error as { code?: unknown; message?: unknown }) : null;
    const code = typeof body?.code === 'string' && body.code.trim() ? body.code.trim() : 'UNKNOWN';
    const said = typeof body?.message === 'string' && body.message.trim() ? `: ${body.message.trim()}` : '';
    return new ProductApiError(err.status, code, `${method} ${url}: ${err.status} ${code}${said}`);
  }
}
