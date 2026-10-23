import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { KioskLanguage, provideKioskI18n } from '../i18n/i18n';
import { provideLive } from '../live/live.providers';
import { FreshStartComponent } from './fresh-start.component';
import { KioskStore } from './kiosk.store';

// K151: a start on a stack a previous demo session changed asks whether to start fresh.
describe('FreshStartComponent (K151)', () => {
  async function shown(lang: 'en' | 'zh' = 'en') {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting(), ...provideKioskI18n(), ...provideLive()] });
    await TestBed.inject(KioskLanguage).setLang(lang);
    const store = TestBed.inject(KioskStore);
    const f = TestBed.createComponent(FreshStartComponent);
    f.detectChanges();
    return { store, el: f.nativeElement as HTMLElement };
  }
  const text = (el: HTMLElement, sel: string) => el.querySelector(sel)?.textContent?.trim();

  it('asks in plain words, with "Start fresh" and "Continue"', async () => {
    const { el } = await shown();
    expect(text(el, 'h2')).toBe('Start fresh for a new visitor?');
    expect(text(el, 'p')).toBe('The last demo session left its changes. Starting fresh puts back the prepared start first.');
    expect(text(el, '[data-act="freshStart"]')).toBe('Start fresh');
    expect(text(el, '[data-act="keepSession"]')).toBe('Continue');
  });

  it('in Chinese too', async () => {
    const { el } = await shown('zh');
    expect(text(el, 'h2')).toBe('要为新访客重新开始吗？');
    expect(text(el, '[data-act="freshStart"]')).toBe('重新开始');
    expect(text(el, '[data-act="keepSession"]')).toBe('继续');
  });

  it('"Start fresh" and "Continue" are the store’s', async () => {
    const { store, el } = await shown();
    const fresh = vi.spyOn(store, 'startFresh').mockResolvedValue();
    const keep = vi.spyOn(store, 'keepSession').mockImplementation(() => undefined);
    (el.querySelector('[data-act="freshStart"]') as HTMLButtonElement).click();
    (el.querySelector('[data-act="keepSession"]') as HTMLButtonElement).click();
    expect(fresh).toHaveBeenCalledTimes(1);
    expect(keep).toHaveBeenCalledTimes(1);
  });
});
