import { expect, test, type Page } from '@playwright/test';

// K138 pass 4, W11 (19 Oct): on Ember's dose (Companions, Today's dose) the golden run's long AI greeting
// pushed the rail's LIVE row ("New greeting") to 692..720 px, under the footer (top 703), and nothing
// scrolled, in en and zh. K42: every LIVE row is reachable. Measured at the showroom's 1366 x 768 (K2) on
// every Companion's dose in both languages, each greeting the golden run's longest (Ember's).

import { EMBER, WORLD, routeDose, routeGreeting } from './world-routes';

async function jump(page: Page, to: string): Promise<void> {
  await page.keyboard.press('Backquote');
  await page.click(`[data-act="jump"][data-to="${to}"]`);
  await page.keyboard.press('Backquote');
}

interface RailFit {
  /** The ability row's bottom and the dose's top, in px: the row never covers the dose (K158, four abilities). */
  readonly abilitiesBottom: number;
  readonly doseTop: number;
  /** The LIVE row's bottom, and the footer's top, in px. */
  readonly rowBottom: number;
  readonly footTop: number;
  /** The LIVE button's centre hits the button itself (not the footer or a sibling over it). */
  readonly buttonOnTop: boolean;
  /** The greeting's box: taller text than box means it must scroll inside itself. */
  readonly quoteOverflows: boolean;
  readonly quoteScrolls: boolean;
}

async function railFit(page: Page): Promise<RailFit> {
  return page.evaluate(() => {
    const rail = document.querySelector('.cx-rail') as HTMLElement;
    const row = rail.querySelector('[data-live]') as HTMLElement;
    const btn = rail.querySelector('[data-act="live"]') as HTMLElement;
    const quote = rail.querySelector('.cx-rail__quote') as HTMLElement;
    const r = btn.getBoundingClientRect();
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    const scroll = getComputedStyle(quote).overflowY;
    return {
      abilitiesBottom: Math.round((document.querySelector('.comp-abilities') as HTMLElement).getBoundingClientRect().bottom),
      doseTop: Math.round((document.querySelector('.comp-dose') as HTMLElement).getBoundingClientRect().top),
      rowBottom: Math.round(row.getBoundingClientRect().bottom),
      footTop: Math.round((document.querySelector('#bottom') as HTMLElement).getBoundingClientRect().top),
      buttonOnTop: !!hit && btn.contains(hit),
      quoteOverflows: quote.scrollHeight > quote.clientHeight + 1,
      quoteScrolls: scroll === 'auto' || scroll === 'scroll',
    };
  });
}

const fits: Record<string, RailFit> = {};

test.beforeEach(async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  (page as unknown as { kioskErrors: string[] }).kioskErrors = errors;
  expect((await page.request.post('/api/v1/kiosk/reset')).ok()).toBe(true);
});

test.afterEach(async ({ page }) => {
  expect((page as unknown as { kioskErrors: string[] }).kioskErrors).toEqual([]);
});

test.afterAll(() => {
  console.log(`[dose-fit] ${JSON.stringify(fits)}`);
});

for (const lang of ['en', 'zh'] as const) {
  test(`every Companion's dose keeps its greeting's LIVE row in view, with the golden run's longest greeting (${lang})`, async ({ page }) => {
    await routeDose(page);
    await routeGreeting(page, EMBER);
    await page.goto('/');
    if (lang === 'zh') await page.click('[data-act="lang"][data-lang="zh"]');
    await jump(page, 'comp');
    for (const mate of ['pingu', 'nova', 'ember']) {
      await page.click(`[data-act="mate"][data-id="${WORLD[`companion.${mate}`]}"]`);
      await page.click('[data-act="ability"][data-ab="dose"]');
      await expect(page.locator('.cx-rail__quote')).toHaveText(EMBER);
      const fit = await railFit(page);
      fits[`${lang}.${mate}`] = fit;
      if (mate === 'ember') await page.screenshot({ path: `test-results/dose-fit-ember-${lang}.png` });
      expect(fit.doseTop - fit.abilitiesBottom, `${lang} ${mate}: the abilities end ${fit.abilitiesBottom} px, the dose starts ${fit.doseTop} px`).toBeGreaterThanOrEqual(8);
      expect(fit.rowBottom, `${lang} ${mate}: the LIVE row ends ${fit.rowBottom} px, the footer starts ${fit.footTop} px`).toBeLessThanOrEqual(fit.footTop - 4);
      expect(fit.buttonOnTop, `${lang} ${mate}: "New greeting" is covered`).toBe(true);
      // Text the box cannot show at once is still readable: the box scrolls inside itself.
      if (fit.quoteOverflows) expect(fit.quoteScrolls, `${lang} ${mate}: the greeting overflows its box and does not scroll`).toBe(true);
    }
  });
}

test('a greeting twice the golden run’s longest scrolls inside its box, and the LIVE row stays in view', async ({ page }) => {
  await routeDose(page);
  await routeGreeting(page, `${EMBER} ${EMBER}`);
  await page.goto('/');
  await jump(page, 'comp');
  await page.click(`[data-act="mate"][data-id="${WORLD['companion.ember']}"]`);
  await page.click('[data-act="ability"][data-ab="dose"]');
  await expect(page.locator('.cx-rail__quote')).toHaveText(`${EMBER} ${EMBER}`);
  const fit = await railFit(page);
  fits['en.ember.double'] = fit;
  // The control: this greeting cannot fit at once, so a box that never overflows would prove nothing.
  expect(fit.quoteOverflows, 'the doubled greeting fits its box at once, so the case is not measured').toBe(true);
  expect(fit.quoteScrolls).toBe(true);
  expect(fit.rowBottom).toBeLessThanOrEqual(fit.footTop - 4);
  expect(fit.buttonOnTop).toBe(true);
});
