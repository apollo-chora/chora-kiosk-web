import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { expect, test, type Page } from '@playwright/test';

// K158 W20: "Read my marked test" (Companions' fourth ability) takes the map's place, as the dose does:
// the paper at the region's height, its proposed weak spots with Keep / Not this one / Same as another
// here, and Save. K206, K210: a marked test keeps its prepared reading under its prepared stamp, with no
// LIVE row; Pingu's panel adds the essay as a second tab, its page, caption and the one LIVE row. K42:
// every LIVE row is reachable; the stage never scrolls, so a long panel scrolls its spot list inside
// itself. Measured on every Companion's prepared run in both languages, at the showroom's 1366 x 768
// (K2) and at the stage's own 1600 x 900.

const ROOT = join(__dirname, '..');
const WORLD = (JSON.parse(readFileSync(join(ROOT, 'dev/fixtures/world/manifest.json'), 'utf8')) as { body: { world: Record<string, string> } }).body.world;
const MATES = ['pingu', 'nova', 'ember'] as const;
const SIZES = [
  { width: 1366, height: 768 },
  { width: 1600, height: 900 },
] as const;

interface WeakFit {
  /** The ability row's bottom and the region's top, in px: the row never covers the region (K158, four abilities). */
  readonly abilitiesBottom: number;
  readonly regionTop: number;
  /** The footer's top and the region's bottom, in px: everything below ends above both. */
  readonly footTop: number;
  readonly regionBottom: number;
  readonly paperBottom: number;
  readonly paperLoaded: boolean;
  /** The paper ends left of the side column (no overlap). */
  readonly paperRight: number;
  readonly sideLeft: number;
  /** The side column's own overflow: content it cannot show is cut off by the region. */
  readonly sideOverflowsY: boolean;
  readonly sideOverflowsX: boolean;
  /** The spot list: taller content than box means it must scroll inside itself. */
  readonly edgesOverflow: boolean;
  readonly edgesScroll: boolean;
  /** The list's room under its last spot, in px (negative: the last spot runs past it and the list scrolls). */
  readonly edgesSpare: number | null;
  /** The list's room under its third spot, in px (negative: the third is cut at the list's bottom edge, W38). */
  readonly thirdSpare: number | null;
  /** Save, while the review is open (null once saved). */
  readonly saveBottom: number | null;
  readonly saveOnTop: boolean | null;
  /** The saved line, once saved (null while the review is open). */
  readonly savedBottom: number | null;
  /** The LIVE row's bottom (the essay), or the prepared stamp's (a marked test, K206). */
  readonly rowBottom: number;
  /** The LIVE button is on top; null where there is none (a marked test, K206, K210). */
  readonly liveOnTop: boolean | null;
  /** The two document tabs (Pingu, K206): their bottom, or null where there are none. */
  readonly tabsBottom: number | null;
  /** The essay's caption: its bottom, or null where none shows. */
  readonly capBottom: number | null;
  /** The page itself scrolls (it never should). */
  readonly pageScrolls: boolean;
}

async function weakFit(page: Page): Promise<WeakFit> {
  return page.evaluate(() => {
    const region = document.querySelector('.comp-weak') as HTMLElement;
    const panel = region.querySelector('.cx-weak') as HTMLElement;
    const img = panel.querySelector('.cx-weak__paper img') as HTMLImageElement;
    const side = panel.querySelector('.cx-weak__side') as HTMLElement;
    const edges = side.querySelector('.cx-weak__edges') as HTMLElement | null;
    const save = side.querySelector('[data-act="weakSave"]') as HTMLElement | null;
    const saved = side.querySelector('.cx-weak__saved') as HTMLElement | null;
    const row = (side.querySelector('[data-live]') ?? side.querySelector('.cx-weak__stamp')) as HTMLElement;
    const live = row.querySelector('[data-act="live"]') as HTMLElement | null;
    const tabs = side.querySelector('.cx-weak__docs') as HTMLElement | null;
    const cap = side.querySelector('.cx-weak__essayCap') as HTMLElement | null;
    const onTop = (el: HTMLElement): boolean => {
      const r = el.getBoundingClientRect();
      const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return !!hit && el.contains(hit);
    };
    const bottom = (el: HTMLElement): number => Math.round(el.getBoundingClientRect().bottom);
    const scroll = edges ? getComputedStyle(edges).overflowY : '';
    const doc = document.scrollingElement as HTMLElement;
    return {
      abilitiesBottom: bottom(document.querySelector('.comp-abilities') as HTMLElement),
      regionTop: Math.round(region.getBoundingClientRect().top),
      footTop: Math.round((document.querySelector('#bottom') as HTMLElement).getBoundingClientRect().top),
      regionBottom: bottom(region),
      paperBottom: bottom(img),
      paperLoaded: img.complete && img.naturalWidth > 0,
      paperRight: Math.round(img.getBoundingClientRect().right),
      sideLeft: Math.round(side.getBoundingClientRect().left),
      sideOverflowsY: side.scrollHeight > side.clientHeight + 1,
      sideOverflowsX: side.scrollWidth > side.clientWidth + 1,
      edgesOverflow: !!edges && edges.scrollHeight > edges.clientHeight + 1,
      edgesScroll: scroll === 'auto' || scroll === 'scroll',
      edgesSpare: edges?.lastElementChild ? Math.round(edges.getBoundingClientRect().bottom - edges.lastElementChild.getBoundingClientRect().bottom) : null,
      thirdSpare: edges && edges.children.length >= 3 ? Math.round(edges.getBoundingClientRect().bottom - edges.children[2].getBoundingClientRect().bottom) : null,
      saveBottom: save ? bottom(save) : null,
      saveOnTop: save ? onTop(save) : null,
      savedBottom: saved ? bottom(saved) : null,
      rowBottom: bottom(row),
      liveOnTop: live ? onTop(live) : null,
      tabsBottom: tabs ? bottom(tabs) : null,
      capBottom: cap ? bottom(cap) : null,
      pageScrolls: doc.scrollHeight > window.innerHeight + 1 || doc.scrollWidth > window.innerWidth + 1,
    };
  });
}

function expectFits(fit: WeakFit, at: string): void {
  const floor = Math.min(fit.footTop - 4, fit.regionBottom);
  expect(fit.pageScrolls, `${at}: the page scrolls`).toBe(false);
  expect(fit.regionTop - fit.abilitiesBottom, `${at}: the abilities end ${fit.abilitiesBottom} px, the panel starts ${fit.regionTop} px`).toBeGreaterThanOrEqual(8);
  expect(fit.paperLoaded, `${at}: the paper did not load`).toBe(true);
  expect(fit.paperBottom, `${at}: the paper ends ${fit.paperBottom} px, the footer starts ${fit.footTop} px`).toBeLessThanOrEqual(floor);
  expect(fit.paperRight, `${at}: the paper runs under the side column`).toBeLessThanOrEqual(fit.sideLeft);
  expect(fit.sideOverflowsY, `${at}: the side column is cut off at the bottom`).toBe(false);
  expect(fit.sideOverflowsX, `${at}: the side column is cut off at the right`).toBe(false);
  if (fit.edgesOverflow) expect(fit.edgesScroll, `${at}: the spot list overflows and does not scroll`).toBe(true);
  if (fit.saveBottom !== null) {
    expect(fit.saveBottom, `${at}: Save ends ${fit.saveBottom} px, the footer starts ${fit.footTop} px`).toBeLessThanOrEqual(floor);
    expect(fit.saveOnTop, `${at}: Save is covered`).toBe(true);
  }
  if (fit.savedBottom !== null) expect(fit.savedBottom, `${at}: the saved line is cut off`).toBeLessThanOrEqual(floor);
  expect(fit.rowBottom, `${at}: the LIVE row or the prepared stamp ends ${fit.rowBottom} px, the footer starts ${fit.footTop} px`).toBeLessThanOrEqual(floor);
  if (fit.liveOnTop !== null) expect(fit.liveOnTop, `${at}: the LIVE button is covered`).toBe(true);
  if (fit.tabsBottom !== null) expect(fit.tabsBottom, `${at}: the tabs are cut off`).toBeLessThanOrEqual(floor);
  if (fit.capBottom !== null) expect(fit.capBottom, `${at}: the essay's caption is cut off`).toBeLessThanOrEqual(floor);
}

async function jump(page: Page, to: string): Promise<void> {
  await page.keyboard.press('Backquote');
  await page.click(`[data-act="jump"][data-to="${to}"]`);
  await page.keyboard.press('Backquote');
}

async function openWeak(page: Page, mate: (typeof MATES)[number]): Promise<void> {
  await page.click(`[data-act="mate"][data-id="${WORLD[`companion.${mate}`]}"]`);
  await page.click('[data-act="ability"][data-ab="weak"]');
  await expect(page.locator('.cx-weak .cx-edge').first()).toBeVisible();
  await expect(page.locator('.cx-weak__paper img')).toHaveJSProperty('complete', true);
}

const fits: Record<string, WeakFit> = {};

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
  console.log(`[weak-fit] ${JSON.stringify(fits)}`);
});

for (const size of SIZES) {
  test.describe(`${size.width} x ${size.height}`, () => {
    test.use({ viewport: size });

    for (const lang of ['en', 'zh'] as const) {
      test(`every Companion's marked test keeps the paper, its weak spots, Save and its stamp in view; Pingu's essay tab its caption and LIVE row (${lang})`, async ({ page }) => {
        await page.goto('/');
        if (lang === 'zh') await page.click('[data-act="lang"][data-lang="zh"]');
        await jump(page, 'comp');
        for (const mate of MATES) {
          const at = `${size.width} ${lang} ${mate}`;
          await openWeak(page, mate);
          const shot = (state: string) => page.screenshot({ path: `test-results/weak-fit-${size.width}-${lang}-${mate}-${state}.png`, animations: 'disabled' });

          // The review as it opens: every spot kept.
          fits[`${at} review`] = await weakFit(page);
          await shot('review');
          expectFits(fits[`${at} review`], `${at} review`);
          // K206, K210: no marked test has a LIVE read; only Pingu has the two tabs.
          expect(fits[`${at} review`].liveOnTop, `${at} review: a marked test shows a LIVE read`).toBeNull();
          expect(fits[`${at} review`].tabsBottom !== null, `${at} review: the tabs`).toBe(mate === 'pingu');
          // W38: the golden run's own spots (dev/world/mockup-world.mjs): the first three show whole at once;
          // a fourth (Nova's run has four), or an open merge, scrolls inside the list.
          expect(fits[`${at} review`].thirdSpare, `${at} review: the third spot is cut ${fits[`${at} review`].thirdSpare} px at the list's bottom`).toBeGreaterThanOrEqual(0);

          // The tallest review: the first spot "Same as another here", its kept targets offered under it.
          const first = page.locator('.cx-weak .cx-edge').first();
          const spots = await page.locator('.cx-weak .cx-edge').count();
          await first.locator('[data-act="weakDecide"][data-decision="merge"]').click();
          await expect(first.locator('[data-act="weakInto"]')).toHaveCount(spots - 1);
          fits[`${at} merge`] = await weakFit(page);
          await shot('merge');
          expectFits(fits[`${at} merge`], `${at} merge`);

          // Saved: the merge folds into a kept spot, Save confirms, the saved line takes the list's place.
          await first.locator('[data-act="weakInto"]').first().click();
          await page.click('[data-act="weakSave"]');
          await expect(page.locator('.cx-weak__saved')).toBeVisible();
          fits[`${at} saved`] = await weakFit(page);
          await shot('saved');
          expectFits(fits[`${at} saved`], `${at} saved`);

          if (mate === 'pingu') {
            // K206: the essay tab before its press: its page, the caption and the one LIVE row, no list.
            await page.click('[data-act="weakDoc"][data-doc="essay"]');
            await expect(page.locator('.cx-weak__essayCap')).toBeVisible();
            await expect(page.locator('.cx-weak__paper img')).toHaveJSProperty('complete', true);
            fits[`${at} essay`] = await weakFit(page);
            await shot('essay');
            expectFits(fits[`${at} essay`], `${at} essay`);
            expect(fits[`${at} essay`].liveOnTop, `${at} essay: the LIVE read`).toBe(true);
            await page.click('[data-act="weakDoc"][data-doc="test"]');
          }
        }
      });
    }

    test('a panel twice the prepared run, with a save that failed, scrolls its spot list and keeps Save and its stamp in view', async ({ page }) => {
      const upload = (JSON.parse(readFileSync(join(ROOT, 'dev/fixtures/world/weakness-paper.water.json'), 'utf8')) as { path: string; body: { upload_id: string; review: { proposed_edges: Record<string, unknown>[] } } });
      const edges = upload.body.review.proposed_edges;
      const doubled = [...edges, ...edges.map((e, i) => ({ ...e, proposed_edge_id: `e2e-long-${i}`, summary: `${String(e['summary'])} ${String(e['summary'])}` }))];
      await page.route(`**${upload.path}`, (route) => route.fulfill({ json: { ...upload.body, review: { ...upload.body.review, proposed_edges: doubled } } }));
      await page.route(`**${upload.path}/resume`, (route) => route.fulfill({ status: 500, json: { error: 'e2e: the save failed' } }));
      await page.goto('/');
      await jump(page, 'comp');
      await openWeak(page, 'pingu');
      await expect(page.locator('.cx-weak .cx-edge')).toHaveCount(6);
      await page.click('[data-act="weakSave"]');
      await expect(page.locator('.cx-weak .msg-error')).toBeVisible();
      const at = `${size.width} en pingu doubled`;
      fits[at] = await weakFit(page);
      await page.screenshot({ path: `test-results/weak-fit-${size.width}-en-pingu-doubled.png`, animations: 'disabled' });
      // The control: six spots cannot fit at once, so a list that never overflows would prove nothing.
      expect(fits[at].edgesOverflow, `${at}: six spots fit at once, so the scroll case is not measured`).toBe(true);
      expectFits(fits[at], at);
      // The save that failed logs its own two errors (the 500, and the panel's loud line); any other stays.
      const errors = (page as unknown as { kioskErrors: string[] }).kioskErrors;
      const expected = [/the server responded with a status of 500/, new RegExp(`review of ${upload.body.upload_id} was not saved`)];
      for (const re of expected) expect(errors.some((e) => re.test(e)), `no error matches ${re}`).toBe(true);
      errors.splice(0, errors.length, ...errors.filter((e) => !expected.some((re) => re.test(e))));
    });
  });
}
