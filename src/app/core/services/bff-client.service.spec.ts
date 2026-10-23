import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { BffClientService } from './bff-client.service';

describe('BffClientService', () => {
  let service: BffClientService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(BffClientService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('should make GET requests', () => {
    service.get<{ id: string }>('/api/v1/test').subscribe((data) => {
      expect(data.id).toBe('123');
    });

    const req = httpMock.expectOne((r) => r.url.includes('/api/v1/test') && r.method === 'GET');
    req.flush({ id: '123' });
  });

  it('should make POST requests', () => {
    service.post<{ created: boolean }>('/api/v1/test', { name: 'test' }).subscribe((data) => {
      expect(data.created).toBe(true);
    });

    const req = httpMock.expectOne((r) => r.url.includes('/api/v1/test') && r.method === 'POST');
    expect(req.request.body).toEqual({ name: 'test' });
    req.flush({ created: true });
  });

  it('should make DELETE requests', () => {
    service.delete<void>('/api/v1/test/123').subscribe();

    const req = httpMock.expectOne((r) => r.url.includes('/api/v1/test/123') && r.method === 'DELETE');
    req.flush(null);
  });

  it('should make GET blob requests with responseType blob (authenticated download)', () => {
    const blob = new Blob(['a,b,c'], { type: 'text/csv' });
    service.getBlob('/api/v1/export?format=csv').subscribe((data) => {
      expect(data).toBeInstanceOf(Blob);
    });

    const req = httpMock.expectOne(
      (r) => r.url.includes('/api/v1/export') && r.method === 'GET',
    );
    expect(req.request.responseType).toBe('blob');
    req.flush(blob);
  });

  it('getBlobResponse exposes the full response so callers can branch on status (200 vs 202)', () => {
    const jobJson = new Blob(['{"job_id":"j1","status":"building"}'], {
      type: 'application/json',
    });
    let status = 0;
    service
      .getBlobResponse('/api/v1/me/transactions/export?format=csv')
      .subscribe((resp) => {
        status = resp.status;
        expect(resp.body).toBeInstanceOf(Blob);
      });

    const req = httpMock.expectOne(
      (r) => r.url.includes('/transactions/export') && r.method === 'GET',
    );
    expect(req.request.responseType).toBe('blob');
    req.flush(jobJson, { status: 202, statusText: 'Accepted' });
    expect(status).toBe(202);
  });
});
