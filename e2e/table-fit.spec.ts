import { expect, test, type Page } from '@playwright/test';

// K138 pass 7, W45: the comparison table grew to eleven rows (K168's matching row, K172's payments row),
// and on a 768px screen the About sheet's last row and its Close button sat below the screen, and the
// Engine Room's last row under the footer, where no scroll reached them. Every row and Close must be
// reachable on screen: measured here with the page's own boxes and taps, never Playwright's clicks,
// which scroll an element into view first. At 1366 x 768 (K2) and 1600 x 900, in both languages.

interface Reach {
  /** The box that scrolls the table, if any: it scrolls inside the screen, never past it. */
  readonly scrollerBottom: number | null;
  /** The last row's box once its scroller (if any) is scrolled to the end. */
  readonly lastTop: number;
  readonly lastBottom: number;
  /** A tap at the last row's middle lands on it. */
  readonly lastOnTop: boolean;
  /** The bottom limit: the screen's for the sheet, the footer's top for the page. */
  readonly limit: number;
}

async function reach(page: Page, table: string, limitOf: 'screen' | 'footer'): Promise<Reach> {
  return page.evaluate(
    ({ table, limitOf }) => {
      const t = document.querySelector(table) as HTMLElement;
      let scroller: HTMLElement | null = t.parentElement;
      while (scroller && !/(auto|scroll)/.test(getComputedStyle(scroller).overflowY)) scroller = scroller.parentElement;
      if (scroller && scroller.scrollHeight > scroller.clientHeight + 1) scroller.scrollTop = scroller.scrollHeight;
      else scroller = null;
      const rows = t.querySelectorAll('tbody tr');
      const last = rows[rows.length - 1] as HTMLElement;
      const r = last.getBoundingClientRect();
      const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      const limit = limitOf === 'screen' ? window.innerHeight : (document.querySelector('#bottom') as HTMLElement).getBoundingClientRect().top;
      return {
        scrollerBottom: scroller ? Math.round(scroller.getBoundingClientRect().bottom) : null,
        lastTop: Math.round(r.top),
        lastBottom: Math.round(r.bottom),
        lastOnTop: !!hit && last.contains(hit),
        limit: Math.round(limit),
      };
    },
    { table, limitOf },
  );
}

const fits: Record<string, unknown> = {};

test.beforeEach(async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  (page as unknown as { kioskErrors: string[] }).kioskErrors = errors;
});

test.afterEach(async ({ page }) => {
  expect((page as unknown as { kioskErrors: string[] }).kioskErrors).toEqual([]);
});

test.afterAll(() => {
  console.log(`[table-fit] ${JSON.stringify(fits)}`);
});

for (const size of [{ width: 1366, height: 768 }, { width: 1600, height: 900 }] as const)
  for (const lang of ['en', 'zh'] as const) {
    test(`W45: About the app shows Close on screen and reaches its last row (${size.width}, ${lang})`, async ({ page }) => {
      await page.setViewportSize(size);
      await page.goto('/');
      if (lang === 'zh') await page.click('[data-act="lang"][data-lang="zh"]');
      await page.click('[data-act="disclosure"]');
      await expect(page.locator('#ov-disclosure')).toHaveClass(/show/);
      await page.waitForTimeout(450);
      const close = await page.evaluate(() => {
        const b = document.querySelector('#ov-disclosure [data-act="closeOverlay"]') as HTMLElement;
        const r = b.getBoundingClientRect();
        const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
        return { top: Math.round(r.top), bottom: Math.round(r.bottom), onTop: !!hit && b.contains(hit), screen: window.innerHeight };
      });
      const at = `${size.width} ${lang} about`;
      const last = await reach(page, '#ov-disclosure table.disclose', 'screen');
      fits[at] = { close, last };
      await page.screenshot({ path: `test-results/table-fit-about-${size.width}-${lang}.png` });
      expect(close.bottom, `${at}: Close ends ${close.bottom} px on a ${close.screen} px screen`).toBeLessThanOrEqual(close.screen - 8);
      expect(close.onTop, `${at}: Close is covered`).toBe(true);
      expect(last.lastBottom, `${at}: the last row ends ${last.lastBottom} px`).toBeLessThanOrEqual(last.limit);
      if (last.scrollerBottom !== null) expect(last.scrollerBottom).toBeLessThanOrEqual(close.top);
      expect(last.lastOnTop, `${at}: the last row is covered`).toBe(true);
    });

    test(`W45: How this demo runs reaches its last row above the footer (${size.width}, ${lang})`, async ({ page }) => {
      await page.setViewportSize(size);
      await page.goto('/');
      if (lang === 'zh') await page.click('[data-act="lang"][data-lang="zh"]');
      await page.keyboard.press('Backquote');
      await page.click('[data-act="jump"][data-to="local"]');
      await page.keyboard.press('Backquote');
      await expect(page.locator('#scene table.disclose tbody tr')).toHaveCount(11);
      await page.waitForTimeout(450);
      const at = `${size.width} ${lang} local`;
      const last = await reach(page, '#scene table.disclose', 'footer');
      fits[at] = last;
      await page.screenshot({ path: `test-results/table-fit-local-${size.width}-${lang}.png` });
      expect(last.lastBottom, `${at}: the last row ends ${last.lastBottom} px, the footer starts ${last.limit} px`).toBeLessThanOrEqual(last.limit - 4);
      if (last.scrollerBottom !== null) expect(last.scrollerBottom).toBeLessThanOrEqual(last.limit - 4);
      expect(last.lastOnTop, `${at}: the last row is covered`).toBe(true);
    });
  }
