/**
 * Vitest global setup (see vitest.config.ts). kiosk-web is zoneless, so the TestBed is too.
 * `@angular/compiler` enables JIT compilation of templates in tests.
 */
import '@angular/compiler';
import { setupTestBed } from '@analogjs/vitest-angular/setup-testbed';

setupTestBed({ zoneless: true });

// jsdom lays nothing out and has no scrollIntoView; the reveal directive calls it in the browser,
// and the specs spy on it (K138 W4).
if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = function scrollIntoView(): void {};
