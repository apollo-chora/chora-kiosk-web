// Tests for the offline gate (T3.1): the production bundle names no external URL.
// Each case plants a small bundle in a temporary directory and runs the gate on it,
// so the gate is shown to fail on the thing it exists for (positive control) and to
// pass a clean bundle (negative control).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { findExternalUrls } from './offline-gate.mjs';

const GATE = fileURLToPath(new URL('./offline-gate.mjs', import.meta.url));

function plant(files) {
  const dir = mkdtempSync(join(tmpdir(), 'kiosk-offline-gate-'));
  for (const [rel, content] of Object.entries(files)) {
    const path = join(dir, rel);
    mkdirSync(join(path, '..'), { recursive: true });
    writeFileSync(path, content);
  }
  return dir;
}

function runGate(dir) {
  return spawnSync(process.execPath, [GATE, dir], { encoding: 'utf8' });
}

const CLEAN = {
  'index.html': '<!doctype html><html><head><link rel="stylesheet" href="styles-ABC.css"></head><body><kiosk-root></kiosk-root><script src="main-XYZ.js" type="module"></script></body></html>',
  'styles-ABC.css': '@font-face{font-family:"Inter Variable";src:url(./media/inter-latin-wght-normal.woff2) format("woff2-variations")}',
  'main-XYZ.js': 'const s=document.createElementNS("http://www.w3.org/2000/svg","svg");fetch("/api/v1/kiosk/readiness");',
  'media/inter-latin-wght-normal.woff2': Buffer.from([0x77, 0x4f, 0x46, 0x32, 0x68, 0x74, 0x74, 0x70]),
};

test('a clean bundle passes (negative control)', () => {
  const dir = plant(CLEAN);
  const r = runGate(dir);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /offline gate: PASS/);
});

test('a Google Fonts link in index.html fails', () => {
  const dir = plant({
    ...CLEAN,
    'index.html': CLEAN['index.html'].replace(
      '<head>',
      '<head><link href="https://fonts.googleapis.com/css2?family=Inter:wght@400" rel="stylesheet">',
    ),
  });
  const r = runGate(dir);
  assert.equal(r.status, 1);
  assert.match(r.stdout, /https:\/\/fonts\.googleapis\.com\/css2\?family=Inter:wght@400/);
  assert.match(r.stdout, /index\.html/);
});

test('a cdnjs stylesheet in CSS fails', () => {
  const dir = plant({
    ...CLEAN,
    'styles-ABC.css': '@import url("https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css");',
  });
  const r = runGate(dir);
  assert.equal(r.status, 1);
  assert.match(r.stdout, /cdnjs\.cloudflare\.com/);
});

test('an absolute API URL in a script fails, and so does a websocket URL', () => {
  const dir = plant({
    ...CLEAN,
    'chunk-1.js': 'fetch("http://127.0.0.1:18080/api/v1/kiosk/session");new WebSocket("wss://example.org/x")',
  });
  const r = runGate(dir);
  assert.equal(r.status, 1);
  assert.match(r.stdout, /http:\/\/127\.0\.0\.1:18080\/api\/v1\/kiosk\/session/);
  assert.match(r.stdout, /wss:\/\/example\.org\/x/);
});

test('a protocol-relative URL in CSS fails', () => {
  const dir = plant({ ...CLEAN, 'styles-ABC.css': 'a{background:url(//cdn.example.org/a.png)}' });
  const r = runGate(dir);
  assert.equal(r.status, 1);
  assert.match(r.stdout, /\/\/cdn\.example\.org\/a\.png/);
});

test('an external URL inside a source map or an SVG asset also fails', () => {
  const dir = plant({
    ...CLEAN,
    'media/logo.svg': '<svg xmlns="http://www.w3.org/2000/svg"><image href="https://example.org/x.png"/></svg>',
  });
  const r = runGate(dir);
  assert.equal(r.status, 1);
  assert.match(r.stdout, /https:\/\/example\.org\/x\.png/);
});

test('XML namespace identifiers are not loads and pass', () => {
  const found = findExternalUrls(
    'createElementNS("http://www.w3.org/2000/svg","g");setAttributeNS("http://www.w3.org/1999/xlink","href","#a");' +
      '"http://www.w3.org/1999/xhtml";"http://www.w3.org/XML/1998/namespace";"http://www.w3.org/2000/xmlns/";"http://www.w3.org/1998/Math/MathML"',
  );
  assert.deepEqual(found, []);
});

test("Angular core's security-doc constant is exempt, exactly, and no other angular.dev URL", () => {
  assert.deepEqual(
    findExternalUrls('var Ar="https://angular.dev/best-practices/security#preventing-cross-site-scripting-xss";'),
    [],
  );
  assert.equal(findExternalUrls('fetch("https://angular.dev/best-practices/security")').length, 1);
  assert.equal(findExternalUrls('"https://angular.dev/errors/NG0100"').length, 1);
});

test('a w3.org URL that is not a namespace identifier still fails', () => {
  const found = findExternalUrls('fetch("http://www.w3.org/2000/svg/../evil.css")');
  assert.equal(found.length, 1);
});

test('an empty or missing bundle directory fails loudly, never passes', () => {
  const empty = mkdtempSync(join(tmpdir(), 'kiosk-offline-gate-empty-'));
  const r1 = runGate(empty);
  assert.equal(r1.status, 2, r1.stdout + r1.stderr);
  assert.match(r1.stderr, /no index\.html/);
  const r2 = runGate(join(empty, 'does-not-exist'));
  assert.equal(r2.status, 2);
});
