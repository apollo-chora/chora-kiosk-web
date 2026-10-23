import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { KioskLanguage, provideKioskI18n } from '../../i18n/i18n';
import { provideLive } from '../../live/live.providers';
import { KioskStore } from '../kiosk.store';
import { KioskTour } from './kiosk-tour';
import { TourFooterComponent } from './tour-footer.component';
import { quietBeats } from './tour.testing';

@Component({
  imports: [TourFooterComponent],
  template: `<footer id="bottom" class="frame-bottom"
    ><kiosk-tour-footer
      >@if (extra()) {
        <button class="btn btn-frame btn-sm" data-act="xray">How was this made?</button>
      }</kiosk-tour-footer
    ></footer
  >`,
})
class HostComponent {
  readonly extra = signal(true);
}

// K173 (the owner: "next should consistently stay at the right-most so that a visitor can click at the
// same spot to move forward"): the footer on the hall and on every beat holds the beat marker at the
// left; at the right the exhibit's own extra (Behind the scenes), "Back to Explore", Done, Back, and Next
// last. The hall has no Back and no "Back to Explore".
describe('TourFooterComponent (K173)', () => {
  let fixture: ComponentFixture<HostComponent>;
  let el: HTMLElement;
  let store: KioskStore;
  let tour: KioskTour;

  async function settle(): Promise<void> {
    for (let i = 0; i < 4; i++) {
      await Promise.resolve();
      fixture.detectChanges();
    }
  }

  beforeEach(async () => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting(), ...provideKioskI18n(), ...provideLive()] });
    await TestBed.inject(KioskLanguage).ready();
    store = TestBed.inject(KioskStore);
    tour = TestBed.inject(KioskTour);
    quietBeats();
    store.go('hall');
    fixture = TestBed.createComponent(HostComponent);
    el = fixture.nativeElement as HTMLElement;
    await settle();
  });

  const text = (n: Element | null) => n?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
  const right = () => [...el.querySelectorAll('#bottom .fb-right > button')];

  it('on the hall: the marker says where Next starts; Done, then Next, right-most; no Back, no "Back to Explore"', async () => {
    fixture.componentInstance.extra.set(false);
    await settle();
    expect(text(el.querySelector('#bottom .fb-left .tour-marker'))).toBe('Next starts the tour at Wander the maps');
    expect(right().map((b) => b.getAttribute('data-act'))).toEqual(['resetAll', 'next']);
    expect(text(right()[1])).toBe('Next');
  });

  it('on a beat: the marker names the exhibit and n of m; the extra, "Back to Explore", Done, Back, then Next', async () => {
    await tour.openCard('comp');
    await tour.next();
    await settle();
    expect(text(el.querySelector('#bottom .fb-left .tour-marker'))).toBe('Meet the Companions, 2 of 6');
    expect(right().map((b) => b.getAttribute('data-act'))).toEqual(['xray', 'toHall', 'resetAll', 'back', 'next']);
    expect(right().map((b) => text(b))).toEqual(['How was this made?', 'Back to Explore', 'Done, end the demo session', 'Back', 'Next']);
  });

  it('its buttons drive the tour and the end of the demo session', async () => {
    const end = vi.spyOn(store, 'endSession').mockResolvedValue();
    (el.querySelector('#bottom [data-act="next"]') as HTMLButtonElement).click();
    await settle();
    expect(tour.beat()).toBe('M1');
    (el.querySelector('#bottom [data-act="next"]') as HTMLButtonElement).click();
    await settle();
    (el.querySelector('#bottom [data-act="back"]') as HTMLButtonElement).click();
    await settle();
    expect(tour.beat()).toBe('M1');
    (el.querySelector('#bottom [data-act="toHall"]') as HTMLButtonElement).click();
    await settle();
    expect(store.scene()).toBe('hall');
    (el.querySelector('#bottom [data-act="resetAll"]') as HTMLButtonElement).click();
    expect(end).toHaveBeenCalledTimes(1);
  });

  it('Next and Back wait while a beat is still showing (G3’s release)', async () => {
    let release!: () => void;
    tour.register('G1', { show: () => new Promise<void>((r) => (release = r)) });
    void tour.openCard('grade');
    await settle();
    expect((el.querySelector('#bottom [data-act="next"]') as HTMLButtonElement).disabled).toBe(true);
    expect((el.querySelector('#bottom [data-act="back"]') as HTMLButtonElement).disabled).toBe(true);
    release();
    await settle();
    expect((el.querySelector('#bottom [data-act="next"]') as HTMLButtonElement).disabled).toBe(false);
  });

  it('speaks Chinese: the marker and the buttons', async () => {
    await TestBed.inject(KioskLanguage).setLang('zh');
    await settle();
    expect(text(el.querySelector('#bottom .fb-left .tour-marker'))).toBe('按“下一步”从“漫游学习者的知识地图”开始导览');
    await tour.openCard('engine');
    await settle();
    expect(text(el.querySelector('#bottom .fb-left .tour-marker'))).toBe('引擎室：第 1 步，共 5 步');
    expect(text(el.querySelector('#bottom [data-act="next"]'))).toBe('下一步');
  });
});
