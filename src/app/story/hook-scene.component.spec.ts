import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { signal, type Provider } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { KioskLanguage, provideKioskI18n } from '../i18n/i18n';
import { provideLive } from '../live/live.providers';
import { LIVE_EXECUTORS, LiveAvailability, LiveService } from '../live/live.service';
import { FooterSlot } from '../shell/footer-slot';
import { KioskStore } from '../shell/kiosk.store';
import { HookSceneComponent } from './hook-scene.component';
import { HookStory } from './hook-story';
import { ALL_PENDING, DESAL, DESAL_IDS, GOAL, NEWATER, NEW_UNDER_DESAL, ROOT, SERVED, graph, manifest, pendingDto, sugg } from './hook-world.testing';
import { BehindTheScenes } from '../xray/behind-the-scenes';
import { VISIT_RANDOM } from '../shared/visit-order';
import { keepServedOrder, seededRandom } from '../shared/visit-order.testing';

// The hook's steps 1 to 3 on screen (mockup SCENES.hook, 4408 to 4432): production's lens with the
// kiosk's glow (K37), the caption, the drawer kept to K36, the footer and the presenter's talk key.
describe('HookSceneComponent (steps 1 to 3)', () => {
  let http: HttpTestingController;
  let fixture: ComponentFixture<HookSceneComponent>;
  let el: HTMLElement;

  async function settle(): Promise<void> {
    for (let i = 0; i < 4; i++) {
      await Promise.resolve();
      fixture.detectChanges();
    }
  }

  /** `seed`: K149's draw from a seeded source; without one, the options keep the serve door's order. `extra` overrides a provider. */
  async function shown(m = manifest(), seed?: number, pending: unknown[] = ALL_PENDING, g: object = graph(), extra: Provider[] = []): Promise<void> {
    const order = seed === undefined ? keepServedOrder() : [{ provide: VISIT_RANDOM, useValue: seededRandom(seed) }];
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting(), ...provideKioskI18n(), ...provideLive(), ...order, ...extra] });
    http = TestBed.inject(HttpTestingController);
    await TestBed.inject(KioskLanguage).ready();
    TestBed.inject(KioskStore).go('hook');
    fixture = TestBed.createComponent(HookSceneComponent);
    el = fixture.nativeElement as HTMLElement;
    fixture.detectChanges();
    http.expectOne('/api/v1/kiosk/prewarm/manifest').flush(m);
    await vi.waitFor(() => http.expectOne(`/api/v1/me/maps/${GOAL}/graph`).flush(g));
    await vi.waitFor(() => http.expectOne((r) => r.url === '/api/v1/me/concept-graph/suggestions').flush({ suggestions: pending }));
    await vi.waitFor(() => expect(TestBed.inject(HookStory).status()).toBe('ready'));
    await settle();
  }

  const text = (sel: string) => el.querySelector(sel)?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
  const text2 = (n: Element | null) => n?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
  const glowing = () => [...el.querySelectorAll('.lens-node')].filter((n) => n.querySelector('.lens-glow')).map((n) => n.getAttribute('data-id'));
  const click = (sel: string) => (el.querySelector(sel) as HTMLElement).dispatchEvent(new MouseEvent('click', { bubbles: true }));

  afterEach(() => TestBed.inject(HookStory).forget());

  it('step 1: production’s lens on the learner’s map, only Desalination glowing (K139), the caption and the footer', async () => {
    await shown();
    expect(el.querySelector('#lenshost chora-aplus-concept-lens-map')).not.toBeNull();
    expect(glowing()).toEqual([DESAL]);
    expect(text('#caption h2')).toBe('This is a learner’s own map');
    expect(text('#caption p')).toContain('One won idea is glowing: their Companion has new ideas waiting there.');
    expect(text('#caption .hint')).toContain('Click the glowing idea');
    expect(el.querySelector('#panel')?.classList.contains('open')).toBe(false);
    expect(TestBed.inject(FooterSlot).template()).not.toBeNull();
    expect(TestBed.inject(KioskStore).talkKey()).toBe('h1');
  });

  it('a won idea holding only hidden batches never reaches the lens: no glow, no fog ghost, and a click opens nothing (K139, K64)', async () => {
    await shown();
    const ghosts = () => [...el.querySelectorAll('[data-testid^="lens-fog-ghost-"]')].map((g) => g.getAttribute('data-testid')?.replace('lens-fog-ghost-', ''));
    expect(ghosts().sort()).toEqual([...DESAL_IDS].sort());
    expect(glowing()).not.toContain(NEWATER);
    expect(glowing()).not.toContain(ROOT);
    click(`[data-id="${NEWATER}"]`);
    await settle();
    expect(TestBed.inject(HookStory).beat()).toBe(1);
    expect(el.querySelector('#panel')?.classList.contains('open')).toBe(false);
  });

  const titles = () => [...el.querySelectorAll('#panel .sugg-row b > bdi')].map((b) => text2(b));
  const acts = () => [...el.querySelectorAll('#panel .sugg-row')].map((r) => [...r.querySelectorAll('.acts [data-act]')].map((b) => b.getAttribute('data-act')).join(' '));
  const accept = (id: string) =>
    vi.waitFor(() => http.expectOne(`/api/v1/me/concept-graph/suggestions/${id}/accept`).flush({ ...pendingDto(id, DESAL, id), status: 'accepted' }));

  it('step 2: the glowing idea opens Pingu’s six as one list, each with its own Add (K189 (1)); Next waits for Reverse osmosis', async () => {
    await shown();
    click(`[data-id="${DESAL}"]`);
    await settle();
    expect(text('#caption h2')).toBe('Pingu, your Companion, suggests three ideas');
    expect(text('[data-act="accept"]')).toBe('Add all three to my map');
    expect(text('#caption .wait-ro')).toBe('Add Reverse osmosis to go on: step 3 asks you a question about it.');
    expect(el.querySelector('#caption [data-act="skip"]')).not.toBeNull();
    expect(el.querySelector('#panel')?.classList.contains('open')).toBe(true);
    expect(text('#panel .kd-title')).toBe('Desalination');
    expect(titles()).toEqual(['Seawater intake', 'Reverse osmosis', 'Energy use']);
    // No Dismiss in step 2: a dismissed Reverse osmosis would keep the story from step 3 (R2).
    expect(acts()).toEqual(['suggAccept', 'suggAccept', 'suggAccept']);
    expect(text('#panel .kd-sub')).toBe('Pingu suggests');
    expect(TestBed.inject(HookStory).nextWaits()).toBe(true);
    expect(TestBed.inject(KioskStore).talkKey()).toBe('h2');
    await TestBed.inject(KioskLanguage).setLang('zh');
    await settle();
    expect(text('#caption .wait-ro')).toBe('加入“Reverse osmosis”才能继续：第 3 步会就它问你一道题。');
  });

  /** The manifest with Desalination's visible batch holding the given suggestions (the rest of the world unchanged). */
  const withDesalBatch = (ids: string[]) => {
    const m = manifest();
    return { ...m, choices: { ...m.choices, 'sugg.water.desal': sugg('d', DESAL, ids, ids.map((id) => `Idea ${id}`)) } };
  };

  it('step 2 states the batch’s real count (K138 W3): six ideas, in English and in Chinese', async () => {
    await shown(withDesalBatch([...DESAL_IDS, 's-x1', 's-x2', 's-x3']), undefined, [...ALL_PENDING, ...['s-x1', 's-x2', 's-x3'].map((id) => pendingDto(id, DESAL, `Idea ${id}`))]);
    click(`[data-id="${DESAL}"]`);
    await settle();
    expect(text('#caption h2')).toBe('Pingu, your Companion, suggests six ideas');
    expect(text('[data-act="accept"]')).toBe('Add all six to my map');
    await TestBed.inject(KioskLanguage).setLang('zh');
    await settle();
    expect(text('#caption h2')).toBe('你的学习伙伴 Pingu 推荐了六个概念');
    expect(text('[data-act="accept"]')).toBe('把六个概念全部加入我的地图');
  });

  it('step 2 with a batch of one says one idea, and the button adds it', async () => {
    await shown(withDesalBatch([DESAL_IDS[0]]));
    click(`[data-id="${DESAL}"]`);
    await settle();
    expect(text('#caption h2')).toBe('Pingu, your Companion, suggests one idea');
    expect(text('[data-act="accept"]')).toBe('Add it to my map');
    await TestBed.inject(KioskLanguage).setLang('zh');
    await settle();
    expect(text('#caption h2')).toBe('你的学习伙伴 Pingu 推荐了一个概念');
    expect(text('[data-act="accept"]')).toBe('加入我的地图');
  });

  it('K189 (1): an idea’s own Add takes it off the list; "Add all" then counts what still waits; Reverse osmosis on the map opens Next', async () => {
    await shown();
    click(`[data-id="${DESAL}"]`);
    await settle();
    (el.querySelectorAll('#panel [data-act="suggAccept"]')[0] as HTMLButtonElement).click();
    await accept('s-sea');
    await vi.waitFor(() => http.expectOne(`/api/v1/me/maps/${GOAL}/graph`).flush(graph([NEW_UNDER_DESAL[0]])));
    await vi.waitFor(() => http.expectOne((r) => r.url === '/api/v1/me/concept-graph/suggestions').flush({ suggestions: ALL_PENDING.filter((x) => x.suggestionId !== 's-sea') }));
    await settle();
    expect(titles()).toEqual(['Reverse osmosis', 'Energy use']);
    expect(text('[data-act="accept"]')).toBe('Add two of Pingu’s ideas to my map');
    expect(el.querySelector('#caption [data-act="skip"]')).toBeNull();
    (el.querySelectorAll('#panel [data-act="suggAccept"]')[0] as HTMLButtonElement).click();
    await accept('s-rod');
    await vi.waitFor(() => http.expectOne(`/api/v1/me/maps/${GOAL}/graph`).flush(graph(NEW_UNDER_DESAL.slice(0, 2))));
    await vi.waitFor(() => http.expectOne((r) => r.url === '/api/v1/me/concept-graph/suggestions').flush({ suggestions: ALL_PENDING.filter((x) => !['s-sea', 's-rod'].includes(x.suggestionId)) }));
    await settle();
    expect(titles()).toEqual(['Energy use']);
    expect(text('[data-act="accept"]')).toBe('Add Energy use to my map');
    expect(el.querySelector('#caption .wait-ro')).toBeNull();
    expect(TestBed.inject(HookStory).nextWaits()).toBe(false);
    await TestBed.inject(KioskLanguage).setLang('zh');
    await settle();
    expect(text('[data-act="accept"]')).toBe('把“Energy use”加入我的地图');
  });

  it('K190: with Desalination full, its rows are greyed, "Add all" is gone, and the card says Next skips step 3', async () => {
    const six = ['k1', 'k2', 'k3', 'k4', 'k5', 'k6'].map((k) => ({ id: `c-${k}`, title: `Kid ${k}`, under: DESAL }));
    await shown(manifest(), undefined, ALL_PENDING, graph(six));
    click(`[data-id="${DESAL}"]`);
    await settle();
    expect([...el.querySelectorAll('#panel .sugg-row')].map((r) => text2(r.querySelector('.sugg-state')))).toEqual(Array(3).fill('No room: an idea holds six at most'));
    expect(el.querySelector('#panel .acts')).toBeNull();
    expect(el.querySelector('#caption [data-act="accept"]')).toBeNull();
    expect(el.querySelector('#caption .wait-ro')).toBeNull();
    expect(text('#caption .full-skip')).toBe('Desalination already holds six ideas, so Reverse osmosis cannot join: Next skips step 3 and goes on to step 4.');
    await TestBed.inject(KioskLanguage).setLang('zh');
    await settle();
    expect(text('#caption .full-skip')).toBe('“Desalination”下已经有六个概念，“Reverse osmosis”无法加入：按“下一步”会跳过第 3 步，直接进入第 4 步。');
  });

  it('step 2’s drawer carries the LIVE row; a missed press’s prepared fresh ideas join the top of the one list, Add alone (K64)', async () => {
    await shown();
    click(`[data-id="${DESAL}"]`);
    await settle();
    const row = el.querySelector('#panel kiosk-live-row .live-row');
    expect(row?.getAttribute('data-live')).toBe(`sugg:hook:${DESAL}`);
    expect(text('#panel .live-btn .live-label')).toBe('Ask Pingu for fresh ideas');
    expect(text('#panel .live-row .stamp')).toBe('Prepared 20 Oct, 13:31');
    TestBed.inject(HookStory).onSuggOutcome({ status: 'missed', kind: 'sugg', reason: 'late', ms: 20000 });
    await settle();
    expect(el.querySelector('#panel .sugg-fresh')).toBeNull();
    expect(titles()).toEqual(['Brine discharge', 'Tuas plant', 'Seawater intake', 'Reverse osmosis', 'Energy use']);
    expect(acts()).toEqual(['freshAccept', 'freshAccept', 'suggAccept', 'suggAccept', 'suggAccept']);
    // A prepared batch, never tagged live (K101).
    expect(el.querySelector('#panel .sugg-live')).toBeNull();
  });

  it('gap (b): a missed press stamps Pingu’s batch at its time, the miss, then the hidden batch it shows at its own time', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const m = manifest();
    (m.choices['fresh.water.desal'] as { prepared_at: string }).prepared_at = '2026-10-20T05:34:20Z';
    await shown(m, undefined, ALL_PENDING, graph(), [
      { provide: LIVE_EXECUTORS, useValue: { sugg: { run: () => Promise.reject(new Error('explorer failed')) } } },
      { provide: LiveAvailability, useValue: { text: signal(true).asReadonly(), picture: signal(true).asReadonly(), reader: signal(true).asReadonly() } },
    ]);
    click(`[data-id="${DESAL}"]`);
    await settle();
    click('#panel kiosk-live-row [data-act="live"]');
    await vi.waitFor(() => expect(TestBed.inject(LiveService).state(`sugg:hook:${DESAL}`)()?.status).toBe('missed'));
    await settle();
    expect(titles().slice(0, 2)).toEqual(['Brine discharge', 'Tuas plant']);
    expect([...el.querySelectorAll('#panel kiosk-live-row .stamp')].map(text2)).toEqual([
      'Prepared 20 Oct, 13:31',
      'Showing the prepared result: the live call failed',
      'Prepared 20 Oct, 13:34',
    ]);
  });

  it('K189 (2): a LIVE press’s ideas join the top of the list with the LIVE tag, its links dropped (W62)', async () => {
    await shown();
    click(`[data-id="${DESAL}"]`);
    await settle();
    const link = { suggestionId: 's-link', kind: 'edge', status: 'pending', sourceConceptId: NEWATER, targetConceptId: 'c-elsewhere', class: 'lateral', focalConceptId: DESAL, rationale: 'why linked', createdAt: '2026-10-20T05:40:00Z' };
    TestBed.inject(HookStory).onSuggOutcome({ status: 'done', kind: 'sugg', ms: 900, at: new Date(), result: { status: 'ready', requestId: 'r1', suggestions: [pendingDto('s-live', DESAL, 'Brine recovery'), link] } });
    await settle();
    expect(titles()).toEqual(['Brine recovery', 'Seawater intake', 'Reverse osmosis', 'Energy use']);
    expect([...el.querySelectorAll('#panel .sugg-row')].map((r) => text2(r.querySelector('.sugg-live')))).toEqual(['LIVE', '', '', '']);
    expect(el.querySelector('#panel')?.textContent).not.toContain('an idea not on this map');
  });

  it('K157: step 2’s fresh idea already on the map reads "On your map" (the owner saw Desalination offered as new)', async () => {
    await shown();
    click(`[data-id="${DESAL}"]`);
    await settle();
    TestBed.inject(HookStory).onSuggOutcome({ status: 'done', kind: 'sugg', ms: 900, at: new Date(), result: { status: 'ready', requestId: 'r1', suggestions: [pendingDto('s-again', DESAL, 'Desalination'), pendingDto('s-live', DESAL, 'Brine recovery')] } });
    await settle();
    expect([...el.querySelectorAll('#panel .sugg-row')].slice(0, 2).map((r) => [text2(r.querySelector('.sugg-kind')), r.classList.contains('dup')])).toEqual([
      ['On your map', true],
      ['New concept', false],
    ]);
  });

  it('K157 "empty": step 2’s LIVE press with nothing new says so plainly, never the hidden batch', async () => {
    await shown();
    click(`[data-id="${DESAL}"]`);
    await settle();
    TestBed.inject(HookStory).onSuggOutcome({ status: 'done', kind: 'sugg', ms: 900, at: new Date(), result: { status: 'empty', requestId: 'r-empty' } });
    await settle();
    expect(text('#panel .sugg-empty')).toBe('Nothing new this time: every idea it found is already on your map or was suggested before.');
    expect(titles()).toEqual(['Seawater intake', 'Reverse osmosis', 'Energy use']);
    expect(el.querySelector('#panel')?.textContent).not.toContain('Brine discharge');
  });

  it('condition (a): back on step 2 after "Add all", the emptied list says its ideas are on the map, under no prepared stamp', async () => {
    await shown();
    click(`[data-id="${DESAL}"]`);
    await settle();
    click('#caption [data-act="accept"]');
    for (const id of ['s-rod', 's-sea', 's-en']) await accept(id);
    await vi.waitFor(() => http.expectOne(`/api/v1/me/maps/${GOAL}/graph`).flush(graph(NEW_UNDER_DESAL)));
    await vi.waitFor(() => http.expectOne((r) => r.url === '/api/v1/me/concept-graph/suggestions').flush({ suggestions: ALL_PENDING.filter((x) => !DESAL_IDS.includes(x.suggestionId)) }));
    await vi.waitFor(() => expect(TestBed.inject(HookStory).beat()).toBe(3));
    TestBed.inject(HookStory).back();
    await settle();
    expect(TestBed.inject(HookStory).beat()).toBe(2);
    expect(el.querySelectorAll('#panel .sugg-row').length).toBe(0);
    expect(text('#panel .sugg-emptied')).toBe('Nothing waits here now: the ideas you added are on your map.');
    expect(el.querySelector('#panel .live-row .stamp')).toBeNull();
  });

  it('K149: step 3 shows its options in this visit’s drawn order, and the answer goes by the option clicked', async () => {
    await shown(manifest(), 11);
    click(`[data-id="${DESAL}"]`);
    await settle();
    click('#caption [data-act="accept"]');
    for (const id of ['s-rod', 's-sea', 's-en']) await accept(id);
    await vi.waitFor(() => http.expectOne(`/api/v1/me/maps/${GOAL}/graph`).flush(graph(NEW_UNDER_DESAL)));
    await vi.waitFor(() => http.expectOne((r) => r.url === '/api/v1/me/concept-graph/suggestions').flush({ suggestions: [] }));
    await vi.waitFor(() => expect(TestBed.inject(HookStory).beat()).toBe(3));
    await settle();
    click('[data-id="c-ro"]');
    (await vi.waitFor(() => http.expectOne((r) => r.url === `/api/v1/me/goals/${GOAL}/campaign/questions`))).flush(SERVED);
    await vi.waitFor(() => expect(TestBed.inject(HookStory).practice().state).toBe('ready'));
    await settle();
    const shownOrder = () => [...el.querySelectorAll('#panel .opt')].map((o) => o.textContent?.trim());
    const drawn = shownOrder();
    expect(drawn).not.toEqual(['AUV disinfection', 'BMicrofiltration', 'CReverse osmosis']);
    expect(drawn.map((t) => t?.slice(1)).sort()).toEqual(['Microfiltration', 'Reverse osmosis', 'UV disinfection']);
    fixture.detectChanges();
    expect(shownOrder()).toEqual(drawn);
    const firstText = drawn[0]?.slice(1);
    const firstId = { 'UV disinfection': '285c', Microfiltration: '45a9', 'Reverse osmosis': 'c161' }[firstText as string];
    click('#panel .opt:nth-child(1)');
    const answer = http.expectOne(`/api/v1/me/goals/${GOAL}/campaign/questions/answer`);
    expect(answer.request.body).toMatchObject({ selected_option_id: firstId });
  });

  it('step 3: adding puts the new idea on the map; its question is served, answered and graded', async () => {
    await shown();
    click(`[data-id="${DESAL}"]`);
    await settle();
    click('#caption [data-act="accept"]');
    for (const id of ['s-rod', 's-sea', 's-en']) await accept(id);
    await vi.waitFor(() => http.expectOne(`/api/v1/me/maps/${GOAL}/graph`).flush(graph(NEW_UNDER_DESAL)));
    await vi.waitFor(() => http.expectOne((r) => r.url === '/api/v1/me/concept-graph/suggestions').flush({ suggestions: [] }));
    await vi.waitFor(() => expect(TestBed.inject(HookStory).beat()).toBe(3));
    await settle();
    expect(text('#caption h2')).toBe('Reverse osmosis is new on your map');
    expect(glowing()).toEqual(['c-ro']);

    click('[data-id="c-ro"]');
    (await vi.waitFor(() => http.expectOne((r) => r.url === `/api/v1/me/goals/${GOAL}/campaign/questions`))).flush(SERVED);
    await vi.waitFor(() => expect(TestBed.inject(HookStory).practice().state).toBe('ready'));
    await settle();
    expect(text('#caption h2')).toBe('A question written just for you');
    expect(text('#panel .q-stem')).toBe('Which step holds back dissolved salts?');
    expect([...el.querySelectorAll('#panel .opt')].map((o) => o.textContent?.trim())).toEqual(['AUV disinfection', 'BMicrofiltration', 'CReverse osmosis']);

    const reveal = vi.spyOn(Element.prototype, 'scrollIntoView');
    click('#panel .opt:nth-child(3)');
    http
      .expectOne(`/api/v1/me/goals/${GOAL}/campaign/questions/answer`)
      .flush({ correct: true, rung: 1, is_refresher: false, counted: true, cleared_rung: 0, won: false, paced_today: false, rungs_cleared: 0, current_rung_correct: 1, needed_correct: 2, retention_r: 1, correct_option_id: 'c161', explainer: 'Salts stay behind.' });
    await vi.waitFor(() => expect(TestBed.inject(HookStory).answer().state).toBe('done'));
    await settle();
    expect(text('#panel .verdict b')).toBe('Correct.');
    expect(text('#panel .verdict')).toContain('Salts stay behind.');
    expect(reveal.mock.contexts).toContain(el.querySelector('#panel .verdict'));
    reveal.mockRestore();
    expect(el.querySelector('#panel .opt.right')?.textContent).toContain('Reverse osmosis');
    expect(text('#panel .camp-line')).toContain('1 of 2 correct on this rung');
    expect(el.querySelector('#panel kiosk-live-row .live-row')?.getAttribute('data-live')).toBe('q:hook:c-ro');
    expect(text('#panel .live-btn .live-label')).toBe('Write a new question');
    // K75: under the LIVE row, how the question was made (mockup hookDrawerHTML's q.how). The panel itself is
    // the xray sheet's spec; opening the overlay here re-settles the lens, whose connector needs CSS.escape (no jsdom).
    const open = vi.spyOn(TestBed.inject(BehindTheScenes), 'open').mockImplementation(() => undefined);
    (el.querySelector('#panel [data-act="xray"]') as HTMLButtonElement).click();
    expect(open).toHaveBeenCalledWith('q');
    expect(text('#panel [data-act="xray"]')).toBe('How was this made?');
  });

  it('switching language mid-scene remounts the lens, so its hex labels speak the new language', async () => {
    await shown();
    const label = () => el.querySelector(`[data-id="${NEWATER}"]`)?.getAttribute('aria-label') ?? '';
    expect(label()).toContain('Province');
    await TestBed.inject(KioskLanguage).setLang('zh');
    await settle();
    expect(label()).toContain('领地');
    expect(label()).toContain('NEWater');
    expect(text('#caption h2')).not.toBe('This is a learner’s own map');
  });

  it('a story that cannot read the product says so, loudly', async () => {
    TestBed.configureTestingModule({ providers: [...keepServedOrder(), provideHttpClient(), provideHttpClientTesting(), ...provideKioskI18n(), ...provideLive()] });
    http = TestBed.inject(HttpTestingController);
    await TestBed.inject(KioskLanguage).ready();
    fixture = TestBed.createComponent(HookSceneComponent);
    el = fixture.nativeElement as HTMLElement;
    fixture.detectChanges();
    http.expectOne('/api/v1/kiosk/prewarm/manifest').flush({}, { status: 404, statusText: 'Not Found' });
    await vi.waitFor(() => expect(TestBed.inject(HookStory).status()).toBe('failed'));
    await settle();
    expect(text('#caption')).toContain('This step could not reach Chora. Please ask the presenter.');
  });

  it('Next takes the glowing idea, Desalination (K139); Back reviews step 1', async () => {
    await shown();
    const store = TestBed.inject(KioskStore);
    store.next();
    await settle();
    expect(TestBed.inject(HookStory).branch()).toBe(DESAL);
    store.back();
    await settle();
    expect(TestBed.inject(HookStory).step()).toBe(1);
    expect(TestBed.inject(HookStory).reviewing()).toBe(true);
    expect(text('#caption .rv-note')).toContain('You picked Desalination');
  });

  it('leaving the only glowing idea’s ideas out: step 1 says none glows now and Next goes on to the teacher (K139 ruling A)', async () => {
    await shown();
    click(`[data-id="${DESAL}"]`);
    await settle();
    click('#caption [data-act="skip"]');
    for (const id of DESAL_IDS) {
      await vi.waitFor(() => http.expectOne(`/api/v1/me/concept-graph/suggestions/${id}/dismiss`).flush({ ...pendingDto(id, DESAL, id), status: 'dismissed' }));
    }
    await vi.waitFor(() => http.expectOne((r) => r.url === '/api/v1/me/concept-graph/suggestions').flush({ suggestions: ALL_PENDING.filter((x) => !DESAL_IDS.includes(x.suggestionId)) }));
    await vi.waitFor(() => expect(TestBed.inject(HookStory).beat()).toBe(1));
    await settle();
    expect(glowing()).toEqual([]);
    expect(text('#caption p')).toContain('You left the waiting ideas out, so no idea glows now');
    expect(text('#caption p')).not.toContain('still glows');
    expect(text('#caption .hint')).toBe('Press Next');
  });

  it('Back on an untouched first step returns to the start screen (nothing to undo)', async () => {
    await shown();
    const store = TestBed.inject(KioskStore);
    store.back();
    expect(store.scene()).toBe('idle');
  });

  it('step 4a: “Same you, new hat” over the teacher’s studio; Continue lifts it (K34)', async () => {
    await shown();
    // This spec's manifest holds no step 4 draft: the studio fails loud (its own spec covers the draft).
    const err = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    TestBed.inject(HookStory).toTeacher();
    await settle();
    expect(el.querySelector('#lenshost')).toBeNull();
    expect(el.querySelector('kiosk-studio-a')).not.toBeNull();
    expect(text('#swap h2')).toBe('Same you, new hat');
    expect(text('#swap .hats .now')).toBe('Teacher');
    click('#swap .swap-go');
    await settle();
    expect(el.querySelector('#swap')).toBeNull();
    expect(el.querySelector('kiosk-studio-a')).not.toBeNull();
    err.mockRestore();
  });
});
