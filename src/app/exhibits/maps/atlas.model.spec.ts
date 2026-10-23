import type { ConceptSuggestion } from '../../aplus/discovery-graph/concept-graph.model';
import { HEX_R } from '../../aplus/my-knowledge/concept-lens-map/concept-lens';
import type { MapGraph } from '../../aplus/my-knowledge/maps.model';
import { ATLAS_CX, MINI_MIN, batchRows, regionCounts, regionMinis, spreadMinis } from './atlas.model';

/** A map: a root with two children, one won, one climbing, and one grandchild. */
function map(): MapGraph {
  const c = (id: string, title: string) => ({ conceptId: id, title, atomRefs: [], provenance: 'learner_authored' as const });
  const e = (s: string, t: string) => ({ edgeId: `${s}-${t}`, sourceConceptId: s, targetConceptId: t, class: 'hierarchy' as const, provenance: 'learner_authored' as const });
  return {
    goalId: 'g',
    title: 'Singapore’s water',
    rootConceptId: 'root',
    concepts: [c('root', 'Singapore’s water'), c('res', 'Reservoirs'), c('newater', 'NEWater'), c('desal', 'Desalination')],
    edges: [e('root', 'res'), e('root', 'newater'), e('newater', 'desal')],
    campaign: {
      focusConceptId: 'res',
      frontierTotal: 2,
      frontierWon: 1,
      canSeal: false,
      nodes: {
        newater: { rungsCleared: 6, currentRungCorrect: 0, wonAt: '2026-10-20T02:00:00Z', cooling: false, advancedToday: false },
        res: { rungsCleared: 5, currentRungCorrect: 1, cooling: false, advancedToday: false },
      },
    },
  } as unknown as MapGraph;
}

const sugg = (id: string, title: string): ConceptSuggestion =>
  ({ suggestionId: id, kind: 'concept', status: 'pending', title, rationale: `why ${title}`, focalConceptId: 'desal' }) as ConceptSuggestion;

// The atlas (mockup atlasHTML and spreadMinis, lines 4689 and 5867; K36): three equal regions, each
// with its map's concept count, its won count and its concepts as small hexes laid out by production's
// own lens layout, scaled down about the region's centre and spread so no two overlap.
describe('the atlas model', () => {
  it('places the three regions at the mockup’s centres, equal in width', () => {
    expect(ATLAS_CX).toEqual([330, 800, 1270]);
    expect(ATLAS_CX[1] - ATLAS_CX[0]).toBe(ATLAS_CX[2] - ATLAS_CX[1]);
  });

  it('counts a region’s concepts and its won hexes from the map read', () => {
    expect(regionCounts(map())).toEqual({ n: 4, won: 1 });
    expect(regionCounts({ ...map(), campaign: undefined })).toEqual({ n: 4, won: 0 });
  });

  it('draws one mini hex per concept, the root and the won ones marked, about the region’s centre', () => {
    const minis = regionMinis(map(), 800);
    expect(minis.map((m) => [m.id, m.cls])).toEqual([
      ['root', 'r'],
      ['res', ''],
      ['newater', 'f'],
      ['desal', ''],
    ]);
    const root = minis[0];
    expect(Math.abs(root.x - 800)).toBeLessThan(60);
    expect(Math.abs(root.y - 286)).toBeLessThan(60);
  });

  it('spreads the minis so no two sit closer than the mockup’s minimum', () => {
    expect(MINI_MIN).toBeCloseTo(HEX_R * 0.26 * 1.85, 6);
    const pts = spreadMinis(
      [
        { id: 'a', x: 100, y: 100 },
        { id: 'b', x: 101, y: 100 },
        { id: 'c', x: 100, y: 102 },
      ],
      MINI_MIN,
    );
    for (let i = 0; i < pts.length; i++)
      for (let j = i + 1; j < pts.length; j++) expect(Math.hypot(pts[i].x - pts[j].x, pts[i].y - pts[j].y)).toBeGreaterThanOrEqual(MINI_MIN - 0.5);
  });

  it('leaves minis that are already apart where they are', () => {
    const pts = spreadMinis(
      [
        { id: 'a', x: 0, y: 0 },
        { id: 'b', x: 100, y: 0 },
      ],
      MINI_MIN,
    );
    expect(pts.map((p) => [p.x, p.y])).toEqual([
      [0, 0],
      [100, 0],
    ]);
  });

  describe('a prepared batch’s rows (mockup suggListHTML: K42, what the visit did carries over)', () => {
    const batch = ['s-ro', 's-mf', 's-uv', 's-old'];
    it('waiting ones from the pending read, decided ones from this visit, in the batch’s order', () => {
      const rows = batchRows(batch, [sugg('s-mf', 'Microfiltration')], new Map([['s-ro', { suggestion: sugg('s-ro', 'Reverse osmosis'), state: 'added' as const }], ['s-uv', { suggestion: sugg('s-uv', 'UV disinfection'), state: 'dropped' as const }]]), map());
      expect(rows.map((r) => [r.id, r.title, r.state])).toEqual([
        ['s-ro', 'Reverse osmosis', 'added'],
        ['s-mf', 'Microfiltration', 'pending'],
        ['s-uv', 'UV disinfection', 'dropped'],
      ]);
    });

    it('a waiting idea whose title is already on the map is “already on your map”', () => {
      const rows = batchRows(['s-dup'], [sugg('s-dup', 'Reservoirs')], new Map(), map());
      expect(rows.map((r) => r.state)).toEqual(['dup']);
    });

    it('an idea neither waiting nor decided this visit (decided before it) is not shown', () => {
      expect(batchRows(['s-old'], [], new Map(), map())).toEqual([]);
    });

    it('a link is no row, waiting or decided: the lists show ideas only (K189 (2), W62)', () => {
      const link = { suggestionId: 's-link', kind: 'edge', status: 'pending', sourceConceptId: 'res', targetConceptId: 'desal', class: 'lateral', rationale: 'why' } as ConceptSuggestion;
      const decidedLink = { ...link, suggestionId: 's-link2' };
      const rows = batchRows(['s-link', 's-mf', 's-link2'], [link, sugg('s-mf', 'Microfiltration')], new Map([['s-link2', { suggestion: decidedLink, state: 'added' as const }]]), map());
      expect(rows.map((r) => r.id)).toEqual(['s-mf']);
    });
  });
});
