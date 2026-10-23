/// <reference types="vitest" />
/**
 * Vitest through Vite and @analogjs/vite-plugin-angular, as chora-web runs it (ADR-176):
 * the `@angular/build:unit-test` builder does not instrument application source, so its
 * coverage reads 0%. Run with `npm test` or `npm run test:coverage` (never `ng test`).
 *
 * kiosk-web is zoneless (Angular 21's default, explicit in app.config.ts), so the TestBed
 * starts zoneless too (src/test-setup.ts) and timer tests use vitest's fake timers.
 * pool 'forks' + isolate true: each spec file gets its own module graph.
 * The npm scripts give node a 6 GB heap: a run that dies with exit 134 printed no summary
 * and is not green.
 *
 * testTimeout/hookTimeout are 20s, not vitest's 5s default. A full run takes 2-3 minutes
 * over 121 files, and the Angular + jsdom setup in a hook can exceed 5s on a loaded machine:
 * measured 2026-10-23, runs failing with "Test timed out in 5000ms" in a different file each
 * time, every one of them passing in isolation and none of them failing an assertion.
 */
import { defineConfig } from 'vite';
import angular from '@analogjs/vite-plugin-angular';

export default defineConfig(() => ({
  plugins: [
    angular({
      tsconfig: 'tsconfig.spec.json',
      inlineStylesExtension: 'scss',
    }),
  ],
  resolve: {
    conditions: ['style', 'sass'],
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['src/test-setup.ts'],
    include: ['src/**/*.spec.ts'],
    pool: 'forks',
    isolate: true,
    testTimeout: 20000,
    hookTimeout: 20000,
    coverage: {
      provider: 'v8',
      reportOnFailure: true,
      reporter: ['text-summary', 'json-summary', 'html'],
      reportsDirectory: './coverage/kiosk-web',
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.spec.ts', 'src/**/*.testing.ts', 'src/main.ts', 'src/**/*.d.ts', 'src/test-setup.ts'],
      thresholds: {
        lines: 80,
        statements: 80,
        functions: 80,
        branches: 80,
      },
    },
  },
}));
