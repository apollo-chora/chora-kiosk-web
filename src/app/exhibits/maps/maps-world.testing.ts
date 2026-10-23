// Test data for the atlas's specs: the learner's three maps, each naming its Companion and march,
// the prepared batches (one visible, one hidden fresh) and practice sets the manifest maps, and each
// goal's waiting suggestions in the product's wire shape. Test-only.
import { MANIFEST_FORMAT, type PrewarmManifestWire } from '../../kiosk-api/manifest.service';

export const G = { water: 'g-water', nature: 'g-nature', hawker: 'g-hawker' } as const;
export const C = { pingu: 'c-pingu', nova: 'c-nova', ember: 'c-ember' } as const;
export const GOALS = [G.water, G.nature, G.hawker];

const WON = { rungsCleared: 6, currentRungCorrect: 0, wonAt: '2026-10-11T02:00:00Z', cooling: false, advancedToday: false };
const climbing = (rungs: number, counted = 0) => ({ rungsCleared: rungs, currentRungCorrect: counted, cooling: false, advancedToday: false });

interface Node {
  readonly id: string;
  readonly title: string;
  readonly under?: string;
  readonly due?: boolean;
}

/** A goal's map: its root, its concepts under it, its Companion, its march and its ladders. */
export function atlasMap(goalId: string, root: string, companion: [string, string], nodes: Node[], march: string, ladder: Record<string, unknown>) {
  const rootId = `${goalId}-root`;
  return {
    goalId,
    title: root,
    rootConceptId: rootId,
    attachedCompanionId: companion[0],
    attachedCompanionName: companion[1],
    concepts: [
      { conceptId: rootId, title: root, atomRefs: [], provenance: 'learner_authored' },
      ...nodes.map((n) => ({
        conceptId: n.id,
        title: n.title,
        atomRefs: [],
        provenance: 'learner_authored',
        ...(n.due ? { growthEdge: { edgeId: `ge-${n.id}`, conceptKey: n.id, strength: 0.6, isDue: true } } : {}),
      })),
    ],
    edges: nodes.map((n) => ({ edgeId: `e-${n.id}`, sourceConceptId: n.under ?? rootId, targetConceptId: n.id, class: 'hierarchy', provenance: 'learner_authored' })),
    campaign: { focusConceptId: march, frontierTotal: nodes.length, frontierWon: 0, canSeal: false, nodes: ladder },
  };
}

export function water(extra: Node[] = [], ladder: Record<string, unknown> = {}) {
  return atlasMap(
    G.water,
    'Singapore’s water',
    [C.pingu, 'Pingu'],
    [
      { id: 'w-res', title: 'Reservoirs', due: true },
      { id: 'w-newater', title: 'NEWater' },
      { id: 'w-desal', title: 'Desalination' },
      { id: 'w-used', title: 'Used water' },
      ...extra,
    ],
    'w-res',
    { 'w-res': climbing(5, 1), 'w-newater': WON, 'w-desal': WON, 'w-used': climbing(2), ...ladder },
  );
}
export const nature = () => atlasMap(G.nature, 'City in Nature', [C.nova, 'Nova'], [{ id: 'n-otters', title: 'Smooth-coated otters' }, { id: 'n-super', title: 'Supertrees' }], 'n-otters', { 'n-otters': climbing(2), 'n-super': WON });
export const hawker = () => atlasMap(G.hawker, 'Hawker culture', [C.ember, 'Ember'], [{ id: 'h-unesco', title: 'UNESCO listing' }, { id: 'h-centres', title: 'Hawker centres' }], 'h-unesco', { 'h-unesco': climbing(2), 'h-centres': WON });

export const pending = (id: string, title: string, focal: string) => ({ suggestionId: id, kind: 'concept', status: 'pending', title, focalConceptId: focal, rationale: `why ${title}`, createdAt: '2026-10-20T05:31:40Z' });
/**
 * Each goal's waiting suggestions: Desalination's batch and its hidden fresh one, the hidden fresh
 * batches of the root, NEWater and Reservoirs (as the golden manifest holds them), Supertrees' batch.
 */
export const PENDING: Record<string, ReturnType<typeof pending>[]> = {
  [G.water]: [
    pending('s-ro', 'Reverse osmosis', 'w-desal'),
    pending('s-intake', 'Seawater intake', 'w-desal'),
    pending('s-brine', 'Brine discharge', 'w-desal'),
    pending('s-rain', 'Rainfall patterns', `${G.water}-root`),
    pending('s-dtss', 'Deep Tunnel Sewerage System', 'w-newater'),
    pending('s-marina', 'Marina Barrage', 'w-res'),
  ],
  [G.nature]: [pending('s-solar', 'Solar canopies', 'n-super')],
  [G.hawker]: [],
};

const batch = (goal: string, focal: string, ids: string[], hidden: boolean, preparedAt = '2026-10-20T05:31:40Z') => ({
  kind: 'suggestions' as const,
  stage: 'main',
  hidden,
  prepared_at: preparedAt,
  run_at: '2026-10-20T05:31:00Z',
  params_sha256: 'x',
  params: {},
  records: { goal_id: goal, focal_concept_id: focal, request_id: `r-${focal}`, suggestion_ids: ids, titles: [], edge_suggestion_ids: [] },
});
const practice = (goal: string, concept: string, rung: number) => ({
  kind: 'practice_set' as const,
  stage: 'main',
  hidden: false,
  prepared_at: '2026-10-20T05:40:00Z',
  run_at: '2026-10-20T05:39:00Z',
  params_sha256: 'x',
  params: {},
  records: { goal_id: goal, concept_id: concept, concept_key: concept, rung, trace_id: `t-${concept}`, question_count: 2 },
});

export function atlasManifest(): PrewarmManifestWire {
  return {
    format: MANIFEST_FORMAT,
    made_at: '2026-10-20T06:30:00Z',
    commit: 'c',
    list_sha256: 'l',
    world: { 'goal.water': G.water, 'goal.nature': G.nature, 'goal.hawker': G.hawker, 'companion.pingu': C.pingu, 'companion.nova': C.nova, 'companion.ember': C.ember },
    templates: { word_revision: { lines: [], option_line: '', option_line_explained: '' } },
    choices: {
      'sugg.water.desal': batch(G.water, 'w-desal', ['s-ro', 's-intake'], false),
      // A minute after the batch it stands behind, as in the golden run (K138 W13: 12:38, then 12:39).
      'fresh.water.desal': batch(G.water, 'w-desal', ['s-brine'], true, '2026-10-20T05:32:40Z'),
      'fresh.water.root': batch(G.water, `${G.water}-root`, ['s-rain'], true),
      'fresh.water.newater': batch(G.water, 'w-newater', ['s-dtss'], true),
      'fresh.water.res': batch(G.water, 'w-res', ['s-marina'], true),
      'sugg.nature.supertrees': batch(G.nature, 'n-super', ['s-solar'], false),
      'set.water.res.r6': practice(G.water, 'w-res', 6),
      'set.water.used.r3': practice(G.water, 'w-used', 3),
      'set.nature.otters.r3': practice(G.nature, 'n-otters', 3),
      'set.hawker.unesco.r4': practice(G.hawker, 'h-unesco', 4),
    },
  } as unknown as PrewarmManifestWire;
}

export const card = (goalId: string) => ({ goalId, title: 'x', northStarNote: '', kind: 'map', status: 'active', conceptCount: 2, shakyCount: 0, masteredCount: 0, createdAt: 'x', updatedAt: 'x' });
