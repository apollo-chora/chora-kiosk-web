// The production build compiles only the app (orchestrator, 18 Oct): tsconfig.app.json type-checks
// every file it includes, so a spec-only helper there made the static server's image build read
// kiosk/world/prepared-choices.json from outside kiosk-web (studio-world.testing.ts imports it; the
// stack session had to copy the list into its Node stage, 7c599afda). The build's file list must
// hold the app's entry, and no spec, no *.testing.ts helper and nothing outside kiosk-web but
// node_modules.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const TSC = fileURLToPath(new URL('../../node_modules/typescript/bin/tsc', import.meta.url));

function appFiles() {
  const r = spawnSync(process.execPath, [TSC, '-p', 'tsconfig.app.json', '--listFilesOnly'], { cwd: ROOT, encoding: 'utf8' });
  assert.equal(r.status, 0, `tsc --listFilesOnly failed: ${r.stderr || r.stdout}`);
  return r.stdout
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .map((p) => relative(ROOT, p).split(sep).join('/'));
}

test('the production build lists the app’s entry (the listing is real)', () => {
  assert.ok(appFiles().includes('src/main.ts'));
});

test('the production build compiles no spec and no *.testing.ts helper', () => {
  const helpers = appFiles().filter((f) => /\.(spec|testing)\.ts$/.test(f));
  assert.deepEqual(helpers, []);
});

test('the production build reads nothing outside kiosk-web but node_modules', () => {
  const outside = appFiles().filter((f) => f.startsWith('../') || f.startsWith('/'));
  assert.deepEqual(outside, []);
});
