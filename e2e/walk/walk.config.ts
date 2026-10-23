/**
 * The scripted walk (T4.1): the mockup's qa-walk.js ported to kiosk-web, one demo session per
 * language at the showroom's 1366 x 768 (K2). Start it with e2e/walk/run-walk.sh, which holds the
 * browser slot and the stack's go; this config refuses to load without what the script sets.
 *
 * KIOSK_WALK_TARGET=fixtures: this worktree's production build (tools/serve-dist.mjs on 18410)
 *   over the dev fixture server (18401), T4's port range. Record checks there are fixture data.
 * KIOSK_WALK_TARGET=stack: the kiosk itself, KIOSK_WALK_EDGE (http://127.0.0.1:8093), only with
 *   KIOSK_WALK_STACK_GO=1 (the orchestrator's slot); nothing is started.
 */
import { defineConfig, devices } from '@playwright/test';

const FIXTURES = 18401;
const DIST = 18410;

const target = process.env['KIOSK_WALK_TARGET'];
const out = process.env['KIOSK_WALK_OUT'];
if (target !== 'fixtures' && target !== 'stack') {
  throw new Error('[walk] KIOSK_WALK_TARGET must be fixtures or stack: start the walk with e2e/walk/run-walk.sh');
}
if (!out || !out.startsWith('/')) throw new Error('[walk] KIOSK_WALK_OUT must be an absolute directory: start the walk with e2e/walk/run-walk.sh');
if (target === 'stack' && process.env['KIOSK_WALK_STACK_GO'] !== '1') {
  throw new Error('[walk] a stack walk needs KIOSK_WALK_STACK_GO=1, given only in a slot the orchestrator assigns');
}
const edge = process.env['KIOSK_WALK_EDGE'];
if (target === 'stack' && !edge) throw new Error('[walk] a stack walk needs KIOSK_WALK_EDGE, the kiosk origin');
const baseURL = target === 'stack' ? (edge as string) : `http://127.0.0.1:${DIST}`;

const viewport = { width: 1366, height: 768 };
const browser = { ...devices['Desktop Chrome'], viewport, deviceScaleFactor: 1, timezoneId: 'Asia/Singapore', locale: 'en-SG' };

export default defineConfig({
  testDir: '.',
  testMatch: 'walk.spec.ts',
  outputDir: `${out}/playwright`,
  // A whole demo session per language; the stack's slow steps (a reset, a prepared crew) fit, and
  // so does section S (four more resets of about 40 s each and the 2-minute idle loop).
  timeout: 45 * 60_000,
  expect: { timeout: 10_000 },
  workers: 1,
  fullyParallel: false,
  retries: 0,
  reporter: [['list']],
  // Every action and navigation is bounded: an element that is not there must fail its step, never
  // wait out the test (the first stack run hung 30 minutes on a fill).
  use: { baseURL, actionTimeout: 10_000, navigationTimeout: 30_000, screenshot: 'off', trace: 'off', video: 'off' },
  projects: [
    { name: 'en', use: browser, metadata: { lang: 'en' } },
    { name: 'zh', use: browser, metadata: { lang: 'zh' } },
  ],
  webServer:
    target === 'fixtures'
      ? [
          { command: `node dev/fixture-server.mjs --port ${FIXTURES}`, port: FIXTURES, reuseExistingServer: false, cwd: '../..' },
          {
            command: `node tools/serve-dist.mjs --port ${DIST} --api http://127.0.0.1:${FIXTURES}`,
            url: `http://127.0.0.1:${DIST}/`,
            reuseExistingServer: false,
            cwd: '../..',
          },
        ]
      : undefined,
});
