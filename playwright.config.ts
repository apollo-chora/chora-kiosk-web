/**
 * Playwright for T3's own browser checks against the production build (e2e/, outside
 * e2e/walk/, which is T4's port of the mockup walk). The showroom's window is 1366x768 (K2).
 * The build is served by tools/serve-dist.mjs on 127.0.0.1:18310, with /api and /bff proxied
 * to the dev fixture server on 127.0.0.1:18301 (T3's port range).
 * Run one browser walk at a time.
 */
import { defineConfig, devices } from '@playwright/test';

const PORT = 18310;
const FIXTURES = 18301;

export default defineConfig({
  testDir: './e2e',
  testIgnore: ['walk/**'],
  timeout: 30_000,
  expect: { timeout: 5_000 },
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    viewport: { width: 1366, height: 768 },
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1366, height: 768 } } }],
  webServer: [
    {
      command: `node dev/fixture-server.mjs --port ${FIXTURES}`,
      port: FIXTURES,
      reuseExistingServer: false,
    },
    {
      command: `node tools/serve-dist.mjs --port ${PORT} --api http://127.0.0.1:${FIXTURES}`,
      url: `http://127.0.0.1:${PORT}/`,
      reuseExistingServer: false,
    },
  ],
});
