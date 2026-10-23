import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { provideKioskI18n } from '../../i18n/i18n';
import { provideLive } from '../../live/live.providers';
import { CompanionsExhibit } from './companions-exhibit';
import { ATOM_BODIES, DOSE_WIRE, GROWTH, IDS, MAPS, MARCH, SERVED_RES, atomRead, doseManifest, quizManifest, waterOnLastRung } from './companions-world.testing';

// The Companions exhibit's loud failures, read at the exhibit (no screen): a map that cannot pair
// a Companion, a serve door that is not ready, a won march, a greeting or an atom that cannot be
// read, and LIVE outcomes that carry nothing to show. Each says what failed and shows no guess.
describe('CompanionsExhibit (loud failures)', () => {
  let http: HttpTestingController;
  let exhibit: CompanionsExhibit;
  let error: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    // The exhibit reads the store's overlay (W52's paper popup), and the store needs the LIVE providers.
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting(), ...provideKioskI18n(), ...provideLive()] });
    http = TestBed.inject(HttpTestingController);
    exhibit = TestBed.inject(CompanionsExhibit);
    error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    exhibit.forget();
    vi.restoreAllMocks();
  });

  async function load(maps: Record<string, object> = MAPS, manifest = quizManifest()): Promise<void> {
    void exhibit.load();
    http.expectOne('/api/v1/kiosk/prewarm/manifest').flush(manifest);
    for (const goal of [IDS.water, IDS.nature, IDS.hawker]) {
      const req = await vi.waitFor(() => http.match(`/api/v1/me/maps/${goal}/graph`)[0] ?? Promise.reject(new Error('not yet')));
      req.flush(maps[goal]);
      if (exhibit.status() === 'failed') return;
    }
    for (const c of [IDS.pingu, IDS.nova, IDS.ember]) (await vi.waitFor(() => http.expectOne(`/api/v1/me/companions/${c}/growth`))).flush(GROWTH[c]);
    await vi.waitFor(() => expect(exhibit.status()).toBe('ready'));
  }

  const failsWith = async (maps: Record<string, object>, said: RegExp) => {
    void exhibit.load();
    http.expectOne('/api/v1/kiosk/prewarm/manifest').flush(quizManifest());
    (await vi.waitFor(() => http.expectOne(`/api/v1/me/maps/${IDS.water}/graph`))).flush(maps[IDS.water]);
    await vi.waitFor(() => expect(exhibit.status()).toBe('failed'));
    expect(error).toHaveBeenCalledWith(expect.stringMatching(said));
    expect(exhibit.roster()).toEqual([]);
  };

  it.each([
    ['no Companion', { attachedCompanionId: '' }, /names no Companion/],
    ['no root', { rootConceptId: '' }, /names no root/],
    ['no march concept', { campaign: { ...MAPS[IDS.water].campaign, focusConceptId: 'gone' } }, /holds no march concept gone/],
  ])('a map that names %s fails the read, never a guessed pairing', async (_what, broken, said) => {
    await failsWith({ ...MAPS, [IDS.water]: { ...MAPS[IDS.water], ...broken } }, said);
  });

  it('a serve door that answers other than ready shows the quiz failed, never a generation nobody pressed', async () => {
    await load({ ...MAPS, [IDS.water]: waterOnLastRung() });
    void exhibit.openQuiz();
    (await vi.waitFor(() => http.expectOne((r) => r.url.endsWith('/campaign/questions')))).flush({ ...SERVED_RES, status: 'generating', questions: null });
    await vi.waitFor(() => expect(exhibit.quiz().state).toBe('failed'));
    expect(error).toHaveBeenCalledWith(expect.stringContaining('answered generating'));
  });

  it('a won march opens the quiz with no serve call', async () => {
    await load({ ...MAPS, [IDS.water]: waterOnLastRung(true) });
    await exhibit.openQuiz();
    expect(exhibit.view()).toBe('quiz');
    expect(exhibit.march()?.won).toBe(true);
    http.expectNone((r) => r.url.includes('/campaign/questions'));
  });

  it('a prepared greeting that cannot be read leaves the rail with no quote, said loudly; an atom with no body shows its card’s error', async () => {
    await load(MAPS, doseManifest());
    void exhibit.openDose();
    (await vi.waitFor(() => http.expectOne((r) => r.url === '/api/companion/daily-dose'))).flush(DOSE_WIRE);
    (await vi.waitFor(() => http.expectOne('/api/companion/greeting'))).flush({ error: 'GREETING_FAILED', detail: 'x', turn_id: 'turn-pingu' }, { status: 503, statusText: 'Unavailable' });
    for (const c of DOSE_WIRE.atoms) {
      (await vi.waitFor(() => http.expectOne(`/api/atoms/${c.atomId}`))).flush(atomRead(c.atomId, c.title, c.atomId === 'a-rev' ? '  ' : ATOM_BODIES[c.atomId]));
    }
    await vi.waitFor(() => expect(exhibit.dose()?.state).toBe('ready'));
    expect(exhibit.greeting()).toEqual({ prepared: null, live: null });
    expect(error).toHaveBeenCalledWith(expect.stringContaining(`the prepared greeting for ${IDS.pingu} could not be read`));
    expect(error).toHaveBeenCalledWith(expect.stringContaining('atom a-rev has no body'));
    expect(exhibit.playable('a-rev')).toBe(false);
    expect(exhibit.playable('a-str')).toBe(true);
  });

  it('LIVE outcomes that carry nothing to show change nothing', async () => {
    await load({ ...MAPS, [IDS.water]: waterOnLastRung() });
    exhibit.onGreetOutcome(IDS.pingu, { status: 'stopped' });
    expect(exhibit.greeting()).toBeNull();
    void exhibit.openQuiz();
    (await vi.waitFor(() => http.expectOne((r) => r.url.endsWith('/campaign/questions')))).flush(SERVED_RES);
    await vi.waitFor(() => expect(exhibit.quiz().state).toBe('ready'));
    const before = exhibit.quiz();
    exhibit.onQOutcome(MARCH, { status: 'done', kind: 'q', ms: 1, at: new Date(), result: { freshSetId: 'fs-empty', conceptId: 'x', conceptKey: 'x', rung: 6, questions: [], traceId: null, trace: null, critic: null } });
    expect(exhibit.quiz()).toBe(before);
    expect(error).toHaveBeenCalledWith(expect.stringContaining('fs-empty holds no question'));
    await exhibit.onSuggOutcome(MARCH, { status: 'stopped' });
    expect(exhibit.fresh()).toEqual([]);
  });
});
