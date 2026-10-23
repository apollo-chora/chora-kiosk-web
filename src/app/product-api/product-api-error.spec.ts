import { HttpErrorResponse } from '@angular/common/http';

import { ProductApiError } from './product-api-error';

describe('ProductApiError', () => {
  it('reads the service’s {code, message}', () => {
    const e = ProductApiError.from('GET', '/api/x', new HttpErrorResponse({ status: 404, error: { code: 'NOT_FOUND', message: 'no such job' } }));
    expect(e).toMatchObject({ status: 404, code: 'NOT_FOUND', message: 'GET /api/x: 404 NOT_FOUND: no such job' });
  });

  it('a body with no code reads UNKNOWN, never a guess', () => {
    const e = ProductApiError.from('GET', '/api/x', new HttpErrorResponse({ status: 502, error: '<html>bad gateway</html>' }));
    expect(e).toMatchObject({ status: 502, code: 'UNKNOWN', message: 'GET /api/x: 502 UNKNOWN' });
  });

  it('a failure that is not an HTTP answer keeps its own message', () => {
    const e = ProductApiError.from('POST', '/api/x', new Error('aborted: late'));
    expect(e).toMatchObject({ status: 0, code: 'UNKNOWN', message: 'POST /api/x: aborted: late' });
    expect(ProductApiError.from('POST', '/api/x', 'odd').message).toBe('POST /api/x: odd');
  });
});
