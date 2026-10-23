import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import crews from '../exhibits/engine/crews.recorded.json';
import { KioskLanguage, provideKioskI18n } from '../i18n/i18n';
import campaign from '../live/kinds/campaign-trace.recorded.json';
import { provideLive } from '../live/live.providers';
import { HookStory, QuestionRun } from '../story/hook-story';
import { StudioDraft, StudioPicture, StudioRevision, TeacherStudio } from '../story/teacher-studio';
import { BehindTheScenes, XrayKind } from './behind-the-scenes';
import recorded from './xray.recorded.json';
import { XraySheetComponent } from './xray-sheet.component';

// "Behind the scenes" for one run (K75; mockup xrayHTML kinds q, draft, words and rev): the stages
// from product reads only (API-CONTRACT section 4), recorded from the stack. The crew records no stage
// durations on the kiosk (each row starts and ends at once: the call runs in the parked agent), so a
// row shows the time its stage finished. A model is named by its role and provider; the only model id
// is the image model a prepared picture's run stamped (K72).
const RUN = { live: false, traceId: recorded.xray.trace_id, goalId: 'g-water', conceptId: 'c-ro', rung: 6 } as const;
const XRAY_URL = `/api/v1/kiosk/xray/${RUN.traceId}`;
const DRAFT_JOB = crews.job;
const WORDS_JOB = recorded.words_job;
const draftOf = (jobId: string): StudioDraft => ({ atomId: 'a-newater', jobId, draftId: 'd', question: {} as StudioDraft['question'], critic: null });
const rev = (part: 'a' | 'b', how: StudioRevision['how'], extra: Partial<StudioRevision> = {}): StudioRevision => ({
  n: 2,
  part,
  how,
  chip: null,
  typed: null,
  at: new Date(),
  madeAt: how === 'prepared' ? new Date('2026-10-18T04:50:11Z') : null,
  ...extra,
});

describe('Behind the scenes: the record kinds', () => {
  let http: HttpTestingController;
  let fixture: ComponentFixture<XraySheetComponent>;
  let el: HTMLElement;
  const run = signal<QuestionRun | null>(null);
  const draft = signal<StudioDraft | null>(null);
  const revisions = signal<readonly StudioRevision[]>([]);
  const picture = signal<Pick<StudioPicture, 'mode'> | null>(null);

  async function shown(kind: XrayKind): Promise<void> {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        ...provideKioskI18n(),
        ...provideLive(),
        { provide: HookStory, useValue: { questionRun: run.asReadonly() } },
        { provide: TeacherStudio, useValue: { draft: draft.asReadonly(), revisions: revisions.asReadonly(), picture: picture.asReadonly() } },
      ],
    });
    http = TestBed.inject(HttpTestingController);
    await TestBed.inject(KioskLanguage).ready();
    TestBed.inject(BehindTheScenes).open(kind);
    fixture = TestBed.createComponent(XraySheetComponent);
    el = fixture.nativeElement as HTMLElement;
    fixture.detectChanges();
  }

  async function settle(): Promise<void> {
    for (let i = 0; i < 3; i++) {
      await fixture.whenStable();
      fixture.detectChanges();
    }
  }

  beforeEach(() => {
    run.set(null);
    draft.set(null);
    revisions.set([]);
    picture.set(null);
  });

  const text = (sel: string) => el.querySelector(sel)?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
  const titles = () =>
    [...el.querySelectorAll('.trace li > div > b')].map((b) => [...b.childNodes].filter((n) => n.nodeType === Node.TEXT_NODE).map((n) => n.textContent).join('').trim());
  const subs = () => [...el.querySelectorAll('.trace li > div > span')].map((s) => s.textContent?.trim());
  const times = () => [...el.querySelectorAll('.trace li > .t')].map((s) => s.textContent?.trim());

  it('step 3’s prepared question: the conductor’s xray of its set, the critic’s final word, served from the map', async () => {
    run.set(RUN);
    await shown('q');
    const req = http.expectOne((r) => r.url === XRAY_URL);
    expect(req.request.params.get('kind')).toBe('campaign_set');
    expect(req.request.params.get('goal_id')).toBe('g-water');
    expect(req.request.params.get('concept_id')).toBe('c-ro');
    expect(req.request.params.get('rung')).toBe('6');
    req.flush(recorded.xray);
    await settle();
    expect(text('h2')).toBe('How this question was made');
    expect(titles()).toEqual(['Safety screen (input)', 'Writer AI wrote it', 'Critic AI checked it: Accepted', 'Safety screen (output)', 'Served from your saved practice questions']);
    expect(subs().slice(1, 3)).toEqual(['writer model · Ollama · generate', 'critic model · Ollama · critique']);
    // The second pass's writer and critic (the first was sent back), in Singapore time.
    expect(times()).toEqual(['', '12:40:55', '12:41:01', '', 'just now']);
    expect(el.querySelector('.trace-foot')).not.toBeNull();
  });

  it('a LIVE question: its own set’s trace, said to be written just now; no xray read', async () => {
    run.set({ live: true, trace: campaign.pipeline_trace });
    await shown('q');
    await settle();
    http.expectNone((r) => r.url.startsWith('/api/v1/kiosk/xray'));
    expect(titles().at(-1)).toBe('Written just now, live');
    expect(subs().at(-1)).toBe('You asked for a new question, so the writer and the critic ran again.');
    expect(titles()[2]).toBe('Critic AI checked it: Accepted');
  });

  it('a question whose run is not known reads nothing and says it cannot be shown', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await shown('q');
    await settle();
    expect(text('.msg-error')).not.toBe('');
    expect(el.querySelector('.trace li')).toBeNull();
    expect(err).toHaveBeenCalled();
    err.mockRestore();
  });

  it('a failed xray read says so in place of the stages', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    run.set(RUN);
    await shown('q');
    http.expectOne((r) => r.url === XRAY_URL).flush({ code: 'NOT_READY' }, { status: 503, statusText: 'Unavailable' });
    await settle();
    expect(text('.msg-error')).not.toBe('');
    expect(el.querySelector('.trace li')).toBeNull();
    err.mockRestore();
  });

  it('step 4’s draft: its job’s writer, the diagram drawn by Kroki, the critic’s own note', async () => {
    draft.set(draftOf(DRAFT_JOB.job_id));
    picture.set({ mode: 'mermaid' });
    await shown('draft');
    http.expectOne(`/api/atoms/a-newater/question-jobs/${DRAFT_JOB.job_id}`).flush(DRAFT_JOB);
    await settle();
    expect(text('h2')).toBe('How your change was made');
    expect(titles()).toEqual(['Safety screen (input)', 'Writer AI wrote it', 'Drawn locally (Kroki, offline)', 'Critic AI checked it', 'Safety screen (output)']);
    const note = DRAFT_JOB.pipeline_trace.find((r) => r.name === 'critique')?.notes;
    expect(subs().slice(1, 4)).toEqual(['writer model · Ollama', 'Kroki', note]);
    expect(el.querySelector('.trace li:nth-child(4) > div > span')?.getAttribute('lang')).toBe('en');
    expect(times()).toEqual(['', '12:44:41', '12:44:45', '12:44:45', '']);
  });

  it('a word revision: its own job’s new draft and the critic’s re-check', async () => {
    draft.set(draftOf(WORDS_JOB.job_id));
    revisions.set([rev('a', 'prepared')]);
    await shown('words');
    http.expectOne(`/api/atoms/a-newater/question-jobs/${WORDS_JOB.job_id}`).flush(WORDS_JOB);
    await settle();
    expect(text('h2')).toBe('How the new words were made');
    expect(titles()).toEqual(['Safety screen (input)', 'Writer AI wrote a new draft from your instruction', 'Critic AI re-checked it: Accepted', 'Safety screen (output)']);
    expect(subs().slice(1, 3)).toEqual(['writer model · Ollama · ai_draft', 'critic model · Ollama']);
    expect(times()).toEqual(['', '12:44:59', '12:45:05', '']);
  });

  it('a hand edit: no AI involved, no read and no gateway line', async () => {
    draft.set(draftOf('j-hand'));
    revisions.set([rev('a', 'hand')]);
    await shown('words');
    await settle();
    http.expectNone(() => true);
    expect(titles()).toEqual(['Edited by you, by hand']);
    expect(times()).toEqual(['just now']);
    expect(el.querySelector('.trace-foot')).toBeNull();
  });

  it('a prepared picture restyle: the plan rewritten, the image model its run stamped edited it, at its record’s time', async () => {
    revisions.set([rev('b', 'prepared', { model: 'gemini-3-pro-image' })]);
    picture.set({ mode: 'scene' });
    await shown('rev');
    await settle();
    http.expectNone(() => true);
    expect(titles()).toEqual(['Safety screen at the model gateway', 'Writer AI rewrote the picture’s plan', 'Image model edited the picture']);
    expect(subs().slice(1)).toEqual(['writer model · Ollama', 'gemini-3-pro-image · Google Vertex AI']);
    expect(times()).toEqual(['', '', '12:50:11']);
  });

  it('a LIVE picture names no model id nothing proves ran; a diagram is drawn by Kroki', async () => {
    revisions.set([rev('b', 'live')]);
    picture.set({ mode: 'scene' });
    await shown('rev');
    await settle();
    expect(subs().at(-1)).toBe('Google Vertex AI');
    expect(times().at(-1)).toBe('just now');
    picture.set({ mode: 'mermaid' });
    fixture.detectChanges();
    expect(titles().at(-1)).toBe('Drawn locally (Kroki, offline)');
    expect(subs().at(-1)).toBe('Kroki');
  });

  it('K150: a live direct edit shows only what its job ran: no writer row, the image model at the trace’s time', async () => {
    const step = (name: string, at: string) => ({ name, status: 'succeeded', started_at: at, completed_at: at });
    revisions.set([rev('b', 'live', { trace: [step('render_image', '2026-10-19T05:00:09Z')] })]);
    picture.set({ mode: 'scene' });
    await shown('rev');
    await settle();
    expect(titles()).toEqual(['Safety screen at the model gateway', 'Image model edited the picture']);
    expect(times()).toEqual(['', '13:00:09']);
  });

  it('K150: a live diagram change shows the writer, then the drawing, each at its time', async () => {
    const step = (name: string, at: string) => ({ name, status: 'succeeded', started_at: at, completed_at: at });
    revisions.set([rev('b', 'live', { trace: [step('generate', '2026-10-19T05:00:04Z'), step('render_image', '2026-10-19T05:00:05Z')] })]);
    picture.set({ mode: 'mermaid' });
    await shown('rev');
    await settle();
    expect(titles()).toEqual(['Safety screen at the model gateway', 'Writer AI rewrote the picture’s plan', 'Drawn locally (Kroki, offline)']);
    expect(times()).toEqual(['', '13:00:04', '13:00:05']);
  });
});
