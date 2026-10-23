#!/usr/bin/env node
// The no-fixture gate (T3.1): no dev fixture reaches the production bundle.
//
// Fixtures live in kiosk-web/dev/fixtures/ and are served only by the dev fixture server.
// Each fixture file is a wrapper carrying the marker:
//   { "fixture": "KIOSK_DEV_FIXTURE", "method": "GET", "path": "/api/...", "status": 200, "body": ... }
// The gate fails when the bundle holds the marker (a fixture file was imported) or any
// fixture's long content string (fixture text copied into the source by hand). A fixture string
// that equals an interface string (src/app/i18n/en.json, zh.json) is the product's own copy, not a
// leak: the prepared-choice list must name a chip's English string exactly (PREPARED-CHOICES.md 5.5).
// Nor is a fixture string that the world's own shipped papers contain (kiosk/world/papers/papers.json,
// the build's /papers/): a model's label quoting the paper it read (W38) is the world's text, not a leak.
//
// Usage: node tools/gates/no-fixture-gate.mjs <bundle dir> [--fixtures <dir>] [--interface <i18n dir>] [--world <papers.json>]
// Exit 0: clean. Exit 1: fixture content found. Exit 2: bad input (never a pass).
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { join, relative, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const MARKER = 'KIOSK_DEV_FIXTURE';
// Strings shorter than this (enums, ids, names, short labels) are too common to fingerprint.
const MIN_FINGERPRINT = 24;
// Only prose is a fingerprint: a string with no whitespace is an identifier (a contract enum,
// an id, a time, a path) that the bundle may legitimately share with a recorded response.
const isProse = (s) => /\s/.test(s.trim());

const DEFAULT_FIXTURES = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'dev', 'fixtures');
const DEFAULT_INTERFACE = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'src', 'app', 'i18n');
const INTERFACE_TABLES = ['en.json', 'zh.json'];
const DEFAULT_WORLD = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'papers', 'papers.json');

/** Every string of the world's papers file: the world's own text, which the bundle ships by design. */
export function loadWorldStrings(path) {
  if (!existsSync(path)) throw new Error(`no-fixture gate: the world file ${path} does not exist`);
  let parsed;
  try {
    parsed = JSON.parse(readFileSync(path, 'utf8'));
  } catch (err) {
    throw new Error(`no-fixture gate: the world file ${path} is not JSON (${err.message})`);
  }
  const out = [];
  const visit = (v) => {
    if (typeof v === 'string') out.push(v);
    else if (Array.isArray(v)) v.forEach(visit);
    else if (v && typeof v === 'object') Object.values(v).forEach(visit);
  };
  visit(parsed);
  return out;
}

/** Every string of the interface tables: the product's own copy, which the bundle holds by design. */
export function loadInterfaceStrings(dir) {
  const out = new Set();
  for (const name of INTERFACE_TABLES) {
    const path = join(dir, name);
    if (!existsSync(path)) throw new Error(`no-fixture gate: the interface table ${path} does not exist`);
    for (const v of Object.values(JSON.parse(readFileSync(path, 'utf8')))) out.add(v);
  }
  return out;
}

function walk(dir, filter = () => true) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) out.push(...walk(path, filter));
    else if (filter(path)) out.push(path);
  }
  return out;
}

/** Every prose string of length >= MIN_FINGERPRINT in a fixture's bodies: its body, each sequence step's, each variant's. */
export function fixtureStrings(fixture) {
  const out = new Set();
  const visit = (v) => {
    if (typeof v === 'string') {
      if (v.length >= MIN_FINGERPRINT && v !== MARKER && isProse(v)) out.add(v);
    } else if (Array.isArray(v)) v.forEach(visit);
    else if (v && typeof v === 'object') Object.values(v).forEach(visit);
  };
  visit(fixture.body);
  for (const step of [...(fixture.sequence ?? []), ...(fixture.variants ?? [])]) visit(step.body);
  return [...out];
}

/** The forms a string can take inside a minified bundle: as is, JSON-escaped, \u-escaped. */
function encodings(s) {
  const json = JSON.stringify(s).slice(1, -1);
  const ascii = json.replace(/[\u0080-￿]/g, (c) => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0'));
  return [...new Set([s, json, ascii])];
}

export function loadFixtures(dir) {
  if (!existsSync(dir) || !statSync(dir).isDirectory()) {
    throw new Error(`no-fixture gate: fixtures directory ${dir} does not exist`);
  }
  const files = walk(dir, (p) => p.endsWith('.json'));
  if (files.length === 0) throw new Error(`no-fixture gate: no fixture files in ${dir}`);
  const fingerprints = [];
  for (const file of files) {
    let parsed;
    try {
      parsed = JSON.parse(readFileSync(file, 'utf8'));
    } catch (err) {
      throw new Error(`no-fixture gate: ${relative(dir, file)} is not JSON (${err.message})`);
    }
    if (parsed.fixture !== MARKER) {
      throw new Error(`no-fixture gate: ${relative(dir, file)} lacks the "fixture": "${MARKER}" marker`);
    }
    for (const s of fixtureStrings(parsed)) fingerprints.push({ file: relative(dir, file), s });
  }
  return { files: files.length, fingerprints };
}

export function scanBundle(bundleDir, fixturesDir, interfaceDir = DEFAULT_INTERFACE, worldFile = DEFAULT_WORLD) {
  if (!existsSync(bundleDir) || !statSync(bundleDir).isDirectory()) {
    throw new Error(`no-fixture gate: bundle directory ${bundleDir} does not exist`);
  }
  const own = loadInterfaceStrings(interfaceDir);
  const world = loadWorldStrings(worldFile);
  const loaded = loadFixtures(fixturesDir);
  const fixtureFiles = loaded.files;
  const fingerprints = loaded.fingerprints.filter((fp) => !own.has(fp.s) && !world.some((w) => w.includes(fp.s)));
  const bundleFiles = walk(bundleDir);
  const hits = [];
  for (const file of bundleFiles) {
    const text = readFileSync(file).toString('utf8');
    const rel = relative(bundleDir, file);
    if (text.includes(MARKER)) hits.push({ file: rel, what: MARKER });
    for (const fp of fingerprints) {
      if (encodings(fp.s).some((e) => text.includes(e))) {
        hits.push({ file: rel, what: `"${fp.s.slice(0, 60)}" from ${fp.file}` });
      }
    }
  }
  return { fixtureFiles, fingerprints: fingerprints.length, bundleFiles: bundleFiles.length, hits };
}

function main(argv) {
  const args = argv.slice(2);
  const bundleDir = args[0];
  const fi = args.indexOf('--fixtures');
  const fixturesDir = fi >= 0 ? args[fi + 1] : DEFAULT_FIXTURES;
  const ii = args.indexOf('--interface');
  const interfaceDir = ii >= 0 ? args[ii + 1] : DEFAULT_INTERFACE;
  const wi = args.indexOf('--world');
  const worldFile = wi >= 0 ? args[wi + 1] : DEFAULT_WORLD;
  if (!bundleDir || !fixturesDir) {
    process.stderr.write('usage: no-fixture-gate.mjs <bundle dir> [--fixtures <dir>] [--interface <i18n dir>] [--world <papers.json>]\n');
    return 2;
  }
  let r;
  try {
    r = scanBundle(bundleDir, fixturesDir, interfaceDir, worldFile);
  } catch (err) {
    process.stderr.write(`${err.message}\n`);
    return 2;
  }
  const scope = `${r.fixtureFiles} fixture file(s), ${r.fingerprints} fingerprint(s), ${r.bundleFiles} bundle file(s)`;
  if (r.hits.length > 0) {
    process.stdout.write(`no-fixture gate: FAIL (${scope})\n`);
    for (const h of r.hits) process.stdout.write(`  ${h.file}: ${h.what}\n`);
    return 1;
  }
  process.stdout.write(`no-fixture gate: PASS (${scope})\n`);
  return 0;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exit(main(process.argv));
}
