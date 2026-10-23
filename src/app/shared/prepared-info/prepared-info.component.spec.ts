import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { KioskLanguage, provideKioskI18n } from '../../i18n/i18n';
import { PreparedInfoComponent } from './prepared-info.component';

@Component({
  imports: [PreparedInfoComponent],
  template: `<span class="stamp a">Prepared 18 Oct, 12:38<kiosk-prepared-info /></span>
    <span class="stamp b">Prepared 18 Oct, 12:55<kiosk-prepared-info /></span>
    <p class="elsewhere">elsewhere</p>`,
})
class HostComponent {}

const NOTE =
  'Prepared: made in advance for this demo, by the same AI pipeline you see here. It is what shows without internet, or when a live call runs late. Press a LIVE button to ask the AI now.';

// K161 W30 (the owner, 19 Oct 22:15 +08: ""prepared 8 oct ..." is not self explanatory"): one general
// explanation of a prepared result, reachable from every stamp: an info mark after the stamp's words
// opens a short note under it; a second tap, a tap elsewhere or Esc closes it, and one note shows at a time.
describe('PreparedInfoComponent (W30)', () => {
  let fixture: ComponentFixture<HostComponent>;
  let el: HTMLElement;

  beforeEach(async () => {
    TestBed.configureTestingModule({ providers: [...provideKioskI18n()] });
    await TestBed.inject(KioskLanguage).ready();
    fixture = TestBed.createComponent(HostComponent);
    el = fixture.nativeElement as HTMLElement;
    await fixture.whenStable();
  });

  const btn = (s: 'a' | 'b') => el.querySelector(`.stamp.${s} kiosk-prepared-info button`) as HTMLButtonElement;
  const notes = () => [...document.querySelectorAll('.prep-note')].map((n) => n.textContent?.replace(/\s+/g, ' ').trim());
  async function tap(target: HTMLElement): Promise<void> {
    target.click();
    fixture.detectChanges();
    await fixture.whenStable();
  }

  it('is a labelled button that adds no words to the stamp until opened', () => {
    expect(btn('a').getAttribute('aria-label')).toBe('What does Prepared mean?');
    expect(btn('a').getAttribute('aria-expanded')).toBe('false');
    expect(btn('a').getAttribute('type')).toBe('button');
    expect(el.querySelector('.stamp.a')?.textContent?.trim()).toBe('Prepared 18 Oct, 12:38');
    expect(notes()).toEqual([]);
  });

  it('a tap opens the note under it; a second tap closes it', async () => {
    await tap(btn('a'));
    expect(notes()).toEqual([NOTE]);
    expect(btn('a').getAttribute('aria-expanded')).toBe('true');
    await tap(btn('a'));
    expect(notes()).toEqual([]);
  });

  it('a tap elsewhere or Esc closes it, and opening another closes the first', async () => {
    await tap(btn('a'));
    await tap(el.querySelector('.elsewhere') as HTMLElement);
    expect(notes()).toEqual([]);
    await tap(btn('a'));
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    fixture.detectChanges();
    expect(notes()).toEqual([]);
    await tap(btn('a'));
    await tap(btn('b'));
    expect(notes()).toEqual([NOTE]);
    expect([btn('a').getAttribute('aria-expanded'), btn('b').getAttribute('aria-expanded')]).toEqual(['false', 'true']);
  });

  it('in Chinese the label and the note are translated', async () => {
    await TestBed.inject(KioskLanguage).setLang('zh');
    fixture.detectChanges();
    await tap(btn('a'));
    expect(btn('a').getAttribute('aria-label')).toBe('“预先备好”是什么意思？');
    expect(notes()).toEqual(['预先备好：用你在这里看到的同一套 AI 流程，为这次演示提前做好。没有网络、或实时调用来得太慢时，就显示它。按 LIVE 按钮，就请 AI 现在来做。']);
  });
});
