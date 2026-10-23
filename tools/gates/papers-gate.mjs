#!/usr/bin/env node
// The papers gate (K158 D5): the bundle serves the prepared papers at /papers/, copied by the build
// from kiosk/world/papers/ through the `papers` link. A link that dangles (the folder left out of
// the build context) still builds green, with no papers: so the bundle must hold every paper the
// list names, byte for byte, and papers.json (their titles) beside them.
//
// Usage: node tools/gates/papers-gate.mjs <bundle dir> <papers.sha256>
// Exit 0: every listed paper matches. Exit 1: what is missing or differs, one per line.
// Exit 2: the bundle's papers folder or the list is missing or empty (never a pass).
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

function main(argv) {
  const [bundle, listPath] = argv.slice(2);
  if (!bundle || !listPath) {
    console.error('usage: papers-gate.mjs <bundle dir> <papers.sha256>');
    return 2;
  }
  const dir = join(bundle, 'papers');
  if (!existsSync(dir) || !statSync(dir).isDirectory()) {
    console.error(`papers: ${dir} is missing: the build copied no papers (is kiosk/world/papers in the build context?)`);
    return 2;
  }
  if (!existsSync(listPath)) {
    console.error(`papers: the list ${listPath} is missing`);
    return 2;
  }
  const listed = readFileSync(listPath, 'utf8')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      const m = /^([0-9a-f]{64}) {2}(\S+)$/.exec(l);
      if (!m) throw new Error(`papers: ${listPath} has a line that is not "<sha256>  <file>": ${l}`);
      return { sum: m[1], name: m[2] };
    });
  if (listed.length === 0) {
    console.error(`papers: the list ${listPath} names no paper`);
    return 2;
  }
  const faults = [];
  for (const { sum, name } of listed) {
    const path = join(dir, name);
    if (!existsSync(path)) {
      faults.push(`${name}: missing from the bundle`);
      continue;
    }
    const got = createHash('sha256').update(readFileSync(path)).digest('hex');
    if (got !== sum) faults.push(`${name}: sha256 ${got}, listed ${sum}`);
  }
  if (!existsSync(join(dir, 'papers.json'))) faults.push('papers.json: missing from the bundle');
  if (faults.length) {
    for (const f of faults) console.error(`papers: ${f}`);
    return 1;
  }
  console.log(`papers: ${listed.length} of ${listed.length} match papers.sha256: PASS`);
  return 0;
}

process.exit(main(process.argv));
