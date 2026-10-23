import { expect, test, type Page } from '@playwright/test';

// W91 (K207; round3-design.html section 6): the hall gains a sixth tile, "Your own goal", after the Engine Room's
// card, and it opens a still, five-step storyboard of the full product. On the showroom's 1366 x 768 screen (K2)
// and at 1600 x 900, in English and Chinese: the hall's six cards sit in one row inside the scene, each card's
// art, title, text and foot inside the card; the storyboard's head, line and five steps sit inside the scene, each
// step's label, picture and caption inside its step, above the footer; it sends nothing (no POST: no write, no
// payment; the unit spec proves it makes no call at all); Back returns to the
// hall; nothing showed an error.

interface Box {
  readonly top: number;
  readonly bottom: number;
  readonly left: number;
  readonly right: number;
}

interface Panel {
  readonly box: Box;
  /** Each child's box, by its class, and its scroll overflow. */
  readonly parts: readonly (Box & { readonly cls: string })[];
  readonly overflowY: number;
}

/** Every element matching `panels`, with its direct children's boxes (in viewport px). */
async function panels(page: Page, selector: string): Promise<{ scene: Box; bottom: Box; panels: Panel[] }> {
  return page.evaluate((sel) => {
    const box = (e: Element) => {
      const r = e.getBoundingClientRect();
      return { top: r.top, bottom: r.bottom, left: r.left, right: r.right };
    };
    const scene = document.querySelector('#scene') as HTMLElement;
    const sr = scene.getBoundingClientRect();
    const scale = sr.width / 1600;
    return {
      scene: { top: sr.top, bottom: sr.top + 757 * scale, left: sr.left, right: sr.left + 1600 * scale },
      bottom: box(document.querySelector('#bottom') as Element),
      panels: [...document.querySelectorAll(sel)].map((p) => ({
        box: box(p),
        parts: [...p.children].map((c) => ({ ...box(c), cls: (c as HTMLElement).className || c.tagName })),
        overflowY: (p as HTMLElement).scrollHeight - (p as HTMLElement).clientHeight,
      })),
    };
  }, selector);
}

const inside = (inner: Box, outer: Box, slack = 0.5) =>
  inner.top >= outer.top - slack && inner.bottom <= outer.bottom + slack && inner.left >= outer.left - slack && inner.right <= outer.right + slack;

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

for (const size of [{ width: 1366, height: 768 }, { width: 1600, height: 900 }] as const) {
  for (const lang of ['en', 'zh'] as const) {
    test(`W91: the hall's six cards and the storyboard's five steps fit (${size.width}, ${lang})`, async ({ page }) => {
      const at = `${size.width} ${lang}`;
      await page.setViewportSize(size);
      await page.goto('/');
      if (lang === 'zh') await page.click('[data-act="lang"][data-lang="zh"]');
      await page.keyboard.press('Backquote');
      await page.click('[data-act="jump"][data-to="hall"]');
      await page.keyboard.press('Backquote');
      await expect(page.locator('#scene .hall')).toBeVisible();
      await expect(page.locator('#scene .hall .cards > .ex-card')).toHaveCount(6);
      await page.evaluate(() => document.fonts.ready); // measure the type the visitor sees, not a fallback face

      await page.mouse.move(0, 0); // no card lifted by its hover (a .28 s transition) while it is measured
      await expect
        .poll(() => page.evaluate(() => [...document.querySelectorAll('#scene .hall .cards > .ex-card')].every((c) => getComputedStyle(c).transform === 'none')))
        .toBe(true);
      const hall = await panels(page, '#scene .hall .cards > .ex-card');
      await page.screenshot({ path: `test-results/own-hall-${size.width}-${lang}.png`, animations: 'disabled' });
      const tops = hall.panels.map((p) => p.box.top);
      expect(Math.max(...tops) - Math.min(...tops), `${at}: the six cards share one row (${tops})`).toBeLessThanOrEqual(1);
      for (const [i, p] of hall.panels.entries()) {
        expect(inside(p.box, hall.scene), `${at}: card ${i + 1} inside the scene`).toBe(true);
        expect(p.box.bottom, `${at}: card ${i + 1} above the footer`).toBeLessThanOrEqual(hall.bottom.top + 0.5);
        expect(p.overflowY, `${at}: card ${i + 1} overflows by ${p.overflowY}px`).toBeLessThanOrEqual(0);
        for (const part of p.parts) expect(inside(part, p.box), `${at}: card ${i + 1}'s ${part.cls} inside it`).toBe(true);
      }

      const requests: string[] = [];
      page.on('request', (r) => {
        if (r.method() !== 'GET') requests.push(`${r.method()} ${r.url()}`);
      });
      await page.click('#scene [data-act="openOwn"]');
      await expect(page.locator('#scene .own .own-steps > .own-step')).toHaveCount(5);
      await page.evaluate(() => document.fonts.ready);
      const own = await panels(page, '#scene .own .own-steps > .own-step');
      await page.screenshot({ path: `test-results/own-steps-${size.width}-${lang}.png`, animations: 'disabled' });
      const head = await panels(page, '#scene .own');
      expect(inside(head.panels[0].box, head.scene), `${at}: the storyboard inside the scene`).toBe(true);
      for (const part of head.panels[0].parts) expect(inside(part, head.scene), `${at}: the storyboard's ${part.cls} inside the scene`).toBe(true);
      for (const [i, p] of own.panels.entries()) {
        expect(p.box.bottom, `${at}: step ${i + 1} above the footer`).toBeLessThanOrEqual(own.bottom.top + 0.5);
        expect(p.overflowY, `${at}: step ${i + 1} overflows by ${p.overflowY}px`).toBeLessThanOrEqual(0);
        for (const part of p.parts) expect(inside(part, p.box), `${at}: step ${i + 1}'s ${part.cls} inside it`).toBe(true);
      }
      expect(requests, `${at}: the storyboard sends nothing`).toEqual([]);

      await page.click('#bottom [data-act="back"]');
      await expect(page.locator('#scene .hall')).toBeVisible();
    });
  }
}
