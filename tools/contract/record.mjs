#!/usr/bin/env node
// Records the contract reads from the running kiosk stack (W68, T3.3); see recorder.mjs for what it
// calls. Run it only on the orchestrator's go: it mints a kiosk session and reads through the edge.
//
// Usage: node tools/contract/record.mjs --out <empty folder> [--base http://127.0.0.1:18080] [--plan <plan.json>]
// Exit 0 recorded; 1 the stack refused or a read failed (nothing written); 2 a bad argument (nothing called).
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { DEFAULT_BASE, checkBase, recordStack, validatePlan, writeRecordings } from './recorder.mjs';

const DEFAULT_PLAN = fileURLToPath(new URL('../../src/app/contract/plan.json', import.meta.url));

function args(argv) {
  const o = { base: DEFAULT_BASE, plan: DEFAULT_PLAN, out: null };
  for (let i = 0; i < argv.length; i += 2) {
    const [flag, value] = [argv[i], argv[i + 1]];
    if (!['--base', '--plan', '--out'].includes(flag) || value === undefined) throw new Error(`unknown or incomplete argument ${flag}`);
    o[flag.slice(2)] = value;
  }
  if (!o.out) throw new Error('--out <empty folder> is required');
  o.base = checkBase(o.base);
  o.plan = validatePlan(JSON.parse(readFileSync(o.plan, 'utf8')));
  return o;
}

let o;
try {
  o = args(process.argv.slice(2));
} catch (err) {
  process.stderr.write(`[contract] ${err.message.replace(/^\[contract\] /, '')}\n`);
  process.exit(2);
}

try {
  const run = await recordStack({ base: o.base, plan: o.plan, log: (line) => process.stdout.write(`${line}\n`) });
  const files = writeRecordings(o.out, run.recordings, run.token);
  process.stdout.write(`recorded ${run.recordings.length} reads in ${files.length} files to ${o.out}\n`);
} catch (err) {
  process.stderr.write(`${err.message}\n`);
  process.exit(1);
}
