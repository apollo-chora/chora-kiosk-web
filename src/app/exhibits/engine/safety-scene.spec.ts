import { NgTemplateOutlet } from '@angular/common';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Component, inject } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import en from '../../i18n/en.json';
import zh from '../../i18n/zh.json';
import { KioskLanguage, provideKioskI18n } from '../../i18n/i18n';
import { provideLive } from '../../live/live.providers';
import { FooterSlot } from '../../shell/footer-slot';
import { KioskStore } from '../../shell/kiosk.store';
import { quietBeats } from '../../shell/tour/tour.testing';
import { SAFETY_ATTACKS, SAFETY_STAGES, safetyStringKeys } from './safety-stages';
import { SafetySceneComponent } from './safety-scene.component';

@Component({ imports: [SafetySceneComponent, NgTemplateOutlet], template: `<kiosk-safety-scene /><footer id="bottom"><ng-container [ngTemplateOutlet]="footer()" /></footer>` })
class Host {
  protected readonly footer = inject(FooterSlot).template;
}

// AI safety and evaluation (mockup SCENES.safety and its stages, lines 6006 to 6092; K15, K73,
// K74): one pipeline of five checks, three before release and two after, each opened to its plain
// sentence, its rule and its evidence, the crops of the project's own screenshots (verdict lines
// only), each with its date and tool. Static: the laptop runs none of these checks.
describe('SafetySceneComponent', () => {
  let http: HttpTestingController;
  let fixture: ComponentFixture<Host>;
  let el: HTMLElement;
  let store: KioskStore;

  async function shown(): Promise<void> {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting(), ...provideKioskI18n(), ...provideLive()] });
    http = TestBed.inject(HttpTestingController);
    store = TestBed.inject(KioskStore);
    await TestBed.inject(KioskLanguage).ready();
    store.go('safety');
    fixture = TestBed.createComponent(Host);
    el = fixture.nativeElement as HTMLElement;
    fixture.detectChanges();
  }

  const text = (sel: string) => el.querySelector(sel)?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
  const texts = (sel: string) => [...el.querySelectorAll(sel)].map((n) => n.textContent?.replace(/\s+/g, ' ').trim() ?? '');
  const open = () => el.querySelector('.sf-step.on')?.getAttribute('data-id');

  it('every stage, crop and attack has its words in both languages (the mockup’s self-check, fail loud)', () => {
    const tables = { en: en as Record<string, string>, zh: zh as Record<string, string> };
    const missing = safetyStringKeys().flatMap((k) => (['en', 'zh'] as const).filter((l) => !tables[l][k]?.trim()).map((l) => `${l} ${k}`));
    expect(missing).toEqual([]);
    expect(SAFETY_STAGES.map((s) => s.id)).toEqual(['judge', 'redteam', 'gate', 'runtime', 'drift']);
    expect(SAFETY_ATTACKS).toHaveLength(6);
  });

  it('the pipeline: three checks before release, the release, two after; the judge open first; said to be static; no read', async () => {
    await shown();
    expect(text('.ex-head h2')).toBe('AI safety and evaluation');
    expect(text('.static-banner')).toContain('This computer runs none of these checks');
    expect(texts('.sf-phase:not(.sf-phase--post) .sf-step b')).toEqual(['AI judge', 'Red team', 'Fail-closed gate']);
    expect(text('.sf-release')).toBe('Release');
    expect(texts('.sf-phase--post .sf-step b').length).toBe(2);
    expect(el.querySelector('.sf-phase--post .sf-step .tag-sim')?.textContent).toBe('Simulated on local');
    expect(open()).toBe('judge');
    expect(text('.sf-detail .kicker')).toBe('Stage 1 of 5 · Before release');
    expect([...el.querySelectorAll('.sf-crop img')].map((i) => i.getAttribute('src'))).toEqual(['assets/safety/judge-floors.png', 'assets/safety/judge-oplus.png']);
    expect(text('.sf-crop figcaption b')).toBe('24 Aug 2026 · Vertex AI Evaluation, in the Cloud Build log');
    expect(text('.sf-ev__head .sf-mask')).toContain('Grey boxes hide ids');
    http.expectNone(() => true);
  });

  it('a click opens a stage: the red team lists its six attacks; the gate carries its note and the side crop', async () => {
    await shown();
    (el.querySelector('[data-act="sfStage"][data-id="redteam"]') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(open()).toBe('redteam');
    expect([...el.querySelectorAll('.sf-attacks li code')].map((c) => c.textContent)).toEqual([...SAFETY_ATTACKS]);
    expect(el.querySelector('.sf-mask')).toBeNull();
    (el.querySelector('[data-act="sfStage"][data-id="gate"]') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(text('.sf-note')).toContain('Nobody planted this one');
    expect([...el.querySelectorAll('.sf-crop')].map((f) => [f.getAttribute('data-crop'), f.classList.contains('sf-crop--side')])).toEqual([
      ['gate-blocked-leak', false],
      ['gate-crew-nothing', true],
    ]);
  });

  it('K173 (E3): the page is one beat: Next goes on to Governance and Back to Agent crews; the five stages stay a click away; Esc to the hall', async () => {
    await shown();
    const beats = quietBeats();
    store.go('safety');
    store.next();
    await vi.waitFor(() => expect(store.scene()).toBe('gov'));
    store.back();
    await vi.waitFor(() => expect(store.scene()).toBe('safety'));
    store.back();
    await vi.waitFor(() => expect(store.scene()).toBe('crews'));
    expect(beats).toEqual(['E4 next', 'E3 back', 'E2 back']);
    store.go('safety');
    store.escapeUp();
    expect(store.scene()).toBe('hall');
  });

  it('its footer is the tour’s: no "Back to the Engine Room" (Back does its job)', async () => {
    await shown();
    fixture.detectChanges();
    expect(el.querySelector('#bottom [data-act="toEngine"]')).toBeNull();
    expect(el.querySelector('#bottom [data-act="next"]')).not.toBeNull();
  });
});
