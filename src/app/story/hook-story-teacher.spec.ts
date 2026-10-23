import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { provideLive } from '../live/live.providers';
import { HookStory } from './hook-story';
import type { TestRequest } from '@angular/common/http/testing';
import { ALL_PENDING, DESAL, DESAL_IDS, GOAL, NEW_UNDER_DESAL, SERVED, graph, manifest, pendingDto } from './hook-world.testing';
import { jobRead, jobUrl, studioManifest, V1_STEM } from './studio-world.testing';
import { TeacherStudio } from './teacher-studio';

// The story's step 4 moves (mockup toTeacher, dismissSwap, toPicture and hookNext, lines 4492 to
// 4606): "Same you, new hat" first (K34), then the words; the forward arrow gives an untouched 4a
// its prepared change (the first chip) before it moves on to the picture.
describe('HookStory (step 4a, be the teacher)', () => {
  let story: HookStory;
  let studio: TeacherStudio;
  let http: HttpTestingController;

  beforeEach(async () => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting(), ...provideLive()] });
    story = TestBed.inject(HookStory);
    studio = TestBed.inject(TeacherStudio);
    http = TestBed.inject(HttpTestingController);
    const m = manifest();
    const s = studioManifest();
    const done = story.load();
    http.expectOne('/api/v1/kiosk/prewarm/manifest').flush({ ...m, world: { ...m.world, ...s.world }, templates: s.templates, choices: { ...m.choices, ...s.choices } });
    await vi.waitFor(() => http.expectOne(`/api/v1/me/maps/${GOAL}/graph`).flush(graph()));
    await vi.waitFor(() => http.expectOne((r) => r.url === '/api/v1/me/concept-graph/suggestions').flush({ suggestions: ALL_PENDING }));
    await done;
  });

  afterEach(() => {
    story.forget();
    http.verify();
  });

  async function teacher(): Promise<void> {
    story.toTeacher();
    await vi.waitFor(() => http.expectOne(jobUrl('j-v1')).flush(jobRead('j-v1', V1_STEM)));
    await vi.waitFor(() => expect(studio.status()).toBe('ready'));
  }

  it('the teacher’s step opens on “Same you, new hat” and reads the step’s draft', async () => {
    await teacher();
    expect(story.beat()).toBe(4);
    expect(story.sub()).toBe('a');
    expect(story.step()).toBe(5);
    expect(story.swap()).toBe(true);
    expect(story.talkKey()).toBe('h4');
  });

  it('forward: dismisses the interstitial, then gives an untouched 4a its first chip, then moves to the picture', async () => {
    await teacher();
    await story.next();
    expect(story.swap()).toBe(false);
    expect(studio.revisions()).toEqual([]);
    const chip = story.next();
    await vi.waitFor(() => http.expectOne(jobUrl('j-r')).flush(jobRead('j-r', 'Which stage?')));
    await chip;
    expect(studio.revisions().map((r) => [r.how, r.chip])).toEqual([['prepared', 'scenario']]);
    expect(story.sub()).toBe('a');
    await story.next();
    expect(story.sub()).toBe('b');
    expect(story.step()).toBe(6);
    expect(story.maxStep()).toBe(6);
    expect(story.talkKey()).toBe('h4b');
  });

  async function atPicture(): Promise<void> {
    await teacher();
    await story.next();
    const chip = story.next();
    await vi.waitFor(() => http.expectOne(jobUrl('j-r')).flush(jobRead('j-r', 'Which stage?')));
    await chip;
    await story.next();
  }

  it('forward at 4b: an untouched picture gets its first chip, then Keep and continue accepts it and ends the story', async () => {
    await atPicture();
    await story.next();
    expect(studio.revisions().map((r) => [r.part, r.chip])).toEqual([
      ['a', 'scenario'],
      ['b', 'uv'],
    ]);
    expect(story.beat()).toBe(4);
    expect(story.keepPending()).toBe(true);
    const keep = story.next();
    await vi.waitFor(() => http.expectOne(`${jobUrl('j-r')}/accept`).flush({ persisted: [] }));
    await keep;
    expect(studio.kept()).toEqual({ n: 3 });
    expect(story.beat()).toBe(5);
    expect(story.step()).toBe(7);
    expect(story.talkKey()).toBe('h5');
    // The presenter's count of finished stories (mockup visit('hookDone')).
    expect(http.expectOne('/api/v1/kiosk/visits').request.body).toEqual({ event: 'hook_done' });
  });

  it('a refused Keep leaves the visitor on the picture, with the reason shown', async () => {
    await atPicture();
    await story.next();
    const err = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const keep = story.next();
    await vi.waitFor(() => http.expectOne(`${jobUrl('j-r')}/accept`).flush({}, { status: 409, statusText: 'Conflict' }));
    await keep;
    expect(story.beat()).toBe(4);
    expect(studio.change().state).toBe('failed');
    err.mockRestore();
  });

  it('“Continue without keeping” ends the story and keeps nothing', async () => {
    await atPicture();
    await story.next();
    story.continueNoKeep();
    expect(story.beat()).toBe(5);
    expect(studio.kept()).toBeNull();
    http.expectOne('/api/v1/kiosk/visits').flush({});
  });

  /** Answers each real call the story's prepared moves make, until the jump settles. */
  async function answering(done: Promise<void>): Promise<void> {
    const accepted = DESAL_IDS;
    const respond = (r: TestRequest) => {
      const url = r.request.url;
      const accept = /^\/api\/v1\/me\/concept-graph\/suggestions\/([^/]+)\/accept$/.exec(url);
      if (accept) return r.flush({ ...pendingDto(accept[1], DESAL, accept[1]), status: 'accepted' });
      if (url === `/api/v1/me/maps/${GOAL}/graph`) return r.flush(graph(NEW_UNDER_DESAL));
      if (url === '/api/v1/me/concept-graph/suggestions') return r.flush({ suggestions: ALL_PENDING.filter((x) => !accepted.includes(x.suggestionId)) });
      if (url === `/api/v1/me/goals/${GOAL}/campaign/questions`) return r.flush(SERVED);
      if (url === jobUrl('j-v1')) return r.flush(jobRead('j-v1', V1_STEM));
      if (url === jobUrl('j-r')) return r.flush(jobRead('j-r', 'Which stage?'));
      if (url === `${jobUrl('j-r')}/accept`) return r.flush({ persisted: [] });
      if (url === '/api/v1/kiosk/visits') return r.flush({});
      throw new Error(`unexpected call ${r.request.method} ${url}`);
    };
    let settled = false;
    void done.finally(() => (settled = true));
    for (let i = 0; i < 400 && !settled; i++) {
      for (const r of http.match(() => true)) respond(r);
      await new Promise((res) => setTimeout(res, 2));
    }
    await done;
    for (const r of http.match(() => true)) respond(r);
  }

  it('the presenter’s jump to step 5 takes every prepared move from step 1: the words, the picture and Keep', async () => {
    await answering(story.advanceToBeat(5));
    expect(story.beat()).toBe(5);
    expect(story.step()).toBe(7);
    expect(studio.revisions().map((r) => [r.part, r.how, r.chip])).toEqual([
      ['a', 'prepared', 'scenario'],
      ['b', 'prepared', 'uv'],
    ]);
    expect(studio.kept()).toEqual({ n: 3 });
  });

  it('a jump stops when a move makes no progress (a refused Keep is tried once, never again and again)', async () => {
    story.toTeacher();
    await vi.waitFor(() => http.expectOne(jobUrl('j-v1')).flush(jobRead('j-v1', V1_STEM)));
    await vi.waitFor(() => expect(studio.status()).toBe('ready'));
    const err = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const jumping = story.advanceToBeat(5);
    await vi.waitFor(() => http.expectOne(jobUrl('j-r')).flush(jobRead('j-r', 'Which stage?')));
    await vi.waitFor(() => http.expectOne(`${jobUrl('j-r')}/accept`).flush({}, { status: 409, statusText: 'Conflict' }));
    await jumping;
    http.expectNone(`${jobUrl('j-r')}/accept`);
    expect(story.beat()).toBe(4);
    err.mockRestore();
  });

  it('a step reviewed shows no interstitial', async () => {
    await teacher();
    await story.next();
    story.viewStep(2);
    story.viewStep(5);
    expect(story.swap()).toBe(false);
  });

  it('a new visitor’s story forgets the teacher’s draft too', async () => {
    await teacher();
    story.forget();
    expect(studio.status()).toBe('idle');
    expect(studio.draft()).toBeNull();
    expect(story.swap()).toBe(false);
  });
});
