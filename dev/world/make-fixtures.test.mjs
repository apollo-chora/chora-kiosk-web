// Tests for the dev fixture generator: the prepared-choice manifest and the hook's product reads,
// built from kiosk/world/prepared-choices.json, the demo world (kiosk/world/world.json) and the AI
// outputs the mockup shows (mockup-world.mjs), served by the dev fixture server. Dev only: nothing here reaches the bundle (the no-fixture gate).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';

import { buildFixtures, buildManifest, buildPictures, buildWorld, checkFixtures, idOf, readInputs, servedOptionId } from './make-fixtures.mjs';
import { createFixtureServer, loadFixtureRoutes } from '../fixture-server.mjs';
import { normalizeConceptKey } from '../../src/app/shared/concept-key.ts';
import { STEP4_SCENARIO_STANDIN } from './mockup-world.mjs';

const { list, mockup } = readInputs();
const demo = JSON.parse(readFileSync(new URL('../../../kiosk/world/world.json', import.meta.url), 'utf8'));
const routing = readFileSync(new URL('../../../kiosk/config/models.example.yaml', import.meta.url), 'utf8');
const world = buildWorld(list);
const manifest = buildManifest(list, world);
const allChoices = list.stages.flatMap((s) => s.choices.map((c) => ({ ...c, stage: s.id })));

// The records each kind's entry carries (PREPARED-CHOICES.md section 5).
const RECORD_FIELDS = {
  suggestions: ['edge_suggestion_ids', 'focal_concept_id', 'goal_id', 'request_id', 'suggestion_ids', 'titles'],
  practice_set: ['concept_id', 'concept_key', 'goal_id', 'question_count', 'rung', 'trace_id'],
  adoptable_set: ['concept_key', 'goal_id', 'question_count', 'rung', 'suggestion_id', 'title', 'trace_id', 'twin_concept_id', 'twin_edge_id'],
  question_draft: ['atom_id', 'draft_id', 'image_gcs_uri', 'image_mode', 'image_url', 'job_id', 'question_type'],
  word_revision: ['atom_id', 'draft_id', 'from_draft_id', 'image_gcs_uri', 'image_mode', 'image_url', 'job_id', 'question_type'],
  picture_regen: ['atom_id', 'draft_id', 'image_gcs_uri', 'image_url', 'mode', 'parent_job_id', 'regen_job_id', 'source_image_gcs_uri'],
  accept: ['atom_id', 'draft_id', 'image_url', 'job_id', 'question_id'],
  manual_copy: ['atom_id', 'from_draft_id', 'from_job_id', 'image_url', 'manual_job_id', 'question_id'],
  bank: ['assemble_job_id', 'bank_id', 'question_ids', 'test_set_id'],
  graded_sample: ['ai_points_earned', 'assessment_id', 'points_possible', 'question_id', 'submission_id', 'test_set_id', 'test_set_question_id'],
  greeting: ['companion_id', 'model', 'turn_id'],
  dose_open: ['atom_ids', 'dose_id', 'goal_id', 'greeting_companion_id', 'served_on'],
  weakness_paper: ['companion_id', 'goal_id', 'proposed_edges', 'sha256', 'status', 'upload_id'],
};

/** The generated fixtures, their pictures and the hand-written conductor fixtures (the reset), served. */
async function serveWorld() {
  const dir = mkdtempSync(join(tmpdir(), 'kiosk-world-serve-'));
  for (const f of buildFixtures(list, world, manifest).files) {
    mkdirSync(dirname(join(dir, f.name)), { recursive: true });
    writeFileSync(join(dir, f.name), JSON.stringify(f.json));
  }
  for (const p of buildPictures(mockup)) {
    mkdirSync(dirname(join(dir, p.name)), { recursive: true });
    writeFileSync(join(dir, p.name), p.bytes);
  }
  cpSync(new URL('../fixtures/conductor', import.meta.url), join(dir, 'conductor'), { recursive: true });
  const server = createFixtureServer(loadFixtureRoutes(dir), { log: () => {} });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  return { server, base: `http://127.0.0.1:${server.address().port}` };
}

test('ids are UUID-shaped, stable and distinct', () => {
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
  assert.match(idOf('goal.water'), uuid);
  assert.equal(idOf('goal.water'), idOf('goal.water'));
  assert.notEqual(idOf('goal.water'), idOf('goal.nature'));
});

test("the served option id is production's (outputs of Go 1.26, served_id.go, run 17 Oct)", () => {
  assert.equal(servedOptionId(0, 'Reverse osmosis', ''), 'c16193213247371d');
  assert.equal(servedOptionId(0, 'Microfiltration', ''), '45a9397fcce7f69e');
  assert.equal(servedOptionId(1, 'Reverse osmosis', ''), '285162b6ccca83ae');
  assert.equal(servedOptionId(0, ' Café ', ''), '291d66043d898ced');
  assert.equal(servedOptionId(2, '', 'Sedimentation'), 'deff9a98215bfa5c');
});

test("the world holds every key of the list's world_keys and every key world.json names", () => {
  for (const key of Object.keys(list.world_keys)) assert.ok(world[key], key);
  for (const x of [...demo.goals, ...demo.concepts, ...demo.companions, ...demo.atoms]) assert.ok(world[x.key], x.key);
  assert.equal(new Set(Object.values(world)).size, Object.keys(world).length);
});

test("each goal's map is world.json's: concepts in its order with its titles, edges and kinds, campaign states and cues", () => {
  const files = buildFixtures(list, world, manifest).files;
  for (const goal of demo.goals) {
    const f = files.find((x) => x.json.path === `/api/v1/me/maps/${world[goal.key]}/graph`);
    assert.ok(f, goal.key);
    const g = f.json.body;
    const concepts = demo.concepts.filter((c) => c.goal === goal.key).sort((a, b) => a.order - b.order);
    assert.deepEqual(g.concepts.map((c) => c.title), concepts.map((c) => c.title), goal.key);
    assert.deepEqual(g.concepts.map((c) => c.conceptId), concepts.map((c) => world[c.key]));
    assert.equal(g.rootConceptId, world[goal.root]);
    assert.equal(g.title, concepts.find((c) => c.key === goal.root).title);
    assert.equal(g.campaign.focusConceptId, world[goal.march]);
    const companion = demo.companions.find((c) => c.goal === goal.key);
    assert.equal(g.attachedCompanionId, world[companion.key]);
    assert.equal(g.attachedCompanionName, companion.name);
    const edges = demo.edges.filter((e) => e.goal === goal.key).sort((a, b) => a.order - b.order);
    assert.deepEqual(
      g.edges.map((e) => [e.sourceConceptId, e.targetConceptId, e.class]),
      edges.map((e) => [world[e.from], world[e.to], e.kind === 'link' ? 'lateral' : 'hierarchy']),
    );
    for (const c of concepts) {
      const node = g.campaign.nodes[world[c.key]];
      const shown = g.concepts.find((x) => x.conceptId === world[c.key]);
      if (c.campaign.state === 'won') assert.deepEqual([node.rungsCleared, node.wonAt.slice(0, 10)], [6, c.campaign.won_on], c.key);
      else assert.deepEqual([node.rungsCleared, node.currentRungCorrect, node.wonAt], [c.campaign.rungs_cleared, c.campaign.counted, undefined], c.key);
      assert.equal(shown.mastered === true, c.cue === 'mastered', c.key);
      assert.equal(shown.growthEdge?.isDue === true, c.cue === 'due', c.key);
      assert.equal(!!shown.growthEdge, c.cue === 'due' || c.cue === 'shaky', c.key);
    }
    assert.equal(g.campaign.frontierWon, concepts.filter((c) => c.key !== goal.root && c.campaign.state === 'won').length);
  }
});

test("the atlas's list read: each goal as the map card consumption serves, in world.json's order", () => {
  // maps_handler.go mapCardDTO: the root's title, the seed's kind and note, the attached Companion, and the
  // counts over the root's sub-tree (shaky: a growth edge paints it; mastered).
  const files = buildFixtures(list, world, manifest).files;
  const f = files.find((x) => x.json.method === 'GET' && x.json.path === '/api/v1/me/maps');
  assert.ok(f, 'no fixture for GET /api/v1/me/maps');
  const items = f.json.body.items;
  assert.deepEqual(items.map((c) => c.goalId), demo.goals.map((g) => world[g.key]));
  for (const [i, goal] of demo.goals.entries()) {
    const concepts = demo.concepts.filter((c) => c.goal === goal.key);
    const root = concepts.find((c) => c.key === goal.root).title;
    const card = items[i];
    assert.deepEqual(
      [card.title, card.northStarNote, card.rootConceptId, card.kind, card.status, card.attachedCompanionId],
      [root, root, world[goal.root], 'curiosity', 'active', world[demo.companions.find((c) => c.goal === goal.key).key]],
      goal.key,
    );
    assert.deepEqual(
      [card.conceptCount, card.shakyCount, card.masteredCount],
      [concepts.length, concepts.filter((c) => c.cue === 'shaky' || c.cue === 'due').length, concepts.filter((c) => c.cue === 'mastered').length],
      goal.key,
    );
    assert.ok(card.createdAt && card.updatedAt, goal.key);
  }
});

test("each Companion's growth ledger leads to its growth read: the seed's grant, then the golden run's dose open, newest first", () => {
  // The read the walk and the Companions exhibit poll for credits (D8, 19 Oct: the fixture world had none), in
  // the shape recorded from the stack on 18 Oct (consumption eventRecordResp, camelCased and wrapped in {data}
  // by the edge): no companion id, the running total as expTotalAfter.
  const KEYS = ['awardedAt', 'dailyCapHit', 'expDelta', 'expTotalAfter', 'growthEventId', 'source', 'stageAfter', 'stageBefore', 'triggeredStageUp'];
  const files = buildFixtures(list, world, manifest).files;
  for (const c of demo.companions) {
    const f = files.find((x) => x.json.path === `/api/v1/me/companions/${world[c.key]}/growth-events`);
    assert.ok(f, c.key);
    assert.equal(f.json.method, 'GET');
    const events = f.json.body.data.events;
    assert.ok(events.every((e) => JSON.stringify(Object.keys(e).sort()) === JSON.stringify(KEYS)), c.key);
    assert.equal(events[0].expTotalAfter, c.exp_shown, c.key);
    assert.equal(events.at(-1).source, 'admin_grant', c.key);
    assert.equal(events.at(-1).expDelta, c.exp_seeded, c.key);
    assert.equal(events.reduce((n, e) => n + e.expDelta, 0), c.exp_shown, c.key);
    assert.ok(events.every((e, i) => i === 0 || e.awardedAt <= events[i - 1].awardedAt), `${c.key}: newest first`);
    assert.ok(events.every((e) => e.stageBefore === c.stage && e.stageAfter === c.stage && !e.triggeredStageUp), c.key);
  }
  // The golden run opens each goal's dose once; every open credits the ACTIVE Companion (K102), and the
  // daily cap lets only the first count (recorded: +2, then two capped 0s).
  const pingu = demo.companions.find((c) => c.active);
  const events = files.find((x) => x.json.path === `/api/v1/me/companions/${world[pingu.key]}/growth-events`).json.body.data.events;
  const opens = events.filter((e) => e.source === 'daily_dose_open');
  assert.equal(opens.length, Object.values(manifest.choices).filter((x) => x.kind === 'dose_open').length);
  assert.deepEqual(opens.map((e) => e.expDelta).reverse(), [pingu.exp_shown - pingu.exp_seeded, ...opens.slice(1).map(() => 0)]);
  assert.ok(opens.every((e) => e.dailyCapHit));
  for (const c of demo.companions.filter((x) => !x.active)) {
    const own = files.find((x) => x.json.path === `/api/v1/me/companions/${world[c.key]}/growth-events`).json.body.data.events;
    assert.deepEqual(own.map((e) => e.source), ['admin_grant'], c.key);
  }
});

test("each Companion's growth read is world.json's: stage, EXP shown, and its stage's tools, one per ability", () => {
  const THRESHOLD = [0, 0, 50, 200, 500, 1200, 3000];
  const files = buildFixtures(list, world, manifest).files;
  for (const c of demo.companions) {
    const f = files.find((x) => x.json.path === `/api/v1/me/companions/${world[c.key]}/growth`);
    assert.ok(f, c.key);
    const g = f.json.body.data;
    assert.deepEqual(
      [g.companionId, g.displayName, g.species, g.growthStage, g.expCumulative, g.expCurrent, g.expNextThreshold, g.unlockedTools.length],
      [world[c.key], c.name, c.species, c.stage, c.exp_shown, c.exp_shown - THRESHOLD[c.stage], THRESHOLD[c.stage + 1], c.abilities],
      c.key,
    );
  }
});

test('every manifest entry carries the models stamp: each tier as the routing file names it (PREPARED-CHOICES.md 6)', () => {
  const tier = (name) => new RegExp(`^  ${name}:\\s*\\{[^}]*model: "([^"]+)"`, 'm').exec(routing)[1];
  const want = Object.fromEntries(['hard', 'middle', 'light', 'companion', 'image', 'embedding'].map((t) => [t, tier(t)]));
  assert.equal(want.light, 'gpt-oss:120b');
  for (const [key, entry] of Object.entries(manifest.choices)) assert.deepEqual(entry.models, want, key);
});

test('the model ids the fixtures name are the routing file’s tiers (K132)', () => {
  const tier = (name) => new RegExp(`^  ${name}:\\s*\\{[^}]*model: "([^"]+)"`, 'm').exec(routing)[1];
  const named = new Set();
  for (const f of buildFixtures(list, world, manifest).files) {
    JSON.stringify(f.json).replace(/"model(?:_used)?":"([^"]+)"/g, (_all, m) => (named.add(m), ''));
  }
  assert.ok(named.size > 0, 'the fixtures name no model at all: the check would pass vacuously');
  for (const m of named) assert.ok([tier('hard'), tier('middle'), tier('light'), tier('companion')].includes(m), m);
  assert.ok(!named.has('glm-5.3-flash'));
});

test('the manifest is format v1 and carries the world and the template, copied', () => {
  assert.equal(manifest.format, 'chora-kiosk/prewarm-manifest/v1');
  assert.deepEqual(manifest.world, world);
  assert.deepEqual(manifest.templates.word_revision, list.templates.word_revision);
  assert.match(manifest.list_sha256, /^[0-9a-f]{64}$/);
});

test('every choice of every stage has an entry with its params, stamps and exactly its kind\'s records', () => {
  assert.deepEqual(Object.keys(manifest.choices), allChoices.map((c) => c.key));
  for (const c of allChoices) {
    const e = manifest.choices[c.key];
    const { key, kind, stage, ...params } = c;
    assert.equal(e.kind, kind, key);
    assert.equal(e.stage, stage, key);
    assert.equal(e.hidden, kind === 'suggestions' ? c.hidden : false, key);
    assert.deepEqual(e.params, params, key);
    assert.match(e.params_sha256, /^[0-9a-f]{64}$/, key);
    assert.ok(Date.parse(e.run_at) < Date.parse(e.prepared_at), `${key}: run_at before prepared_at`);
    assert.deepEqual(Object.keys(e.records).sort(), RECORD_FIELDS[kind], key);
  }
});

test('the records hang together the way the golden run makes them', () => {
  const r = (key) => manifest.choices[key].records;
  const water = world['goal.water'];
  // suggestions: the mockup's batch, one id per title; K139: only Desalination's is visible
  assert.deepEqual(r('sugg.water.desal').titles, ['Seawater intake', 'Reverse osmosis', 'Energy use']);
  assert.equal(r('sugg.water.desal').focal_concept_id, world['concept.water.desal']);
  assert.equal(r('sugg.water.desal').goal_id, water);
  assert.equal(manifest.choices['sugg.water.newater'], undefined);
  assert.equal(r('fresh.water.res').suggestion_ids.length, 2);
  // the twin: the from-batch's suggestion whose title keys to the concept key
  const v1 = r('v1.reverse-osmosis');
  assert.equal(v1.suggestion_id, r('sugg.water.desal').suggestion_ids[1]);
  assert.equal(normalizeConceptKey(v1.title), v1.concept_key);
  assert.equal(v1.rung, 1);
  // a practice set keys its concept's title
  assert.equal(r('set.water.res.r6').concept_key, 'reservoirs');
  assert.equal(r('set.water.res.r6').concept_id, world['concept.water.res']);
  // the draft, its word revisions and its picture chain
  const h4 = r('draft.h4');
  assert.equal(h4.atom_id, world['atom.water.newater-process']);
  assert.equal(h4.image_mode, 'mermaid');
  assert.match(h4.image_url, /^\/KIOSK_DEV_FIXTURE\/pictures\/diagram-v1\.svg$/);
  assert.equal(r('words.r').from_draft_id, h4.draft_id);
  assert.equal(r('words.r.s').from_draft_id, r('words.r').draft_id);
  assert.equal(r('words.r').image_url, null);
  for (const key of ['pic.uv', 'pic.illus', 'pic.illus.sketch', 'pic.sketch.photo']) {
    assert.equal(r(key).draft_id, h4.draft_id, key);
    assert.equal(r(key).parent_job_id, h4.job_id, key);
  }
  assert.equal(r('pic.uv').source_image_gcs_uri, null);
  assert.equal(r('pic.illus.sketch').source_image_gcs_uri, r('pic.illus').image_gcs_uri);
  assert.equal(r('pic.sketch.photo').source_image_gcs_uri, r('pic.illus.sketch').image_gcs_uri);
  // accepts, the manual copy and the banks
  assert.equal(r('accept.water.q3').image_url, r('draft.water.q3').image_url);
  assert.equal(r('copy.water.q2').from_draft_id, h4.draft_id);
  assert.equal(r('copy.water.q2').image_url, h4.image_url);
  assert.deepEqual(r('bank.water').question_ids, [r('accept.water.q1').question_id, r('copy.water.q2').question_id, r('accept.water.q3').question_id]);
  assert.equal(r('sample.strong').test_set_id, r('bank.grading').test_set_id);
  assert.equal(r('greet.pingu').companion_id, world['companion.pingu']);
  assert.equal(r('dose.water').goal_id, water);
});

test('the fixture files load in the fixture server: each marked, sourced and on its own route', () => {
  const { files } = buildFixtures(list, world, manifest);
  const dir = mkdtempSync(join(tmpdir(), 'kiosk-world-fixtures-'));
  for (const f of files) {
    assert.equal(f.json.fixture, 'KIOSK_DEV_FIXTURE', f.name);
    assert.ok(f.json.source && f.json.source.length > 10, `${f.name} names its source`);
    mkdirSync(dirname(join(dir, f.name)), { recursive: true });
    writeFileSync(join(dir, f.name), JSON.stringify(f.json));
  }
  for (const p of buildPictures(mockup)) {
    mkdirSync(dirname(join(dir, p.name)), { recursive: true });
    writeFileSync(join(dir, p.name), p.bytes);
  }
  assert.ok(loadFixtureRoutes(dir).length >= files.length);
});

test("step 4's sixteen job reads carry the golden run's critic notes as recorded through the edge (K155), the scenario chip's eleven the labelled stand-in (K187)", () => {
  const { critique } = JSON.parse(readFileSync(new URL('./step4-critique.recorded.json', import.meta.url), 'utf8'));
  const jobs = buildFixtures(list, world, manifest).files.filter((f) => /\/job-(draft\.h4|words\.[ers.]+)\.json$/.test(f.name));
  const keyOf = (f) => f.name.match(/job-(.+)\.json$/)[1];
  const scenario = (key) => key.split('.').slice(1).includes('r');
  assert.equal(jobs.length, 16);
  assert.equal(jobs.filter((f) => scenario(keyOf(f))).length, 11);
  assert.deepEqual(Object.keys(critique).sort(), jobs.map(keyOf).filter((k) => !scenario(k)).sort());
  for (const f of jobs) {
    const key = keyOf(f);
    const note = scenario(key) ? STEP4_SCENARIO_STANDIN.critique : critique[key].at(-1).notes;
    const rows = f.json.body.pipeline_trace;
    // The screen reads the last critique row (criticVerdict); the quality gate repeats its note, as recorded.
    assert.equal(rows.find((r) => r.name === 'critique').notes, note, key);
    assert.equal(rows.find((r) => r.name === 'quality_gate').notes, note, key);
  }
});

test("the committed fixtures are the generator's output (npm run fixtures:write after a list or world change)", () => {
  const problems = checkFixtures();
  assert.deepEqual(problems, []);
});

test('the hook story runs on the fixtures: map, suggestions, accept, the adopted question, answer, reset', async () => {
  const { server, base } = await serveWorld();
  const get = async (path) => {
    const res = await fetch(base + path);
    assert.equal(res.status, 200, `GET ${path}`);
    return res.json();
  };
  const post = async (path, body) => fetch(base + path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  try {
    const m = await get('/api/v1/kiosk/prewarm/manifest');
    assert.equal(m.format, 'chora-kiosk/prewarm-manifest/v1');
    const goal = m.world['goal.water'];
    const newater = m.world['concept.water.newater'];
    const desal = m.world['concept.water.desal'];
    const batch = m.choices['sugg.water.desal'].records;
    const hidden = new Set(Object.values(m.choices).filter((c) => c.kind === 'suggestions' && c.hidden).flatMap((c) => c.records.suggestion_ids));

    const before = await get(`/api/v1/me/maps/${goal}/graph`);
    assert.equal(before.concepts.length, 9);
    assert.equal(before.rootConceptId, m.world['concept.water.root']);
    assert.equal(before.attachedCompanionName, 'Pingu');
    assert.ok(before.campaign.nodes[newater].wonAt);
    assert.equal(before.campaign.nodes[m.world['concept.water.res']].rungsCleared, 5);

    const pending = (await get(`/api/v1/me/concept-graph/suggestions?goalId=${goal}`)).suggestions;
    assert.deepEqual(
      pending.filter((s) => s.focalConceptId === desal && !hidden.has(s.suggestionId)).map((s) => s.suggestionId),
      batch.suggestion_ids,
    );
    assert.deepEqual(pending.filter((s) => s.focalConceptId === newater && !hidden.has(s.suggestionId)), [], 'K139: NEWater holds only a hidden batch');
    assert.ok(pending.some((s) => hidden.has(s.suggestionId)), 'the hidden fresh batches are pending too, for the screen to keep out');

    for (const id of batch.suggestion_ids) {
      const res = await post(`/api/v1/me/concept-graph/suggestions/${id}/accept`, {});
      assert.equal(res.status, 200);
      assert.equal((await res.json()).status, 'accepted');
    }
    const after = await get(`/api/v1/me/maps/${goal}/graph`);
    assert.equal(after.concepts.length, 12);
    const ro = after.concepts.filter((c) => normalizeConceptKey(c.title) === 'reverse-osmosis');
    assert.equal(ro.length, 1, 'one new concept keys to the twin');
    assert.equal(ro[0].provenance, 'companion_suggested_accepted');
    assert.ok(after.edges.some((e) => e.sourceConceptId === desal && e.targetConceptId === ro[0].conceptId));
    const left = (await get(`/api/v1/me/concept-graph/suggestions?goalId=${goal}`)).suggestions.map((s) => s.suggestionId);
    assert.ok(batch.suggestion_ids.every((id) => !left.includes(id)), 'accepted suggestions are no longer pending');

    const served = await get(`/api/v1/me/goals/${goal}/campaign/questions?concept_id=${ro[0].conceptId}&rung=1`);
    assert.equal(served.status, 'ready');
    assert.equal(served.concept_key, 'reverse-osmosis');
    assert.match(served.trace_id, /^[0-9a-f]{32}$/);
    assert.ok(Array.isArray(served.pipeline_trace));
    // The producer's served shape (recorded from the stack in src/app/live/kinds/campaign-trace.recorded.json):
    // the set lane's critique row counts, each candidate's critique_verdict row judges, and only a
    // guardrail row keeps its notes (SanitizeServedTrace).
    const trace = served.pipeline_trace;
    assert.ok(trace.some((s) => s.name === 'critique') && trace.every((s) => s.name !== 'critique' || !('accepted' in s)));
    const verdicts = trace.filter((s) => s.name === 'critique_verdict');
    assert.equal(verdicts.length, served.questions.candidates.length);
    assert.ok(verdicts.every((s) => s.accepted === true && s.status === 'ACCEPTED'));
    assert.ok(trace.every((s) => s.name.startsWith('guardrail') === ('notes' in s)));
    assert.ok(trace.filter((s) => s.name.startsWith('guardrail')).every((s) => s.notes === 'not_screened (local edition)'));
    // The conductor's xray of the same set (Behind the scenes, K75), in its recorded shape (src/app/xray/xray.recorded.json).
    const xray = await get(`/api/v1/kiosk/xray/${served.trace_id}?kind=campaign_set&goal_id=${goal}&concept_id=${ro[0].conceptId}&rung=1`);
    assert.equal(xray.kind, 'campaign_set');
    assert.equal(xray.trace_id, served.trace_id);
    assert.deepEqual(xray.stages.map((s) => s.name), trace.map((s) => s.name));
    assert.ok(xray.stages.every((s) => s.safety === (s.name.startsWith('guardrail') ? 'simulated_on_local' : null)));
    assert.ok(xray.stages.every((s) => !('notes' in s)));
    assert.deepEqual(xray.decisions.map((d) => [d.agent, d.model]), [['qgen_question', ''], ['qgen_critic', '']]);
    assert.ok(!JSON.stringify(served.questions).includes('is_correct'), 'the served set is sanitised');
    const options = served.questions.candidates[0].options;
    assert.deepEqual(options.map((o) => o.option_id), [...options.map((o) => o.option_id)].sort());
    const right = options.find((o) => o.label === 'Reverse osmosis').option_id;
    const wrong = options.find((o) => o.label === 'Microfiltration').option_id;
    const answer = (selected) => post(`/api/v1/me/goals/${goal}/campaign/questions/answer`, { concept_id: ro[0].conceptId, rung: 1, question_index: 0, selected_option_id: selected });
    const yes = await (await answer(right)).json();
    assert.equal(yes.correct, true);
    assert.equal(yes.correct_option_id, right);
    const no = await (await answer(wrong)).json();
    assert.equal(no.correct, false);
    assert.equal(no.correct_option_id, right);

    const h4 = m.choices['draft.h4'].records;
    const job = await get(`/api/atoms/${h4.atom_id}/question-jobs/${h4.job_id}`);
    assert.equal(job.status, 'succeeded');
    const draft = job.candidate_questions.find((c) => c.draft_id === h4.draft_id);
    assert.equal(draft.mcq_payload.options[3].label, 'Chlorination');
    // Creation's job read runs the qgen crew's SINGLE lane for step 4, as recorded from the stack: draft.h4 in
    // src/app/exhibits/engine/crews.recorded.json, words.f in kiosk/stack/tests/words-trace.recorded.json. One
    // critique row carries the verdict and the critic's note; there is no critique_verdict row (that is the
    // campaign set lane's). Each row's name, status and keys match the recording (candidate_json, the draft with
    // its key, is left out, as the stack's recording does).
    const shape = (rows) =>
      rows.map((s) => `${s.name}:${s.status}:${Object.keys(s).filter((k) => !['name', 'status', 'started_at', 'completed_at', 'candidate_json'].includes(k)).sort().join(',')}`);
    const recorded = (rel) => JSON.parse(readFileSync(new URL(rel, import.meta.url), 'utf8'));
    assert.deepEqual(shape(job.pipeline_trace), shape(recorded('../../src/app/exhibits/engine/crews.recorded.json').job.pipeline_trace));
    const critique = job.pipeline_trace.find((s) => s.name === 'critique');
    assert.equal(critique.accepted, true);
    // K155: the critic's note is the golden run's own (step4-critique.recorded.json), which flags no option.
    const notes = recorded('./step4-critique.recorded.json').critique;
    assert.equal(critique.notes, notes['draft.h4'].at(-1).notes);
    assert.doesNotMatch(critique.notes, /chlorination|option d\b|depends on/i);
    assert.ok(job.pipeline_trace.filter((s) => s.name.startsWith('guardrail')).every((s) => s.notes === 'not_screened (local edition)'));
    const pic = await fetch(base + draft.image_url);
    assert.equal(pic.status, 200);
    assert.equal(pic.headers.get('content-type'), 'image/svg+xml');
    const fs = m.choices['words.r.s'].records;
    const revisedJob = await get(`/api/atoms/${fs.atom_id}/question-jobs/${fs.job_id}`);
    assert.deepEqual(shape(revisedJob.pipeline_trace), shape(recorded('../../../kiosk/stack/tests/words-trace.recorded.json').pipeline_trace));
    // K187: the scenario chip's paths carry the labelled stand-in note until the golden run records them.
    assert.equal(notes['words.r.s'], undefined);
    assert.equal(revisedJob.pipeline_trace.find((s) => s.name === 'critique').notes, STEP4_SCENARIO_STANDIN.critique);
    const revised = revisedJob.candidate_questions[0];
    assert.equal(revised.prompt, 'Which NEWater stage kills germs that get past the membranes?');
    assert.equal(revised.mcq_payload.options[3].label, 'Chlorination');
    const kept = await post(`/api/atoms/${fs.atom_id}/question-jobs/${fs.job_id}/accept`, { accepted_candidates: [{ draft_id: fs.draft_id }] });
    assert.equal(kept.status, 200);
    assert.equal((await kept.json()).persisted.length, 1);
    const photo = await fetch(base + m.choices['pic.illus.photo'].records.image_url);
    assert.equal(photo.headers.get('content-type'), 'image/jpeg');

    assert.equal((await post('/api/v1/kiosk/reset', {})).status, 202);
    assert.equal((await get(`/api/v1/me/maps/${goal}/graph`)).concepts.length, 9, 'the reset puts the prepared map back');
  } finally {
    server.close();
  }
});

test("W69 (K135): Pingu's ledger, growth and skills follow the quiz win: a wrong answer credits nothing; the win credits +8 then +25, stage 2 with three slots; a reset puts the seed back", async () => {
  const { server, base } = await serveWorld();
  const get = async (path) => {
    const res = await fetch(base + path);
    assert.equal(res.status, 200, `GET ${path}`);
    return res.json();
  };
  const post = (path, body) => fetch(base + path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  try {
    const m = await get('/api/v1/kiosk/prewarm/manifest');
    const goal = m.world['goal.water'];
    const pingu = m.world['companion.pingu'];
    const ledger = async () => (await get(`/api/v1/me/companions/${pingu}/growth-events`)).data.events;
    const growth = async () => (await get(`/api/v1/me/companions/${pingu}/growth`)).data;
    const skills = () => get(`/api/v1/me/companions/${pingu}/skills`);
    const answers = buildFixtures(list, world, manifest).files.filter((f) => /^world\/answer-set\.water\.res\.r6-\d\.json$/.test(f.name));
    const win = answers.find((f) => f.json.body.won);
    const miss = answers.find((f) => !f.json.body.correct);
    assert.ok(win && miss, 'the res r6 set has a winning answer and a wrong one');
    const answer = (f) => post(`/api/v1/me/goals/${goal}/campaign/questions/answer`, { ...f.json.match_body, rung: 6, question_index: 0 });

    const seeded = await ledger();
    assert.equal(seeded[0].expTotalAfter, 32);
    assert.deepEqual([(await growth()).growthStage, (await growth()).expCumulative], [1, 32]);
    const before = await skills();
    assert.deepEqual([before.growthStage, before.skillSlotsUnlocked, before.grants.map((g) => [g.skillKey, g.unlockedAtStage])], [1, 2, [['progress_mirror', 1]]]);

    assert.equal((await answer(miss)).status, 200);
    assert.deepEqual(await ledger(), seeded, 'a wrong answer credits nothing');
    assert.equal((await answer(win)).status, 200);
    const after = await ledger();
    assert.deepEqual(
      after.slice(0, 2).map((e) => [e.source, e.expDelta, e.expTotalAfter, e.stageBefore, e.stageAfter, e.triggeredStageUp]),
      [
        ['campaign_node_won', 25, 65, 1, 2, true],
        ['campaign_rung_cleared', 8, 40, 1, 1, false],
      ],
    );
    assert.deepEqual(after.slice(2), seeded, 'the seed and the dose open stay under the win');
    const g = await growth();
    assert.deepEqual([g.growthStage, g.expCumulative, g.expCurrent, g.expNextThreshold, g.unlockedTools], [2, 65, 15, 200, ['atom_search', 'cite_atom']]);
    const l = await skills();
    assert.deepEqual([l.growthStage, l.skillSlotsUnlocked, l.grants.map((x) => [x.skillKey, x.unlockedAtStage])], [2, 3, [['progress_mirror', 1], ['explain_anew', 2], ['recap_scribe', 2]]]);

    assert.equal((await post('/api/v1/kiosk/reset', {})).status, 202);
    assert.deepEqual(await ledger(), seeded, 'a reset puts the seeded ledger back');
    assert.equal((await growth()).growthStage, 1);
  } finally {
    server.close();
  }
});

test('a dismissed batch leaves the pending list but not the map; the hidden batches stay pending', async () => {
  const { server, base } = await serveWorld();
  const goal = world['goal.water'];
  try {
    for (const id of manifest.choices['sugg.water.desal'].records.suggestion_ids) {
      const res = await fetch(`${base}/api/v1/me/concept-graph/suggestions/${id}/dismiss`, { method: 'POST', body: '{}' });
      assert.equal((await res.json()).status, 'dismissed');
    }
    const pending = (await (await fetch(`${base}/api/v1/me/concept-graph/suggestions?goalId=${goal}`)).json()).suggestions.map((s) => s.suggestionId);
    assert.ok(manifest.choices['sugg.water.desal'].records.suggestion_ids.every((id) => !pending.includes(id)));
    assert.ok(manifest.choices['fresh.water.newater'].records.suggestion_ids.every((id) => pending.includes(id)));
    assert.equal((await (await fetch(`${base}/api/v1/me/maps/${goal}/graph`)).json()).concepts.length, 9);
  } finally {
    server.close();
  }
});

test("K156: Desalination's LIVE press replays the owner's two presses, ends on the world's ids; Add on a link draws it", async () => {
  const recorded = JSON.parse(readFileSync(new URL('./f43-presses.recorded.json', import.meta.url), 'utf8'));
  const { server, base } = await serveWorld();
  const goal = world['goal.water'];
  const desal = world['concept.water.desal'];
  const titleOf = new Map(demo.concepts.filter((c) => c.goal === 'goal.water').map((c) => [world[c.key], c.title]));
  const call = async (method, path, body) => {
    const res = await fetch(base + path, { method, headers: { 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
    return { status: res.status, json: await res.json() };
  };
  try {
    const presses = [];
    for (let n = 0; n < 3; n++) {
      const g = await call('POST', '/api/v1/me/concept-graph/suggestions/generate', { focalConceptId: desal, goalId: goal });
      assert.equal(g.status, 202);
      const r = await call('GET', `/api/v1/me/concept-graph/suggestions/requests/${g.json.requestId}`);
      assert.equal(r.status, 200);
      assert.equal(r.json.status, 'ready');
      assert.equal(r.json.focalConceptId, desal);
      presses.push(r.json);
    }
    assert.deepEqual(presses.map((p) => p.requestId), [recorded.presses[0].request_id, recorded.presses[1].request_id, recorded.presses[1].request_id], 'press 1, then Do it again repeats press 2');
    const shape = (p) => [p.suggestions.length, p.suggestions.filter((s) => s.kind === 'edge').length];
    assert.deepEqual(presses.slice(0, 2).map(shape), [[9, 4], [12, 6]]);
    const links = presses[0].suggestions.filter((s) => s.kind === 'edge');
    assert.deepEqual(links.map((s) => `${titleOf.get(s.sourceConceptId)} -> ${titleOf.get(s.targetConceptId)}`), [
      'Four National Taps -> Imported water',
      'Four National Taps -> NEWater',
      'Four National Taps -> Local catchment',
      'Reservoirs -> Local catchment',
    ]);
    assert.ok(presses.flatMap((p) => p.suggestions).every((s) => s.status === 'pending' && s.focalConceptId === desal && (s.kind === 'edge' ? !s.title : s.title)));

    const other = await call('POST', '/api/v1/me/concept-graph/suggestions/generate', { focalConceptId: world['concept.water.newater'], goalId: goal });
    assert.equal(other.status, 404, 'only Desalination was pressed live; any other press still falls back to its hidden batch');

    // Add on a link, then on a concept: the map draws both, beside the seeded links.
    const before = (await call('GET', `/api/v1/me/maps/${goal}/graph`)).json;
    const link = links[3];
    const concept = presses[0].suggestions.find((s) => s.kind === 'concept');
    assert.equal((await call('POST', `/api/v1/me/concept-graph/suggestions/${link.suggestionId}/accept`, {})).json.status, 'accepted');
    assert.equal((await call('POST', `/api/v1/me/concept-graph/suggestions/${concept.suggestionId}/accept`, {})).json.status, 'accepted');
    const after = (await call('GET', `/api/v1/me/maps/${goal}/graph`)).json;
    const minted = after.concepts.slice(before.concepts.length);
    assert.deepEqual(minted.map((c) => c.title), [concept.title]);
    const added = after.edges.slice(before.edges.length).map((e) => [e.sourceConceptId, e.targetConceptId, e.class, e.provenance]);
    assert.deepEqual(new Set(added.map(String)), new Set([
      [link.sourceConceptId, link.targetConceptId, 'lateral', 'companion_suggested_accepted'],
      [desal, minted[0].conceptId, 'hierarchy', 'companion_suggested_accepted'],
    ].map(String)), 'the link drawn, and the concept under the focal');
    assert.ok(after.campaign.nodes[minted[0].conceptId], 'the minted idea has its campaign node');
    const dismissed = await call('POST', `/api/v1/me/concept-graph/suggestions/${presses[1].suggestions[0].suggestionId}/dismiss`, {});
    assert.equal(dismissed.json.status, 'dismissed');
  } finally {
    server.close();
  }
});

test('K159: City in Nature and Hawker culture take water\'s mix: q2 a multiple choice with a scene picture, q3 an open question with one, kept by their accepts', () => {
  for (const bank of ['nature', 'hawker']) {
    const q2 = manifest.choices[`draft.${bank}.q2`].records;
    const q3 = manifest.choices[`draft.${bank}.q3`].records;
    assert.deepEqual([q2.question_type, q2.image_mode, q3.question_type, q3.image_mode], ['mcq', 'scene', 'oe', 'scene'], bank);
    assert.match(q2.image_url, /\/KIOSK_DEV_FIXTURE\/pictures\/scene-/);
    assert.notEqual(q2.image_url, q3.image_url);
    assert.equal(manifest.choices[`accept.${bank}.q2`].records.image_url, q2.image_url);
    assert.equal(manifest.choices[`accept.${bank}.q3`].records.image_url, q3.image_url);
    assert.equal(manifest.choices[`draft.${bank}.q1`].records.image_url, null);
  }
});

test("K158 (W20): each prepared paper is a run left at its review: the paper's map, its Companion, its bytes' sha256, and a panel", () => {
  const sums = new Map(readFileSync(new URL('../../../kiosk/world/papers/papers.sha256', import.meta.url), 'utf8').trim().split('\n').map((l) => l.split(/\s+/).reverse()));
  for (const [bank, companion] of [['water', 'pingu'], ['nature', 'nova'], ['hawker', 'ember']]) {
    const e = manifest.choices[`paper.${bank}`];
    assert.equal(e.kind, 'weakness_paper');
    const r = e.records;
    assert.deepEqual([r.goal_id, r.companion_id, r.status], [world[`goal.${bank}`], world[`companion.${companion}`], 'AWAITING_REVIEW']);
    assert.equal(r.sha256, sums.get(`paper-${bank}.png`));
    assert.ok(r.proposed_edges.length >= 1);
    for (const x of r.proposed_edges) assert.deepEqual(Object.keys(x).sort(), ['concept', 'confidence', 'descriptor', 'id']);
  }
});

test('K158 (W20): the prepared run reads at its review with its panel; a confirm completes it, and the next read says so', async () => {
  const { server, base } = await serveWorld();
  const r = manifest.choices['paper.hawker'].records;
  const call = async (method, path, body) => {
    const res = await fetch(base + path, { method, headers: { 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
    return { status: res.status, json: await res.json() };
  };
  try {
    const before = await call('GET', `/api/v1/me/growth-edges/uploads/${r.upload_id}`);
    assert.equal(before.json.status, 'AWAITING_REVIEW');
    assert.deepEqual(before.json.review.proposed_edges.map((x) => [x.proposed_edge_id, x.concept_label]), r.proposed_edges.map((x) => [x.id, x.concept]));
    assert.equal(before.json.review.familiar.familiar_id, r.companion_id);
    const edges = r.proposed_edges.map((x) => ({ proposed_edge_id: x.id, decision: 'accept' }));
    const resumed = await call('POST', `/api/v1/me/growth-edges/uploads/${r.upload_id}/resume`, { action: 'confirm', edges, added_struggles: [], selected_outputs: [] });
    assert.deepEqual([resumed.status, resumed.json.status, resumed.json.upload_id], [200, 'completed', r.upload_id]);
    const after = await call('GET', `/api/v1/me/growth-edges/uploads/${r.upload_id}`);
    assert.equal(after.json.status, 'COMPLETED');
    assert.equal(after.json.review, undefined);
    assert.equal(after.json.upserted_growth_edge_ids.length, r.proposed_edges.length);
  } finally {
    server.close();
  }
});

test('the replay refuses an end the world does not hold, loudly', () => {
  const bad = JSON.parse(readFileSync(new URL('./f43-presses.recorded.json', import.meta.url), 'utf8'));
  bad.presses[0].rows.find((r) => r.kind === 'edge').source = 'No such idea';
  assert.throws(() => buildFixtures(list, world, manifest, bad), /No such idea/);
});

test('the pictures: four mermaid-like diagrams drawn as SVG, the mockup\'s four illustrations, and four K159 dev scenes', () => {
  const pictures = buildPictures(mockup);
  const names = pictures.map((p) => p.name).sort();
  assert.deepEqual(names, [
    'pictures/diagram-uv-where.svg', 'pictures/diagram-uv.svg', 'pictures/diagram-v1.svg', 'pictures/diagram-where.svg',
    'pictures/flat.jpg', 'pictures/photo.jpg',
    'pictures/scene-hawker-kaya.svg', 'pictures/scene-hawker-teh-tarik.svg', 'pictures/scene-nature-shorebirds.svg', 'pictures/scene-nature-streets.svg',
    'pictures/sketch.jpg', 'pictures/taps.jpg',
  ]);
  // K159 (W27): a stand-in for the golden run's own scene, labelled as one, never another bank's picture.
  const birds = pictures.find((p) => p.name === 'pictures/scene-nature-shorebirds.svg').bytes.toString('utf8');
  assert.match(birds, /Shorebirds feeding on the Sungei Buloh mudflats/);
  assert.match(birds, /dev fixture/);
  const uv = pictures.find((p) => p.name === 'pictures/diagram-uv.svg').bytes.toString('utf8');
  assert.match(uv, /UV disinfection/);
  assert.doesNotMatch(pictures.find((p) => p.name === 'pictures/diagram-v1.svg').bytes.toString('utf8'), /UV disinfection/);
  const jpeg = pictures.find((p) => p.name === 'pictures/flat.jpg').bytes;
  assert.deepEqual([...jpeg.subarray(0, 3)], [0xff, 0xd8, 0xff]);
  assert.ok(readFileSync(new URL('./mockup-world.mjs', import.meta.url), 'utf8').length > 0);
});
