import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';

import { ContentDirective } from './content.directive';
import { BundledTranslateLoader, KioskLanguage, englishString, provideKioskI18n } from './i18n';

// A screen in miniature: an interface label from the tables, and a question stem that came
// from an API (content).
@Component({
  imports: [TranslatePipe, ContentDirective],
  template: `<h2 id="label">{{ 'kd.dose' | translate }}</h2>
    <p id="stem" kioskContent>{{ stem() }}</p>
    <p id="mixed">{{ 'hud.march' | translate: { name: name(), c: focus() } }}</p>`,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
class ScreenComponent {
  readonly stem = input('Which stage of NEWater production destroys germs?');
  readonly name = input('Pingu');
  readonly focus = input('NEWater');
}

describe('kiosk i18n (T3.2)', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideKioskI18n()] });
    document.documentElement.lang = '';
  });

  it('starts in English and marks the page as English', async () => {
    const lang = TestBed.inject(KioskLanguage);
    await lang.ready();
    expect(lang.lang()).toBe('en');
    expect(document.documentElement.lang).toBe('en');
    expect(TestBed.inject(TranslateService).instant('nav.next')).toBe('Next');
  });

  it('switches the interface to Simplified Chinese and marks the page zh-Hans', async () => {
    const lang = TestBed.inject(KioskLanguage);
    await lang.setLang('zh');
    expect(lang.lang()).toBe('zh');
    expect(document.documentElement.lang).toBe('zh-Hans');
    expect(TestBed.inject(TranslateService).instant('nav.next')).toBe('下一步');
  });

  it('under the Chinese interface, content stays English and is marked lang="en" (K41)', async () => {
    await TestBed.inject(KioskLanguage).setLang('zh');
    const fixture = TestBed.createComponent(ScreenComponent);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('#label')!.textContent).not.toBe('');
    expect(el.querySelector('#label')!.textContent).toMatch(/[一-鿿]/);
    const stem = el.querySelector('#stem')!;
    expect(stem.textContent).toBe('Which stage of NEWater production destroys germs?');
    expect(stem.getAttribute('lang')).toBe('en');
    expect(el.querySelector('#mixed')!.textContent).toBe('Pingu 正在进军“NEWater”');
  });

  it('re-renders the interface when the language changes, content untouched', async () => {
    const lang = TestBed.inject(KioskLanguage);
    await lang.ready();
    const fixture = TestBed.createComponent(ScreenComponent);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    const englishLabel = el.querySelector('#label')!.textContent;
    await lang.setLang('zh');
    await fixture.whenStable();
    expect(el.querySelector('#label')!.textContent).not.toBe(englishLabel);
    expect(el.querySelector('#stem')!.textContent).toBe('Which stage of NEWater production destroys germs?');
  });

  it('a key with no string is reported loudly, never shown silently', async () => {
    const errors: unknown[] = [];
    const spy = vi.spyOn(console, 'error').mockImplementation((...a: unknown[]) => void errors.push(a.join(' ')));
    await TestBed.inject(KioskLanguage).ready();
    const out = TestBed.inject(TranslateService).instant('no.such.key');
    expect(out).toBe('no.such.key');
    expect(errors.join('\n')).toMatch(/\[kiosk\] missing string no\.such\.key \(en\)/);
    spy.mockRestore();
  });

  it('the bundled loader refuses a table it does not have', () => {
    expect(() => new BundledTranslateLoader().getTranslation('fr')).toThrow(/no string table for fr/);
  });

  it('refuses a language the kiosk does not have', async () => {
    const lang = TestBed.inject(KioskLanguage);
    await expect(lang.setLang('fr' as never)).rejects.toThrow(/no language fr/);
    expect(lang.lang()).toBe('en');
  });

  it('englishString reads the English table whatever the language, and a missing key is loud (K148)', async () => {
    TestBed.configureTestingModule({ providers: [...provideKioskI18n()] });
    await TestBed.inject(KioskLanguage).setLang('zh');
    expect(englishString('chip.photo')).toBe('Make it photorealistic');
    expect(TestBed.inject(TranslateService).instant('chip.photo')).not.toBe('Make it photorealistic');
    expect(() => englishString('chip.nope')).toThrow(/no English string chip.nope/);
  });
});
