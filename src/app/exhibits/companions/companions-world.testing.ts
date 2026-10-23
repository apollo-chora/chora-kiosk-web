// Test data for the Companions exhibit's specs: three goals, each map naming its Companion and its
// march, and each Companion's growth read in the bridge's wire shape. Test-only.
import { MANIFEST_FORMAT, type PrewarmManifestWire } from '../../kiosk-api/manifest.service';
import papers from '../../../../kiosk/world/papers/papers.json';

export const IDS = {
  water: 'g-water',
  nature: 'g-nature',
  hawker: 'g-hawker',
  pingu: 'c-pingu',
  nova: 'c-nova',
  ember: 'c-ember',
} as const;

export function companionsManifest(): PrewarmManifestWire {
  return {
    format: MANIFEST_FORMAT,
    made_at: '2026-10-20T06:30:00Z',
    commit: 'c',
    list_sha256: 'l',
    world: {
      'goal.water': IDS.water,
      'goal.nature': IDS.nature,
      'goal.hawker': IDS.hawker,
      'companion.pingu': IDS.pingu,
      'companion.nova': IDS.nova,
      'companion.ember': IDS.ember,
    },
    templates: { word_revision: { lines: [], option_line: '', option_line_explained: '' } },
    choices: {},
  };
}

/** A goal's map: its root's title, its Companion and its march concept. */
export function companionMap(goalId: string, title: string, companionId: string, companionName: string, march: string) {
  return {
    goalId,
    title,
    rootConceptId: `${goalId}-root`,
    attachedCompanionId: companionId,
    attachedCompanionName: companionName,
    concepts: [
      { conceptId: `${goalId}-root`, title, atomRefs: [], provenance: 'learner_authored' },
      { conceptId: `${goalId}-march`, title: march, atomRefs: [], provenance: 'learner_authored' },
    ],
    edges: [{ edgeId: `${goalId}-e`, sourceConceptId: `${goalId}-root`, targetConceptId: `${goalId}-march`, class: 'hierarchy', provenance: 'learner_authored' }],
    campaign: { focusConceptId: `${goalId}-march`, frontierTotal: 1, frontierWon: 0, canSeal: false, nodes: {} },
  };
}

export const MAPS = {
  [IDS.water]: companionMap(IDS.water, 'Singapore’s water', IDS.pingu, 'Pingu', 'Reservoirs'),
  [IDS.nature]: companionMap(IDS.nature, 'City in Nature', IDS.nova, 'Nova', 'Smooth-coated otters'),
  [IDS.hawker]: companionMap(IDS.hawker, 'Hawker culture', IDS.ember, 'Ember', 'UNESCO listing'),
};

export function growth(id: string, name: string, species: string, stage: number, cumulative: number, current: number, next: number, tier: string, tools: string[]) {
  return {
    data: {
      companionId: id,
      growthStage: stage,
      stageName: 'unused',
      displayName: name,
      species,
      shinyVariant: false,
      expCurrent: current,
      expNextThreshold: next,
      expCumulative: cumulative,
      effectiveLlmTier: tier,
      effectiveMaxOutputTokens: 1024,
      unlockedTools: tools,
      ahaMomentConsumed: false,
      lastStageUpAt: null,
    },
  };
}

export const GROWTH = {
  [IDS.pingu]: growth(IDS.pingu, 'Pingu', 'penguin', 1, 32, 32, 50, 'flash-lite', ['cite_atom']),
  [IDS.nova]: growth(IDS.nova, 'Nova', 'owl', 2, 118, 68, 200, 'flash', ['atom_search', 'cite_atom']),
  [IDS.ember]: growth(IDS.ember, 'Ember', 'fox', 3, 264, 64, 500, 'flash-reasoning', ['atom_search', 'cite_atom', 'ebbinghaus_state']),
};

/** Pingu after the win (K135): 32 + 8 for the last rung + 25 for the hex = 65, 15 into stage 2. */
export const PINGU_AFTER = growth(IDS.pingu, 'Pingu', 'penguin', 2, 65, 15, 200, 'flash-lite', ['atom_search', 'cite_atom']);

/** One row of the EXP ledger in the bridge's wire shape (companion_growth_handlers.go eventRecordResp, camelCased). */
export function growthEvent(id: string, source: string, delta: number, after: number, stageBefore: number, stageAfter: number) {
  return { growthEventId: id, source, expDelta: delta, expTotalAfter: after, dailyCapHit: false, triggeredStageUp: stageAfter > stageBefore, stageBefore, stageAfter, awardedAt: '2026-10-30T02:05:00Z' };
}
/** The ledger as the golden run leaves it: the dose open's +2 that took Pingu from 30 to 32. */
export const DOSE_OPEN = growthEvent('ev-dose', 'daily_dose_open', 2, 32, 1, 1);
export const events = (...rows: ReturnType<typeof growthEvent>[]) => ({ data: { events: rows } });

/** Pingu's loadout at stage 2: the stage-1 skill it was born with and the two that woke at 2. */
export function loadout(stage: number, slots: number, grants: [string, number, boolean?][]) {
  return {
    companionId: IDS.pingu,
    skillGrants: grants.map(([k]) => k),
    equippedSkills: [],
    grants: grants.map(([skillKey, unlockedAtStage, active = true]) => ({ skillKey, skillKind: 'active', slotCost: 1, equipped: false, unlockedVia: 'species_path', unlockedAtStage, catalogueActive: active })),
    skillSlotsUnlocked: slots,
    slotsUsed: 0,
    evolutionTier: 'flash-lite',
    growthStage: stage,
  };
}
export const PINGU_LOADOUT = loadout(2, 3, [['progress_mirror', 1], ['explain_anew', 2], ['recap_scribe', 2]]);

/** The water map with a won idea the Companion has suggestions around (NEWater) and the march; an extra idea `under` another is its child. */
export const FOCAL = `${IDS.water}-newater`;
export function waterWithFocal(extra: { id: string; title: string; under?: string }[] = []) {
  const m = companionMap(IDS.water, 'Singapore’s water', IDS.pingu, 'Pingu', 'Reservoirs');
  const under = extra.flatMap((x) => (x.under ? [{ edgeId: `e-${x.id}`, sourceConceptId: x.under, targetConceptId: x.id, class: 'hierarchy', provenance: 'companion_suggested_accepted' }] : []));
  return {
    ...m,
    concepts: [...m.concepts, { conceptId: FOCAL, title: 'NEWater', atomRefs: [], provenance: 'learner_authored' }, ...extra.map((x) => ({ conceptId: x.id, title: x.title, atomRefs: [], provenance: 'companion_suggested_accepted' }))],
    edges: [...m.edges, { edgeId: 'e-n', sourceConceptId: `${IDS.water}-root`, targetConceptId: FOCAL, class: 'hierarchy', provenance: 'learner_authored' }, ...under],
    campaign: { ...m.campaign, nodes: { [FOCAL]: { rungsCleared: 6, currentRungCorrect: 0, wonAt: '2026-10-11T02:00:00Z', cooling: false, advancedToday: false } } },
  };
}

const batch = (key: string, ids: string[], titles: string[], hidden: boolean, at = '2026-10-20T05:31:40Z') => ({
  kind: 'suggestions' as const,
  stage: 'main',
  hidden,
  prepared_at: at,
  run_at: '2026-10-20T05:31:00Z',
  params_sha256: 'x',
  params: {},
  records: { goal_id: IDS.water, focal_concept_id: FOCAL, request_id: `r-${key}`, suggestion_ids: ids, titles, edge_suggestion_ids: [] },
});

/** The manifest with the water goal's batch around NEWater (`prepared`, as [id, title]) and its hidden fresh batch (K64), prepared two minutes later. */
export function suggestManifest(prepared: readonly (readonly [string, string])[] = [['s-mf', 'Microfiltration'], ['s-uv', 'UV disinfection']]): PrewarmManifestWire {
  const m = companionsManifest();
  return {
    ...m,
    choices: {
      'sugg.water.newater': batch('n', prepared.map(([id]) => id), prepared.map(([, title]) => title), false),
      'fresh.water.newater': batch('f', ['s-dtss'], ['Deep Tunnel Sewerage System'], true, '2026-10-20T05:33:10Z'),
    },
  };
}

export const pending = (id: string, title: string) => ({ suggestionId: id, kind: 'concept', status: 'pending', title, focalConceptId: FOCAL, rationale: `why ${title}`, createdAt: '2026-10-20T05:31:40Z' });
export const PENDING = [pending('s-mf', 'Microfiltration'), pending('s-uv', 'UV disinfection'), pending('s-dtss', 'Deep Tunnel Sewerage System')];

/** The water map with its march (Reservoirs) one right answer from winning: 5 rungs cleared, 1 counted. */
export const MARCH = `${IDS.water}-march`;
export function waterOnLastRung(won = false) {
  const m = companionMap(IDS.water, 'Singapore’s water', IDS.pingu, 'Pingu', 'Reservoirs');
  const node = won
    ? { rungsCleared: 6, currentRungCorrect: 0, wonAt: '2026-10-30T02:05:00Z', cooling: false, advancedToday: true }
    : { rungsCleared: 5, currentRungCorrect: 1, cooling: false, advancedToday: false };
  return { ...m, campaign: { ...m.campaign, nodes: { [MARCH]: node } } };
}

/** The manifest with a prepared set for the march at its sixth rung (PREPARED-CHOICES.md 5.2). */
export function quizManifest(withSet = true): PrewarmManifestWire {
  const m = companionsManifest();
  if (!withSet) return m;
  return {
    ...m,
    choices: {
      'set.water.res.r6': {
        kind: 'practice_set',
        stage: 'main',
        hidden: false,
        prepared_at: '2026-10-20T05:44:10Z',
        run_at: '2026-10-20T05:43:00Z',
        params_sha256: 'x',
        params: {},
        records: { goal_id: IDS.water, concept_id: MARCH, concept_key: 'reservoirs', rung: 6, trace_id: 'b'.repeat(32), question_count: 1 },
      },
    },
  };
}

export const SERVED_RES = {
  status: 'ready',
  concept_id: MARCH,
  concept_key: 'reservoirs',
  rung: 6,
  questions: { candidates: [{ question_type: 'mcq', stem: 'Design a way to keep a reservoir clean.', options: [{ option_id: 'o-a', label: 'Fence it' }, { option_id: 'o-b', label: 'Protect its catchment' }] }] },
  source: 'question_bank',
  trace_id: 'b'.repeat(32),
  pipeline_trace: [],
};

/**
 * The water goal's dose as consumption answers it (companion_handlers.go dailyDoseResp), in
 * production's order (daily_dose.go:339: campaign, campaign, review, stretch, new); its summaries
 * are the titles and its Companion is the legacy in-memory "Eira" (F17), which the kiosk never shows.
 */
const DOSE_CARDS = [
  { atomId: 'a-camp1', topic: 'Reservoirs', title: 'A reservoir in the city centre', reason: 'campaign', category: 'new', xp: 30 },
  { atomId: 'a-camp2', topic: 'Reservoirs', title: 'More than a water store', reason: 'campaign', category: 'new', xp: 30 },
  { atomId: 'a-rev', topic: 'Four National Taps', title: 'The Four National Taps', reason: 'ebbinghaus_review', category: 'review', xp: 20 },
  { atomId: 'a-str', topic: 'Imported water', title: 'Water from Johor', reason: 'weakness', category: 'stretch', xp: 50 },
  { atomId: 'a-new', topic: 'Local catchment', title: 'Catching the rain', reason: 'fresh', category: 'new', xp: 30 },
];
export const DOSE_WIRE = {
  generated_at: '2026-10-30T01:00:00Z',
  message: 'Eira picked these for you.',
  entries: DOSE_CARDS.map((c) => ({
    atom_id: c.atomId,
    topic: c.topic,
    title: c.title,
    dose_reason: c.reason,
    ...(c.reason === 'campaign' ? { campaign_goal_id: IDS.water, campaign_concept_id: `${IDS.water}-march`, campaign_concept_key: 'reservoirs', campaign_rung: 6 } : {}),
  })),
  greeting: 'Hello from Eira!',
  doseId: 'dose-1',
  servedOn: '2026-10-30',
  atoms: DOSE_CARDS.map((c) => ({ atomId: c.atomId, courseCode: 'WATER', title: c.title, summary: c.title, category: c.category, topic: c.topic, xpOnComplete: c.xp })),
  composition: { reviewPercent: 20, newPercent: 60, stretchPercent: 20 },
  totalXpAvailable: 160,
  nextDoseAt: '2026-10-30T16:00:00Z',
  companionName: 'Eira',
  companionLevel: 3,
  companionQuote: 'Eira is proud of you.',
  greeting_from: { companion_id: IDS.pingu, name: 'Pingu' },
  atom_breakdown: { ebbinghaus: 1, weakness: 1, curiosity: 0, fresh: 1 },
  scope: { goal_id: IDS.water, from_goal: 5, on_topics: 0, broader: 0 },
};

/** Each card's teaching text, which only the atom read carries (F17). */
export const ATOM_BODIES: Record<string, string> = {
  'a-camp1': 'Marina Reservoir sits right in the city centre.',
  'a-camp2': 'The Marina Barrage also keeps out the sea.',
  'a-rev': 'Singapore draws its water from four sources.',
  'a-str': 'Singapore buys part of its water from Johor.',
  'a-new': 'About two thirds of Singapore’s land collects rainwater.',
};

/** GET /api/atoms/{id}: the {atom} envelope, an MCQ with its key stripped (phyllis.go GetAtom). */
export function atomRead(id: string, title: string, body: string) {
  return {
    atom: {
      atom_id: id,
      atom_type: 'mcq',
      body,
      course_id: '',
      gcid: 'learner',
      tenant_id: 'tenant',
      mode: 'learn',
      difficulty: 1,
      revision: 1,
      status: 'published',
      tags: [],
      created_at: '2026-10-19T02:00:00Z',
      updated_at: '2026-10-19T02:00:00Z',
      title,
      question_payload: {
        type: 'mcq',
        question_id: `q-${id}`,
        prompt: `Which is true of ${title}?`,
        options: [
          { option_id: `${id}-o1`, text: 'The first' },
          { option_id: `${id}-o2`, text: 'The second', explainer: `Because of ${title}.` },
          { option_id: `${id}-o3`, text: 'The third' },
        ],
        xp_on_correct: 3,
      },
    },
  };
}

/** The manifest with each Companion's prepared greeting (PREPARED-CHOICES.md 5.11) and the dose opened. */
export function doseManifest(): PrewarmManifestWire {
  const m = quizManifest();
  const greeting = (companion: string, turn: string) => ({
    kind: 'greeting' as const,
    stage: 'main',
    hidden: false,
    prepared_at: '2026-10-20T06:02:00Z',
    run_at: '2026-10-20T06:01:00Z',
    params_sha256: 'x',
    params: {},
    records: { companion_id: companion, turn_id: turn, model: 'gpt-oss:120b' },
  });
  return { ...m, choices: { ...m.choices, 'greet.pingu': greeting(IDS.pingu, 'turn-pingu'), 'greet.nova': greeting(IDS.nova, 'turn-nova') } };
}

/**
 * The manifest after the golden run's res-won stage: the hidden fresh batch around the won
 * Reservoirs (prepared-choices.json fresh.water.res, K64), shown only when a LIVE ask misses.
 */
export function wonManifest(): PrewarmManifestWire {
  const m = doseManifest();
  return {
    ...m,
    choices: {
      ...m.choices,
      'fresh.water.res': {
        kind: 'suggestions',
        stage: 'res-won',
        hidden: true,
        prepared_at: '2026-10-20T05:52:00Z',
        run_at: '2026-10-20T05:51:00Z',
        params_sha256: 'x',
        params: {},
        records: { goal_id: IDS.water, focal_concept_id: MARCH, request_id: 'r-res', suggestion_ids: ['s-bedok', 's-kranji'], titles: ['Bedok Reservoir', 'Kranji Reservoir'], edge_suggestion_ids: [] },
      },
    },
  };
}
export const WON_PENDING = [
  { ...pending('s-bedok', 'Bedok Reservoir'), focalConceptId: MARCH },
  { ...pending('s-kranji', 'Kranji Reservoir'), focalConceptId: MARCH },
  pending('s-mf', 'Microfiltration'),
];

/**
 * K158: the prepared papers (PREPARED-CHOICES 5.13), each the golden run's analyser run left at its review;
 * K206 (W90): `essay` is Pingu's marked one-page essay, whose prepared reading is the LIVE read's fallback.
 */
export const PAPER_UPLOADS = { water: 'up-water', nature: 'up-nature', hawker: 'up-hawker', essay: 'up-water-essay' } as const;

const weakPaper = (goalKey: string, file: string, goal: string, companion: 'pingu' | 'nova' | 'ember', upload: string, at: string) => ({
  kind: 'weakness_paper' as const,
  stage: 'main',
  hidden: false,
  prepared_at: at,
  run_at: '2026-10-20T06:30:10Z',
  params_sha256: 'x',
  params: { paper: file, goal: `goal.${goalKey}`, companion: `companion.${companion}`, upload_kind: 'marked_test' },
  records: { upload_id: upload, goal_id: goal, companion_id: IDS[companion], sha256: `${file}-sha`, status: 'AWAITING_REVIEW', proposed_edges: [] },
});

/** Pingu's and Nova's papers, Pingu's essay last as the world lists it (kiosk/world/prepared-choices.json); Ember has none here. */
export function weakManifest(): PrewarmManifestWire {
  const m = doseManifest();
  return {
    ...m,
    choices: {
      ...m.choices,
      'paper.water': weakPaper('water', 'paper-water.png', IDS.water, 'pingu', PAPER_UPLOADS.water, '2026-10-20T06:30:50Z'),
      'paper.nature': weakPaper('nature', 'paper-nature.png', IDS.nature, 'nova', PAPER_UPLOADS.nature, '2026-10-20T06:31:40Z'),
      'paper.water.essay': weakPaper('water', 'paper-water-essay.png', IDS.water, 'pingu', PAPER_UPLOADS.essay, '2026-10-20T06:35:00Z'),
    },
  };
}

/** K210: the world's four papers, Ember's marked test included. */
export function allPapersManifest(): PrewarmManifestWire {
  const m = weakManifest();
  return { ...m, choices: { ...m.choices, 'paper.hawker': weakPaper('hawker', 'paper-hawker.png', IDS.hawker, 'ember', PAPER_UPLOADS.hawker, '2026-10-20T06:32:30Z') } };
}

/**
 * K206 (W90): the essay's run at its review, its four weak spots the ones the essay is written to reveal
 * (the dev world's stand-ins, dev/world/mockup-world.mjs WEAKNESS_PANELS, as round3-design.html words them).
 */
export function essayJob(uploadId: string) {
  const spot = (n: number, concept_label: string, summary: string) => ({ proposed_edge_id: `${uploadId}-${n}`, concept_label, summary, strength: 0.8, suggested_difficulty: n === 3 ? 'easier' : 'standard' });
  return {
    upload_id: uploadId,
    status: 'AWAITING_REVIEW',
    review: {
      familiar: { familiar_id: IDS.pingu, name: 'Pingu' },
      proposed_edges: [
        spot(1, 'How NEWater is treated', 'The learner thinks NEWater is boiled to make it safe.'),
        spot(2, 'Who uses NEWater', 'The learner thinks most NEWater goes to home taps for drinking.'),
        spot(3, 'Why desalination costs more', 'The learner again blames dirty seawater for the cost, not the energy the process needs.'),
        spot(4, 'Brine disposal', 'The learner thinks the leftover brine is harmless and can be poured back into the sea anywhere.'),
      ],
      candidate_struggles: [],
      available_outputs: [],
    },
  };
}

/** kiosk/world/papers/papers.json as the build serves it at /papers/papers.json: the world's own file (W52 reads its questions). */
export const PAPERS_JSON = papers;

/** A job at its review (consumption's read), with three proposed weak spots. */
export function weakJob(uploadId: string, label = 'Reverse osmosis') {
  return {
    upload_id: uploadId,
    status: 'AWAITING_REVIEW',
    review: {
      familiar: { familiar_id: IDS.ember, name: 'Ember' },
      proposed_edges: [
        { proposed_edge_id: `${uploadId}-1`, concept_label: 'The Four National Taps', summary: 'Rainwater is local catchment; the fourth tap is desalinated water.', strength: 0.5, suggested_difficulty: 'standard' },
        { proposed_edge_id: `${uploadId}-2`, concept_label: label, summary: 'Reverse osmosis removes the salt, not microfiltration.', strength: 0.9, suggested_difficulty: 'easier' },
        { proposed_edge_id: `${uploadId}-3`, concept_label: 'The energy cost of desalination', summary: 'Pushing seawater through membranes takes a lot of energy.', strength: 0.8, suggested_difficulty: 'standard' },
      ],
      candidate_struggles: [],
      available_outputs: [],
    },
  };
}
