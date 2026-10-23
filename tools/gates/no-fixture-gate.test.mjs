// Tests for the no-fixture gate (T3.1): no dev fixture reaches the production bundle.
// Fixture files are wrappers `{ "fixture": "KIOSK_DEV_FIXTURE", "method", "path", "status", "body" }`
// served by the dev-only fixture server; the gate fails if the marker, or any long content
// string of any fixture, appears in the bundle.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { fixtureStrings } from './no-fixture-gate.mjs';

const GATE = fileURLToPath(new URL('./no-fixture-gate.mjs', import.meta.url));

function plant(files) {
  const dir = mkdtempSync(join(tmpdir(), 'kiosk-fixture-gate-'));
  for (const [rel, content] of Object.entries(files)) {
    const path = join(dir, rel);
    mkdirSync(join(path, '..'), { recursive: true });
    writeFileSync(path, content);
  }
  return dir;
}

const STEM = 'Which stage of NEWater production removes the smallest particles?';
const FIXTURE = JSON.stringify({
  fixture: 'KIOSK_DEV_FIXTURE',
  method: 'GET',
  path: '/api/v1/me/goals/g1/campaign/questions',
  status: 200,
  body: { status: 'ready', questions: [{ stem: STEM, options: ['Microfiltration', 'Reverse osmosis'] }] },
});

function run(bundle, fixtures, extra = []) {
  const b = plant(bundle);
  const f = plant(fixtures);
  return spawnSync(process.execPath, [GATE, b, '--fixtures', f, ...extra], { encoding: 'utf8' });
}

const CLEAN_BUNDLE = {
  'index.html': '<!doctype html><kiosk-root></kiosk-root>',
  'main-XYZ.js': 'const t="Where does Singapore’s water come from?";',
};

test('a bundle with no fixture content passes (negative control)', () => {
  const r = run(CLEAN_BUNDLE, { 'campaign-questions.json': FIXTURE });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /no-fixture gate: PASS/);
  assert.match(r.stdout, /1 fixture file/);
});

test('the fixture marker in the bundle fails', () => {
  const r = run(
    { ...CLEAN_BUNDLE, 'chunk-A.js': 'const f={fixture:"KIOSK_DEV_FIXTURE",body:{}}' },
    { 'campaign-questions.json': FIXTURE },
  );
  assert.equal(r.status, 1);
  assert.match(r.stdout, /KIOSK_DEV_FIXTURE/);
  assert.match(r.stdout, /chunk-A\.js/);
});

test('a fixture content string pasted into the bundle fails, even without the marker', () => {
  const r = run({ ...CLEAN_BUNDLE, 'chunk-B.js': `const q=${JSON.stringify(STEM)};` }, { 'campaign-questions.json': FIXTURE });
  assert.equal(r.status, 1);
  assert.match(r.stdout, /NEWater production removes/);
});

test('a fixture string escaped as \\u sequences is still found', () => {
  const escaped = 'Where\\u2019s the NEWater plant that treats used water today?';
  const fixture = JSON.stringify({
    fixture: 'KIOSK_DEV_FIXTURE',
    method: 'GET',
    path: '/x',
    status: 200,
    body: { stem: 'Where’s the NEWater plant that treats used water today?' },
  });
  const r = run({ ...CLEAN_BUNDLE, 'chunk-C.js': `const q="${escaped}";` }, { 'x.json': fixture });
  assert.equal(r.status, 1, r.stdout);
});

test('short strings (enums, ids, names) are not fingerprints', () => {
  const strings = fixtureStrings({ fixture: 'KIOSK_DEV_FIXTURE', body: { status: 'ready', name: 'Pingu', stem: STEM } });
  assert.deepEqual(strings, [STEM]);
});

test('long identifiers (contract enums, ids, times, paths) are not fingerprints: only prose is', () => {
  const strings = fixtureStrings({
    fixture: 'KIOSK_DEV_FIXTURE',
    body: {
      phase: 'clearing_queues_and_pictures',
      id: '0192f3c4-8b1e-7a3d-9c55-2f6e1b7d4a10',
      at: '2026-10-20T06:31:21.123456Z',
      url: '/api/atoms/0192a/question-jobs/0192j',
      stem: STEM,
    },
  });
  assert.deepEqual(strings, [STEM]);
});

test('a contract enum shared by the bundle and a fixture does not fail the gate', () => {
  const fixture = JSON.stringify({
    fixture: 'KIOSK_DEV_FIXTURE',
    method: 'GET',
    path: '/api/v1/kiosk/reset',
    status: 200,
    body: { phase: 'clearing_queues_and_pictures', note: 'The emulator was purged and the blob root put back.' },
  });
  const r = run({ ...CLEAN_BUNDLE, 'chunk-D.js': 'const P=["pausing","clearing_queues_and_pictures"];' }, { 'reset.json': fixture });
  assert.equal(r.status, 0, r.stdout + r.stderr);
});

test('a fixture file without the marker is refused, so every fixture can be traced', () => {
  const r = run(CLEAN_BUNDLE, { 'bad.json': JSON.stringify({ method: 'GET', path: '/x', status: 200, body: {} }) });
  assert.equal(r.status, 2);
  assert.match(r.stderr, /bad\.json.*marker/);
});

test('no fixture files at all is a loud error, never a pass', () => {
  const r = run(CLEAN_BUNDLE, {});
  assert.equal(r.status, 2);
  assert.match(r.stderr, /no fixture files/);
});

test('a missing bundle directory is a loud error', () => {
  const f = plant({ 'campaign-questions.json': FIXTURE });
  const r = spawnSync(process.execPath, [GATE, join(f, 'nope'), '--fixtures', f], { encoding: 'utf8' });
  assert.equal(r.status, 2);
});

test('prose in a sequence step or a variant is a fingerprint too, not only the body', () => {
  const polled = 'The critic asked for the stage the answer depends on.';
  const after = 'Reverse osmosis pushes water through a membrane under pressure.';
  const strings = fixtureStrings({
    fixture: 'KIOSK_DEV_FIXTURE',
    sequence: [{ status: 200, body: { status: 'running' } }, { status: 200, body: { notes: polled } }],
    variants: [{ after: ['^POST /x$'], status: 200, body: { why: after } }],
  });
  assert.deepEqual(strings.sort(), [after, polled].sort());
});

test("a fixture string that is also an interface string (a chip the list names exactly) is the product's own, not a leak", () => {
  const chip = 'Replace the option that could also be right';
  const fixture = JSON.stringify({
    fixture: 'KIOSK_DEV_FIXTURE',
    method: 'GET',
    path: '/api/v1/kiosk/prewarm/manifest',
    status: 200,
    body: { params: { instruction: chip }, stem: STEM },
  });
  const iface = plant({ 'en.json': JSON.stringify({ 'chip.fixd': chip }), 'zh.json': JSON.stringify({ 'chip.fixd': '替换可能也对的选项' }) });
  const ok = run({ ...CLEAN_BUNDLE, 'chunk-E.js': `const c=${JSON.stringify(chip)};` }, { 'm.json': fixture }, ['--interface', iface]);
  assert.equal(ok.status, 0, ok.stdout + ok.stderr);
  const leak = run(
    { ...CLEAN_BUNDLE, 'chunk-E.js': `const c=${JSON.stringify(chip)};const q=${JSON.stringify(STEM)};` },
    { 'm.json': fixture },
    ['--interface', iface],
  );
  assert.equal(leak.status, 1, 'the same fixture\'s other prose still fails');
  assert.match(leak.stdout, /NEWater production removes/);
  assert.doesNotMatch(leak.stdout, /Replace the option/);
});

test("a fixture string the world's own shipped papers contain (a model's label quoting the paper) is the world's, not a leak (W38)", () => {
  const label = "Singapore's Four National Taps";
  const fixture = JSON.stringify({
    fixture: 'KIOSK_DEV_FIXTURE',
    method: 'GET',
    path: '/api/v1/me/growth-edges/uploads/u1',
    status: 200,
    body: { review: { proposed_edges: [{ concept_label: label }] }, stem: STEM },
  });
  const world = plant({ 'papers.json': JSON.stringify({ papers: [{ questions: [{ q: "Name Singapore's Four National Taps." }] }] }) });
  const papers = { 'papers/papers.json': JSON.stringify({ papers: [{ questions: [{ q: "Name Singapore's Four National Taps." }] }] }) };
  const ok = run({ ...CLEAN_BUNDLE, ...papers }, { 'u.json': fixture }, ['--world', join(world, 'papers.json')]);
  assert.equal(ok.status, 0, ok.stdout + ok.stderr);
  const leak = run({ ...CLEAN_BUNDLE, ...papers, 'chunk-F.js': `const q=${JSON.stringify(STEM)};` }, { 'u.json': fixture }, ['--world', join(world, 'papers.json')]);
  assert.equal(leak.status, 1, "the same fixture's other prose still fails");
  assert.match(leak.stdout, /NEWater production removes/);
  // Without the world's file named, the quote is a hit (the control: the exemption is what passes it).
  const bare = run({ ...CLEAN_BUNDLE, ...papers }, { 'u.json': fixture }, ['--world', join(plant({ 'papers.json': '{"papers":[]}' }), 'papers.json')]);
  assert.equal(bare.status, 1);
  assert.match(bare.stdout, /Four National Taps/);
});

test('a world file that is missing or not JSON is a loud error, never a pass', () => {
  const missing = run(CLEAN_BUNDLE, { 'r.json': FIXTURE }, ['--world', join(plant({ 'x.txt': '' }), 'papers.json')]);
  assert.equal(missing.status, 2);
  assert.match(missing.stderr, /world/);
  const bad = run(CLEAN_BUNDLE, { 'r.json': FIXTURE }, ['--world', join(plant({ 'papers.json': 'not json' }), 'papers.json')]);
  assert.equal(bad.status, 2);
});

test('an interface folder without its tables is a loud error, never a pass', () => {
  const r = run(CLEAN_BUNDLE, { 'r.json': FIXTURE }, ['--interface', plant({ 'readme.txt': 'no tables' })]);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /interface/);
});
