import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { KioskLanguage, provideKioskI18n } from '../i18n/i18n';
import { LiveRowComponent } from './live-row.component';
import { LIVE_EXECUTORS, LiveAvailability, LiveExecutor, LiveOutcome, LiveRunContext, LiveService } from './live.service';

// The LIVE row (mockup liveRowHTML, liveBtnHTML, liveCallingHTML, liveSourceHTML, 5656 to 5694): the
// prepared result's stamp (K101), the LIVE button, the call while it runs (K52: the elapsed counter,
// never an estimate), and where the result came from once it ends (K45, K48).
describe('LiveRowComponent', () => {
  let fixture: ComponentFixture<LiveRowComponent>;
  let el: HTMLElement;
  let release: { resolve: (v: unknown) => void; reject: (e: unknown) => void };
  let outcomes: LiveOutcome[];
  const text = signal(true);

  async function mount(over: { kind?: 'sugg' | 'q' | 'weak'; additive?: boolean; preparedAt?: Date | null; noFallback?: boolean; offer?: boolean } = {}): Promise<void> {
    text.set(true);
    const executor: LiveExecutor = {
      run: (_p: unknown, ctx: LiveRunContext) =>
        new Promise((resolve, reject) => {
          release = { resolve, reject };
          ctx.signal.addEventListener('abort', () => reject(new Error('aborted')));
        }),
    };
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        ...provideKioskI18n(),
        { provide: LIVE_EXECUTORS, useValue: { sugg: executor, q: executor, weak: executor } },
        { provide: LiveAvailability, useValue: { text: text.asReadonly(), picture: signal(true).asReadonly(), reader: signal(true).asReadonly() } },
      ],
    });
    await TestBed.inject(KioskLanguage).ready();
    fixture = TestBed.createComponent(LiveRowComponent);
    fixture.componentRef.setInput('liveKey', `${over.kind ?? 'sugg'}:hook:c1`);
    fixture.componentRef.setInput('kind', over.kind ?? 'sugg');
    fixture.componentRef.setInput('label', 'Ask Pingu for fresh ideas');
    fixture.componentRef.setInput('params', { focalConceptId: 'c1' });
    fixture.componentRef.setInput('preparedAt', over.preparedAt === undefined ? new Date('2026-10-20T05:41:40Z') : over.preparedAt);
    fixture.componentRef.setInput('additive', over.additive ?? false);
    if (over.noFallback) fixture.componentRef.setInput('noFallback', true);
    if (over.offer !== undefined) fixture.componentRef.setInput('offer', over.offer);
    outcomes = [];
    // W79: the row emits nothing; each outcome is told by the one LIVE door, with or without a row on screen.
    TestBed.inject(LiveService).onOutcome((_key, o) => outcomes.push(o));
    el = fixture.nativeElement as HTMLElement;
    fixture.detectChanges();
  }

  const txt = (sel: string) => el.querySelector(sel)?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
  const settle = async () => {
    for (let i = 0; i < 4; i++) {
      await Promise.resolve();
      fixture.detectChanges();
    }
  };

  it('before a press: the prepared result’s own stamp and the LIVE button, with its wait in words, never seconds', async () => {
    await mount();
    expect(txt('.stamp')).toBe('Prepared 20 Oct, 13:41');
    // W30: every prepared stamp says what prepared means.
    expect(el.querySelector('.stamp kiosk-prepared-info button[data-act="preparedInfo"]')).not.toBeNull();
    const btn = el.querySelector('button.live-btn') as HTMLButtonElement;
    expect(btn.disabled).toBe(false);
    expect(txt('.live-btn .live-tag')).toBe('LIVE');
    expect(txt('.live-btn .live-label')).toBe('Ask Pingu for fresh ideas');
    expect(txt('.live-btn .live-eta')).toBe('a short wait');
  });

  it('while calling: the provider, the elapsed counter, the crew’s workers and Stop waiting; then live, just now', async () => {
    await mount();
    (el.querySelector('button.live-btn') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(el.querySelector('button.live-btn')).toBeNull();
    expect(txt('.live-status')).toContain('Calling Ollama');
    expect(txt('.live-status .live-secs')).toMatch(/^\d+\.\d s$/);
    expect(txt('.live-status .mini-trace')).toContain('Explorer AI');
    expect(txt('.live-status')).not.toContain('stand-in');
    expect(el.querySelector('.live-status [data-act="liveCancel"]')).not.toBeNull();
    release.resolve({ status: 'ready', requestId: 'r', suggestions: [] });
    await settle();
    expect(txt('.stamp')).toBe('Live, just now');
    expect(el.querySelector('.stand-in')).toBeNull();
    // K186: no "Do it again": once the call has its live result the row offers no repeat.
    expect(el.querySelector('button.live-btn')).toBeNull();
    expect(el.textContent).not.toContain('Do it again');
    expect(outcomes.map((o) => o.status)).toEqual(['done']);
  });

  it('K158: the weakness analyser calls Google Vertex AI, its reader tier, with one Companion AI stage', async () => {
    await mount({ kind: 'weak' });
    (el.querySelector('button.live-btn') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(txt('.live-status')).toContain('Calling Google Vertex AI');
    expect(txt('.live-status .mini-trace')).toContain('Companion AI');
  });

  it('K189 (2): an additive kind says both where its list came from, the prepared stamp and live just now, and offers no repeat', async () => {
    await mount({ additive: true });
    (el.querySelector('button.live-btn') as HTMLButtonElement).click();
    release.resolve({ status: 'ready', requestId: 'r', suggestions: [] });
    await settle();
    expect([...el.querySelectorAll('.stamp')].map((s) => s.textContent?.replace(/\s+/g, ' ').trim())).toEqual(['Prepared 20 Oct, 13:41', 'Live, just now']);
    expect(el.querySelector('button.live-btn')).toBeNull();
  });

  it('an additive kind whose press was earlier this demo session says its own time (W41), not just now', async () => {
    await mount({ additive: true });
    fixture.componentRef.setInput('liveAt', new Date('2026-10-21T12:15:00Z'));
    (el.querySelector('button.live-btn') as HTMLButtonElement).click();
    release.resolve({ status: 'ready', requestId: 'r', suggestions: [] });
    await settle();
    expect([...el.querySelectorAll('.stamp')].map((s) => s.textContent?.replace(/\s+/g, ' ').trim())).toEqual(['Prepared 20 Oct, 13:41', 'Live, 21 Oct, 20:15']);
  });

  it('K186: a subject spent on another exhibit offers no press here; an additive row says when, a result row keeps its prepared stamp', async () => {
    await mount({ additive: true });
    const live = TestBed.inject(LiveService);
    const p = live.press('sugg:story:c1', 'sugg', {});
    release.resolve({ status: 'ready', requestId: 'r', suggestions: [] });
    await p;
    await settle();
    expect(el.querySelector('button.live-btn')).toBeNull();
    expect([...el.querySelectorAll('.stamp')].map((s) => s.textContent?.replace(/\s+/g, ' ').trim())[0]).toBe('Prepared 20 Oct, 13:41');
    expect(el.querySelector('.stamp.live-done')).not.toBeNull();
    fixture.componentRef.setInput('additive', false);
    fixture.detectChanges();
    expect([...el.querySelectorAll('.stamp')].map((s) => s.textContent?.replace(/\s+/g, ' ').trim())).toEqual(['Prepared 20 Oct, 13:41']);
    expect(el.querySelector('button.live-btn')).toBeNull();
  });

  it('gap (b): an additive kind’s miss stamps the fallback batch at its own time, after the list’s prepared stamp', async () => {
    await mount({ additive: true });
    fixture.componentRef.setInput('fallbackAt', new Date('2026-10-20T05:52:00Z'));
    (el.querySelector('button.live-btn') as HTMLButtonElement).click();
    release.reject(new Error('503'));
    await settle();
    expect([...el.querySelectorAll('.stamp')].map((s) => s.textContent?.replace(/\s+/g, ' ').trim())).toEqual([
      'Prepared 20 Oct, 13:41',
      'Showing the prepared result: the live call failed',
      'Prepared 20 Oct, 13:52',
    ]);
  });

  it('K189 (3): a missed call offers Try again until one live result lands, then nothing', async () => {
    await mount();
    (el.querySelector('button.live-btn') as HTMLButtonElement).click();
    release.reject(new Error('503'));
    await settle();
    expect(txt('.live-btn .live-label')).toBe('Try again');
    (el.querySelector('button.live-btn') as HTMLButtonElement).click();
    release.resolve({ status: 'ready', requestId: 'r', suggestions: [] });
    await settle();
    expect(txt('.stamp')).toBe('Live, just now');
    expect(el.querySelector('button.live-btn')).toBeNull();
    expect(outcomes.map((o) => o.status)).toEqual(['missed', 'done']);
  });

  it('a failed call says it failed and shows the prepared result; it never claims a time limit it did not reach', async () => {
    await mount();
    (el.querySelector('button.live-btn') as HTMLButtonElement).click();
    release.reject(new Error('503'));
    await settle();
    expect(txt('.stamp.fallback')).toBe('Showing the prepared result: the live call failed');
    // Gap (b), K45 and K101: the prepared result shown carries its own true time, with what prepared means (W30).
    expect([...el.querySelectorAll('.stamp')].map((s) => s.textContent?.replace(/\s+/g, ' ').trim())).toEqual([
      'Showing the prepared result: the live call failed',
      'Prepared 20 Oct, 13:41',
    ]);
    expect(el.querySelectorAll('kiosk-prepared-info button[data-act="preparedInfo"]').length).toBe(1);
    expect(el.querySelector('.stamp:not(.fallback) kiosk-prepared-info')).not.toBeNull();
    expect(txt('.live-btn .live-label')).toBe('Try again');
    expect(outcomes.map((o) => (o.status === 'missed' ? o.reason : o.status))).toEqual(['failed']);
  });

  it('W79: a row destroyed mid-call (its screen left) emits into nothing, so Angular warns nothing (NG0953)', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    await mount();
    (el.querySelector('button.live-btn') as HTMLButtonElement).click();
    fixture.destroy();
    release.resolve({ status: 'ready', requestId: 'r', suggestions: [] });
    await vi.waitFor(() => expect(outcomes.map((o) => o.status)).toEqual(['done']));
    await Promise.resolve();
    expect(warn.mock.calls.flat().join(' ')).not.toContain('NG0953');
    warn.mockRestore();
  });

  it('Stop waiting lets the call go and puts the prepared result back', async () => {
    await mount();
    (el.querySelector('button.live-btn') as HTMLButtonElement).click();
    fixture.detectChanges();
    (el.querySelector('[data-act="liveCancel"]') as HTMLButtonElement).click();
    await settle();
    expect(txt('.stamp')).toBe('Prepared 20 Oct, 13:41');
    expect(el.querySelector('button.live-btn')).not.toBeNull();
    expect(outcomes.map((o) => o.status)).toEqual(['stopped']);
  });

  it('off when the opening check found no text model, and says so; busy while another LIVE call runs', async () => {
    await mount();
    text.set(false);
    fixture.detectChanges();
    expect((el.querySelector('button.live-btn') as HTMLButtonElement).disabled).toBe(true);
    expect(txt('.live-why')).toBe('Live calls are off for now');
    text.set(true);
    const live = TestBed.inject(LiveService);
    void live.press('q:other', 'q', {});
    fixture.detectChanges();
    expect((el.querySelector('button.live-btn') as HTMLButtonElement).disabled).toBe(true);
    expect(txt('.live-why')).toBe('Another live call is running');
    live.stopWaiting();
  });

  it('with nothing prepared behind it (a typed answer to grade), a miss claims no prepared result: the scene says what happened', async () => {
    await mount({ preparedAt: null, kind: 'q', noFallback: true });
    (el.querySelector('button.live-btn') as HTMLButtonElement).click();
    release.reject(new Error('503'));
    await settle();
    expect(el.querySelector('.stamp')).toBeNull();
    expect(txt('.live-btn .live-label')).toBe('Try again');
    expect(outcomes.map((o) => (o.status === 'missed' ? o.reason : o.status))).toEqual(['failed']);
  });

  it('a row that offers no press (K147) says where the result came from, with no button and no reason it is off', async () => {
    await mount();
    (el.querySelector('button.live-btn') as HTMLButtonElement).click();
    release.resolve({ status: 'ready', requestId: 'r', suggestions: [] });
    await settle();
    fixture.componentRef.setInput('offer', false);
    text.set(false);
    fixture.detectChanges();
    expect(txt('.stamp')).toBe('Live, just now');
    expect(el.querySelector('button.live-btn')).toBeNull();
    expect(el.querySelector('.live-why')).toBeNull();
  });

  it('with no prepared result (a typed change), the row shows the button alone', async () => {
    await mount({ preparedAt: null, kind: 'q' });
    expect(el.querySelector('.stamp')).toBeNull();
    expect(txt('.live-btn .live-eta')).toBe('takes a while');
  });
});
