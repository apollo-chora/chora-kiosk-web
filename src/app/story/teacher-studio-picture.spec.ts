import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import type { PictureParams, PictureResult } from '../live/kinds/picture.live';
import type { WordsParams, WordsResult } from '../live/kinds/words.live';
import { KioskLanguage, provideKioskI18n } from '../i18n/i18n';
import { LIVE_EXECUTORS, LiveAvailability, LiveService, type LiveExecutor } from '../live/live.service';
import type { EditableQuestion } from '../shared/components/chora-question-editor/chora-question-editor.model';
import { ATOM, PIC_PROMPT, V1_STEM, jobRead, jobUrl, studioManifest } from './studio-world.testing';
import { PICTURE_LIVE_KEY, TeacherStudio } from './teacher-studio';

// Step 4b (mockup studioBHTML, lines 4343 to 4361; PREPARED-CHOICES.md sections 5.6 and 7): the
// picture chain lives on `draft.h4`'s one draft (K113). Diagram chips are prepared per SET, the
// illustration once, and restyles per (from, to); off a prepared state a chip, a typed change and a
// redo run LIVE picture on V2. "Keep" accepts the 4a draft's job with the picture on screen (K56).
describe('TeacherStudio (step 4b, the picture)', () => {
  let studio: TeacherStudio;
  let http: HttpTestingController;
  let pics: { resolve: (r: PictureResult) => void; reject: (e: unknown) => void; params: PictureParams }[];
  const picture = signal(true);

  beforeEach(async () => {
    pics = [];
    picture.set(true);
    const words: LiveExecutor<WordsParams, WordsResult> = { run: () => new Promise<WordsResult>(() => undefined) };
    const pic: LiveExecutor<PictureParams, PictureResult> = {
      run: (params) => new Promise<PictureResult>((resolve, reject) => pics.push({ resolve, reject, params })),
    };
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        ...provideKioskI18n(),
        { provide: LIVE_EXECUTORS, useValue: { words, picture: pic } },
        { provide: LiveAvailability, useValue: { text: signal(true).asReadonly(), picture: picture.asReadonly() } },
      ],
    });
    studio = TestBed.inject(TeacherStudio);
    http = TestBed.inject(HttpTestingController);
    const done = studio.load();
    http.expectOne('/api/v1/kiosk/prewarm/manifest').flush(studioManifest());
    await vi.waitFor(() => http.expectOne(jobUrl('j-v1')).flush(jobRead('j-v1', V1_STEM)));
    await done;
  });

  afterEach(() => http.verify());

  const url = () => studio.picture()?.imageUrl;
  const livePic = (name: string, mode: 'mermaid' | 'scene'): PictureResult => ({
    regenJobId: `r-live-${name}`,
    imageUrl: `/pictures/live-${name}.png`,
    imageGcsUri: `gs://kiosk/live-${name}.png`,
    mode,
  });

  it('starts on the draft’s own diagram, with the three diagram chips', () => {
    expect(studio.picture()).toEqual({ imageUrl: '/pictures/h4.png', imageGcsUri: 'gs://kiosk/h4.png', mode: 'mermaid', style: 'diagram', set: [], prompt: null });
    expect(studio.pictureChips()).toEqual(['uv', 'where', 'illus']);
    expect(studio.pictureChanged()).toBe(false);
  });

  it('diagram chips are prepared per SET, whatever the order: where, then uv, shows pic.uv.where', async () => {
    await studio.picChip('where');
    expect(url()).toBe('/pictures/pic.where.png');
    // K155 Q3: any picture change, not only the UV step or a restyle.
    expect(studio.pictureChanged()).toBe(true);
    await studio.picChip('uv');
    expect(url()).toBe('/pictures/pic.uv.where.png');
    expect(studio.picture()?.set).toEqual(['uv', 'where']);
    expect(studio.pictureChanged()).toBe(true);
    const revs = studio.revisions();
    expect(revs.map((r) => [r.n, r.part, r.how, r.chip])).toEqual([
      [2, 'b', 'prepared', 'where'],
      [3, 'b', 'prepared', 'uv'],
    ]);
    expect(revs[1].madeAt?.toISOString()).toBe('2026-10-20T06:02:30.000Z');
    expect(studio.pictureUsed()).toEqual(new Set(['uv', 'where']));
  });

  it('the illustration turns the chips into restyles, prepared per (from, to)', async () => {
    await studio.picChip('illus');
    expect(url()).toBe('/pictures/pic.illus.png');
    expect(studio.picture()?.style).toBe('flat');
    expect(studio.pictureChips()).toEqual(['sketch', 'photo']);
    await studio.picChip('sketch');
    expect(url()).toBe('/pictures/pic.illus.sketch.png');
    expect(studio.pictureUsed().has('sketch')).toBe(true);
    await studio.picChip('photo');
    expect(url()).toBe('/pictures/pic.sketch.photo.png');
    await studio.picChip('sketch');
    expect(url()).toBe('/pictures/pic.photo.sketch.png');
    expect(studio.revisions().map((r) => r.chip)).toEqual(['illus', 'sketch', 'photo', 'sketch']);
  });

  it('the style on screen cannot be asked for again', async () => {
    await studio.picChip('illus');
    await studio.picChip('photo');
    await studio.picChip('photo');
    expect(studio.revisions().length).toBe(2);
  });

  it('a typed change to a diagram is LIVE picture: the diagram’s cumulative prompt plus the visitor’s words, the diagram on screen as its source (K150)', async () => {
    await studio.picChip('uv');
    const done = studio.picTyped('  Label each stage  ');
    await vi.waitFor(() => expect(pics.length).toBe(1));
    expect(pics[0].params).toEqual({
      atomId: ATOM,
      jobId: 'j-v1',
      draftId: 'd-j-v1',
      prompt: `${PIC_PROMPT('uv')}\nLabel each stage`,
      mode: 'mermaid',
      sourceImageGcsUri: 'gs://kiosk/pic.uv.png',
    });
    pics[0].resolve(livePic('typed', 'mermaid'));
    await done;
    expect(url()).toBe('/pictures/live-typed.png');
    expect(studio.picture()?.set).toEqual(['uv']);
    const r = studio.revisions()[1];
    expect([r.n, r.part, r.how, r.chip, r.typed]).toEqual([3, 'b', 'live', null, 'Label each stage']);
    expect(studio.picturePrepared()).toBe(false);
  });

  it('a typed change to a scene edits the picture on screen (its source)', async () => {
    await studio.picChip('illus');
    const done = studio.picTyped('Add a rainbow');
    await vi.waitFor(() => expect(pics.length).toBe(1));
    expect(pics[0].params).toMatchObject({ prompt: 'Add a rainbow', mode: 'scene', sourceImageGcsUri: 'gs://kiosk/pic.illus.png' });
    pics[0].resolve(livePic('rainbow', 'scene'));
    await done;
    // W10: the visitor's words decide its style now, so it is a scene of no named style.
    expect(studio.picture()?.style).toBe('scene');
    expect(studio.pictureChips()).toEqual(['sketch', 'photo']);
    expect(studio.pictureUsed()).toEqual(new Set(['illus']));
  });

  it('W10: a typed change from a pencil sketch frees the sketch chip; a failed photo chip then shows a prepared photo', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await studio.picChip('illus');
    await studio.picChip('sketch');
    expect(studio.picture()?.style).toBe('sketch');
    const typed = studio.picTyped('change it to crayon art');
    await vi.waitFor(() => expect(pics.length).toBe(1));
    pics[0].resolve(livePic('crayon', 'scene'));
    await typed;
    expect(studio.picture()?.style).toBe('scene');
    expect(studio.pictureUsed().has('sketch')).toBe(false);
    const done = studio.picChip('photo');
    await vi.waitFor(() => expect(pics.length).toBe(2));
    pics[1].reject(new Error('regenerate r-2 failed'));
    await done;
    expect(url()).toBe('/pictures/pic.illus.photo.png');
    expect(studio.picture()?.style).toBe('photo');
    err.mockRestore();
  });

  describe('K148: a chip always changes the picture', () => {
    // Off a prepared picture a chip is the visitor's typed change in the chip's own English words,
    // exactly what "Send to the AI" sends for those words (never the list's long prompt, which the
    // writer declined against the draft's stem on 19 Oct). A late, failed or declined call shows
    // the chip's prepared picture instead, labelled (K45).
    async function liveTyped(words: string, result: PictureResult): Promise<void> {
      const typed = studio.picTyped(words);
      await vi.waitFor(() => expect(pics.length).toBeGreaterThan(0));
      pics[pics.length - 1].resolve(result);
      await typed;
    }

    /** The request "Send to the AI" makes for these words on the picture now on screen. */
    async function typedRequest(words: string): Promise<PictureParams> {
      const n = pics.length;
      void studio.picTyped(words);
      await vi.waitFor(() => expect(pics.length).toBe(n + 1));
      const params = pics[n].params;
      TestBed.inject(LiveService).stopWaiting();
      pics.splice(n, 1);
      return params;
    }

    it('after a live change a restyle chip sends its own words as a typed change: same request, the style it names', async () => {
      await studio.picChip('illus');
      await liveTyped('Add a rainbow', livePic('rainbow', 'scene'));
      const asTyped = await typedRequest('Make it a pencil sketch');
      const done = studio.picChip('sketch');
      await vi.waitFor(() => expect(pics.length).toBe(2));
      expect(pics[1].params).toEqual(asTyped);
      expect(pics[1].params).toMatchObject({ prompt: 'Make it a pencil sketch', mode: 'scene', sourceImageGcsUri: 'gs://kiosk/live-rainbow.png' });
      pics[1].resolve(livePic('sketch', 'scene'));
      await done;
      expect(studio.picture()?.style).toBe('sketch');
      const r = studio.revisions().slice(-1)[0];
      expect([r.how, r.chip, r.typed]).toEqual(['live', 'sketch', null]);
    });

    it('after a live change a diagram chip adds its words to the diagram’s prompt, as typed words would', async () => {
      await liveTyped('Thicker arrows', livePic('arrows', 'mermaid'));
      const asTyped = await typedRequest('Add the UV step it missed');
      const done = studio.picChip('uv');
      await vi.waitFor(() => expect(pics.length).toBe(2));
      expect(pics[1].params).toEqual(asTyped);
      expect(pics[1].params.prompt).toBe('Thicker arrows\nAdd the UV step it missed');
      pics[1].resolve(livePic('uv', 'mermaid'));
      await done;
      expect(studio.picture()?.set).toEqual(['uv']);
    });

    it('K150: the illustration chip after a live diagram change edits the diagram on screen into a scene, its words alone', async () => {
      await liveTyped('Thicker arrows', livePic('arrows', 'mermaid'));
      const done = studio.picChip('illus');
      await vi.waitFor(() => expect(pics.length).toBe(2));
      expect(pics[1].params).toMatchObject({ prompt: 'Turn it into an illustration', mode: 'scene', sourceImageGcsUri: 'gs://kiosk/live-arrows.png' });
      pics[1].resolve(livePic('illustrated', 'scene'));
      await done;
      expect(url()).toBe('/pictures/live-illustrated.png');
      expect(studio.picture()?.style).toBe('flat');
    });

    it('K150: a live change keeps the stages its job ran, for Behind the scenes', async () => {
      const trace = [{ name: 'render_image', status: 'succeeded', started_at: 'x', completed_at: 'y' }];
      await studio.picChip('illus');
      await liveTyped('Add a rainbow', { ...livePic('rainbow', 'scene'), trace });
      expect(studio.revisions().slice(-1)[0].trace).toEqual(trace);
    });

    it('K150, the owner’s acceptance case: crayon on the picture, then "Make it photorealistic" sends the crayon picture', async () => {
      await studio.picChip('illus');
      const typed = studio.picTyped('change it to crayon art');
      await vi.waitFor(() => expect(pics.length).toBe(1));
      expect(pics[0].params).toMatchObject({ prompt: 'change it to crayon art', mode: 'scene', sourceImageGcsUri: 'gs://kiosk/pic.illus.png' });
      pics[0].resolve(livePic('crayon', 'scene'));
      await typed;
      const done = studio.picChip('photo');
      await vi.waitFor(() => expect(pics.length).toBe(2));
      expect(pics[1].params).toMatchObject({ prompt: 'Make it photorealistic', mode: 'scene', sourceImageGcsUri: 'gs://kiosk/live-crayon.png' });
      pics[1].resolve(livePic('photo', 'scene'));
      await done;
      expect(url()).toBe('/pictures/live-photo.png');
    });

    it('K150: the opening diagram on screen (as after Back or a review) is the source; creation’s 422 NOT_OWN stays loud and visible', async () => {
      const err = vi.spyOn(console, 'error').mockImplementation(() => undefined);
      const typed = studio.picTyped('Label each stage');
      await vi.waitFor(() => expect(pics.length).toBe(1));
      expect(pics[0].params).toMatchObject({ mode: 'mermaid', sourceImageGcsUri: 'gs://kiosk/h4.png' });
      pics[0].reject(new Error('POST /api/atoms/a/question-jobs/j-v1/regenerate-image answered 422 CREATION_REGEN_SOURCE_NOT_OWN'));
      await typed;
      expect(studio.change()).toEqual({ state: 'failed', key: 'live.typedFailed' });
      expect(url()).toBe('/pictures/h4.png');
      expect(err.mock.calls.flat().join(' ')).toContain('CREATION_REGEN_SOURCE_NOT_OWN');
      err.mockRestore();
    });

    it('the chip’s words are English under Chinese too (K41: content is English only)', async () => {
      await TestBed.inject(KioskLanguage).setLang('zh');
      await studio.picChip('illus');
      await liveTyped('Add a rainbow', livePic('rainbow', 'scene'));
      void studio.picChip('photo');
      await vi.waitFor(() => expect(pics.length).toBe(2));
      expect(pics[1].params.prompt).toBe('Make it photorealistic');
      TestBed.inject(LiveService).stopWaiting();
    });

    it('a declined or failed live chip shows the chip’s prepared picture, labelled as the prepared result', async () => {
      const err = vi.spyOn(console, 'error').mockImplementation(() => undefined);
      await studio.picChip('illus');
      await liveTyped('crayon art style', livePic('crayon', 'scene'));
      const done = studio.picChip('photo');
      await vi.waitFor(() => expect(pics.length).toBe(2));
      pics[1].reject(new Error('regenerate r-2 failed: image_regen_author_empty'));
      await done;
      expect(url()).toBe('/pictures/pic.illus.photo.png');
      expect(studio.picture()?.style).toBe('photo');
      expect(studio.picturePrepared()).toBe(true);
      expect(studio.change()).toEqual({ state: 'none' });
      const r = studio.revisions().slice(-1)[0];
      expect([r.how, r.chip, r.madeAt?.toISOString()]).toEqual(['prepared', 'photo', '2026-10-20T06:05:00.000Z']);
      expect(TestBed.inject(LiveService).state(PICTURE_LIVE_KEY)()).toMatchObject({ status: 'missed', reason: 'failed' });
      err.mockRestore();
    });

    it('a late live chip shows the chip’s prepared picture too', async () => {
      await liveTyped('Thicker arrows', livePic('arrows', 'mermaid'));
      vi.useFakeTimers();
      try {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        const done = studio.picChip('where');
        await vi.advanceTimersByTimeAsync(45_000);
        await done;
        expect(url()).toBe('/pictures/pic.where.png');
        expect(studio.picture()?.set).toEqual(['where']);
        expect(TestBed.inject(LiveService).state(PICTURE_LIVE_KEY)()).toMatchObject({ status: 'missed', reason: 'late' });
        warn.mockRestore();
      } finally {
        vi.useRealTimers();
      }
    });

    it('a chip on a prepared picture still shows its prepared picture with no call', async () => {
      await studio.picChip('illus');
      await studio.picChip('photo');
      expect(url()).toBe('/pictures/pic.illus.photo.png');
      expect(pics.length).toBe(0);
    });
  });

  describe('K203 (W87): after the first photo, a pre-filled request for steel tanks', () => {
    const TANKS = 'Show steel tanks and membrane units instead of the glass and sponges';

    it('the photo chip offers the request, keyed to the photo it starts from; nothing before it', async () => {
      expect(studio.tanksOffer()).toBeNull();
      await studio.picChip('illus');
      expect(studio.tanksOffer()).toBeNull();
      await studio.picChip('photo');
      expect(studio.tanksOffer()).toEqual({ prefill: TANKS, key: 'pic.illus.photo.tanks' });
    });

    it('from the pencil sketch it falls back to the sketch photo’s own tanks', async () => {
      await studio.picChip('illus');
      await studio.picChip('sketch');
      await studio.picChip('photo');
      expect(studio.tanksOffer()).toEqual({ prefill: TANKS, key: 'pic.sketch.photo.tanks' });
    });

    it('the pre-fill stays English under Chinese (K41: content is English only)', async () => {
      await TestBed.inject(KioskLanguage).setLang('zh');
      await studio.picChip('illus');
      await studio.picChip('photo');
      expect(studio.tanksOffer()?.prefill).toBe(TANKS);
    });

    it('the unedited pre-fill is LIVE picture with exactly that prompt on the photo; its result ends the offer', async () => {
      await studio.picChip('illus');
      await studio.picChip('photo');
      const done = studio.picTyped(`${TANKS} `);
      await vi.waitFor(() => expect(pics.length).toBe(1));
      expect(pics[0].params).toMatchObject({ prompt: TANKS, mode: 'scene', sourceImageGcsUri: 'gs://kiosk/pic.illus.photo.png' });
      pics[0].resolve(livePic('tanks', 'scene'));
      await done;
      expect(url()).toBe('/pictures/live-tanks.png');
      expect(studio.lastPicture()?.how).toBe('live');
      expect(studio.tanksOffer()).toBeNull();
    });

    it('a missed unedited pre-fill shows its prepared choice, labelled as prepared', async () => {
      const err = vi.spyOn(console, 'error').mockImplementation(() => undefined);
      await studio.picChip('illus');
      await studio.picChip('photo');
      const done = studio.picTyped(TANKS);
      await vi.waitFor(() => expect(pics.length).toBe(1));
      pics[0].reject(new Error('image model busy'));
      await done;
      expect(url()).toBe('/pictures/pic.illus.photo.tanks.png');
      expect(studio.picture()?.style).toBe('photo');
      expect(studio.lastPicture()).toMatchObject({ part: 'b', how: 'prepared', chip: null, typed: TANKS, madeAt: new Date('2026-10-20T06:07:30Z') });
      expect(studio.change().state).toBe('none');
      expect(studio.tanksOffer()).toBeNull();
      err.mockRestore();
    });

    it('an edited request has no fallback: the normal LIVE miss, the photo kept', async () => {
      const err = vi.spyOn(console, 'error').mockImplementation(() => undefined);
      await studio.picChip('illus');
      await studio.picChip('photo');
      const done = studio.picTyped('Show steel tanks instead of the glass');
      await vi.waitFor(() => expect(pics.length).toBe(1));
      pics[0].reject(new Error('image model busy'));
      await done;
      expect(url()).toBe('/pictures/pic.illus.photo.png');
      expect(studio.change()).toMatchObject({ state: 'failed', key: 'live.typedFailed' });
      err.mockRestore();
    });

    it('another chip ends the offer', async () => {
      await studio.picChip('illus');
      await studio.picChip('photo');
      await studio.picChip('sketch');
      expect(studio.tanksOffer()).toBeNull();
    });
  });

  it('with the picture provider off, off-path chips and typed changes do nothing', async () => {
    const typed = studio.picTyped('Thicker arrows');
    await vi.waitFor(() => expect(pics.length).toBe(1));
    pics[0].resolve(livePic('arrows', 'mermaid'));
    await typed;
    picture.set(false);
    expect(studio.canPictureChip()).toBe(false);
    await studio.picChip('uv');
    await studio.picTyped('More');
    expect(pics.length).toBe(1);
  });

  it('K150 part 3: a diagram chip refused with 422 CREATION_REGEN_BASELINE_MISSING shows its prepared picture, and the code is logged', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const typed = studio.picTyped('Thicker arrows');
    await vi.waitFor(() => expect(pics.length).toBe(1));
    pics[0].resolve(livePic('arrows', 'mermaid'));
    await typed;
    const done = studio.picChip('uv');
    await vi.waitFor(() => expect(pics.length).toBe(2));
    expect(pics[1].params).toMatchObject({ mode: 'mermaid', sourceImageGcsUri: 'gs://kiosk/live-arrows.png' });
    pics[1].reject(new Error('POST /api/atoms/a/question-jobs/j-v1/regenerate-image: 422 Unprocessable Entity CREATION_REGEN_BASELINE_MISSING: no Mermaid recorded'));
    await done;
    expect(url()).toBe('/pictures/pic.uv.png');
    expect(TestBed.inject(LiveService).state(PICTURE_LIVE_KEY)()).toMatchObject({ status: 'missed', reason: 'failed' });
    expect(err.mock.calls.flat().join(' ')).toContain('CREATION_REGEN_BASELINE_MISSING');
    err.mockRestore();
  });

  it('K150: a prepared illustration’s redo edits the diagram it was made from (the picture then on screen)', async () => {
    await studio.picChip('illus');
    expect(studio.pictureRedoParams()).toMatchObject({ prompt: PIC_PROMPT('illus'), mode: 'scene', sourceImageGcsUri: 'gs://kiosk/h4.png' });
  });

  it('“Redo it” asks LIVE picture for the last change again, from the picture it was made on', async () => {
    await studio.picChip('illus');
    await studio.picChip('sketch');
    expect(studio.pictureRedoParams()).toEqual({
      atomId: ATOM,
      jobId: 'j-v1',
      draftId: 'd-j-v1',
      prompt: PIC_PROMPT('illus.sketch'),
      mode: 'scene',
      sourceImageGcsUri: 'gs://kiosk/pic.illus.png',
    });
    studio.onPictureRedoOutcome({ status: 'done', kind: 'picture', result: livePic('redo', 'scene'), ms: 9000, at: new Date() });
    expect(url()).toBe('/pictures/live-redo.png');
    expect(studio.picture()?.style).toBe('sketch');
    expect(studio.picturePrepared()).toBe(false);
  });

  // W79: the row's redo is heard from the one LIVE door, so it lands with no row on screen (step 4b left mid-call).
  it('W79: a redo pressed as the LIVE row presses it lands with no row on screen', async () => {
    await studio.picChip('illus');
    await studio.picChip('sketch');
    const press = TestBed.inject(LiveService).press(PICTURE_LIVE_KEY, 'picture', studio.pictureRedoParams());
    await vi.waitFor(() => expect(pics.length).toBe(1));
    pics[0].resolve(livePic('redo', 'scene'));
    await press;
    expect(url()).toBe('/pictures/live-redo.png');
    expect(studio.picture()?.style).toBe('sketch');
    expect(studio.picturePrepared()).toBe(false);
  });

  it('a missed redo keeps the prepared picture', async () => {
    await studio.picChip('uv');
    studio.onPictureRedoOutcome({ status: 'missed', kind: 'picture', reason: 'late', ms: 45_000 });
    expect(url()).toBe('/pictures/pic.uv.png');
    expect(studio.change()).toEqual({ state: 'none' });
  });

  it('a late typed picture change says so', async () => {
    vi.useFakeTimers();
    try {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
      const done = studio.picTyped('More');
      await vi.advanceTimersByTimeAsync(45_000);
      await done;
      expect(studio.change()).toEqual({ state: 'failed', key: 'live.typedLate', params: { s: '45' } });
      warn.mockRestore();
    } finally {
      vi.useRealTimers();
    }
  });

  it('Keep accepts the 4a draft’s job, with its words as overrides and the picture on screen (K56, K113)', async () => {
    studio.startEdit();
    const q = studio.draft()?.question as EditableQuestion;
    studio.saveEdit({ ...q, prompt: 'My stem?', options: [...q.options, { option_id: null, label: 'Ozone', is_correct: false, explainer: '' }] });
    await studio.picChip('uv');
    const done = studio.keep();
    const req = http.expectOne(`${jobUrl('j-v1')}/accept`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({
      accepted_candidates: [
        {
          draft_id: 'd-j-v1',
          prompt_override: 'My stem?',
          mcq_payload_override: {
            options: [
              { option_id: 'o1', label: 'Microfiltration', is_correct: false, explainer: '' },
              { option_id: 'o2', label: 'Reverse osmosis', is_correct: false, explainer: '' },
              { option_id: 'o3', label: 'UV disinfection', is_correct: true, explainer: '' },
              { option_id: 'o4', label: 'Chlorination', is_correct: false, explainer: '' },
              { option_id: '', label: 'Ozone', is_correct: false, explainer: '' },
            ],
          },
          image_url: '/pictures/pic.uv.png',
        },
      ],
    });
    req.flush({ persisted: [{ question_id: 'q-1' }], mana_debited: 0 });
    await done;
    expect(studio.kept()).toEqual({ n: 3 });
  });

  it('Keep is once; a refused Keep says so and keeps nothing', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const done = studio.keep();
    http.expectOne(`${jobUrl('j-v1')}/accept`).flush({ error: { code: 'CREATION_JOB_NOT_REVIEWABLE' } }, { status: 409, statusText: 'Conflict' });
    await done;
    expect(studio.kept()).toBeNull();
    expect(studio.change()).toEqual({ state: 'failed', key: 'hook.loadFailed' });
    err.mockRestore();
  });

  it('a prepared picture that is missing from the manifest fails loud', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    (studio as unknown as { manifestSig: { set: (m: unknown) => void } }).manifestSig.set({
      choice: () => {
        throw new Error('[kiosk] the manifest has no prepared choice pic.uv');
      },
    });
    await studio.picChip('uv');
    expect(studio.change()).toEqual({ state: 'failed', key: 'hook.loadFailed' });
    expect(url()).toBe('/pictures/h4.png');
    err.mockRestore();
  });
});
