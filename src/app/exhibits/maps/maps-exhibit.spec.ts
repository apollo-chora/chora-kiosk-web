import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { IDS, MAPS, PENDING, suggestManifest, waterWithFocal } from '../companions/companions-world.testing';
import { MapsExhibit } from './maps-exhibit';

const card = (goalId: string) => ({ goalId, title: 'x', northStarNote: '', kind: 'map', status: 'active', conceptCount: 2, shakyCount: 0, masteredCount: 0, createdAt: 'x', updatedAt: 'x' });
const GOALS = [IDS.water, IDS.nature, IDS.hawker];
const isSugg = (goal: string) => (r: { url: string; params: { get(k: string): string | null } }) =>
  r.url === '/api/v1/me/concept-graph/suggestions' && r.params.get('goalId') === goal;

// The atlas's reads (mockup atlasHTML and visitMap; K36, K42; orchestrator answer 2): the learner's
// maps from the product, checked against the world's three goals, each map's graph and its waiting
// suggestions (the hidden fresh batches kept out, K64), read again on every entry so what the visit
// changed elsewhere shows, and forgotten when the visit ends.
describe('MapsExhibit (the atlas’s reads)', () => {
  let http: HttpTestingController;
  const exhibit = () => TestBed.inject(MapsExhibit);

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => exhibit().forget());

  /** Answers one round of reads: the list, each graph, each goal's waiting suggestions. */
  async function answer(opts: { list?: string[]; maps?: Record<string, unknown> } = {}): Promise<void> {
    const maps = { ...MAPS, [IDS.water]: waterWithFocal(), ...opts.maps };
    (await vi.waitFor(() => http.expectOne('/api/v1/me/maps'))).flush({ items: (opts.list ?? GOALS).map(card) });
    for (const g of GOALS) {
      (await vi.waitFor(() => http.expectOne(`/api/v1/me/maps/${g}/graph`))).flush(maps[g] as object);
      (await vi.waitFor(() => http.expectOne(isSugg(g)))).flush({ suggestions: g === IDS.water ? PENDING : [] });
    }
  }

  async function loaded(): Promise<void> {
    const done = exhibit().enter();
    http.expectOne('/api/v1/kiosk/prewarm/manifest').flush(suggestManifest());
    await answer();
    await done;
  }

  it('reads the three maps in the world’s order, each with its Companion, root and waiting suggestions', async () => {
    await loaded();
    expect(exhibit().status()).toBe('ready');
    const r = exhibit().regions();
    expect(r.map((x) => [x.key, x.goalId, x.title, x.companionId, x.companionName, x.rootId])).toEqual([
      ['goal.water', IDS.water, 'Singapore’s water', IDS.pingu, 'Pingu', `${IDS.water}-root`],
      ['goal.nature', IDS.nature, 'City in Nature', IDS.nova, 'Nova', `${IDS.nature}-root`],
      ['goal.hawker', IDS.hawker, 'Hawker culture', IDS.ember, 'Ember', `${IDS.hawker}-root`],
    ]);
  });

  it('keeps the hidden fresh batches off the waiting suggestions, and holds them apart for a missed LIVE press (K64)', async () => {
    await loaded();
    const water = exhibit().regions()[0];
    expect(water.pending.map((s) => s.suggestionId)).toEqual(['s-mf', 's-uv']);
    expect(water.hiddenPending.map((s) => s.suggestionId)).toEqual(['s-dtss']);
  });

  it('reads again on every entry, so a concept added elsewhere shows; the earlier maps stay up meanwhile', async () => {
    await loaded();
    const again = exhibit().enter();
    expect(exhibit().status()).toBe('ready');
    expect(exhibit().regions()[0].map.concepts.length).toBe(3);
    http.expectNone('/api/v1/kiosk/prewarm/manifest');
    await answer({ maps: { [IDS.water]: waterWithFocal([{ id: 'c-mf', title: 'Microfiltration' }]) } });
    await again;
    expect(exhibit().regions()[0].map.concepts.length).toBe(4);
  });

  it('two entries at once read once', async () => {
    const a = exhibit().enter();
    const b = exhibit().enter();
    http.expectOne('/api/v1/kiosk/prewarm/manifest').flush(suggestManifest());
    await answer();
    await Promise.all([a, b]);
    http.verify();
  });

  it('fails loud when the learner’s maps are not the world’s three (one missing, or one more)', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    let done = exhibit().enter();
    http.expectOne('/api/v1/kiosk/prewarm/manifest').flush(suggestManifest());
    (await vi.waitFor(() => http.expectOne('/api/v1/me/maps'))).flush({ items: [IDS.water, IDS.nature].map(card) });
    await done;
    expect(exhibit().status()).toBe('failed');
    expect(String(err.mock.calls.at(-1)?.[0])).toContain(IDS.hawker);
    exhibit().forget();
    // The manifest is read once (ManifestService keeps it); the maps are read again.
    done = exhibit().enter();
    (await vi.waitFor(() => http.expectOne('/api/v1/me/maps'))).flush({ items: [...GOALS, 'g-other'].map(card) });
    await done;
    expect(exhibit().status()).toBe('failed');
    expect(String(err.mock.calls.at(-1)?.[0])).toContain('g-other');
  });

  it('fails loud when a map names no Companion, never a guessed pairing', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const done = exhibit().enter();
    http.expectOne('/api/v1/kiosk/prewarm/manifest').flush(suggestManifest());
    const { attachedCompanionId: _gone, ...lonely } = MAPS[IDS.nature];
    (await vi.waitFor(() => http.expectOne('/api/v1/me/maps'))).flush({ items: GOALS.map(card) });
    (await vi.waitFor(() => http.expectOne(`/api/v1/me/maps/${IDS.water}/graph`))).flush(waterWithFocal());
    (await vi.waitFor(() => http.expectOne(isSugg(IDS.water)))).flush({ suggestions: [] });
    (await vi.waitFor(() => http.expectOne(`/api/v1/me/maps/${IDS.nature}/graph`))).flush(lonely);
    await done;
    expect(exhibit().status()).toBe('failed');
    expect(String(err.mock.calls.at(-1)?.[0])).toContain('names no Companion');
  });

  it('a read that ends after the visit did writes nothing (a reset came between)', async () => {
    const done = exhibit().enter();
    http.expectOne('/api/v1/kiosk/prewarm/manifest').flush(suggestManifest());
    (await vi.waitFor(() => http.expectOne('/api/v1/me/maps'))).flush({ items: GOALS.map(card) });
    exhibit().forget();
    for (const g of GOALS) {
      (await vi.waitFor(() => http.expectOne(`/api/v1/me/maps/${g}/graph`))).flush((g === IDS.water ? waterWithFocal() : MAPS[g]) as object);
      (await vi.waitFor(() => http.expectOne(isSugg(g)))).flush({ suggestions: [] });
    }
    await done;
    expect(exhibit().status()).toBe('idle');
    expect(exhibit().regions()).toEqual([]);
  });
});
