#!/usr/bin/env node
// T3.1's gate: build the production bundle with the network off, then check the bundle.
//
// 1. Prove the sandbox is closed: curl to the npm registry must FAIL inside it. If it
//    succeeds, a green build would prove nothing, so this script refuses (exit 2).
// 2. `ng build` (production) inside macOS sandbox-exec with all outbound IP denied.
//    A failed ng build prints its error and then hangs (its esbuild service stays up),
//    so a FAILED line or the watchdog kills the process group and fails the gate.
// 3. The offline gate (no external URL in the bundle), the no-fixture gate and the papers gate
//    (K158: every prepared paper in the bundle, as papers.sha256 lists it).
//
// Usage: node tools/offline-build.mjs [--watchdog-s 300]
// macOS only (sandbox-exec). Exit 0 only when all three steps pass.
import { spawn, spawnSync } from 'node:child_process';
import { rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PROFILE = '(version 1)(allow default)(deny network-outbound (remote ip))';
const BUNDLE = join(ROOT, 'dist', 'kiosk-web', 'browser');

const wi = process.argv.indexOf('--watchdog-s');
const WATCHDOG_S = wi >= 0 ? Number(process.argv[wi + 1]) : 300;

function fail(code, message) {
  process.stderr.write(`offline build: FAIL, ${message}\n`);
  process.exit(code);
}

if (process.platform !== 'darwin') fail(2, 'sandbox-exec exists only on macOS');

// 1. The sandbox must be closed.
const probe = spawnSync(
  'sandbox-exec',
  ['-p', PROFILE, '/usr/bin/curl', '-s', '-o', '/dev/null', '--max-time', '8', 'https://registry.npmjs.org/'],
  { encoding: 'utf8' },
);
if (probe.error) fail(2, `could not run sandbox-exec (${probe.error.message})`);
if (probe.status === 0) fail(2, 'curl reached the internet inside the sandbox, so it is not offline');
process.stdout.write(`offline build: sandbox closed (curl exit ${probe.status} inside it)\n`);

// 2. The build, network off.
rmSync(join(ROOT, 'dist', 'kiosk-web'), { recursive: true, force: true });
const ng = join(ROOT, 'node_modules', '@angular', 'cli', 'bin', 'ng.js');
const child = spawn('sandbox-exec', ['-p', PROFILE, process.execPath, ng, 'build'], {
  cwd: ROOT,
  detached: true,
  stdio: ['ignore', 'pipe', 'pipe'],
});
let out = '';
let failedLine = false;
const onData = (buf) => {
  const s = buf.toString();
  out += s;
  process.stdout.write(s);
  if (/\[FAILED|An unhandled exception occurred/.test(s) && !failedLine) {
    failedLine = true;
    setTimeout(() => killGroup('the build reported a failure'), 1500);
  }
};
child.stdout.on('data', onData);
child.stderr.on('data', onData);

let killedFor = null;
function killGroup(reason) {
  if (killedFor) return;
  killedFor = reason;
  try {
    process.kill(-child.pid, 'SIGKILL');
  } catch {
    // the group is already gone
  }
}
const watchdog = setTimeout(() => killGroup(`no result within ${WATCHDOG_S} s`), WATCHDOG_S * 1000);

child.on('exit', (code) => {
  clearTimeout(watchdog);
  if (killedFor) fail(1, `ng build stopped: ${killedFor}`);
  if (code !== 0) fail(1, `ng build exited ${code}`);
  if (!/Application bundle generation complete/.test(out)) fail(1, 'ng build printed no completion line');

  // 3. The bundle gates.
  for (const [gate, ...args] of [['offline-gate.mjs'], ['no-fixture-gate.mjs'], ['papers-gate.mjs', join(ROOT, 'papers', 'papers.sha256')]]) {
    const r = spawnSync(process.execPath, [join(ROOT, 'tools', 'gates', gate), BUNDLE, ...args], { encoding: 'utf8' });
    process.stdout.write(r.stdout);
    process.stderr.write(r.stderr);
    if (r.status !== 0) fail(1, `${gate} exited ${r.status}`);
  }
  process.stdout.write('offline build: PASS (built with the network off; no external URL; no fixture; every paper)\n');
  process.exit(0);
});
