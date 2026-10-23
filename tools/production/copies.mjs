#!/usr/bin/env node
// The production code kiosk-web copies (T3.3, T3.6): the lens, the API clients and their
// specs, from chora-web at the commit chora.site serves (copies.json `commit`). kiosk-web is
// its own project (copied, never shared), so the copies must stay provably production's.
//
// A copy is production's file with three mechanical changes and nothing else:
//   - relative imports re-pointed: production's src/app/features/surfaces/<x> lives at
//     kiosk-web/src/app/<x>; core, shared and environments keep their places;
//   - production's own translate pipe and service become @ngx-translate/core (the same
//     instant(key, params) and `translate` pipe);
//   - em and en dashes become colons, commas and hyphens (the owner's style rule).
// A file that needs more is listed `adapted`, with why, and marks each change KIOSK.
//
// Usage: node tools/production/copies.mjs check            every verbatim copy equals production after the rules
//        node tools/production/copies.mjs copy <from>...   write the copy of each listed production file
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, posix } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, '..', '..', '..');
const SURFACES = 'chora-web/src/app/features/surfaces/';
const PROD_SRC = 'chora-web/src/';
const TRANSLATE = new Set(['chora-web/src/app/shared/pipes/translate.pipe', 'chora-web/src/app/core/services/translate.service']);

/** Where a production source path lives in kiosk-web (with or without its extension). */
export function kioskPathOf(prodPath) {
  if (prodPath.startsWith(SURFACES)) return 'kiosk-web/src/app/' + prodPath.slice(SURFACES.length);
  if (prodPath.startsWith(PROD_SRC)) return 'kiosk-web/src/' + prodPath.slice(PROD_SRC.length);
  throw new Error(`${prodPath} is not a chora-web source path`);
}

/** Production's text of `prodPath`, as kiosk-web keeps it. */
export function transform(text, prodPath) {
  const here = posix.dirname(kioskPathOf(prodPath));
  const imports = text.replace(/(from\s+|import\s*\(\s*)(['"])(\.{1,2}\/[^'"]+)\2/g, (_whole, lead, q, spec) => {
    const target = posix.normalize(posix.join(posix.dirname(prodPath), spec));
    if (TRANSLATE.has(target)) return `${lead}${q}@ngx-translate/core${q}`;
    let rel = posix.relative(here, kioskPathOf(target));
    if (!rel.startsWith('.')) rel = './' + rel;
    return `${lead}${q}${rel}${q}`;
  });
  return imports
    .replace(/ — /g, ': ')
    .replace(/ —$/gm, ':')
    .replace(/—/g, ', ')
    .replace(/–/g, '-');
}

function readList() {
  return JSON.parse(readFileSync(join(HERE, 'copies.json'), 'utf8'));
}

function production(commit, from) {
  return execFileSync('git', ['show', `${commit}:${from}`], { cwd: REPO, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
}

function check() {
  const { commit, files } = readList();
  let bad = 0;
  for (const f of files) {
    const kiosk = join(REPO, kioskPathOf(f.from));
    if (!existsSync(kiosk)) {
      bad++;
      process.stdout.write(`MISSING  ${f.from}\n`);
      continue;
    }
    const same = readFileSync(kiosk, 'utf8') === transform(production(commit, f.from), f.from);
    if (f.mode === 'verbatim' && !same) {
      bad++;
      process.stdout.write(`DIFFERS  ${f.from}: listed verbatim, but it is not production's after the rules\n`);
    } else if (f.mode === 'adapted' && (!f.why || same)) {
      bad++;
      process.stdout.write(`ADAPTED? ${f.from}: ${same ? 'equals production, so list it verbatim' : 'names no why'}\n`);
    } else if (f.mode !== 'verbatim' && f.mode !== 'adapted') {
      bad++;
      process.stdout.write(`MODE?    ${f.from}: ${String(f.mode)}\n`);
    }
  }
  const adapted = files.filter((f) => f.mode === 'adapted').length;
  process.stdout.write(`copies: ${files.length - adapted} verbatim, ${adapted} adapted, ${bad} problem(s), from ${commit}\n`);
  process.stdout.write(bad ? 'copies: CHECK FAIL\n' : 'copies: CHECK PASS\n');
  return bad === 0;
}

function copy(froms) {
  const { commit, files } = readList();
  for (const from of froms) {
    const listed = files.find((f) => f.from === from);
    if (!listed) throw new Error(`${from} is not in copies.json: list it first`);
    const target = join(REPO, kioskPathOf(from));
    if (listed.mode === 'adapted' && existsSync(target)) throw new Error(`${from} is adapted: copying would overwrite its KIOSK changes`);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, transform(production(commit, from), from));
    process.stdout.write(`copied ${from}\n`);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [cmd, ...args] = process.argv.slice(2);
  try {
    if (cmd === 'check') process.exit(check() ? 0 : 1);
    else if (cmd === 'copy' && args.length) copy(args);
    else throw new Error('usage: copies.mjs check | copy <from>...');
  } catch (err) {
    process.stderr.write(`copies: FAIL, ${err.message}\n`);
    process.exit(2);
  }
}
