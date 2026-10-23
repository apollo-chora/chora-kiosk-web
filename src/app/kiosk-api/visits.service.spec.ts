import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { VISIT_EVENTS, VisitsService } from './visits.service';

const URL_ = '/api/v1/kiosk/visits';

function setup() {
  TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
  return { visits: TestBed.inject(VisitsService), backend: TestBed.inject(HttpTestingController) };
}

describe('VisitsService: anonymous demo-session counts (K19)', () => {
  it('names the eight events the conductor counts', () => {
    expect([...VISIT_EVENTS]).toEqual(['started', 'hook_done', 'hall', 'maps', 'comp', 'dash', 'grade', 'engine']);
  });

  it('records an event as {event} only: no identifier, no text', async () => {
    const { visits, backend } = setup();
    const p = visits.record('hall');
    const req = backend.expectOne(URL_);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ event: 'hall' });
    req.flush(null, { status: 204, statusText: 'No Content' });
    await expect(p).resolves.toBe(true);
  });

  it('a failed count never breaks the visit, and is reported loudly', async () => {
    const { visits, backend } = setup();
    const errors: string[] = [];
    vi.spyOn(console, 'error').mockImplementation((...a: unknown[]) => void errors.push(a.join(' ')));
    const p = visits.record('maps');
    backend.expectOne(URL_).flush({}, { status: 500, statusText: 'Internal' });
    await expect(p).resolves.toBe(false);
    expect(errors.join('\n')).toMatch(/\[kiosk\] the visit count maps was not recorded: 500/);
    vi.restoreAllMocks();
  });

  it("reads today's counts for the presenter", async () => {
    const { visits, backend } = setup();
    const p = visits.loadToday();
    const body = { day: '2026-10-20', counts: { started: 41, hook_done: 33, hall: 19, maps: 9, comp: 11, dash: 5, grade: 6, engine: 7 } };
    backend.expectOne((r) => r.method === 'GET' && r.url === URL_).flush(body);
    await p;
    expect(visits.today()).toEqual(body);
  });

  it('an unreadable count leaves the presenter tab saying so, not showing zeros', async () => {
    const { visits, backend } = setup();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const p = visits.loadToday();
    backend.expectOne(URL_).flush({}, { status: 503, statusText: 'Unavailable' });
    await p;
    expect(visits.today()).toBeNull();
    expect(visits.unreadable()).toBe(true);
    vi.restoreAllMocks();
  });
});
