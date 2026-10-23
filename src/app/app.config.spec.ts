import { HttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { TranslateService } from '@ngx-translate/core';
import { firstValueFrom } from 'rxjs';

import { appConfig } from './app.config';
import { KioskLanguage } from './i18n/i18n';
import { ReadinessService } from './kiosk-api/readiness.service';
import { LiveAvailability, LiveService } from './live/live.service';

describe('appConfig', () => {
  beforeEach(() => TestBed.configureTestingModule({ providers: appConfig.providers }));

  it('provides the kiosk string tables, English first', async () => {
    await TestBed.inject(KioskLanguage).ready();
    expect(TestBed.inject(TranslateService).instant('nav.back')).toBe('Back');
  });

  it('installs the model-call guard on the app’s HTTP client', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await expect(firstValueFrom(TestBed.inject(HttpClient).post('/api/atoms/a/question-jobs', {}))).rejects.toThrow(
      /outside the LIVE service/,
    );
    vi.restoreAllMocks();
  });

  it('adds the kiosk session to API calls, and refuses a stray model call before minting one', async () => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [...appConfig.providers, provideHttpClientTesting()] });
    const http = TestBed.inject(HttpClient);
    const backend = TestBed.inject(HttpTestingController);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await expect(firstValueFrom(http.post('/api/atoms/a/question-jobs', {}))).rejects.toThrow(/outside the LIVE service/);
    backend.expectNone('/api/v1/kiosk/session');
    const p = firstValueFrom(http.get('/api/v1/me/goals'));
    await new Promise((r) => setTimeout(r, 0));
    backend.expectOne('/api/v1/kiosk/session').flush({
      access_token: 't1',
      token_type: 'Bearer',
      expires_in: 3600,
      gcid: 'g',
      tenant_id: 't',
      roles: ['learner'],
    });
    await new Promise((r) => setTimeout(r, 0));
    expect(backend.expectOne('/api/v1/me/goals').request.headers.get('Authorization')).toBe('Bearer t1');
    vi.restoreAllMocks();
    void p;
  });

  it('reads LIVE availability from the conductor’s readiness, and wires all six kinds (picture on V2)', () => {
    expect(TestBed.inject(LiveAvailability)).toBe(TestBed.inject(ReadinessService));
    const live = TestBed.inject(LiveService);
    // Off until the opening check passes, never "not wired".
    for (const kind of ['q', 'words', 'sugg', 'greet', 'grade', 'picture'] as const) expect(live.whyOff(kind)(), kind).toBe('off');
  });
});
