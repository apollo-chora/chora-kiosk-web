#!/usr/bin/env node
// The dev fixtures for the prepared world (T3.6): the golden run's manifest and the product reads the
// story makes, built from kiosk/world/prepared-choices.json (its world keys and choices), the demo
// world the seed makes (kiosk/world/world.json: keys, titles, order, edges, campaign states, cues,
// Companions, atoms, doses), the AI outputs the mockup shows (mockup-world.mjs) and the model ids of
// kiosk/config/models.example.yaml, for the dev fixture server on 127.0.0.1:18301. Dev only: the
// production bundle never holds a fixture (tools/gates/no-fixture-gate.mjs).
//
// The JSON fixtures are committed under dev/fixtures/world/ and checked against this generator; the
// pictures are drawn on demand into dev/fixtures/pictures/ (gitignored), the mockup's illustrations
// cut out of apollo-kiosk-mockup.html rather than copied into git a second time. Their URLs carry
// the fixture marker, so a picture URL that leaked into the bundle fails the no-fixture gate.
//
// What the fixtures cannot show (a dev limitation, not the product's): one accepted batch per map at
// a time (the last one accepted wins), a hidden batch the visitor accepted still reads as pending, an
// answer does not move the map's ladder, and a hand edit is not reflected in the accepted question.
// A LIVE fresh-ideas press is answered only around Desalination, with the owner's two recorded
// presses of 19 Oct (dev/world/f43-presses.recorded.json, K156): any other press misses, so its
// hidden batch shows.
//
// Usage: node dev/world/make-fixtures.mjs write      regenerate dev/fixtures/world/
//        node dev/world/make-fixtures.mjs check      the committed fixtures equal the generator's output
//        node dev/world/make-fixtures.mjs pictures   draw the pictures into dev/fixtures/pictures/
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { normalizeConceptKey } from '../../src/app/shared/concept-key.ts';
import {
  DIAGRAMS,
  GRADED_POINTS_POSSIBLE,
  GRADED_SCORES,
  ILLUSTRATIONS,
  PICTURE_OF,
  PRACTICE_QUESTIONS,
  SCENES,
  STEP4,
  STEP4_SCENARIO_STANDIN,
  WEAKNESS_PANELS,
  SUGGESTION_BATCHES,
} from './mockup-world.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const KIOSK_WEB = join(HERE, '..', '..');
// The standalone repo: the kiosk inputs are vendored beside this repo (kiosk/world/, kiosk/config/),
// so the generator reads them from here rather than from a monorepo parent.
const REPO = KIOSK_WEB;
const LIST_FILE = join(REPO, 'kiosk', 'world', 'prepared-choices.json');
const WORLD_FILE = join(REPO, 'kiosk', 'world', 'world.json');
const ROUTING_FILE = join(REPO, 'kiosk', 'config', 'models.example.yaml');
const MOCKUP_FILE = join(REPO, 'docs', 'design', 'kiosk', 'apollo-kiosk-mockup.html');
const FIXTURES = join(KIOSK_WEB, 'dev', 'fixtures');
const OUT = 'world';

const MARKER = 'KIOSK_DEV_FIXTURE';
const PICTURES_URL = `/${MARKER}/pictures/`;
const GCS = 'gs://kiosk-dev-fixture/questions/';
const GOLDEN_START = Date.parse('2026-10-20T05:31:00Z');
/** The demo world (format chora-kiosk/world/v1): reads come back in its order (how_made.order_rule). */
const DEMO = JSON.parse(readFileSync(WORLD_FILE, 'utf8'));
if (DEMO.format !== 'chora-kiosk/world/v1') throw new Error(`[make-fixtures] ${WORLD_FILE} is ${DEMO.format}, not chora-kiosk/world/v1`);
/** The owner's two LIVE fresh-ideas presses of 19 Oct (K156, FINDINGS F43), replayed for Desalination's LIVE row. */
const F43_PRESSES = JSON.parse(readFileSync(join(KIOSK_WEB, 'dev', 'world', 'f43-presses.recorded.json'), 'utf8'));
/** The prepared papers' sums (K158, D3): the file the upload door checks against, "<sha256>  <file>" per line. */
const PAPER_SUMS = new Map(
  readFileSync(join(REPO, 'kiosk', 'world', 'papers', 'papers.sha256'), 'utf8')
    .trim()
    .split('\n')
    .map((l) => l.trim().split(/\s+/).reverse()),
);
/** Step 4's critique rows as the golden run left them (K155): read through the edge, never the mockup's notes. */
const STEP4_CRITIQUE = JSON.parse(readFileSync(join(KIOSK_WEB, 'dev', 'world', 'step4-critique.recorded.json'), 'utf8')).critique;

/** A tier's model in the routing file (K132 made light and companion gpt-oss:120b; a K62 swap edits one line). */
function tierModel(name) {
  const m = new RegExp(`^  ${name}:\\s*\\{[^}]*model: "([^"]+)"`, 'm').exec(readFileSync(ROUTING_FILE, 'utf8'));
  if (!m) throw new Error(`[make-fixtures] ${ROUTING_FILE} has no tier ${name}`);
  return m[1];
}
// The models stamp on every manifest entry (PREPARED-CHOICES.md section 6): each tier's model when the run
// step ran the choice, read from the gateway's GET /kiosk/v1/models; here, the routing file's.
const MODEL_STAMP = Object.fromEntries(['hard', 'middle', 'light', 'companion', 'image', 'embedding'].map((t) => [t, tierModel(t)]));
// Each agent's tier (the routing file's by_requested_model and by_agent).
const MODELS = { qgen: tierModel('hard'), critic: tierModel('middle'), explorer: tierModel('light'), companion: tierModel('companion') };
const MOCKUP = 'docs/design/kiosk/apollo-kiosk-mockup.html (Version 6)';

export function readInputs() {
  const listText = readFileSync(LIST_FILE, 'utf8');
  return { list: JSON.parse(listText), listText, mockup: readFileSync(MOCKUP_FILE, 'utf8') };
}

const sha256 = (data) => createHash('sha256').update(data).digest('hex');
const iso = (ms) => new Date(ms).toISOString().replace('.000Z', 'Z');

/** A stable UUIDv7-shaped id for a key (its time bits are a hash, not a time). */
export function idOf(key) {
  const h = sha256(`kiosk-dev-fixture:${key}`);
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-7${h.slice(13, 16)}-${'89ab'[parseInt(h[16], 16) & 3]}${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

/** consumption's servedOptionID (`domain/campaignquestion/served_id.go`): the opaque id the serve door gives an option. */
export function servedOptionId(questionIndex, label, text) {
  const u64 = (n) => {
    const b = Buffer.alloc(8);
    b.writeBigUInt64BE(BigInt(n));
    return b;
  };
  const prefixed = (s) => {
    const b = Buffer.from(s.trim(), 'utf8');
    return Buffer.concat([u64(b.length), b]);
  };
  return sha256(Buffer.concat([u64(questionIndex), prefixed(label), prefixed(text)])).slice(0, 16);
}

const traceId = (key) => sha256(`kiosk-dev-fixture:${key}.trace`).slice(0, 32);

function canonical(v) {
  if (Array.isArray(v)) return `[${v.map(canonical).join(',')}]`;
  if (v && typeof v === 'object') return `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${canonical(v[k])}`).join(',')}}`;
  return JSON.stringify(v);
}

export function buildWorld(list) {
  const world = {};
  const demoKeys = [...DEMO.goals, ...DEMO.concepts, ...DEMO.companions, ...DEMO.atoms].map((x) => x.key);
  for (const key of [...Object.keys(list.world_keys), ...demoKeys]) world[key] = idOf(key);
  return world;
}

const demoGoal = (key) => DEMO.goals.find((g) => g.key === key) ?? fail(`world.json has no goal ${key}`);
const demoConcept = (key) => DEMO.concepts.find((c) => c.key === key) ?? fail(`world.json has no concept ${key}`);
const companionOf = (goalKey) => DEMO.companions.find((c) => c.goal === goalKey) ?? fail(`world.json has no Companion on ${goalKey}`);

function fail(message) {
  throw new Error(`[make-fixtures] ${message}`);
}

function conceptTitle(conceptKey) {
  return demoConcept(conceptKey).title;
}

function choicesOf(list) {
  return list.stages.flatMap((s) => s.choices.map((c) => ({ ...c, stage: s.id })));
}

function pictureFor(key) {
  const file = PICTURE_OF[key];
  if (!file) throw new Error(`[make-fixtures] no picture for ${key}`);
  return { file, url: PICTURES_URL + file, ext: file.split('.').pop() };
}

function recordsFor(c, world, made) {
  const w = (key) => {
    if (!world[key]) throw new Error(`[make-fixtures] ${c.key} names world key ${key}, which the world lacks`);
    return world[key];
  };
  const picOf = (picture, draft) => (picture === null || picture === 'original' ? draft.image_url : made[picture].image_url);
  switch (c.kind) {
    case 'suggestions': {
      const batch = SUGGESTION_BATCHES[c.key];
      if (!batch) throw new Error(`[make-fixtures] the mockup world has no batch for ${c.key}`);
      return {
        goal_id: w(c.goal),
        focal_concept_id: w(c.focal),
        request_id: idOf(`${c.key}.request`),
        suggestion_ids: batch.map((_, i) => idOf(`${c.key}.s${i}`)),
        titles: batch.map(([title]) => title),
        edge_suggestion_ids: [],
      };
    }
    case 'practice_set':
      return {
        goal_id: w(c.goal),
        concept_id: w(c.concept),
        concept_key: normalizeConceptKey(conceptTitle(c.concept)),
        rung: c.rung,
        trace_id: traceId(c.key),
        question_count: 1,
      };
    case 'adoptable_set': {
      const holding = (batchKey) => made[batchKey].titles.flatMap((t, i) => (normalizeConceptKey(t) === c.concept_key ? [i] : []));
      const hits = holding(c.from);
      if (hits.length !== 1) throw new Error(`[make-fixtures] ${c.from} holds ${hits.length} suggestions keyed ${c.concept_key}, not one`);
      for (const other of c.also_in) {
        if (holding(other).length !== 1) throw new Error(`[make-fixtures] ${other} must hold one suggestion keyed ${c.concept_key}`);
      }
      return {
        goal_id: w(c.goal),
        suggestion_id: made[c.from].suggestion_ids[hits[0]],
        title: made[c.from].titles[hits[0]],
        concept_key: c.concept_key,
        rung: c.rung,
        twin_concept_id: idOf(`${c.key}.twin`),
        twin_edge_id: idOf(`${c.key}.twin-edge`),
        trace_id: traceId(c.key),
        question_count: 1,
      };
    }
    case 'question_draft': {
      const draftId = idOf(`${c.key}.draft`);
      const pic = c.image_for_stem ? pictureFor(c.key) : null;
      return {
        atom_id: w(c.atom),
        job_id: idOf(`${c.key}.job`),
        draft_id: draftId,
        question_type: c.question_type,
        image_url: pic ? pic.url : null,
        image_gcs_uri: pic ? `${GCS}${draftId}/stem.${pic.ext}` : null,
        image_mode: pic ? c.expect_image_mode : null,
      };
    }
    case 'word_revision': {
      const from = made[c.from];
      return {
        atom_id: from.atom_id,
        job_id: idOf(`${c.key}.job`),
        draft_id: idOf(`${c.key}.draft`),
        question_type: from.question_type,
        image_url: null,
        image_gcs_uri: null,
        image_mode: null,
        from_draft_id: from.draft_id,
      };
    }
    case 'picture_regen': {
      const draft = made[c.draft];
      const regen = idOf(`${c.key}.regen`);
      const pic = pictureFor(c.key);
      const source = c.source === null ? null : c.source === 'original' ? draft.image_gcs_uri : made[c.source].image_gcs_uri;
      return {
        atom_id: draft.atom_id,
        parent_job_id: draft.job_id,
        draft_id: draft.draft_id,
        regen_job_id: regen,
        mode: c.mode,
        source_image_gcs_uri: source,
        image_url: pic.url,
        image_gcs_uri: `${GCS}${draft.draft_id}/regen-${regen}.${pic.ext}`,
      };
    }
    case 'accept': {
      const draft = made[c.draft];
      return { atom_id: draft.atom_id, job_id: draft.job_id, draft_id: draft.draft_id, question_id: idOf(`${c.key}.question`), image_url: picOf(c.picture, draft) };
    }
    case 'manual_copy': {
      const draft = made[c.from];
      return {
        atom_id: draft.atom_id,
        manual_job_id: idOf(`${c.key}.job`),
        from_job_id: draft.job_id,
        from_draft_id: draft.draft_id,
        question_id: idOf(`${c.key}.question`),
        image_url: picOf(c.picture, draft),
      };
    }
    case 'bank':
      return {
        bank_id: idOf(`${c.key}.bank`),
        question_ids: c.questions.map((q) => made[q].question_id),
        assemble_job_id: idOf(`${c.key}.assemble`),
        test_set_id: idOf(`${c.key}.test-set`),
      };
    case 'graded_sample': {
      const bank = made[c.bank];
      if (!(c.key in GRADED_SCORES)) throw new Error(`[make-fixtures] the mockup world has no score for ${c.key}`);
      return {
        assessment_id: idOf(`${c.key}.assessment`),
        submission_id: idOf(`${c.key}.submission`),
        test_set_id: bank.test_set_id,
        test_set_question_id: idOf(`${c.key}.test-set-question`),
        question_id: bank.question_ids[0],
        ai_points_earned: GRADED_SCORES[c.key],
        points_possible: GRADED_POINTS_POSSIBLE,
      };
    }
    case 'greeting':
      return { companion_id: w(c.companion), turn_id: idOf(`${c.key}.turn`), model: MODELS.companion };
    case 'dose_open': {
      const goal = c.goal.split('.')[1];
      return {
        goal_id: w(c.goal),
        dose_id: idOf(`${c.key}.dose`),
        served_on: '2026-10-20',
        atom_ids: (DEMO.doses[companionOf(c.goal).key] ?? fail(`world.json has no dose for ${c.goal}`)).map((x) => w(x.atom)),
        greeting_companion_id: w(companionOf(c.goal).key),
      };
    }
    case 'weakness_paper': {
      // The run the golden run leaves at its review (PREPARED-CHOICES.md 5.13); the panel is the mockup world's stand-in.
      const sha = PAPER_SUMS.get(c.paper) ?? fail(`${c.key} names ${c.paper}, which kiosk/world/papers/papers.sha256 does not list`);
      const panel = WEAKNESS_PANELS[c.key] ?? fail(`the mockup world has no weakness panel for ${c.key}`);
      return {
        upload_id: idOf(`${c.key}.upload`),
        goal_id: w(c.goal),
        companion_id: w(c.companion),
        sha256: sha,
        status: 'AWAITING_REVIEW',
        proposed_edges: panel.map((e, i) => ({ id: idOf(`${c.key}.edge.${i}`), concept: e.label, descriptor: e.summary, confidence: e.strength })),
      };
    }
    default:
      throw new Error(`[make-fixtures] unknown kind ${c.kind} (${c.key})`);
  }
}

/** The manifest as the conductor writes it (PREPARED-CHOICES.md section 6), with the generator's ids and times. */
export function buildManifest(list, world, listText = JSON.stringify(list)) {
  const made = {};
  const choices = {};
  let last = GOLDEN_START;
  choicesOf(list).forEach((c, i) => {
    const { key, kind, stage, ...params } = c;
    const runAt = GOLDEN_START + i * 50_000;
    last = runAt + 40_000;
    const records = recordsFor(c, world, made);
    made[key] = records;
    choices[key] = {
      kind,
      stage,
      hidden: kind === 'suggestions' ? c.hidden : false,
      prepared_at: iso(last),
      run_at: iso(runAt),
      params_sha256: sha256(canonical({ key, kind, ...params })),
      params,
      records,
      models: MODEL_STAMP,
    };
  });
  return {
    format: 'chora-kiosk/prewarm-manifest/v1',
    made_at: iso(last + 60_000),
    commit: 'dev-fixture',
    list_sha256: sha256(listText),
    world,
    templates: { word_revision: list.templates.word_revision },
    choices,
  };
}

// ---------------------------------------------------------------- the product reads

const fixture = (source, method, path, rest) => ({ fixture: MARKER, source, method, path, ...rest });

function suggestionDto(id, focal, [title, why], createdAt, status) {
  return { suggestionId: id, kind: 'concept', status, title, focalConceptId: focal, rationale: why, modelId: MODELS.explorer, createdAt };
}

const SUGG = '/api/v1/me/concept-graph/suggestions';

/**
 * The recorded presses on the world's ids (K156): each row as consumption's suggestionDTO, a link's
 * ends found by their titles on the goal's map, and what its accept adds to the map (a patch: a link
 * draws its edge; a concept mints itself under the focal, as a batch's accept does).
 */
function livePresses(manifest, recorded) {
  const w = manifest.world;
  const ids = new Map(DEMO.concepts.filter((c) => c.goal === recorded.goal).map((c) => [c.title, w[c.key]]));
  const idOfTitle = (t, where) => ids.get(t) ?? fail(`${where} names ${JSON.stringify(t)}, which ${recorded.goal}'s map does not hold`);
  const focal = idOfTitle(recorded.focal, 'the replay focal');
  const presses = recorded.presses.map((p) => ({
    ...p,
    rows: p.rows.map((r) => {
      const where = `the replay row ${r.suggestion_id}`;
      const dto = {
        suggestionId: r.suggestion_id,
        kind: r.kind,
        status: 'pending',
        ...(r.kind === 'edge'
          ? { sourceConceptId: idOfTitle(r.source, where), targetConceptId: idOfTitle(r.target, where), class: r.class }
          : { title: r.title ?? fail(`${where} is a concept with no title`), ...(r.atom_refs ? { atomRefs: r.atom_refs } : {}) }),
        focalConceptId: focal,
        rationale: r.rationale,
        modelId: r.model_id,
        createdAt: r.created_at,
      };
      const edge = { edgeId: idOf(`live.${r.suggestion_id}.edge`), provenance: 'companion_suggested_accepted' };
      let patch;
      if (r.kind === 'edge') {
        patch = { append: { edges: [{ ...edge, sourceConceptId: dto.sourceConceptId, targetConceptId: dto.targetConceptId, class: dto.class }] } };
      } else {
        const id = idOf(`live.${r.suggestion_id}.concept`);
        patch = {
          append: {
            concepts: [{ conceptId: id, title: dto.title, atomRefs: [], provenance: 'companion_suggested_accepted' }],
            edges: [{ ...edge, sourceConceptId: focal, targetConceptId: id, class: 'hierarchy' }],
          },
          assign: { 'campaign.nodes': { [id]: { rungsCleared: 0, currentRungCorrect: 0, cooling: false, advancedToday: false } } },
        };
      }
      return { dto, patch: { after: [decidedRe(r.suggestion_id, 'accept')], ...patch } };
    }),
  }));
  return { goalKey: recorded.goal, focal, presses };
}

function goalBatches(manifest, goalKey) {
  const goalId = manifest.world[goalKey];
  return Object.entries(manifest.choices).filter(([, e]) => e.kind === 'suggestions' && e.records.goal_id === goalId);
}

/** The concepts a batch mints on accept: one per concept suggestion, under the focal. */
function acceptedConcepts(key, entry) {
  return entry.records.suggestion_ids.map((sid, i) => ({ id: idOf(`${key}.s${i}.concept`), edge: idOf(`${key}.s${i}.edge`), title: entry.records.titles[i], sid }));
}

const byOrder = (a, b) => a.order - b.order;

// consumption domain/growth/curve.go at eeaec46eb: the cumulative EXP to enter each stage, and the
// innate tools each stage has unlocked (toolsByStage; the read lists them sorted by name).
const STAGE_EXP = [0, 0, 50, 200, 500, 1200, 3000];
const TOOLS_BY_STAGE = [
  [],
  ['cite_atom'],
  ['cite_atom', 'atom_search'],
  ['cite_atom', 'atom_search', 'ebbinghaus_state'],
  ['cite_atom', 'atom_search', 'ebbinghaus_state', 'persona_lookup', 'score_atom_for_learner'],
  ['cite_atom', 'atom_search', 'ebbinghaus_state', 'persona_lookup', 'score_atom_for_learner'],
  ['cite_atom', 'atom_search', 'ebbinghaus_state', 'persona_lookup', 'score_atom_for_learner'],
];

// The model tier each stage reaches (ADR-149's stage table, as the mockup's CX_STAGE_MIND reads it).
const TIER_BY_STAGE = ['flash-lite', 'flash-lite', 'flash-lite', 'flash', 'flash', 'flash-reasoning', 'pro'];

/** A Companion's growth read as the bridge serves it, from world.json's sheet. */
function growthOf(c) {
  const tools = [...TOOLS_BY_STAGE[c.stage]].sort();
  if (tools.length !== c.abilities) fail(`${c.key} has ${c.abilities} abilities in world.json, but stage ${c.stage} unlocks ${tools.length} tools`);
  return {
    companionId: idOf(c.key),
    growthStage: c.stage,
    stageName: '',
    displayName: c.name,
    species: c.species,
    shinyVariant: false,
    rarity: 'common',
    expCurrent: c.exp_shown - STAGE_EXP[c.stage],
    expNextThreshold: c.stage >= 6 ? 0 : STAGE_EXP[c.stage + 1],
    expCumulative: c.exp_shown,
    effectiveLlmTier: TIER_BY_STAGE[c.stage],
    effectiveMaxOutputTokens: 1024,
    unlockedTools: tools,
    ahaMomentConsumed: false,
    hatchedAt: '2026-10-01T02:00:00Z',
    lastStageUpAt: null,
  };
}

// A Companion's growth ledger, newest first: the seed's grant at its hatching, then (for the active
// Companion) each prepared dose open, the first credited up to the world's EXP shown and the rest capped.
function growthEventsOf(c, manifest) {
  const rows = [];
  const row = (source, at, expDelta, expTotalAfter, dailyCapHit) => ({
    awardedAt: at,
    dailyCapHit,
    expDelta,
    expTotalAfter,
    growthEventId: idOf(`${c.key}.growth.${rows.length}`),
    source,
    stageAfter: c.stage,
    stageBefore: c.stage,
    triggeredStageUp: false,
  });
  rows.push(row('admin_grant', '2026-10-01T02:00:00Z', c.exp_seeded, c.exp_seeded, false));
  if (c.active) {
    const opens = Object.values(manifest.choices).filter((x) => x.kind === 'dose_open').map((x) => x.prepared_at).sort();
    opens.forEach((at, i) => rows.push(row('daily_dose_open', at, i === 0 ? c.exp_shown - c.exp_seeded : 0, c.exp_shown, true)));
  } else if (c.exp_shown !== c.exp_seeded) {
    fail(`${c.key} is not active, so nothing credits it after the seed, but world.json shows ${c.exp_shown} against ${c.exp_seeded} seeded`);
  }
  return rows.reverse();
}

// K135 (W69): what consumption credits for a won hex, growth/curve.go's amounts: the winning answer clears
// the last rung (campaign_rung_cleared) and wins the node (campaign_node_won), two events in that order.
const WIN_CREDITS = [
  ['campaign_rung_cleared', 8],
  ['campaign_node_won', 25],
];
// The skills each species holds by the stage it reaches: progress_mirror from stage 1 (consumption migration
// 0086), explain_anew and recap_scribe waking at stage 2 (the mockup's stage-up, CX_STAGE_UP woke); a
// species the world wins no hex with needs none. Slots are stage + 1 (growth/slots.go, ADR-218 D2).
const SKILLS_BY_SPECIES = {
  penguin: [
    ['progress_mirror', 1],
    ['explain_anew', 2],
    ['recap_scribe', 2],
  ],
};

/** The stage a cumulative EXP reaches (STAGE_EXP's thresholds). */
const stageAt = (exp) => STAGE_EXP.findLastIndex((t) => exp >= t);

/**
 * W69: a Companion's ledger, growth and loadout once a visitor wins a hex on its goal: the win's two
 * credits on top of its ledger (newest first), the growth they reach, and the skills of that stage.
 */
function afterWin(c, manifest) {
  const seeded = growthEventsOf(c, manifest);
  const last = Object.values(manifest.choices).map((x) => x.prepared_at).sort().at(-1);
  // A visitor's win comes after every prepared time of the golden run: an hour after its last.
  const at = new Date(Date.parse(last) + 3_600_000).toISOString().replace('.000Z', 'Z');
  let total = c.exp_shown;
  const credits = WIN_CREDITS.map(([source, delta], i) => {
    const before = stageAt(total);
    total += delta;
    const after = stageAt(total);
    return { awardedAt: at, dailyCapHit: false, expDelta: delta, expTotalAfter: total, growthEventId: idOf(`${c.key}.growth.win.${i}`), source, stageAfter: after, stageBefore: before, triggeredStageUp: after > before };
  });
  const stage = stageAt(total);
  const growth = { ...growthOf({ ...c, stage, exp_shown: total, abilities: TOOLS_BY_STAGE[stage].length }), lastStageUpAt: stage > c.stage ? at : null };
  return { events: [...credits.reverse(), ...seeded], growth, stage };
}

/** A Companion's loadout as consumption's skills read serves it (the shape companions.service.ts normalises). */
function loadoutOf(c, stage) {
  const path = SKILLS_BY_SPECIES[c.species] ?? fail(`${c.key} is a ${c.species}, whose skills the dev world does not name`);
  const grants = path.filter(([, s]) => s <= stage);
  return {
    companionId: idOf(c.key),
    skillGrants: grants.map(([k]) => k),
    equippedSkills: [],
    grants: grants.map(([skillKey, unlockedAtStage]) => ({ skillKey, skillKind: 'active', slotCost: 1, equipped: false, unlockedVia: 'species_path', unlockedAtStage, catalogueActive: true })),
    skillSlotsUnlocked: stage + 1,
    slotsUsed: 0,
    evolutionTier: TIER_BY_STAGE[stage],
    growthStage: stage,
  };
}

function graphOf(manifest, goalKey, acceptedBatch) {
  const g = demoGoal(goalKey);
  const w = manifest.world;
  const own = DEMO.concepts.filter((c) => c.goal === goalKey).sort(byOrder);
  const concepts = own.map((c) => ({
    conceptId: w[c.key],
    title: c.title,
    atomRefs: [],
    provenance: 'learner_authored',
    ...(c.cue === 'mastered' ? { mastered: true } : {}),
    ...(c.cue === 'shaky' || c.cue === 'due'
      ? { growthEdge: { edgeId: idOf(`${c.key}.growth-edge`), conceptKey: normalizeConceptKey(c.title), strength: c.cue === 'shaky' ? 0.6 : 0.35, isDue: c.cue === 'due' } }
      : {}),
  }));
  const edges = DEMO.edges
    .filter((e) => e.goal === goalKey)
    .sort(byOrder)
    .map((e) => ({
      edgeId: idOf(`${goalKey}.edge.${e.from}.${e.to}`),
      sourceConceptId: w[e.from],
      targetConceptId: w[e.to],
      class: e.kind === 'link' ? 'lateral' : 'hierarchy',
      provenance: 'learner_authored',
    }));
  const nodes = {};
  for (const c of own) {
    const st = c.campaign;
    nodes[w[c.key]] =
      st.state === 'won'
        ? { rungsCleared: 6, currentRungCorrect: 0, wonAt: `${st.won_on}T02:00:00Z`, cooling: false, advancedToday: false }
        : { rungsCleared: st.rungs_cleared, currentRungCorrect: st.counted, cooling: false, advancedToday: false };
  }
  if (acceptedBatch) {
    const [key, entry] = acceptedBatch;
    for (const n of acceptedConcepts(key, entry)) {
      concepts.push({ conceptId: n.id, title: n.title, atomRefs: [], provenance: 'companion_suggested_accepted' });
      edges.push({ edgeId: n.edge, sourceConceptId: entry.records.focal_concept_id, targetConceptId: n.id, class: 'hierarchy', provenance: 'companion_suggested_accepted' });
      nodes[n.id] = { rungsCleared: 0, currentRungCorrect: 0, cooling: false, advancedToday: false };
    }
  }
  const won = own.filter((c) => c.key !== g.root && c.campaign.state === 'won').length;
  const companion = companionOf(goalKey);
  return {
    goalId: w[goalKey],
    title: demoConcept(g.root).title,
    rootConceptId: w[g.root],
    attachedCompanionId: w[companion.key],
    attachedCompanionName: companion.name,
    concepts,
    edges,
    campaign: { focusConceptId: w[g.march], frontierTotal: concepts.length - 1, frontierWon: won, canSeal: false, nodes },
  };
}

const decidedRe = (sid, actions) => `^POST /api/v1/me/concept-graph/suggestions/${sid}/(${actions})$`;

/** W41: each LIVE press's ideas as pending rows of the suggestions list, from its run's read until the idea is decided. */
function livePending(live) {
  const seen = new Set();
  return live.presses.flatMap((p) =>
    p.rows.flatMap((r) => {
      if (seen.has(r.dto.suggestionId)) return [];
      seen.add(r.dto.suggestionId);
      return [{ after: [`^GET ${SUGG}/requests/${p.request_id}$`], until: [decidedRe(r.dto.suggestionId, 'accept|dismiss')], append: { suggestions: [{ ...r.dto, status: 'pending' }] } }];
    }),
  );
}

function subsets(items) {
  const out = [];
  for (let mask = 1; mask < 1 << items.length; mask++) out.push(items.filter((_, i) => mask & (1 << i)));
  return out.sort((a, b) => a.length - b.length);
}

function servedQuestion(questionIndex, q) {
  const options = q.options.map((label) => ({ option_id: servedOptionId(questionIndex, label, ''), label }));
  options.sort((a, b) => (a.option_id < b.option_id ? -1 : a.option_id > b.option_id ? 1 : 0));
  return { question_type: 'mcq', stem: q.stem, options };
}

// The set lane's served trace, in the shape recorded from the stack (src/app/live/kinds/campaign-trace.recorded.json):
// the critique row counts and carries no verdict, each candidate's critique_verdict row judges, and only a
// guardrail row keeps its notes (consumption's SanitizeServedTrace).
function servedTrace(entry, candidates) {
  const start = Date.parse(entry.run_at);
  const row = (name, status, at, extra = {}) => ({ name, status, started_at: iso(start + at * 1000), completed_at: iso(start + (at + 4) * 1000), ...extra });
  const screened = { notes: 'not_screened (local edition)' };
  return [
    row('validate_input', 'ACCEPTED', 0),
    row('guardrail_pre', 'COMPLETED', 0, screened),
    row('plan_chunks', 'COMPLETED', 0),
    row('generate', 'COMPLETED', 4, { attempt: 1, input_tokens: 1820, output_tokens: 640 }),
    row('guardrail_post', 'COMPLETED', 14, { attempt: 1, ...screened }),
    row('critique', 'COMPLETED', 18, { attempt: 1, input_tokens: 2110, output_tokens: 310 }),
    ...Array.from({ length: candidates }, () => row('critique_verdict', 'ACCEPTED', 22, { attempt: 1, accepted: true })),
    row('quality_gate', 'ACCEPTED', 26, { attempt: 1 }),
    row('publish_chunk', 'COMPLETED', 26),
    row('finalize_set', 'COMPLETED', 26),
    row('publish_completed', 'COMPLETED', 26),
  ];
}

function answerResult(q, chosen, state, rung) {
  const right = servedOptionId(0, q.options[q.correct], '');
  const correct = chosen === q.options[q.correct];
  const nowCorrect = state.correct + (correct ? 1 : 0);
  const clears = correct && nowCorrect >= 2;
  const cleared = clears ? state.rungs + 1 : state.rungs;
  return {
    correct,
    rung,
    is_refresher: false,
    counted: correct,
    cleared_rung: clears ? rung : 0,
    won: clears && cleared >= 6,
    paced_today: false,
    rungs_cleared: cleared,
    current_rung_correct: clears ? 0 : nowCorrect,
    needed_correct: 2,
    retention_r: 1,
    correct_option_id: right,
    explainer: q.explain,
  };
}

/** Step 4's candidate for a word-revision path (draft.h4, words.r, words.r.s, ...). */
function step4Candidate(key, draftId, imageUrl, imageGcsUri) {
  const chipsOf = { r: 'Turn it into a real-life scenario', s: 'Make the question simpler', e: 'Add a one-line explanation' };
  const path = key === 'draft.h4' ? [] : key.split('.').slice(1);
  let stem = STEP4.stem;
  const labels = [...STEP4.options];
  let explainer = '';
  for (const p of path) {
    const chip = STEP4.chips[chipsOf[p]];
    if (chip.stem) stem = chip.stem;
    if (chip.option) labels[chip.option[0]] = chip.option[1];
    if (chip.explainer) explainer = chip.explainer;
  }
  return {
    candidate: {
      draft_id: draftId,
      type: 'mcq',
      prompt: stem,
      mcq_payload: {
        options: labels.map((label, i) => ({ option_id: `opt_${i + 1}`, label, is_correct: i === STEP4.correct, explainer: i === STEP4.correct ? explainer : '' })),
      },
      model_used: MODELS.qgen,
      ...(imageUrl ? { image_url: imageUrl, image_gcs_uri: imageGcsUri } : {}),
    },
  };
}

// The conductor's xray of a served set (xray.go Compose): each stage with its duration and the simulated
// safety mark on a guardrail, never its notes; the governance rows carry no model id on the kiosk (recorded).
function xrayOf(traceId, trace) {
  const last = trace[trace.length - 1].completed_at;
  const stages = trace.map((s) => ({
    name: s.name,
    status: s.status,
    started_at: s.started_at,
    completed_at: s.completed_at,
    duration_ms: Date.parse(s.completed_at) - Date.parse(s.started_at),
    attempt: s.attempt ?? null,
    input_tokens: s.input_tokens ?? null,
    output_tokens: s.output_tokens ?? null,
    ...('accepted' in s ? { accepted: s.accepted } : {}),
    safety: s.name.startsWith('guardrail') ? 'simulated_on_local' : null,
  }));
  const decision = (agent) => ({ agent, decision: 'accepted', at: last, model: '', reasoning_summary: 'all 1 candidate(s) accepted' });
  return { run_id: traceId, kind: 'campaign_set', trace_id: traceId, generated_at: last, stages, decisions: [decision('qgen_question'), decision('qgen_critic')] };
}

// Step 4's job trace: creation runs the qgen crew's SINGLE lane, as recorded from the stack (draft.h4 in
// src/app/exhibits/engine/crews.recorded.json, words.f in kiosk/stack/tests/words-trace.recorded.json): one
// critique row carries the verdict and the critic's note (no critique_verdict row, which is the campaign set
// lane's), and the guardrail rows say not_screened. The draft's candidate_json is left out, as the stack's
// recording does.
function jobTrace(key, entry, picture) {
  const start = Date.parse(entry.run_at);
  const at = (s) => iso(start + s * 1000);
  const row = (name, status, s, e, extra = {}) => ({ name, status, started_at: at(s), completed_at: at(e), ...extra });
  const screened = { notes: 'not_screened (local edition)' };
  // The screen reads the last critique row; words.e.f.s's first, rejected round is not modelled here.
  // K187: the scenario chip's paths (letter r) have no recorded critique yet; their note is the labelled stand-in.
  const note = STEP4_CRITIQUE[key]?.at(-1)?.notes ?? (key.split('.').slice(1).includes('r') ? STEP4_SCENARIO_STANDIN.critique : undefined);
  if (!note) throw new Error(`[make-fixtures] step4-critique.recorded.json has no critique row for ${key}`);
  return [
    row('validate_input', 'ACCEPTED', 0, 0),
    row('guardrail_pre', 'COMPLETED', 0, 1, screened),
    row('generate', 'COMPLETED', 1, 12, { attempt: 1, input_tokens: 1460, output_tokens: 520, notes: 'candidate produced' }),
    row('guardrail_post', 'COMPLETED', 12, 13, { attempt: 1, ...screened }),
    row('critique', 'ACCEPTED', 13, 21, { attempt: 1, input_tokens: 1980, output_tokens: 240, notes: note, accepted: true, suggested_revisions: [] }),
    row('quality_gate', 'ACCEPTED', 21, 21, { attempt: 1, notes: note }),
    ...(picture ? [row('render_image', 'COMPLETED', 21, 30, { attempt: 1, notes: 'rendered 1/1 image(s)' })] : []),
    row('publish_completed', 'COMPLETED', 30, 30, { attempt: 1, notes: 'accepted' }),
  ];
}

export function buildFixtures(list, world, manifest, recorded = F43_PRESSES) {
  const files = [];
  const live = livePresses(manifest, recorded);
  const add = (name, json) => files.push({ name: `${OUT}/${name}.json`, json });
  const listSrc = 'kiosk/world/prepared-choices.json';

  add('manifest', fixture(`PREPARED-CHOICES.md section 6; every choice of ${listSrc}, the generator's ids and times; values from ${MOCKUP}`, 'GET', '/api/v1/kiosk/prewarm/manifest', { status: 200, body: manifest }));

  const growthFixtures = new Map();
  for (const c of DEMO.companions) {
    const src = `consumption companion_growth_handlers.go (growthResp), camelCased and wrapped in {data} by the gateway's companion bridge (companionbridge.go); stage, EXP and abilities of kiosk/world/world.json; tools of curve.go toolsByStage`;
    add(`companion-${c.key.split('.')[1]}-growth`, fixture(src, 'GET', `/api/v1/me/companions/${world[c.key]}/growth`, { status: 200, body: { data: growthOf(c) } }));
    const evSrc = `consumption companion_growth_handlers.go (eventRecordResp), camelCased and wrapped in {data} by the edge, as recorded from the stack on 18 Oct; the seed's grant of kiosk/world/world.json exp_seeded, then each prepared dose open crediting the active Companion (K102, capped once a day)`;
    add(`companion-${c.key.split('.')[1]}-growth-events`, fixture(evSrc, 'GET', `/api/v1/me/companions/${world[c.key]}/growth-events`, { status: 200, body: { data: { events: growthEventsOf(c, manifest) } } }));
    growthFixtures.set(c.key, { growth: files.at(-2).json, events: files.at(-1).json });
  }

  // The atlas's list read (lead from the web session, 19 Oct: the dev world had none, so the atlas could not load).
  const cards = DEMO.goals.map((g) => {
    const m = graphOf(manifest, g.key, null);
    return {
      goalId: m.goalId,
      title: m.title,
      northStarNote: m.title,
      rootConceptId: m.rootConceptId,
      kind: 'curiosity',
      status: 'active',
      attachedCompanionId: m.attachedCompanionId,
      conceptCount: m.concepts.length,
      shakyCount: m.concepts.filter((c) => c.growthEdge).length,
      masteredCount: m.concepts.filter((c) => c.mastered).length,
      createdAt: manifest.made_at,
      updatedAt: manifest.made_at,
    };
  });
  add('maps-list', fixture(`consumption maps_handler.go (mapCardDTO; title the root's, counts over the root's sub-tree); kind and northStarNote as kiosk/world/world.json's seed posts each goal; times the manifest's made_at`, 'GET', '/api/v1/me/maps', { status: 200, body: { items: cards } }));

  for (const goalKey of DEMO.goals.map((g) => g.key)) {
    const goalId = world[goalKey];
    const slug = goalKey.split('.')[1];
    const batches = goalBatches(manifest, goalKey);
    const mapSrc = `consumption maps_handler.go (MapGraph, campaign nodes); the map of ${MOCKUP} (HOOK_MAP, ATLAS); after an accept, the batch's concepts under its focal`;
    add(`map-${slug}-graph`, fixture(mapSrc, 'GET', `/api/v1/me/maps/${goalId}/graph`, {
      status: 200,
      body: graphOf(manifest, goalKey, null),
      variants: batches.map((b) => ({ after: b[1].records.suggestion_ids.map((sid) => decidedRe(sid, 'accept')), status: 200, body: graphOf(manifest, goalKey, b) })),
      ...(goalKey === live.goalKey ? { patches: live.presses.flatMap((p) => p.rows.map((r) => r.patch)) } : {}),
    }));

    const pendingOf = (decided) =>
      batches
        .filter(([key]) => !decided.includes(key))
        .flatMap(([key, e]) => e.records.suggestion_ids.map((sid, i) => suggestionDto(sid, e.records.focal_concept_id, SUGGESTION_BATCHES[key][i], e.prepared_at, 'pending')));
    const visible = batches.filter(([, e]) => !e.hidden).map(([key]) => key);
    add(`suggestions-${slug}`, fixture(`consumption concept_suggestion_handler.go (suggestionDTO, pending only, ?goalId= fenced); every batch of ${listSrc} on this map, the hidden ones too`, 'GET', '/api/v1/me/concept-graph/suggestions', {
      query: { goalId },
      status: 200,
      body: { suggestions: pendingOf([]) },
      variants: subsets(visible).map((decided) => ({
        after: decided.flatMap((key) => manifest.choices[key].records.suggestion_ids.map((sid) => decidedRe(sid, 'accept|dismiss'))),
        status: 200,
        body: { suggestions: pendingOf(decided) },
      })),
      // W41: a LIVE press's ideas wait in the product as pending once its run is read, each until the visitor
      // accepts or dismisses it, so they outlive the drawer that showed them (a repeat across presses once).
      ...(goalKey === live.goalKey ? { patches: livePending(live) } : {}),
    }));

    for (const [key, e] of batches) {
      e.records.suggestion_ids.forEach((sid, i) => {
        for (const [action, status] of [['accept', 'accepted'], ['dismiss', 'dismissed']]) {
          add(`suggestion-${key}-${i}-${action}`, fixture(`consumption concept_suggestion_handler.go:590-617 (200, the suggestion DTO); ${key}`, 'POST', `/api/v1/me/concept-graph/suggestions/${sid}/${action}`, {
            status: 200,
            body: suggestionDto(sid, e.records.focal_concept_id, SUGGESTION_BATCHES[key][i], e.prepared_at, status),
          }));
        }
      });
    }
  }

  // K156: Desalination's LIVE fresh-ideas row answers with the owner's first press, and Do it again with
  // the second (F43's link ideas; F44's repeats kept on purpose, the shape a fix must handle).
  const replaySrc = 'dev/world/f43-presses.recorded.json (the owner\'s presses of 19 Oct, chora_consumption rows read only, ends by title)';
  add('live-sugg-generate', fixture(`consumption concept_suggestion_handler.go (202, suggestionGenerateResp); ${replaySrc}: press 1, then press 2 for every Do it again`, 'POST', `${SUGG}/generate`, {
    match_body: { focalConceptId: live.focal },
    sequence: live.presses.map((p) => ({ status: 202, body: { status: 'requested', requestId: p.request_id, focalConceptId: live.focal } })),
  }));
  live.presses.forEach((p, n) => {
    add(`live-sugg-request-${n + 1}`, fixture(`consumption concept_suggestion_handler.go (suggestionRequestDTO, K51); ${replaySrc}, press ${n + 1}`, 'GET', `${SUGG}/requests/${p.request_id}`, {
      status: 200,
      body: { requestId: p.request_id, status: p.status, focalConceptId: live.focal, requestedAt: p.requested_at, completedAt: p.completed_at, suggestions: p.rows.map((r) => r.dto) },
    }));
    p.rows.forEach((r, i) => {
      for (const [action, status] of [['accept', 'accepted'], ['dismiss', 'dismissed']]) {
        add(`live-sugg-${n + 1}-${i}-${action}`, fixture(`consumption concept_suggestion_handler.go:590-617 (200, the suggestion DTO); ${replaySrc}, press ${n + 1}`, 'POST', `${SUGG}/${r.dto.suggestionId}/${action}`, {
          status: 200,
          body: { ...r.dto, status },
        }));
      }
    });
  });

  // The serve door: each prepared set on its concept, and the twin's set adopted (V1) by the concept
  // a visitor's accept mints from any batch holding the twin's key.
  const wins = [];
  for (const [key, e] of Object.entries(manifest.choices)) {
    if (e.kind !== 'practice_set' && e.kind !== 'adoptable_set') continue;
    const q = PRACTICE_QUESTIONS[key];
    if (!q) continue;
    const r = e.records;
    const targets = [];
    if (e.kind === 'practice_set') {
      const st = demoConcept(e.params.concept).campaign;
      if (st.state !== 'climbing') fail(`practice_set ${key} names ${e.params.concept}, which is ${st.state}, not climbing`);
      targets.push({ conceptId: r.concept_id, state: { rungs: st.rungs_cleared, correct: st.counted }, tag: '' });
    } else {
      for (const batchKey of [e.params.from, ...e.params.also_in]) {
        const batch = manifest.choices[batchKey];
        const n = acceptedConcepts(batchKey, batch).find((c) => normalizeConceptKey(c.title) === r.concept_key);
        targets.push({ conceptId: n.id, state: { rungs: 0, correct: 0 }, tag: `-${batchKey}` });
      }
    }
    for (const t of targets) {
      const src = `consumption goals_campaign_questions_handler.go (status ready, sanitised: is_correct and explainer stripped, options re-keyed by served_id.go and sorted; V5 trace); ${key}${e.kind === 'adoptable_set' ? ', adopted (V1) by the concept the accept mints' : ''}; the question of ${MOCKUP}`;
      add(`serve-${key}${t.tag}`, fixture(src, 'GET', `/api/v1/me/goals/${r.goal_id}/campaign/questions`, {
        query: { concept_id: t.conceptId, rung: String(r.rung) },
        status: 200,
        body: {
          status: 'ready',
          concept_id: t.conceptId,
          concept_key: r.concept_key,
          rung: r.rung,
          questions: { candidates: [servedQuestion(0, q)] },
          source: 'question_bank',
          pipeline_trace: servedTrace(e, 1),
          trace_id: r.trace_id,
        },
      }));
      add(`xray-${key}${t.tag}`, fixture(`kiosk conductor xray.go (Compose: the serve door's trace, then the governance decisions; shape recorded 19 Oct, src/app/xray/xray.recorded.json); ${key}`, 'GET', `/api/v1/kiosk/xray/${r.trace_id}`, {
        query: { kind: 'campaign_set', goal_id: r.goal_id, concept_id: t.conceptId, rung: String(r.rung) },
        status: 200,
        body: xrayOf(r.trace_id, servedTrace(e, 1)),
      }));
      q.options.forEach((label, i) => {
        const result = answerResult(q, label, t.state, r.rung);
        add(`answer-${key}${t.tag}-${i}`, fixture(`consumption goals_campaign_answers_handler.go (campaignAnswerResp; 2 correct clear a rung, campaign.go:52); ${key}, option ${label}`, 'POST', `/api/v1/me/goals/${r.goal_id}/campaign/questions/answer`, {
          match_body: { concept_id: t.conceptId, selected_option_id: servedOptionId(0, label, '') },
          status: 200,
          body: result,
        }));
        if (result.won) wins.push({ goalId: r.goal_id, file: files.at(-1).name });
      });
    }
  }

  // W69 (K135): a winning answer credits its goal's Companion: once the server logs that answer's fixture,
  // the Companion's ledger, growth and skills read as consumption leaves them after the win (a reset
  // forgets it). The skills read is served only for a Companion the world can win a hex with.
  for (const c of DEMO.companions) {
    const won = wins.filter((x) => x.goalId === world[c.goal]);
    if (won.length === 0) continue;
    const after = afterWin(c, manifest);
    const variant = (body) => won.map((x) => ({ after: [`^FIXTURE ${x.file.replace(/[.]/g, '\\.')}$`], status: 200, body }));
    const fx = growthFixtures.get(c.key);
    fx.growth.variants = variant({ data: after.growth });
    fx.events.variants = variant({ data: { events: after.events } });
    const skillsSrc = `consumption companion_instance_handlers.go (the skills read, camelCased by the edge, in the shape companions.service.ts normalises); grants of the species path: progress_mirror at stage 1 (migration 0086), explain_anew and recap_scribe at 2 (${MOCKUP}, CX_STAGE_UP woke); slots stage + 1 (growth/slots.go)`;
    add(`companion-${c.key.split('.')[1]}-skills`, fixture(skillsSrc, 'GET', `/api/v1/me/companions/${world[c.key]}/skills`, { status: 200, body: loadoutOf(c, c.stage), variants: variant(loadoutOf(c, after.stage)) }));
  }

  // K158 (W20): each prepared paper's run at its review, the panel production's job read carries
  // (consumption growth_edge_uploads_handler.go:67-97), and its confirm through the edge's resume route
  // (the orchestrator's answer, weakness_router.py); after a confirm the job reads COMPLETED.
  for (const [key, e] of Object.entries(manifest.choices)) {
    if (e.kind !== 'weakness_paper') continue;
    const r = e.records;
    const companion = DEMO.companions.find((c) => world[c.key] === r.companion_id) ?? fail(`${key}'s Companion ${r.companion_id} is not in world.json`);
    const upload = `/api/v1/me/growth-edges/uploads/${r.upload_id}`;
    const review = {
      familiar: { familiar_id: r.companion_id, name: companion.name },
      proposed_edges: r.proposed_edges.map((x) => ({ proposed_edge_id: x.id, concept_label: x.concept, summary: x.descriptor, strength: x.confidence, suggested_difficulty: 'standard' })),
      candidate_struggles: [],
      available_outputs: [],
    };
    const done = { upload_id: r.upload_id, status: 'COMPLETED', upserted_growth_edge_ids: r.proposed_edges.map((x) => idOf(`${x.id}.growth-edge`)) };
    add(`weakness-${key}`, fixture(`consumption growth_edge_uploads_handler.go:67-97 (the job; the panel only while AWAITING_REVIEW); ${key}, its panel the mockup world's stand-in`, 'GET', upload, {
      status: 200,
      body: { upload_id: r.upload_id, status: 'AWAITING_REVIEW', review },
      variants: [{ after: [`^POST ${upload}/resume$`], status: 200, body: done }],
    }));
    add(`weakness-${key}-resume`, fixture(`edge weakness_resume_handler.go:48 (the orchestrator's answer verbatim, weakness_router.py _status_for); ${key}`, 'POST', `${upload}/resume`, {
      status: 200,
      body: { upload_id: r.upload_id, status: 'completed', panel: null, interrupted: false, governance_status: 'approved' },
    }));
  }

  // Step 4's jobs: the draft and every word revision, read and accepted (Keep, K56).
  for (const [key, e] of Object.entries(manifest.choices)) {
    if (!(key === 'draft.h4' || (e.kind === 'word_revision' && key.startsWith('words.')))) continue;
    const r = e.records;
    const { candidate } = step4Candidate(key, r.draft_id, r.image_url, r.image_gcs_uri);
    const jobSrc = `creation question_jobs_handler.go (jobResponse; candidate_questions as candidateDraft); stage names from qgen_crew.py, counts illustrative; ${key}: DRAFT and its chips of ${MOCKUP}; the critic's note recorded through the edge (dev/world/step4-critique.recorded.json, K155)`;
    add(`job-${key}`, fixture(jobSrc, 'GET', `/api/atoms/${r.atom_id}/question-jobs/${r.job_id}`, {
      status: 200,
      body: {
        job_id: r.job_id,
        atom_id: r.atom_id,
        status: 'succeeded',
        mana_charged: 1,
        created_at: e.run_at,
        started_at: iso(Date.parse(e.run_at) + 1000),
        completed_at: e.prepared_at,
        candidate_questions: [candidate],
        pipeline_trace: jobTrace(key, e, !!r.image_url),
      },
    }));
    add(`job-${key}-accept`, fixture(`creation question_jobs_handler.go (acceptResponse: persisted questions, mana_debited); ${key} as written, overrides not applied`, 'POST', `/api/atoms/${r.atom_id}/question-jobs/${r.job_id}/accept`, {
      status: 200,
      body: {
        persisted: [{
          question_id: idOf(`${key}.kept`),
          atom_id: r.atom_id,
          tenant_id: idOf('tenant.kiosk'),
          type: 'mcq',
          prompt: candidate.prompt,
          revision: 1,
          latest_revision_id: idOf(`${key}.kept.revision`),
          created_at: e.prepared_at,
          updated_at: e.prepared_at,
          mcq_payload: candidate.mcq_payload,
        }],
        mana_debited: 0,
      },
    }));
  }

  for (const p of buildPictures(null)) {
    const file = p.name.replace('pictures/', '');
    add(`picture-${file.replace('.', '-')}`, fixture(`a picture the golden run would make, drawn by make-fixtures.mjs (${p.source})`, 'GET', `${PICTURES_URL}${file}`, { status: 200, file: p.name, content_type: p.contentType }));
  }
  return { files };
}

// ---------------------------------------------------------------- pictures

const xml = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function diagramSvg({ stages, outlets }) {
  const W = 440, BW = 250, BH = 38, GAP = 24, TOP = 22, OW = 190;
  const rows = stages.length + (outlets.length ? 1 : 0);
  const H = TOP * 2 + rows * BH + (rows - 1) * GAP + (outlets.length ? 10 : 0);
  const box = (x, y, w, label) =>
    `<rect x="${x}" y="${y}" width="${w}" height="${BH}" rx="8" fill="#ffffff" stroke="#5b6b82"/><text x="${x + w / 2}" y="${y + BH / 2 + 5}" text-anchor="middle">${xml(label)}</text>`;
  const arrow = (x1, y1, x2, y2) => `<path d="M${x1},${y1} L${x2},${y2}" stroke="#5b6b82" stroke-width="1.6" fill="none" marker-end="url(#a)"/>`;
  let s = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" font-family="sans-serif" font-size="14" fill="#1e293b">`;
  s += `<defs><marker id="a" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0,0 L10,5 L0,10 z" fill="#5b6b82"/></marker></defs>`;
  s += `<rect width="${W}" height="${H}" fill="#f8fafc"/>`;
  const x = (W - BW) / 2;
  stages.forEach((label, i) => {
    const y = TOP + i * (BH + GAP);
    if (i > 0) s += arrow(W / 2, y - GAP + 1, W / 2, y - 3);
    s += box(x, y, BW, label);
  });
  if (outlets.length) {
    const yLast = TOP + (stages.length - 1) * (BH + GAP) + BH;
    const y = yLast + GAP + 10;
    outlets.forEach((label, i) => {
      const ox = i === 0 ? 14 : W - OW - 14;
      s += arrow(W / 2, yLast + 1, ox + OW / 2, y - 3);
      s += box(ox, y, OW, label);
    });
  }
  return s + '</svg>';
}

/** A K159 scene stand-in: a plain card naming what the golden run's picture shows, marked as a dev fixture. */
function sceneSvg(caption) {
  const W = 640;
  const H = 400;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" font-family="sans-serif" fill="#1e293b">` +
    `<rect width="${W}" height="${H}" fill="#e8eef6"/><rect x="24" y="24" width="${W - 48}" height="${H - 48}" rx="18" fill="#ffffff" stroke="#9aa9bd" stroke-dasharray="8 6"/>` +
    `<text x="${W / 2}" y="${H / 2 - 6}" text-anchor="middle" font-size="22">${xml(caption)}</text>` +
    `<text x="${W / 2}" y="${H / 2 + 30}" text-anchor="middle" font-size="15" fill="#5b6b82">dev fixture: the golden run's scene picture replaces this</text></svg>`
  );
}

/** The pictures the fixtures point at; with the mockup text, their bytes too. */
export function buildPictures(mockup) {
  const out = Object.entries(DIAGRAMS).map(([name, d]) => ({
    name: `pictures/${name}.svg`,
    contentType: 'image/svg+xml',
    source: 'the stages of layoutDiagram, mockup 4366',
    bytes: Buffer.from(diagramSvg(d), 'utf8'),
  }));
  for (const [name, caption] of Object.entries(SCENES)) {
    out.push({ name: `pictures/${name}.svg`, contentType: 'image/svg+xml', source: 'K159 dev stand-in (W27)', bytes: Buffer.from(sceneSvg(caption), 'utf8') });
  }
  let images = null;
  if (mockup !== null) {
    const line = mockup.split('\n').find((l) => l.startsWith('const ILLUS_IMG = {'));
    if (!line) throw new Error('[make-fixtures] the mockup has no ILLUS_IMG line');
    images = Object.fromEntries([...line.matchAll(/(\w+): 'data:image\/jpeg;base64,([^']+)'/g)].map((m) => [m[1], m[2]]));
  }
  for (const key of ILLUSTRATIONS) {
    if (images && !images[key]) throw new Error(`[make-fixtures] the mockup's ILLUS_IMG has no ${key}`);
    out.push({
      name: `pictures/${key}.jpg`,
      contentType: 'image/jpeg',
      source: `ILLUS_IMG.${key}, mockup 2609`,
      bytes: images ? Buffer.from(images[key], 'base64') : null,
    });
  }
  return out;
}

// ---------------------------------------------------------------- write and check

const text = (json) => JSON.stringify(json, null, 2) + '\n';

function generated() {
  const { list, listText } = readInputs();
  const world = buildWorld(list);
  return buildFixtures(list, world, buildManifest(list, world, listText)).files;
}

/** Each way the committed dev/fixtures/world/ differs from the generator's output. */
export function checkFixtures() {
  const files = generated();
  const problems = [];
  const want = new Set(files.map((f) => f.name));
  for (const f of files) {
    const path = join(FIXTURES, f.name);
    if (!existsSync(path)) problems.push(`missing ${f.name}`);
    else if (readFileSync(path, 'utf8') !== text(f.json)) problems.push(`stale ${f.name}`);
  }
  const dir = join(FIXTURES, OUT);
  if (existsSync(dir)) {
    for (const name of readdirSync(dir)) if (!want.has(`${OUT}/${name}`)) problems.push(`extra ${OUT}/${name}`);
  }
  return problems;
}

function main(argv) {
  const cmd = argv[2];
  if (cmd === 'write') {
    const files = generated();
    rmSync(join(FIXTURES, OUT), { recursive: true, force: true });
    mkdirSync(join(FIXTURES, OUT), { recursive: true });
    for (const f of files) writeFileSync(join(FIXTURES, f.name), text(f.json));
    process.stdout.write(`make-fixtures: wrote ${files.length} fixture(s) to dev/fixtures/${OUT}/\n`);
    return 0;
  }
  if (cmd === 'check') {
    const problems = checkFixtures();
    for (const p of problems) process.stdout.write(`  ${p}\n`);
    process.stdout.write(problems.length ? `make-fixtures: CHECK FAIL, ${problems.length} problem(s); run npm run fixtures:write\n` : 'make-fixtures: CHECK PASS\n');
    return problems.length ? 1 : 0;
  }
  if (cmd === 'pictures') {
    const pictures = buildPictures(readInputs().mockup);
    mkdirSync(join(FIXTURES, 'pictures'), { recursive: true });
    for (const p of pictures) writeFileSync(join(FIXTURES, p.name), p.bytes);
    process.stdout.write(`make-fixtures: drew ${pictures.length} picture(s) into dev/fixtures/pictures/\n`);
    return 0;
  }
  process.stderr.write('usage: make-fixtures.mjs write | check | pictures\n');
  return 2;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) process.exit(main(process.argv));
