// Tests for the papers gate (K158 D5): the bundle carries every prepared paper, byte for byte as
// papers.sha256 lists it. A build whose papers link dangles (the folder not in the build context)
// is green and ships no papers, so the screen's paper and its LIVE upload would fail on the day.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, readFileSync, readlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const GATE = fileURLToPath(new URL('./papers-gate.mjs', import.meta.url));
const ROOT = join(dirname(GATE), '..', '..');

const sha = (b) => createHash('sha256').update(b).digest('hex');
const A = Buffer.from('paper a');
const B = Buffer.from('paper b');
const LIST = `${sha(A)}  paper-a.png\n${sha(B)}  paper-b.png\n`;

function plant(files) {
  const dir = mkdtempSync(join(tmpdir(), 'kiosk-papers-gate-'));
  for (const [rel, content] of Object.entries(files)) {
    const path = join(dir, rel);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, content);
  }
  return dir;
}

function run(bundle, list = LIST) {
  const b = plant(bundle);
  const l = plant(list === null ? {} : { 'papers.sha256': list });
  return spawnSync(process.execPath, [GATE, b, join(l, 'papers.sha256')], { encoding: 'utf8' });
}

const GOOD = { 'papers/paper-a.png': A, 'papers/paper-b.png': B, 'papers/papers.json': '{}' };

test('passes when every listed paper is in the bundle with its listed bytes, and papers.json beside them', () => {
  const r = run(GOOD);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /papers: 2 of 2 match papers\.sha256: PASS/);
});

test('fails naming a paper the bundle lacks', () => {
  const { 'papers/paper-b.png': _b, ...rest } = GOOD;
  const r = run(rest);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /paper-b\.png: missing from the bundle/);
});

test('fails naming a paper whose bytes differ from the list', () => {
  const r = run({ ...GOOD, 'papers/paper-a.png': Buffer.from('changed') });
  assert.equal(r.status, 1);
  assert.match(r.stderr, new RegExp(`paper-a\\.png: sha256 ${sha(Buffer.from('changed'))}, listed ${sha(A)}`));
});

test('fails when papers.json, the papers’ titles, is missing', () => {
  const { 'papers/papers.json': _j, ...rest } = GOOD;
  const r = run(rest);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /papers\.json: missing from the bundle/);
});

test('a bundle with no papers folder, or no list, or an empty one, is never a pass (exit 2)', () => {
  assert.equal(run({ 'index.html': '<html></html>' }).status, 2);
  assert.equal(run(GOOD, null).status, 2);
  assert.equal(run(GOOD, '\n').status, 2);
});

test('the build reads the papers from kiosk/world through the papers link (no second copy in git)', () => {
  assert.equal(readlinkSync(join(ROOT, 'papers')), '../kiosk/world/papers');
  const angular = JSON.parse(readFileSync(join(ROOT, 'angular.json'), 'utf8'));
  const assets = Object.values(angular.projects)[0].architect.build.options.assets;
  assert.ok(assets.some((a) => a.input === 'papers' && a.output === 'papers' && a.glob === '{paper-*.png,papers.json}'), JSON.stringify(assets));
});
