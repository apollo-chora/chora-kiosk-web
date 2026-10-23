import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import type { EditableQuestion } from '../shared/components/chora-question-editor/chora-question-editor.model';
import type { WordsParams, WordsResult } from '../live/kinds/words.live';
import { wordRevisionPrompt } from '../live/kinds/word-revision';
import { LIVE_EXECUTORS, LiveAvailability, LiveService, type LiveExecutor } from '../live/live.service';
import { TeacherStudio, WORDS_LIVE_KEY } from './teacher-studio';
import { ATOM, INSTRUCTION, TEMPLATE, V1_OPTIONS, V1_STEM, candidate, jobRead, jobUrl, opt, studioManifest } from './studio-world.testing';

const R_STEM = 'Which stage destroys germs that slip through the membranes?';
const R_OPTIONS = [opt('o1', 'Microfiltration'), opt('o2', 'Reverse osmosis'), opt('o3', 'UV disinfection', true), opt('o4', 'Sedimentation')];
const FS_STEM = 'Which NEWater stage kills germs that get past the membranes?';

// Step 4a (mockup studioAHTML, lines 4326 to 4342; PREPARED-CHOICES.md sections 5.5 and 7): the
// golden run's draft, each word chip a NEW draft read from the prepared choice for its PATH, a hand
// edit with production's question editor, and once the screen is off a prepared path (a hand edit,
// a typed change or a LIVE redo) every further change runs LIVE words with the same template.
describe('TeacherStudio (step 4a, the words)', () => {
  let studio: TeacherStudio;
  let http: HttpTestingController;
  let pending: { resolve: (r: WordsResult) => void; reject: (e: unknown) => void; params: WordsParams }[];
  const text = signal(true);

  beforeEach(() => {
    pending = [];
    text.set(true);
    const words: LiveExecutor<WordsParams, WordsResult> = {
      run: (params) => new Promise<WordsResult>((resolve, reject) => pending.push({ resolve, reject, params })),
    };
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: LIVE_EXECUTORS, useValue: { words } },
        { provide: LiveAvailability, useValue: { text: text.asReadonly(), picture: signal(true).asReadonly() } },
      ],
    });
    studio = TestBed.inject(TeacherStudio);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  async function loaded(): Promise<void> {
    const done = studio.load();
    http.expectOne('/api/v1/kiosk/prewarm/manifest').flush(studioManifest());
    await vi.waitFor(() => http.expectOne(jobUrl('j-v1')).flush(jobRead('j-v1', V1_STEM)));
    await done;
  }

  async function chip(c: 'scenario' | 'simpler' | 'explain', job: string, stem: string, options = V1_OPTIONS): Promise<void> {
    const done = studio.chip(c);
    await vi.waitFor(() => http.expectOne(jobUrl(job)).flush(jobRead(job, stem, options, { accepted: true, notes: 'Only one option destroys germs now.' })));
    await done;
  }

  const liveDraft = (job: string, prompt: string): WordsResult => ({
    jobId: job,
    draft: candidate(job, prompt) as WordsResult['draft'],
    critic: { accepted: true, notes: 'Clear and fair.' },
    trace: null,
    modelUsed: 'gpt-oss:120b',
  });

  it('v1 is the golden run’s draft, read from its own job, with the critic’s own notes and the record’s time', async () => {
    await loaded();
    expect(studio.status()).toBe('ready');
    const d = studio.draft();
    expect(d?.jobId).toBe('j-v1');
    expect(d?.draftId).toBe('d-j-v1');
    expect(d?.question.prompt).toBe(V1_STEM);
    expect(d?.question.options.map((o) => o.label)).toEqual(['Microfiltration', 'Reverse osmosis', 'UV disinfection', 'Chlorination']);
    expect(d?.critic).toEqual({ accepted: true, notes: 'Option D, chlorination, also destroys germs.' });
    expect(studio.firstPreparedAt()?.toISOString()).toBe('2026-10-20T05:47:30.000Z');
    expect(studio.revisions()).toEqual([]);
    expect(studio.prepared()).toBe(true);
  });

  it('a chip reads the prepared draft for its PATH: f, then f.s (never a draft from another path)', async () => {
    await loaded();
    await chip('scenario', 'j-r', R_STEM, R_OPTIONS);
    expect(studio.draft()?.jobId).toBe('j-r');
    expect(studio.draft()?.question.options[3].label).toBe('Sedimentation');
    expect(studio.draft()?.critic?.notes).toBe('Only one option destroys germs now.');
    await chip('simpler', 'j-rs', FS_STEM, R_OPTIONS);
    expect(studio.draft()?.jobId).toBe('j-rs');
    expect(studio.used()).toEqual(new Set(['scenario', 'simpler']));
    const revs = studio.revisions();
    expect(revs.map((r) => [r.n, r.part, r.how, r.chip])).toEqual([
      [2, 'a', 'prepared', 'scenario'],
      [3, 'a', 'prepared', 'simpler'],
    ]);
    expect(revs[0].madeAt?.toISOString()).toBe('2026-10-20T05:48:20.000Z');
    expect(revs[1].madeAt?.toISOString()).toBe('2026-10-20T05:50:50.000Z');
    expect(revs[1].at).toBeInstanceOf(Date);
    expect(studio.prepared()).toBe(true);
  });

  it('a used chip does nothing a second time', async () => {
    await loaded();
    await chip('scenario', 'j-r', R_STEM, R_OPTIONS);
    await studio.chip('scenario');
    http.expectNone(jobUrl('j-r'));
    expect(studio.revisions().length).toBe(1);
  });

  it('a prepared draft that cannot be read fails loud and leaves the draft on screen', async () => {
    await loaded();
    const err = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const done = studio.chip('explain');
    await vi.waitFor(() => http.expectOne(jobUrl('j-e')).flush('boom', { status: 500, statusText: 'Server Error' }));
    await done;
    expect(studio.change()).toEqual({ state: 'failed', key: 'hook.loadFailed' });
    expect(studio.draft()?.jobId).toBe('j-v1');
    expect(studio.revisions()).toEqual([]);
    expect(studio.used().has('explain')).toBe(false);
    expect(err).toHaveBeenCalled();
    err.mockRestore();
  });

  it('a hand edit is the teacher’s own: a new version, the same job, and the screen leaves the prepared paths', async () => {
    await loaded();
    studio.startEdit();
    expect(studio.editing()).toBe(true);
    const edited: EditableQuestion = { ...(studio.draft()?.question as EditableQuestion), prompt: 'My own stem?' };
    studio.saveEdit(edited);
    expect(studio.editing()).toBe(false);
    expect(studio.draft()?.question.prompt).toBe('My own stem?');
    expect(studio.draft()?.jobId).toBe('j-v1');
    expect(studio.revisions().map((r) => [r.n, r.how])).toEqual([[2, 'hand']]);
    expect(studio.prepared()).toBe(false);
    expect(studio.criticCheckedVersion()).toBe(1);
  });

  it('saving an unchanged or invalid hand edit makes no version', async () => {
    await loaded();
    studio.startEdit();
    studio.saveEdit(studio.draft()?.question as EditableQuestion);
    expect(studio.revisions()).toEqual([]);
    studio.startEdit();
    studio.saveEdit({ ...(studio.draft()?.question as EditableQuestion), prompt: '   ' });
    expect(studio.revisions()).toEqual([]);
    expect(studio.editing()).toBe(true);
    studio.cancelEdit();
    expect(studio.editing()).toBe(false);
    expect(studio.prepared()).toBe(true);
  });

  it('off a prepared path a chip runs LIVE words: the chip’s instruction from the manifest, on the draft on screen', async () => {
    await loaded();
    studio.startEdit();
    const edited: EditableQuestion = { ...(studio.draft()?.question as EditableQuestion), prompt: 'My own stem?' };
    studio.saveEdit(edited);
    const done = studio.chip('explain');
    await vi.waitFor(() => expect(pending.length).toBe(1));
    expect(pending[0].params).toEqual({
      atomId: ATOM,
      questionType: 'mcq',
      prompt: wordRevisionPrompt(TEMPLATE, { prompt: 'My own stem?', mcq_payload: { options: edited.options } }, INSTRUCTION.e),
      imageForStem: false,
    });
    pending[0].resolve(liveDraft('j-live', 'A live stem?'));
    await done;
    http.expectNone(jobUrl('j-e'));
    expect(studio.draft()?.jobId).toBe('j-live');
    expect(studio.draft()?.critic).toEqual({ accepted: true, notes: 'Clear and fair.' });
    expect(studio.revisions().map((r) => [r.n, r.how, r.chip])).toEqual([
      [2, 'hand', null],
      [3, 'live', 'explain'],
    ]);
    expect(studio.criticCheckedVersion()).toBe(3);
    expect(studio.used().has('explain')).toBe(true);
  });

  it('off a prepared path with LIVE off, a chip does nothing', async () => {
    await loaded();
    studio.startEdit();
    studio.saveEdit({ ...(studio.draft()?.question as EditableQuestion), prompt: 'Mine?' });
    text.set(false);
    expect(studio.chipsLive()).toBe(true);
    expect(studio.canChip()).toBe(false);
    await studio.chip('simpler');
    expect(pending.length).toBe(0);
    expect(studio.revisions().length).toBe(1);
  });

  it('a typed change is LIVE words with the visitor’s own instruction', async () => {
    await loaded();
    const done = studio.typed('  Use the word germs only once  ');
    await vi.waitFor(() => expect(pending.length).toBe(1));
    expect(pending[0].params.prompt).toBe(wordRevisionPrompt(TEMPLATE, { prompt: V1_STEM, mcq_payload: { options: V1_OPTIONS } }, 'Use the word germs only once'));
    pending[0].resolve(liveDraft('j-typed', 'Typed stem?'));
    await done;
    expect(studio.draft()?.question.prompt).toBe('Typed stem?');
    const r = studio.revisions()[0];
    expect([r.n, r.how, r.chip, r.typed, r.madeAt]).toEqual([2, 'live', null, 'Use the word germs only once', null]);
    expect(studio.prepared()).toBe(false);
  });

  it('a late typed change says so (it has no prepared twin) and leaves the draft', async () => {
    vi.useFakeTimers();
    try {
      await loaded();
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
      const done = studio.typed('Shorter please');
      await vi.advanceTimersByTimeAsync(45_000);
      await done;
      expect(studio.change()).toEqual({ state: 'failed', key: 'live.typedLate', params: { s: '45' } });
      expect(studio.draft()?.jobId).toBe('j-v1');
      expect(studio.revisions()).toEqual([]);
      expect(studio.prepared()).toBe(true);
      warn.mockRestore();
    } finally {
      vi.useRealTimers();
    }
  });

  it('a failed typed change says so', async () => {
    await loaded();
    const err = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const done = studio.typed('Shorter please');
    await vi.waitFor(() => expect(pending.length).toBe(1));
    pending[0].reject(new Error('job failed'));
    await done;
    expect(studio.change()).toEqual({ state: 'failed', key: 'live.typedFailed' });
    err.mockRestore();
  });

  it('a missed typed change says so in its own line and leaves the row no “Try again” for another change; a prepared chip clears the line', async () => {
    await loaded();
    const live = TestBed.inject(LiveService);
    const err = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const done = studio.typed('Shorter please');
    await vi.waitFor(() => expect(pending.length).toBe(1));
    pending[0].reject(new Error('job failed'));
    await done;
    expect(studio.change()).toEqual({ state: 'failed', key: 'live.typedFailed' });
    // The row's retry would redo the last change, not these words, so the miss is not left on it (K189 (3)).
    expect(live.state(WORDS_LIVE_KEY)()).toBeUndefined();
    await chip('scenario', 'j-r', R_STEM, R_OPTIONS);
    expect(live.state(WORDS_LIVE_KEY)()).toBeUndefined();
    expect(studio.change()).toEqual({ state: 'none' });
    err.mockRestore();
  });

  it('an empty typed change does nothing', async () => {
    await loaded();
    await studio.typed('   ');
    expect(pending.length).toBe(0);
  });

  it('“Redo it” asks LIVE words for the last change again, from the draft it was made on', async () => {
    await loaded();
    await chip('scenario', 'j-r', R_STEM, R_OPTIONS);
    expect(studio.redoParams()).toEqual({
      atomId: ATOM,
      questionType: 'mcq',
      prompt: wordRevisionPrompt(TEMPLATE, { prompt: V1_STEM, mcq_payload: { options: V1_OPTIONS } }, INSTRUCTION.r),
      imageForStem: false,
    });
    studio.onRedoOutcome({ status: 'done', kind: 'words', result: liveDraft('j-redo', 'Redone stem?'), ms: 900, at: new Date() });
    expect(studio.draft()?.jobId).toBe('j-redo');
    expect(studio.revisions().map((r) => [r.n, r.how, r.chip])).toEqual([
      [2, 'prepared', 'scenario'],
      [3, 'live', 'scenario'],
    ]);
    expect(studio.prepared()).toBe(false);
  });

  // W79: the row's redo is heard from the one LIVE door, so it lands with no row on screen (step 4a left
  // mid-call); the studio's own presses (chips, typed changes) apply their results once, as before.
  it('W79: a redo pressed as the LIVE row presses it lands with no row on screen, once', async () => {
    await loaded();
    await chip('scenario', 'j-r', R_STEM, R_OPTIONS);
    const press = TestBed.inject(LiveService).press(WORDS_LIVE_KEY, 'words', studio.redoParams());
    await vi.waitFor(() => expect(pending.length).toBe(1));
    pending[0].resolve(liveDraft('j-redo', 'Redone stem?'));
    await press;
    expect(studio.draft()?.jobId).toBe('j-redo');
    expect(studio.revisions().map((r) => [r.n, r.how, r.chip])).toEqual([
      [2, 'prepared', 'scenario'],
      [3, 'live', 'scenario'],
    ]);
  });

  it('W79: a typed change after a chip is applied once, as the studio’s own press, never also as the row’s redo of the chip', async () => {
    await loaded();
    await chip('scenario', 'j-r', R_STEM, R_OPTIONS);
    const done = studio.typed('Shorter please');
    await vi.waitFor(() => expect(pending.length).toBe(1));
    pending[0].resolve(liveDraft('j-typed', 'Typed stem?'));
    await done;
    expect(studio.revisions().map((r) => [r.n, r.how, r.chip, r.typed])).toEqual([
      [2, 'prepared', 'scenario', null],
      [3, 'live', null, 'Shorter please'],
    ]);
  });

  it('a missed redo keeps the prepared result (the LIVE row labels it, K45)', async () => {
    await loaded();
    await chip('scenario', 'j-r', R_STEM, R_OPTIONS);
    studio.onRedoOutcome({ status: 'missed', kind: 'words', reason: 'late', ms: 45_000 });
    expect(studio.draft()?.jobId).toBe('j-r');
    expect(studio.revisions().length).toBe(1);
    expect(studio.change()).toEqual({ state: 'none' });
    expect(studio.prepared()).toBe(true);
  });

  it('there is no redo after a hand edit, or before any change', async () => {
    await loaded();
    expect(studio.redoParams()).toBeNull();
    studio.startEdit();
    studio.saveEdit({ ...(studio.draft()?.question as EditableQuestion), prompt: 'Mine?' });
    expect(studio.redoParams()).toBeNull();
  });

  it('the LIVE key is the words kind’s, one for the step', () => {
    expect(WORDS_LIVE_KEY.startsWith('words:')).toBe(true);
  });

  it('a new visitor starts on a fresh read', async () => {
    await loaded();
    await chip('scenario', 'j-r', R_STEM, R_OPTIONS);
    studio.forget();
    expect(studio.status()).toBe('idle');
    expect(studio.draft()).toBeNull();
    expect(studio.revisions()).toEqual([]);
    expect(studio.used().size).toBe(0);
    expect(studio.prepared()).toBe(true);
  });
});
