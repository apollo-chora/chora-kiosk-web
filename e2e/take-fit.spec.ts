import { expect, test, type Page } from '@playwright/test';

// K138 pass 6, W40 (21 Oct): during the take, Hawker culture's open question (the golden run's longest
// stem, teh tarik, with its picture beside it) pushed Back and Submit across the card's bottom edge at
// 1366 x 768 (buttons about 661..697, card bottom about 677). Measured here at 1366 x 768 (K2) and at the
// stage's own 1600 x 900, in both languages. The dev world serves no banks, test sets or takes, so this
// spec answers them (and the dashboard's streak and mana tiles), on the dev manifest's own bank records, in delivery's shapes (as
// src/app/exhibits/dashboard/dashboard-world.testing.ts).

import { TEH_TARIK, routeTake } from './world-routes';

interface TakeFit {
  readonly cardBottom: number;
  readonly navBottom: number;
  readonly backOnTop: boolean;
  readonly submitOnTop: boolean;
  /** The answer box's height, in px: it must still take a few lines. */
  readonly textHeight: number;
  readonly stemWhole: boolean;
}

async function takeFit(page: Page): Promise<TakeFit> {
  return page.evaluate(() => {
    const card = document.querySelector('.dbx-card') as HTMLElement;
    const onTop = (el: HTMLElement): boolean => {
      const r = el.getBoundingClientRect();
      const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return !!hit && el.contains(hit);
    };
    const back = card.querySelector('[data-act="dbxPrev"]') as HTMLElement;
    const submit = card.querySelector('[data-act="dbxSubmit"]') as HTMLElement;
    const stem = card.querySelector('.dbx-stem') as HTMLElement;
    const main = card.querySelector('.dbx-main') as HTMLElement;
    return {
      cardBottom: Math.round(card.getBoundingClientRect().bottom),
      navBottom: Math.round(Math.max(back.getBoundingClientRect().bottom, submit.getBoundingClientRect().bottom)),
      backOnTop: onTop(back),
      submitOnTop: onTop(submit),
      textHeight: Math.round((card.querySelector('#dbxtext') as HTMLElement).getBoundingClientRect().height),
      stemWhole: stem.getBoundingClientRect().bottom <= main.getBoundingClientRect().bottom && stem.scrollHeight <= stem.clientHeight + 1,
    };
  });
}

const fits: Record<string, TakeFit> = {};

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
  console.log(`[take-fit] ${JSON.stringify(fits)}`);
});

for (const size of [{ width: 1366, height: 768 }, { width: 1600, height: 900 }] as const)
  for (const lang of ['en', 'zh'] as const) {
    test(`W40: Hawker culture's open question keeps Back and Submit inside the card (${size.width}, ${lang})`, async ({ page }) => {
      await page.setViewportSize(size);
      await routeTake(page);
      await page.goto('/');
      if (lang === 'zh') await page.click('[data-act="lang"][data-lang="zh"]');
      await page.keyboard.press('Backquote');
      await page.click('[data-act="jump"][data-to="dash"]');
      await page.keyboard.press('Backquote');
      // W43 (K172): the mana tile's one plain line stays inside the 64px strip, clear of the dose button.
      await expect(page.locator('.db-today .db-mana-note')).toBeVisible();
      const note = await page.evaluate(() => {
        const n = (document.querySelector('.db-today .db-mana-note') as HTMLElement).getBoundingClientRect();
        const strip = (document.querySelector('.db-today') as HTMLElement).getBoundingClientRect();
        const dose = (document.querySelector('.db-today [data-act="dbDose"]') as HTMLElement).getBoundingClientRect();
        return { top: Math.round(n.top), bottom: Math.round(n.bottom), right: Math.round(n.right), stripTop: Math.round(strip.top), stripBottom: Math.round(strip.bottom), doseLeft: Math.round(dose.left), lines: Math.round(n.height / 15) };
      });
      fits[`${size.width} ${lang} manaNote`] = note as unknown as TakeFit;
      await page.locator('.db-today').screenshot({ path: `test-results/take-fit-mana-note-${size.width}-${lang}.png` });
      expect(note.bottom, `the mana note ends ${note.bottom} px, the strip ${note.stripBottom} px`).toBeLessThanOrEqual(note.stripBottom - 2);
      expect(note.top).toBeGreaterThanOrEqual(note.stripTop);
      expect(note.right, `the mana note ends ${note.right} px, the dose button starts ${note.doseLeft} px`).toBeLessThanOrEqual(note.doseLeft - 8);
      await page.click('[data-act="dbBank"][data-id="bank.hawker"]');
      await page.click('[data-act="dbxTake"]');
      await page.click('[data-act="dbxNext"]');
      await page.click('[data-act="dbxNext"]');
      await expect(page.locator('.dbx-stem')).toHaveText(TEH_TARIK);
      await expect(page.locator('.dbx-side img')).toHaveJSProperty('complete', true);
      const at = `${size.width} ${lang}`;
      fits[at] = await takeFit(page);
      await page.screenshot({ path: `test-results/take-fit-hawker-q3-${size.width}-${lang}.png`, animations: 'disabled' });
      expect(fits[at].navBottom, `${at}: Back and Submit end ${fits[at].navBottom} px, the card ends ${fits[at].cardBottom} px`).toBeLessThanOrEqual(fits[at].cardBottom - 8);
      expect(fits[at].backOnTop, `${at}: Back is covered`).toBe(true);
      expect(fits[at].submitOnTop, `${at}: Submit is covered`).toBe(true);
      expect(fits[at].stemWhole, `${at}: the question is cut`).toBe(true);
      // Three lines of the answer box's 17px/1.45 type still show at the showroom's scale.
      expect(fits[at].textHeight, `${at}: the answer box is ${fits[at].textHeight} px tall`).toBeGreaterThanOrEqual(Math.round(3 * 17 * 1.45 * (size.width / 1600)));
    });
  }
