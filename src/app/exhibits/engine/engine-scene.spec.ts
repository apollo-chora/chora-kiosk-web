import { NgTemplateOutlet } from '@angular/common';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Component, inject } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { KioskLanguage, provideKioskI18n } from '../../i18n/i18n';
import { VisitsService } from '../../kiosk-api/visits.service';
import { provideLive } from '../../live/live.providers';
import { FooterSlot } from '../../shell/footer-slot';
import { KioskStore } from '../../shell/kiosk.store';
import { quietBeats } from '../../shell/tour/tour.testing';
import { EngineSceneComponent } from './engine-scene.component';
import { provideEngineJumps } from './engine-jumps';

@Component({ imports: [EngineSceneComponent, NgTemplateOutlet], template: `<kiosk-engine-scene /><footer id="bottom"><ng-container [ngTemplateOutlet]="footer()" /></footer>` })
class EngineHost {
  protected readonly footer = inject(FooterSlot).template;
}

// The Engine Room's door (mockup SCENES.engine as amended, line 6125; K4, K8, K10, K40): four tiles,
// AI safety after the crews, the comparison with the full platform marked; each opens its page; Back,
// Esc and the footer return to Explore. It reads nothing.
describe('The Engine Room (the door)', () => {
  let http: HttpTestingController;
  let fixture: ComponentFixture<EngineHost>;
  let el: HTMLElement;
  let store: KioskStore;

  async function shown(): Promise<void> {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting(), ...provideKioskI18n(), ...provideLive()] });
    http = TestBed.inject(HttpTestingController);
    store = TestBed.inject(KioskStore);
    await TestBed.inject(KioskLanguage).ready();
    fixture = TestBed.createComponent(EngineHost);
    el = fixture.nativeElement as HTMLElement;
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  const text = (sel: string) => el.querySelector(sel)?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
  const texts = (sel: string) => [...el.querySelectorAll(sel)].map((n) => n.textContent?.replace(/\s+/g, ' ').trim() ?? '');

  it('four tiles in the amended order, each with its art, title and line; only How this demo runs is marked', async () => {
    await shown();
    expect(text('.ex-head .crumb')).toBe('Explore · Engine Room');
    expect(text('.ex-head h2')).toBe('The Engine Room');
    expect(el.querySelector('.eng-tiles')?.classList.contains('eng-tiles--4')).toBe(true);
    const tiles = [...el.querySelectorAll('.eng-tiles .eng-tile')] as HTMLElement[];
    expect(tiles.map((t) => t.getAttribute('data-to'))).toEqual(['crews', 'safety', 'gov', 'local']);
    expect(texts('.eng-tile h3')).toEqual(['Agent crews at work', 'AI safety and evaluation', 'Governance and DevSecOps', 'How this demo runs']);
    expect(texts('.eng-tile p')[0]).toBe('Two crews, one door for every model call, and a decision log an auditor can verify.');
    expect(tiles.map((t) => t.classList.contains('warn'))).toEqual([false, false, false, true]);
    expect(tiles.every((t) => t.querySelector('.art svg'))).toBe(true);
    http.expectNone(() => true);
  });

  it('a tile opens its page, which leads back here (K40)', async () => {
    await shown();
    for (const to of ['crews', 'safety', 'gov', 'local'] as const) {
      store.go('engine');
      (el.querySelector(`.eng-tile[data-to="${to}"]`) as HTMLButtonElement).click();
      expect(store.scene()).toBe(to);
    }
  });

  it('a visit is counted only when the door is entered from Explore, never from its own pages', async () => {
    await shown();
    const record = vi.spyOn(TestBed.inject(VisitsService), 'record').mockResolvedValue(true);
    store.go('engine');
    (el.querySelector('.eng-tile[data-to="gov"]') as HTMLButtonElement).click();
    expect(record).not.toHaveBeenCalled();
  });

  it('K173: the keys are the tour’s (Next to Agent crews, Back to Grading’s last beat); Esc and "Back to Explore" return to the hall', async () => {
    await shown();
    const beats = quietBeats();
    store.go('engine');
    store.next();
    await vi.waitFor(() => expect(store.scene()).toBe('crews'));
    store.back();
    await vi.waitFor(() => expect(store.scene()).toBe('engine'));
    store.back();
    await vi.waitFor(() => expect(store.scene()).toBe('grade'));
    expect(beats).toEqual(['E2 next', 'E1 back', 'G3 back']);
    store.go('engine');
    store.escapeUp();
    expect(store.scene()).toBe('hall');
    store.go('engine');
    fixture.detectChanges();
    expect(texts('#bottom .fb-right button')).toEqual(['Back to Explore', 'Done, end the demo session', 'Back', 'Next']);
    (el.querySelector('#bottom [data-act="toHall"]') as HTMLButtonElement).click();
    expect(store.scene()).toBe('hall');
  });

  it('the presenter can jump to the door', async () => {
    await shown();
    TestBed.runInInjectionContext(() => provideEngineJumps());
    expect(store.canJump('engine')).toBe(true);
    store.jumpTo('engine');
    expect(store.scene()).toBe('engine');
  });

  it('reads in Chinese', async () => {
    await shown();
    await TestBed.inject(KioskLanguage).setLang('zh');
    fixture.detectChanges();
    expect(text('.ex-head h2')).not.toBe('The Engine Room');
    expect(text('#bottom [data-act="toHall"]')).not.toBe('Back to Explore');
  });
});
