import hawker from '../../../../dev/fixtures/world/map-hawker-graph.json';
import nature from '../../../../dev/fixtures/world/map-nature-graph.json';
import water from '../../../../dev/fixtures/world/map-water-graph.json';
import { treeInvariants } from './tree-invariants.testing';

interface Graph {
  readonly rootConceptId: string;
  readonly edges: readonly { sourceConceptId: string; targetConceptId: string; class: 'hierarchy' | 'lateral' }[];
}
interface Fixture {
  readonly body: Graph;
  readonly variants?: readonly { readonly body: Graph }[];
}
const FIXTURES = { water, nature, hawker } as unknown as Record<string, Fixture>;

// K174, K176: the hexes are reviewed against the owner's two rules on every map the walk and the
// e2e serve: the seeded map and each map after an accept (the variants, among them story step 3's).
describe('the hex rules on the fixture maps (K174, K176)', () => {
  for (const [name, f] of Object.entries(FIXTURES)) {
    it(`${name}: the seeded map and every map after an accept keep them`, () => {
      const maps = [f.body, ...(f.variants ?? []).map((v) => v.body)];
      expect(maps.length).toBeGreaterThan(1);
      for (const m of maps) expect(treeInvariants(m.edges, m.rootConceptId)).toEqual([]);
    });
  }

  it('water: story step 3’s map (after Desalination’s batch) is among the maps checked', () => {
    const step3 = (FIXTURES['water'].variants ?? []).map((v) => v.body).filter((m) => m.edges.length > FIXTURES['water'].body.edges.length);
    expect(step3.length).toBeGreaterThan(0);
  });

  it('finds each breach it exists for (positive controls on a planted map)', () => {
    const h = (s: string, t: string) => ({ sourceConceptId: s, targetConceptId: t, class: 'hierarchy' as const });
    const seven = Array.from({ length: 7 }, (_, i) => h('a', `k${i}`));
    expect(treeInvariants(seven, 'root')).toEqual(['a has 7 children']);
    expect(treeInvariants([h('root', 'a'), h('b', 'a')], 'root')).toEqual(['a has 2 parents']);
    expect(treeInvariants([h('a', 'root')], 'root')).toEqual(['the root root has a parent']);
    expect(treeInvariants([...seven.slice(0, 6), { ...h('b', 'k0'), class: 'lateral' as const }], 'root')).toEqual([]);
  });
});
