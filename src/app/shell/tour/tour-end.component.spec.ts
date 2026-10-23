import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { KioskLanguage, provideKioskI18n } from '../../i18n/i18n';
import { ResetService, type ResetStatus } from '../../kiosk-api/reset.service';
import { provideLive } from '../../live/live.providers';
import { KioskStore } from '../kiosk.store';
import { KioskTour } from './kiosk-tour';
import { TourEndComponent } from './tour-end.component';
import { provideTourNav } from './tour-nav';
import { quietBeats } from './tour.testing';

/** The end of the tour as the root mounts it, over a scene on the tour (its Next, Back and Esc are the tour's). */
@Component({
  imports: [TourEndComponent],
  template: `<kiosk-tour-end />`,
})
class HostComponent {
  constructor() {
    provideTourNav();
  }
}

// W55 (the owner: "Show a message saying that visitor has reached the end of their tour and offer an
// exit option (modal/popup) or choose to remain in the hall to explore"): Next on the Engine Room's
// last page opens a modal dialog over it, the focus on its first button. Done ends the demo session as
// the footer's Done does; Stay in the hall, and Esc, go to the hall.
describe('TourEndComponent (W55)', () => {
  let fixture: ComponentFixture<HostComponent>;
  let el: HTMLElement;
  let store: KioskStore;
  let tour: KioskTour;

  async function settle(): Promise<void> {
    for (let i = 0; i < 4; i++) {
      await Promise.resolve();
      fixture.detectChanges();
    }
    await fixture.whenStable();
  }

  async function ended(lang: 'en' | 'zh' = 'en'): Promise<void> {
    await TestBed.inject(KioskLanguage).setLang(lang);
    store.go('local');
    await tour.next();
    await settle();
  }

  beforeEach(async () => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting(), ...provideKioskI18n(), ...provideLive()] });
    await TestBed.inject(KioskLanguage).ready();
    store = TestBed.inject(KioskStore);
    tour = TestBed.inject(KioskTour);
    quietBeats();
    fixture = TestBed.createComponent(HostComponent);
    el = fixture.nativeElement as HTMLElement;
    await settle();
  });

  const text = (sel: string) => el.querySelector(sel)?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
  const dialog = () => el.querySelector('#ov-tour-end [role="dialog"]');
  const button = (act: string) => el.querySelector(`#ov-tour-end [data-act="${act}"]`) as HTMLButtonElement;

  it('shows nothing until the tour has ended: the overlay is hidden and holds no dialog', async () => {
    store.go('local');
    await settle();
    expect(el.querySelector('#ov-tour-end')?.classList.contains('show')).toBe(false);
    expect(dialog()).toBeNull();
  });

  it('Next on the last beat opens a modal dialog over the page: the title, the body, Done then Stay, the focus on Done', async () => {
    await ended();
    expect(el.querySelector('#ov-tour-end')?.classList.contains('show')).toBe(true);
    const d = dialog() as HTMLElement;
    expect(d.getAttribute('aria-modal')).toBe('true');
    expect(el.querySelector(`#${d.getAttribute('aria-labelledby')}`)?.textContent?.trim()).toBe('You have reached the end of the tour');
    expect(text('#ov-tour-end h2')).toBe('You have reached the end of the tour');
    expect(text('#ov-tour-end p')).toBe(
      'That was the last stop on the tour. End the demo session so the next visitor starts fresh, or stay in the hall and explore on your own.',
    );
    expect([...d.querySelectorAll('button')].map((b) => [b.getAttribute('data-act'), b.textContent?.trim()])).toEqual([
      ['tourEndDone', 'Done, end the demo session'],
      ['tourEndStay', 'Stay in the hall and explore'],
    ]);
    expect(document.activeElement).toBe(button('tourEndDone'));
    expect(store.scene()).toBe('local');
  });

  it('speaks Chinese: the title, the body and both buttons', async () => {
    await ended('zh');
    expect(text('#ov-tour-end h2')).toBe('导览到此结束');
    expect(text('#ov-tour-end p')).toBe('这是导览的最后一站。你可以结束这场演示，让下一位访客从头开始；也可以留在大厅，自己继续探索。');
    expect(button('tourEndDone').textContent?.trim()).toBe('完成，结束这场演示');
    expect(button('tourEndStay').textContent?.trim()).toBe('留在大厅继续探索');
  });

  it('Done is the store’s end of the demo session, the same path as the footer’s Done', async () => {
    await ended();
    const end = vi.spyOn(store, 'endSession').mockResolvedValue();
    button('tourEndDone').click();
    expect(end).toHaveBeenCalledTimes(1);
  });

  it('Done for real: the dialog closes at once and the reset card takes the window', async () => {
    await ended();
    vi.spyOn(TestBed.inject(ResetService), 'start').mockReturnValue(new Promise<ResetStatus>(() => undefined));
    button('tourEndDone').click();
    await settle();
    expect(tour.ended()).toBe(false);
    expect(store.resetCardShown()).toBe(true);
    expect(dialog()).toBeNull();
  });

  it('Stay in the hall goes to the hall and closes the dialog', async () => {
    await ended();
    button('tourEndStay').click();
    await settle();
    expect(store.scene()).toBe('hall');
    expect(tour.ended()).toBe(false);
    expect(tour.beat()).toBeNull();
    expect(dialog()).toBeNull();
  });

  it('Esc does what Stay does, through the kiosk’s own keys (the tour’s Esc)', async () => {
    await ended();
    store.onKey(new KeyboardEvent('keydown', { key: 'Escape' }), document.activeElement);
    await settle();
    expect(store.scene()).toBe('hall');
    expect(tour.ended()).toBe(false);
    expect(dialog()).toBeNull();
  });

  it('the arrow keys behind it do nothing: Next and Back wait for a choice', async () => {
    await ended();
    store.onKey(new KeyboardEvent('keydown', { key: 'ArrowRight' }), document.activeElement);
    store.onKey(new KeyboardEvent('keydown', { key: 'ArrowLeft' }), document.activeElement);
    await settle();
    expect(store.scene()).toBe('local');
    expect(tour.ended()).toBe(true);
    expect(dialog()).not.toBeNull();
  });
});
