import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { expect, test, type Page } from '@playwright/test';

// W52 (K182): a tap on the marked test's paper opens how the Companion read it, INSIDE the scene: the
// paper at the scene's height, each lost mark with the weak spot placed under it, and Close in a head
// row that never scrolls (W45's lesson: Close stays in view). The header and the footer, Next
// included, neither move nor hide (the tour's C6 relies on it). Measured on every Companion's prepared
// paper (the take's gemma4 runs, dev/world/mockup-world.mjs) in both languages, at the showroom's
// 1366 x 768 (K2) and at the stage's own 1600 x 900.

const ROOT = join(__dirname, '..');
const WORLD = (JSON.parse(readFileSync(join(ROOT, 'dev/fixtures/world/manifest.json'), 'utf8')) as { body: { world: Record<string, string> } }).body.world;
const MATES = [
  { mate: 'pingu', name: 'Pingu', lost: 3 },
  { mate: 'nova', name: 'Nova', lost: 4 },
  { mate: 'ember', name: 'Ember', lost: 4 },
] as const;
const SIZES = [
  { width: 1366, height: 768 },
  { width: 1600, height: 900 },
] as const;

interface PopFit {
  readonly sceneTop: number;
  readonly sceneBottom: number;
  readonly footTop: number;
  readonly sheetTop: number;
  readonly sheetBottom: number;
  readonly paperLoaded: boolean;
  readonly paperHeight: number;
  readonly paperBottom: number;
  readonly paperRight: number;
  readonly sideLeft: number;
  readonly sideOverflowsX: boolean;
  readonly closeBox: { x: number; y: number };
  readonly closeBottom: number;
  readonly closeOnTop: boolean;
  /** The list's own overflow, and whether it scrolls. */
  readonly listOverflows: boolean;
  readonly listScrolls: boolean;
  /** After the list is scrolled to its end: the last card's bottom against the list's. */
  readonly lastSpare: number;
  /** Close after that scroll: the same place, still on top. */
  readonly closeBoxAfter: { x: number; y: number };
  readonly closeOnTopAfter: boolean;
  readonly nextOnTop: boolean;
  readonly pageScrolls: boolean;
}

async function popFit(page: Page): Promise<PopFit> {
  return page.evaluate(async () => {
    const r = (sel: string) => (document.querySelector(sel) as HTMLElement).getBoundingClientRect();
    const onTop = (el: HTMLElement): boolean => {
      const b = el.getBoundingClientRect();
      const hit = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2);
      return !!hit && el.contains(hit);
    };
    const close = document.querySelector('.paper-pop [data-act="paperClose"]') as HTMLElement;
    const img = document.querySelector('.paper-pop__paper') as HTMLImageElement;
    const side = document.querySelector('.paper-pop__side') as HTMLElement;
    const list = document.querySelector('.paper-pop__list') as HTMLElement;
    const doc = document.scrollingElement as HTMLElement;
    const box = (el: HTMLElement) => ({ x: Math.round(el.getBoundingClientRect().x), y: Math.round(el.getBoundingClientRect().y) });
    const before = {
      sceneTop: Math.round(r('#scene').top),
      sceneBottom: Math.round(r('#scene').bottom),
      footTop: Math.round(r('#bottom').top),
      sheetTop: Math.round(r('.paper-pop__sheet').top),
      sheetBottom: Math.round(r('.paper-pop__sheet').bottom),
      paperLoaded: img.complete && img.naturalWidth > 0,
      paperHeight: Math.round(img.getBoundingClientRect().height),
      paperBottom: Math.round(img.getBoundingClientRect().bottom),
      paperRight: Math.round(img.getBoundingClientRect().right),
      sideLeft: Math.round(side.getBoundingClientRect().left),
      sideOverflowsX: side.scrollWidth > side.clientWidth + 1,
      closeBox: box(close),
      closeBottom: Math.round(close.getBoundingClientRect().bottom),
      closeOnTop: onTop(close),
      listOverflows: list.scrollHeight > list.clientHeight + 1,
      listScrolls: ['auto', 'scroll'].includes(getComputedStyle(list).overflowY),
      nextOnTop: onTop(document.querySelector('#bottom [data-act="next"]') as HTMLElement),
      pageScrolls: doc.scrollHeight > window.innerHeight + 1 || doc.scrollWidth > window.innerWidth + 1,
    };
    list.scrollTop = list.scrollHeight;
    await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));
    const last = list.lastElementChild as HTMLElement;
    return {
      ...before,
      lastSpare: Math.round(list.getBoundingClientRect().bottom - last.getBoundingClientRect().bottom),
      closeBoxAfter: box(close),
      closeOnTopAfter: onTop(close),
    };
  });
}

/** Next's box in page pixels, with the pointer away (`.btn:hover` lifts a button 1 px). */
async function nextBox(page: Page): Promise<{ x: number; y: number; w: number; h: number }> {
  await page.mouse.move(1, 1);
  const next = page.locator('#bottom [data-act="next"]');
  await expect.poll(() => next.evaluate((el) => getComputedStyle(el).transform)).toMatch(/^(none|matrix\(1, 0, 0, 1, 0, 0\))$/);
  const b = await next.boundingBox();
  if (!b) throw new Error('Next is not on screen');
  return { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height) };
}

async function jump(page: Page, to: string): Promise<void> {
  await page.keyboard.press('Backquote');
  await page.click(`[data-act="jump"][data-to="${to}"]`);
  await page.keyboard.press('Backquote');
}

const fits: Record<string, PopFit> = {};

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
  console.log(`[paper-pop] ${JSON.stringify(fits)}`);
});

for (const size of SIZES) {
  test.describe(`${size.width} x ${size.height}`, () => {
    test.use({ viewport: size });

    for (const lang of ['en', 'zh'] as const) {
      test(`every Companion's paper popup fits inside the scene with Close in view, Next unmoved (${lang})`, async ({ page }) => {
        await page.goto('/');
        if (lang === 'zh') await page.click('[data-act="lang"][data-lang="zh"]');
        await jump(page, 'comp');
        for (const { mate, name, lost } of MATES) {
          const at = `${size.width} ${lang} ${mate}`;
          await page.click(`[data-act="mate"][data-id="${WORLD[`companion.${mate}`]}"]`);
          await page.click('[data-act="ability"][data-ab="weak"]');
          await expect(page.locator('.cx-weak .cx-edge').first()).toBeVisible();
          const next = await nextBox(page);
          await page.click('[data-act="paperOpen"]');
          await expect(page.locator('.paper-pop__paper')).toHaveJSProperty('complete', true);
          // Content per record: this Companion's own paper and name, one card per lost mark, each holding the weak spot placed under it.
          await expect(page.locator('.paper-pop__head h3')).toContainText(name);
          await expect(page.locator('.paper-pop__paper')).toHaveAttribute('src', `/papers/paper-${{ pingu: 'water', nova: 'nature', ember: 'hawker' }[mate]}.png`);
          await expect(page.locator('.paper-pop .pp-q')).toHaveCount(lost);
          await expect(page.locator('.paper-pop .pp-q .pp-spot')).toHaveCount(lost);
          await expect(page.locator('.paper-pop .pp-q__none')).toHaveCount(0);
          await expect(page.locator('.paper-pop .pp-apart')).toHaveCount(0);

          const f = await popFit(page);
          fits[at] = f;
          await page.screenshot({ path: `test-results/paper-pop-${size.width}-${lang}-${mate}.png`, animations: 'disabled' });
          expect(f.pageScrolls, `${at}: the page scrolls`).toBe(false);
          expect(f.sheetTop, `${at}: the sheet starts ${f.sheetTop} px, the scene ${f.sceneTop} px`).toBeGreaterThanOrEqual(f.sceneTop);
          expect(f.sheetBottom, `${at}: the sheet ends ${f.sheetBottom} px, the footer starts ${f.footTop} px`).toBeLessThanOrEqual(Math.min(f.sceneBottom, f.footTop));
          expect(f.paperLoaded, `${at}: the paper did not load`).toBe(true);
          // The paper takes the sheet's height: 705 of the scene's 757 design px (0.93), well past the panel's 534.
          expect(f.paperHeight / (f.sceneBottom - f.sceneTop), `${at}: the paper is ${f.paperHeight} px tall`).toBeGreaterThanOrEqual(0.9);
          expect(f.paperBottom, `${at}: the paper runs past the sheet`).toBeLessThanOrEqual(f.sheetBottom);
          expect(f.paperRight, `${at}: the paper runs under the extract`).toBeLessThanOrEqual(f.sideLeft);
          expect(f.sideOverflowsX, `${at}: the extract is cut off at the right`).toBe(false);
          expect(f.closeBottom, `${at}: Close ends ${f.closeBottom} px, the sheet ${f.sheetBottom} px`).toBeLessThanOrEqual(f.sheetBottom);
          expect(f.closeOnTop, `${at}: Close is covered`).toBe(true);
          if (f.listOverflows) expect(f.listScrolls, `${at}: the extract overflows and does not scroll`).toBe(true);
          expect(f.lastSpare, `${at}: the last card is cut ${f.lastSpare} px at the list's end`).toBeGreaterThanOrEqual(0);
          expect(f.closeBoxAfter, `${at}: Close moved when the list scrolled`).toEqual(f.closeBox);
          expect(f.closeOnTopAfter, `${at}: Close is covered after the list scrolled`).toBe(true);
          expect(f.nextOnTop, `${at}: the popup covers Next`).toBe(true);
          expect(await nextBox(page), `${at}: Next moved`).toEqual(next);

          await page.click('[data-act="paperClose"]');
          await expect(page.locator('.paper-pop')).toHaveCount(0);
        }
      });
    }
  });
}

test('the popup reads the paper only: opening and closing it makes no request', async ({ page }) => {
  await page.goto('/');
  await jump(page, 'comp');
  await page.click('[data-act="ability"][data-ab="weak"]');
  await expect(page.locator('.cx-weak .cx-edge').first()).toBeVisible();
  await expect(page.locator('.cx-weak__paper img')).toHaveJSProperty('complete', true);
  const calls: string[] = [];
  page.on('request', (r) => calls.push(`${r.method()} ${new URL(r.url()).pathname}`));
  await page.click('[data-act="paperOpen"]');
  await expect(page.locator('.paper-pop .pp-q')).toHaveCount(3);
  await page.keyboard.press('Escape');
  await expect(page.locator('.paper-pop')).toHaveCount(0);
  await expect(page.locator('.cx-weak__paper')).toBeVisible();
  // The paper's image is the panel's own (cached); anything else would be a read or a write.
  expect(calls.filter((c) => !c.endsWith('.png'))).toEqual([]);
});
