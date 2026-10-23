import { expect, test, type Page } from '@playwright/test';

// K208 (W92): "How this demo runs" opens with the architecture diagram (approved version 2), above the
// table. Version 1's last box let its text flow out ("the text flowed out of the box"), so every line of
// every box must end inside its box, with room to spare, in both languages at the showroom's 1366 x 768 (K2)
// and at 1600 x 900; the legend's three labels must not run into each other; the diagram spans the stage.

interface Line {
  readonly box: string;
  readonly text: string;
  readonly spare: number;
}

const fits: Record<string, unknown> = {};
test.afterAll(() => {
  console.log(`[arch-fit] ${JSON.stringify(fits)}`);
});

/** Each box's lines with the room each leaves to its box's edges (the least of left, right, top, bottom). */
async function lines(page: Page): Promise<{ lines: Line[]; legend: { left: number; right: number }[]; svg: { left: number; right: number }; width: number }> {
  return page.evaluate(() => {
    const out: { box: string; text: string; spare: number }[] = [];
    for (const g of document.querySelectorAll('kiosk-arch-diagram g.arch-box')) {
      const r = (g.querySelector('rect') as SVGRectElement).getBoundingClientRect();
      for (const t of g.querySelectorAll('text')) {
        const b = t.getBoundingClientRect();
        out.push({ box: g.getAttribute('data-box') ?? '', text: t.textContent ?? '', spare: Math.min(b.left - r.left, r.right - b.right, b.top - r.top, r.bottom - b.bottom) });
      }
    }
    const legend = [...document.querySelectorAll('kiosk-arch-diagram text.lg')].map((t) => {
      const b = t.getBoundingClientRect();
      return { left: b.left, right: b.right };
    });
    const s = (document.querySelector('kiosk-arch-diagram svg') as SVGSVGElement).getBoundingClientRect();
    return { lines: out, legend, svg: { left: s.left, right: s.right }, width: window.innerWidth };
  });
}

for (const size of [{ width: 1366, height: 768 }, { width: 1600, height: 900 }] as const) {
  for (const lang of ['en', 'zh'] as const) {
    test(`K208: every line of the diagram ends inside its box (${size.width}, ${lang})`, async ({ page }) => {
      await page.setViewportSize(size);
      await page.goto('/');
      if (lang === 'zh') await page.click('[data-act="lang"][data-lang="zh"]');
      await page.keyboard.press('Backquote');
      await page.click('[data-act="jump"][data-to="local"]');
      await page.keyboard.press('Backquote');
      await expect(page.locator('kiosk-arch-diagram g.arch-box')).toHaveCount(22);
      // The presenter panel slides shut and the scene fades in (as table-fit waits).
      await page.waitForTimeout(450);
      await page.evaluate(() => document.fonts.ready);
      const at = `${size.width} ${lang}`;
      const f = await lines(page);
      fits[at] = { tight: [...f.lines].sort((a, b) => a.spare - b.spare).slice(0, 4), svg: f.svg };
      await page.screenshot({ path: `test-results/arch-fit-${size.width}-${lang}.png` });
      expect(f.lines.length, `${at}: lines measured`).toBeGreaterThanOrEqual(65);
      // Four px of room at 1366 (the boxes' own padding is 16 lens px, about 12 px there).
      const room = 4 * (size.width / 1366);
      for (const l of f.lines) expect(l.spare, `${at}: "${l.text}" in ${l.box} leaves ${l.spare.toFixed(1)} px`).toBeGreaterThanOrEqual(room);
      for (let i = 1; i < f.legend.length; i++) expect(f.legend[i].left, `${at}: legend label ${i + 1} runs into label ${i}`).toBeGreaterThan(f.legend[i - 1].right + 8);
      expect(f.svg.left, `${at}: the diagram starts inside the window`).toBeGreaterThanOrEqual(0);
      expect(f.svg.right, `${at}: the diagram ends inside the window`).toBeLessThanOrEqual(f.width);
      expect(f.svg.right - f.svg.left, `${at}: the diagram spans the stage`).toBeGreaterThan(f.width * 0.85);
    });
  }
}
