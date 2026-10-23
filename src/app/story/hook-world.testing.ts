// Test data for the story's specs: a small water map in the product's wire shapes, the manifest's
// visible and hidden batches as K139 left them (only Desalination holds a visible batch; NEWater
// and the root hold only hidden fresh batches), and the twin's served set. Test-only.
import { MANIFEST_FORMAT, type PrewarmManifestWire } from '../kiosk-api/manifest.service';

export const GOAL = 'g-water';
export const ROOT = 'c-root';
export const TAPS = 'c-taps';
export const NEWATER = 'c-newater';
export const DESAL = 'c-desal';

export const sugg = (key: string, focal: string, ids: string[], titles: string[], hidden = false) => ({
  kind: 'suggestions' as const,
  stage: 'main',
  hidden,
  prepared_at: '2026-10-20T05:31:40Z',
  run_at: '2026-10-20T05:31:00Z',
  params_sha256: 'x',
  params: {},
  records: { goal_id: GOAL, focal_concept_id: focal, request_id: `r-${key}`, suggestion_ids: ids, titles, edge_suggestion_ids: [] },
});

export function manifest(twinKey = 'reverse-osmosis', twinSuggestion = 's-rod'): PrewarmManifestWire {
  return {
    format: MANIFEST_FORMAT,
    made_at: '2026-10-20T06:00:00Z',
    commit: 'c',
    list_sha256: 'l',
    world: { 'goal.water': GOAL, 'concept.water.root': ROOT, 'concept.water.taps': TAPS, 'concept.water.newater': NEWATER, 'concept.water.desal': DESAL },
    templates: { word_revision: { lines: [], option_line: '', option_line_explained: '' } } as unknown as PrewarmManifestWire['templates'],
    choices: {
      'sugg.water.desal': sugg('d', DESAL, ['s-sea', 's-rod', 's-en'], ['Seawater intake', 'Reverse osmosis', 'Energy use']),
      'fresh.water.newater': sugg('fn', NEWATER, ['s-dtss', 's-fabs'], ['Deep Tunnel Sewerage System', 'Wafer fabs'], true),
      'fresh.water.desal': sugg('fd', DESAL, ['s-brine', 's-tuas'], ['Brine discharge', 'Tuas plant'], true),
      'fresh.water.root': sugg('fr', ROOT, ['s-rain', 's-catch'], ['Rainfall patterns', 'Water catchments'], true),
      'v1.reverse-osmosis': {
        kind: 'adoptable_set',
        stage: 'main',
        hidden: false,
        prepared_at: '2026-10-20T05:41:40Z',
        run_at: '2026-10-20T05:41:00Z',
        params_sha256: 'x',
        params: {},
        records: { goal_id: GOAL, suggestion_id: twinSuggestion, title: 'Reverse osmosis', concept_key: twinKey, rung: 1, twin_concept_id: 't', twin_edge_id: 'te', trace_id: 'a'.repeat(32), question_count: 1 },
      },
    },
  };
}

export const node = (conceptId: string, title: string, provenance = 'learner_authored') => ({ conceptId, title, atomRefs: [], provenance });
export const edge = (s: string, t: string) => ({ edgeId: `${s}-${t}`, sourceConceptId: s, targetConceptId: t, class: 'hierarchy', provenance: 'learner_authored' });

export function graph(extra: { id: string; title: string; under: string }[] = []) {
  return {
    goalId: GOAL,
    title: 'Singapore’s water',
    rootConceptId: ROOT,
    attachedCompanionId: 'pingu',
    attachedCompanionName: 'Pingu',
    concepts: [node(ROOT, 'Singapore’s water'), node(TAPS, 'Four National Taps'), node(NEWATER, 'NEWater'), node(DESAL, 'Desalination'), ...extra.map((x) => node(x.id, x.title, 'companion_suggested_accepted'))],
    edges: [edge(ROOT, TAPS), edge(TAPS, NEWATER), edge(TAPS, DESAL), ...extra.map((x) => edge(x.under, x.id))],
    campaign: { focusConceptId: TAPS, frontierTotal: 3, frontierWon: 3, canSeal: false, nodes: { [ROOT]: { rungsCleared: 6, currentRungCorrect: 0, wonAt: '2026-10-05T02:00:00Z', cooling: false, advancedToday: false }, [TAPS]: { rungsCleared: 6, currentRungCorrect: 0, wonAt: '2026-10-05T02:00:00Z', cooling: false, advancedToday: false }, [NEWATER]: { rungsCleared: 6, currentRungCorrect: 0, wonAt: '2026-10-05T02:00:00Z', cooling: false, advancedToday: false }, [DESAL]: { rungsCleared: 6, currentRungCorrect: 0, wonAt: '2026-10-05T02:00:00Z', cooling: false, advancedToday: false } } },
  };
}

export const pendingDto = (id: string, focal: string, title: string) => ({ suggestionId: id, kind: 'concept', status: 'pending', title, focalConceptId: focal, rationale: `why ${title}`, createdAt: '2026-10-20T05:31:40Z' });
/** Desalination's visible batch, and every hidden one still pending (as the golden run left the stack). */
export const DESAL_IDS = ['s-sea', 's-rod', 's-en'];
export const ALL_PENDING = [
  pendingDto('s-sea', DESAL, 'Seawater intake'),
  pendingDto('s-rod', DESAL, 'Reverse osmosis'),
  pendingDto('s-en', DESAL, 'Energy use'),
  pendingDto('s-dtss', NEWATER, 'Deep Tunnel Sewerage System'),
  pendingDto('s-fabs', NEWATER, 'Wafer fabs'),
  pendingDto('s-brine', DESAL, 'Brine discharge'),
  pendingDto('s-tuas', DESAL, 'Tuas plant'),
  pendingDto('s-rain', ROOT, 'Rainfall patterns'),
  pendingDto('s-catch', ROOT, 'Water catchments'),
];
export const NEW_UNDER_DESAL = [
  { id: 'c-sea', title: 'Seawater intake', under: DESAL },
  { id: 'c-ro', title: 'Reverse osmosis', under: DESAL },
  { id: 'c-en', title: 'Energy use', under: DESAL },
];

export const SERVED = {
  status: 'ready',
  concept_id: 'c-ro',
  concept_key: 'reverse-osmosis',
  rung: 1,
  questions: {
    candidates: [
      {
        question_type: 'mcq',
        stem: 'Which step holds back dissolved salts?',
        options: [
          { option_id: '285c', label: 'UV disinfection' },
          { option_id: '45a9', label: 'Microfiltration' },
          { option_id: 'c161', label: 'Reverse osmosis' },
        ],
      },
    ],
  },
  source: 'question_bank',
  trace_id: 'a'.repeat(32),
  pipeline_trace: [],
};
