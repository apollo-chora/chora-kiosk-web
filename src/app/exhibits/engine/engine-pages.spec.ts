import { NgTemplateOutlet } from '@angular/common';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Component, Type, inject } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { KioskLanguage, provideKioskI18n } from '../../i18n/i18n';
import { provideLive } from '../../live/live.providers';
import { FooterSlot } from '../../shell/footer-slot';
import { KioskStore } from '../../shell/kiosk.store';
import { quietBeats } from '../../shell/tour/tour.testing';
import { KioskTour } from '../../shell/tour/kiosk-tour';
import { provideEngineJumps } from './engine-jumps';
import { GovSceneComponent } from './gov-scene.component';
import { LocalSceneComponent } from './local-scene.component';

@Component({ imports: [GovSceneComponent, NgTemplateOutlet], template: `<kiosk-gov-scene /><footer id="bottom"><ng-container [ngTemplateOutlet]="footer()" /></footer>` })
class GovHost {
  protected readonly footer = inject(FooterSlot).template;
}
@Component({ imports: [LocalSceneComponent, NgTemplateOutlet], template: `<kiosk-local-scene /><footer id="bottom"><ng-container [ngTemplateOutlet]="footer()" /></footer>` })
class LocalHost {
  protected readonly footer = inject(FooterSlot).template;
}

// Two Engine Room pages that read nothing (K8, K9, K40): Governance and DevSecOps, the production
// O+ IMDA board as captured on 10 Aug 2026 with its disclaimer (mockup SCENES.gov, line 5953), and
// How this demo runs, the comparison table the header's About the app shows too (SCENES.local,
// line 5968). Back, Esc and the footer lead to the Engine Room, the only way out (K40).
describe('the Engine Room’s static pages', () => {
  let http: HttpTestingController;
  let fixture: ComponentFixture<unknown>;
  let el: HTMLElement;
  let store: KioskStore;

  async function shown(host: Type<unknown>): Promise<void> {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting(), ...provideKioskI18n(), ...provideLive()] });
    http = TestBed.inject(HttpTestingController);
    store = TestBed.inject(KioskStore);
    await TestBed.inject(KioskLanguage).ready();
    fixture = TestBed.createComponent(host);
    el = fixture.nativeElement as HTMLElement;
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  const text = (sel: string) => el.querySelector(sel)?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
  const texts = (sel: string) => [...el.querySelectorAll(sel)].map((n) => n.textContent?.replace(/\s+/g, ' ').trim() ?? '');

  it('Governance: the 10 Aug capture said to be static, the four dimensions with their signals and counts, and the DevSecOps facts; no read', async () => {
    await shown(GovHost);
    expect(text('.ex-head h2')).toBe('Governance and DevSecOps');
    // K220 (W98): the page in plain words, a line under the title saying what it is about.
    expect(text('.ex-head h2 + p')).toBe('How Chora holds its AI to account, and how its software is checked for security.');
    expect(text('.static-banner')).toBe('A still picture of Chora’s live governance dashboard (O+), taken on 10 Aug 2026. This kiosk measures nothing live, so these numbers stay as they were that day.');
    expect(text('.gov-grid .kicker')).toBe('Singapore’s Model AI Governance Framework (IMDA): its four areas');
    expect(texts('.imda .dim h4')).toEqual(['D1 · Accountability', 'D2 · Transparency', 'D3 · Safety and Robustness', 'D4 · Fairness and Human Oversight']);
    expect([...el.querySelectorAll('.imda .dim .signal')].map((s) => [['green', 'amber', 'red'].find((c) => s.classList.contains(c)), s.textContent?.trim()])).toEqual([
      ['amber', 'Partly met'],
      ['green', 'Meets the baseline'],
      ['amber', 'Partly met'],
      ['red', 'Needs attention'],
    ]);
    expect(texts('.imda .dim:first-child .counts')).toEqual(['9 checks: 6 met, 1 partly met, 2 not yet met']);
    expect(text('.imda .dim:first-child .what')).toBe('A record of every decision, where data came from, how long it is kept, and who is responsible for what.');
    // Only a green dimension with fails explains why it is still green.
    expect(texts('.imda .dim .counts').filter((c) => c.startsWith('Still green'))).toHaveLength(1);
    expect(el.querySelectorAll('.imda .dim')[1].textContent).toContain('Still green');
    expect((el.querySelector('.imda .dim') as HTMLElement).style.borderLeftColor).toBe('rgb(25, 118, 210)');
    expect(el.querySelectorAll('.imda .dim')[1].textContent).toContain('Still green: none of its unmet checks is top priority, and fewer than two are second priority.');
    expect(text('.gov-grid .rule')).toBe(
      'How the colour is set (the same rule the product shows): red if any top-priority check is not met, amber if two or more second-priority checks are not met; third-priority checks never change it. Red is shown honestly: it marks work still to do.',
    );
    // K220: the four facts as approved; autonomy level 3 said in plain words, after the three levels it sits beyond.
    expect(texts('.facts li')).toEqual([
      'Every Chora service has its own checked release pipeline: it scans the code for security weaknesses, lists every software part inside, signs the result so anyone can check it is the copy that was built, and tests the running service from the outside. The copies on this computer were built here for the showcase, so they are not signed.',
      'In that pipeline, a team of AI agents must pass its own test before release: a score below its pass mark stops the release.',
      'Every AI agent is registered with how much freedom it has: simple low-stakes tasks it may do alone, work a person watches, or work a person must approve. The level beyond these, an AI acting outside the system’s checks and records (Chora’s autonomy level 3), is not allowed: the database will not accept it.',
      'Every decision an AI makes is written to a tamper-evident log, each entry sealed to the one before it, so an auditor can check that none was altered afterwards.',
    ]);
    // K220 (W98): the kiosk's own apostrophe (’), never a straight one, on the whole page.
    expect(el.textContent).not.toContain("'");
    http.expectNone(() => true);
  });

  it('Governance in Chinese dates its capture the Chinese way, and reads K220’s drafts (K161)', async () => {
    await shown(GovHost);
    await TestBed.inject(KioskLanguage).setLang('zh');
    fixture.detectChanges();
    expect(text('.static-banner')).toContain('2026 年 8 月 10 日');
    expect(text('.ex-head h2 + p')).toBe('Chora 如何让它的 AI 负起责任，以及它的软件如何接受安全检查。');
    expect(texts('.imda .dim:first-child .counts')).toEqual(['共 9 项检查：6 项达到，1 项部分达到，2 项尚未达到']);
  });

  it('How this demo runs: the comparison table with its flagged safety-screen row', async () => {
    await shown(LocalHost);
    expect(text('.ex-head h2')).toBe('How this demo runs');
    expect(text('.ex-head .crumb')).toBe('Engine Room · This demo');
    expect(el.querySelectorAll('table.disclose tbody tr').length).toBeGreaterThan(0);
    expect(el.querySelector('table.disclose tbody tr:nth-child(5)')?.classList.contains('flag')).toBe(true);
    expect(el.querySelector('table.disclose tbody tr:nth-child(4) td')?.textContent).toBe('AI for matching topics');
    // K197 moves the kiosk off text-embedding-004: the matching row names no model, so it stays true whichever is picked.
    const r10 = [...el.querySelectorAll('table.disclose tbody tr:nth-child(4) td')].map((td) => td.textContent?.replace(/\s+/g, ' ').trim());
    expect(r10).toEqual([
      'AI for matching topics',
      'A text embedding model on Google Cloud, through Chora’s model gateway',
      'A text embedding model, through the same gateway: after “Save my choices” on a marked test, your Companion matches each weak spot you keep to an idea on your map',
    ]);
    http.expectNone(() => true);
  });

  it('K208: How this demo runs opens with the architecture diagram above the table: 21 boxes in six lanes, kept, replaced or left out', async () => {
    await shown(LocalHost);
    const svg = el.querySelector('kiosk-arch-diagram svg.arch-svg');
    expect(svg).not.toBeNull();
    expect(svg?.getAttribute('viewBox')).toBe('0 0 1420 920');
    // The diagram first, the table under it (the owner's "Diagram first, table under").
    expect((svg as Element).compareDocumentPosition(el.querySelector('table.disclose') as Element) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    const boxes = [...el.querySelectorAll('g.arch-box')].filter((g) => g.getAttribute('data-box') !== 'visitor');
    expect(boxes).toHaveLength(21);
    const by = (state: string) => boxes.filter((g) => g.getAttribute('data-state') === state).map((g) => g.getAttribute('data-box'));
    expect(by('kept')).toEqual(['svc', 'crews', 'gw', 'pics', 'embed']);
    expect(by('repl')).toEqual(['lb', 'signin', 'gke', 'words', 'db', 'events', 'files', 'watch', 'keys', 'build']);
    expect(by('gone')).toEqual(['waf', 'pay', 'mesh', 'more', 'safety', 'wif']);
    // A replaced box carries the amber underline; a left-out one the grey dashes.
    for (const g of boxes) {
      const state = g.getAttribute('data-state');
      expect(g.querySelectorAll('rect[fill="#f59e0b"]').length, g.getAttribute('data-box') ?? '').toBe(state === 'repl' ? 1 : 0);
      expect(g.querySelector('rect')?.getAttribute('stroke-dasharray') ?? null, g.getAttribute('data-box') ?? '').toBe(state === 'gone' ? '8 7' : null);
    }
    const lines = (id: string) => [...el.querySelectorAll(`g.arch-box[data-box="${id}"] text`)].map((t) => t.textContent?.trim());
    expect(lines('keys')).toEqual(['Secrets and keys', 'Secret Manager, Cloud KMS', 'This computer: AI keys set by its admin,', 'used only by the model gateway']);
    expect(lines('embed')).toEqual(['Matching ideas', 'Vertex AI, gemini-embedding-001', 'Kept: called online']);
    expect(lines('waf')).toEqual(['Web firewall', 'Cloud Armor (OWASP rules)', 'Not in this demo: no internet traffic']);
    expect(lines('safety')).toEqual(['Safety screens', 'Model Armor, Vision SafeSearch', 'Not in this demo']);
    expect(texts('kiosk-arch-diagram text.lane-t')).toEqual(['Front door and security', 'The app', 'AI', 'Data', 'Operations and release']);
    expect(texts('kiosk-arch-diagram text.lg')).toEqual(['Kept', 'Replaced on this computer', 'Left out of this demo']);
    expect(text('g.arch-box[data-box="visitor"]')).toBe('A visitor’s browser');
    expect(el.textContent).not.toMatch(/laptop/i);
    http.expectNone(() => true);
  });

  it('K208: the diagram in Chinese, product names kept in English', async () => {
    await shown(LocalHost);
    await TestBed.inject(KioskLanguage).setLang('zh');
    fixture.detectChanges();
    const lines = (id: string) => [...el.querySelectorAll(`g.arch-box[data-box="${id}"] text`)].map((t) => t.textContent?.trim());
    expect(lines('keys')).toEqual(['机密与密钥', 'Secret Manager、Cloud KMS', '这台电脑：AI 密钥由它的管理员设置，', '只有模型网关会使用']);
    expect(lines('pics')).toEqual(['图片', 'Vertex AI，gemini-3-pro-image', '保留：在线调用']);
    expect(texts('kiosk-arch-diagram text.lane-t')).toEqual(['入口与安全', '应用', 'AI', '数据', '运维与发布']);
  });

  it('K173: a page opened by its tile, Back first returns to the door (ruling a); one reached by Next, Back goes to the page before; Esc to the hall', async () => {
    for (const [host, scene, before] of [[GovHost, 'gov', 'safety'], [LocalHost, 'local', 'gov']] as const) {
      TestBed.resetTestingModule();
      await shown(host);
      const tour = TestBed.inject(KioskTour);
      quietBeats();
      await tour.openCard('engine');
      store.openScene(scene);
      store.back();
      await vi.waitFor(() => expect(store.scene()).toBe('engine'));
      while (store.scene() !== scene) await tour.next();
      store.back();
      await vi.waitFor(() => expect(store.scene()).toBe(before));
      store.go(scene);
      store.escapeUp();
      expect(store.scene()).toBe('hall');
      store.go(scene);
      fixture.detectChanges();
      expect(el.querySelector('#bottom [data-act="toEngine"]')).toBeNull();
      expect(el.querySelector('#bottom [data-act="next"]')).not.toBeNull();
    }
  });

  it('the presenter can jump to each page built so far', async () => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting(), ...provideKioskI18n(), ...provideLive()] });
    store = TestBed.inject(KioskStore);
    TestBed.runInInjectionContext(() => provideEngineJumps());
    for (const to of ['engine', 'crews', 'safety', 'gov', 'local'] as const) {
      expect(store.canJump(to)).toBe(true);
      store.jumpTo(to);
      expect(store.scene()).toBe(to);
    }
  });
});
