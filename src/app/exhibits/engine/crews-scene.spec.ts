import { NgTemplateOutlet } from '@angular/common';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Component, inject, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import list from '../../../../kiosk/world/prepared-choices.json';
import type { ConceptSuggestion } from '../../aplus/discovery-graph/concept-graph.model';
import { KioskLanguage, provideKioskI18n } from '../../i18n/i18n';
import { MANIFEST_FORMAT, type ManifestChoiceWire, type PrewarmManifestWire } from '../../kiosk-api/manifest.service';
import type { WordRevisionTemplate } from '../../live/kinds/word-revision';
import { provideLive } from '../../live/live.providers';
import { VisitDecisions } from '../../shared/sugg/visit-decisions';
import { VisitTally } from '../../shared/visit-tally';
import { FooterSlot } from '../../shell/footer-slot';
import { KioskStore } from '../../shell/kiosk.store';
import { quietBeats } from '../../shell/tour/tour.testing';
import { StudioRevision, TeacherStudio } from '../../story/teacher-studio';
import { CrewsSceneComponent } from './crews-scene.component';
import { provideEngineJumps } from './engine-jumps';
import recorded from './crews.recorded.json';

@Component({ imports: [CrewsSceneComponent, NgTemplateOutlet], template: `<kiosk-crews-scene /><footer id="bottom"><ng-container [ngTemplateOutlet]="footer()" /></footer>` })
class CrewsHost {
  protected readonly footer = inject(FooterSlot).template;
}

const MANIFEST_URL = '/api/v1/kiosk/prewarm/manifest';
const CHOICES = recorded.choices as unknown as Record<string, ManifestChoiceWire>;
const JOB_URL = `/api/atoms/${recorded.job.atom_id}/question-jobs/${recorded.job.job_id}`;
const WIRE: PrewarmManifestWire = {
  format: MANIFEST_FORMAT,
  made_at: '2026-10-18T05:16:18Z',
  commit: 'c',
  list_sha256: 'l',
  world: {},
  templates: { word_revision: list.templates.word_revision as WordRevisionTemplate },
  choices: CHOICES,
};

// "Agent crews at work" (mockup SCENES.crews, line 5935; K8, K15, K21, K40, K72, K81, K82, K101): the
// crew diagram with the guardrail drawn dashed and simulated, the prepared run's timeline from its own
// records (recorded from the stack), this demo session's tally, and the decision log row said to be a
// snapshot of a past log. No LIVE button (K81).
describe('Agent crews at work', () => {
  let http: HttpTestingController;
  let fixture: ComponentFixture<CrewsHost>;
  let el: HTMLElement;
  let store: KioskStore;
  const revisions = signal<readonly StudioRevision[]>([]);

  async function shown(): Promise<void> {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        ...provideKioskI18n(),
        ...provideLive(),
        { provide: TeacherStudio, useValue: { revisions: revisions.asReadonly() } },
      ],
    });
    http = TestBed.inject(HttpTestingController);
    store = TestBed.inject(KioskStore);
    await TestBed.inject(KioskLanguage).ready();
    fixture = TestBed.createComponent(CrewsHost);
    el = fixture.nativeElement as HTMLElement;
    fixture.detectChanges();
  }

  async function settle(): Promise<void> {
    for (let i = 0; i < 4; i++) {
      await fixture.whenStable();
      fixture.detectChanges();
    }
  }

  async function records(job: object = recorded.job): Promise<void> {
    http.expectOne(MANIFEST_URL).flush(WIRE);
    await settle();
    http.expectOne(JOB_URL).flush(job);
    await settle();
  }

  beforeEach(() => revisions.set([]));

  const text = (sel: string) => el.querySelector(sel)?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
  const texts = (sel: string) => [...el.querySelectorAll(sel)].map((n) => n.textContent?.replace(/\s+/g, ' ').trim() ?? '');

  it('the diagram: the orchestrator, both crews with their agents, one gateway, the simulated guardrail and both providers', async () => {
    await shown();
    await records();
    expect(text('.ex-head .crumb')).toBe('Engine Room · Agent crews');
    expect(text('.ex-head h2')).toBe('Agent crews at work');
    const svg = el.querySelector('.crew-diagram svg') as SVGSVGElement;
    expect(svg.getAttribute('viewBox')).toBe('0 0 816 570');
    const words = texts('.crew-diagram svg text');
    for (const w of ['Orchestrator', 'Authoring crew', 'Grading crew', 'Writer AI', 'qgen_question', 'Critic AI', 'qgen_critic', 'Renderer', 'qgen_renderer', 'Evaluator AI', 'oe_evaluator', 'Moderator AI', 'oe_moderator', 'Model gateway', 'Text models via Ollama', 'Images via Google Vertex AI']) {
      expect(words, w).toContain(w);
    }
    // K15, K40: the guardrail sits on the gateway's path to every model, dashed and said to be simulated.
    expect(words).toContain('Runtime guardrail: Cloud Model Armor');
    expect(words).toContain('Simulated on local: not enabled for this demo');
    expect(el.querySelectorAll('.crew-diagram svg rect[stroke-dasharray]')).toHaveLength(1);
    // K72: the image box names the model the illustration's own run stamped.
    expect(words).toContain('gemini-3-pro-image');
    expect(el.querySelector('[data-act="live"], .live-row')).toBeNull();
  });

  it('the timeline: the simulated screens, then the prepared run at its records’ own times, then this session', async () => {
    await shown();
    await records();
    expect(text('.timeline h4')).toBe('The prepared run, then this demo session');
    expect(texts('.tl li code')).toEqual(['', '12:38:47', '12:44:41', '12:44:45', '12:44:45', '12:50:11', 'just now']);
    expect(texts('.tl li > span').slice(1, 6)).toEqual(['Suggestions generated', 'Question written', 'Question checked: accepted', 'Diagram drafted and drawn', 'Illustration drawn']);
    const first = el.querySelector('.tl li') as HTMLElement;
    expect(first.classList.contains('sim')).toBe(true);
    expect(first.textContent).toContain('Safety screens (input and output)');
    expect(text('.tl li:first-child .tag-sim')).toBe('Simulated on local');
    expect(text('.tl li:last-child > span')).toBe('This demo session so far · ideas added: 0 · answers: 0 · revisions: 0');
  });

  it('the session’s row counts the ideas added, the answers graded and the revisions made, live', async () => {
    await shown();
    await records();
    const s = (id: string) => ({ suggestionId: id, title: id }) as unknown as ConceptSuggestion;
    const decisions = TestBed.inject(VisitDecisions);
    decisions.record(s('a'), 'accept');
    decisions.record(s('b'), 'accept');
    decisions.record(s('c'), 'dismiss');
    TestBed.inject(VisitTally).answered(3);
    revisions.set([{ n: 2, part: 'a', how: 'live', chip: null, typed: null, at: new Date(), madeAt: null }]);
    fixture.detectChanges();
    expect(text('.tl li:last-child > span')).toBe('This demo session so far · ideas added: 2 · answers: 3 · revisions: 1');
  });

  it('the decision log row says it is a snapshot of a past log (K82), its reason in English in every language (K41)', async () => {
    await shown();
    await records();
    expect(text('.decision h4')).toBe('Decision log row');
    expect(text('.decision .snap-note')).toBe('A snapshot of a past log, not live.');
    expect(el.querySelector('.decision .snap-note .clock')).not.toBeNull();
    expect(texts('.decision .kv b')).toEqual(['Decision', 'Reason', 'Hash chain', 'Trace']);
    expect(text('.decision .badge.ok')).toBe('Accepted');
    await TestBed.inject(KioskLanguage).setLang('zh');
    fixture.detectChanges();
    const reason = el.querySelector('.decision [lang="en"]') as HTMLElement;
    expect(reason.textContent?.trim()).toBe('Stem is unambiguous, one option is correct, the distractors are plausible.');
    expect(text('.ex-head h2')).not.toBe('Agent crews at work');
  });

  it('a record it cannot read says so in place of the timeline, and never shows a made-up time', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await shown();
    await records({ ...recorded.job, pipeline_trace: recorded.job.pipeline_trace.filter((r) => r.name !== 'generate') });
    expect(el.querySelector('.tl')).toBeNull();
    expect(text('.timeline .msg-error')).not.toBe('');
    expect(err.mock.calls.flat().join(' ')).toMatch(/crews timeline.*no completed generate row/);
    err.mockRestore();
  });

  it('K173: Back returns to the door (the page before it), Esc to the hall; the presenter can jump here', async () => {
    await shown();
    TestBed.runInInjectionContext(() => provideEngineJumps());
    quietBeats();
    store.go('crews');
    store.back();
    await vi.waitFor(() => expect(store.scene()).toBe('engine'));
    store.go('crews');
    store.escapeUp();
    expect(store.scene()).toBe('hall');
    store.go('crews');
    fixture.detectChanges();
    expect(el.querySelector('#bottom [data-act="toEngine"]')).toBeNull();
    expect(store.canJump('crews')).toBe(true);
    store.jumpTo('crews');
    expect(store.scene()).toBe('crews');
  });

  it('the session’s answers are forgotten when the demo session ends', async () => {
    await shown();
    TestBed.runInInjectionContext(() => provideEngineJumps());
    const tally = TestBed.inject(VisitTally);
    tally.answered(2);
    // The forgetters run before the reset is asked for; the reset itself is the store's own spec.
    void store.endSession();
    expect(tally.answers()).toBe(0);
  });
});
