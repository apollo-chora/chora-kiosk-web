import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { expect, test, type Page } from '@playwright/test';

// Round 3 on the atlas map, measured on the production build at the showroom's 1366 x 768 (K2) and at
// 1600 x 900, in both languages, on the golden world's water map (dev fixtures):
// - K202 (W86): every link drawn between two linked ideas shows at least 40 px of line at 1366 (the stage
//   scales with the window, so at 1600 the floor is 40 x 1600/1366), and the picked idea and its ring (its
//   children) lie inside the frame: the lens's box, cut at the drawer's left edge while the drawer is open.
//   The rest of the map may run off the edges.
// - K204 (W88), K214: each lens tab shows its caption under the tabs, on two lines, its lead bold, inside the
//   window. The campaign line moves up beside the tabs, where the old one-line caption sat (above the map's
//   frame), so the bar keeps the footprint it had over the map.

const ROOT = join(__dirname, '..');
const WATER = (JSON.parse(readFileSync(join(ROOT, 'dev/fixtures/world/map-water-graph.json'), 'utf8')) as { body: { concepts: { conceptId: string; title: string }[] } }).body.concepts;
// MAP_LENS_CHROME (src/app/shared/lens-frames.ts): the caption card's corner of the map box, in lens px (stage px at the atlas's scale of 1).
const CHROME = { w: 550, h: 70 };
const LEADS = { en: ['Explore', 'Growth', 'Mastery'], zh: ['探索', '成长', '掌握'] } as const;
const MIN_LINK_AT_1366 = 40;

interface Box {
  readonly top: number;
  readonly bottom: number;
  readonly left: number;
  readonly right: number;
}

interface MapFit {
  readonly frame: Box;
  /** The lens's own box (the frame before the drawer cuts it) and the caption card. */
  readonly box: Box;
  readonly cap: Box;
  readonly links: readonly number[];
  readonly ring: readonly (Box & { readonly id: string })[];
}

const fits: Record<string, unknown> = {};
test.afterAll(() => {
  console.log(`[map-fit] ${JSON.stringify(fits)}`);
});

async function jump(page: Page, to: string): Promise<void> {
  await page.keyboard.press('Backquote');
  await page.click(`[data-act="jump"][data-to="${to}"]`);
  await page.keyboard.press('Backquote');
}

/** Waits until no idea moves between two frames (the re-focus glide and the drawer's slide are over). */
async function settled(page: Page): Promise<void> {
  const shot = () =>
    page.evaluate(() =>
      [...document.querySelectorAll('#maplens g.lens-node path.lens-hex')].map((h) => {
        const r = h.getBoundingClientRect();
        return `${r.x.toFixed(1)},${r.y.toFixed(1)}`;
      }).join(' '),
    );
  let last = '';
  await expect
    .poll(async () => {
      const now = await shot();
      const same = now === last && now !== '';
      last = now;
      return same;
    }, { intervals: [150, 150, 150, 300, 300, 600] })
    .toBe(true);
}

async function mapFit(page: Page): Promise<MapFit> {
  return page.evaluate(() => {
    const box = (r: DOMRect) => ({ top: r.top, bottom: r.bottom, left: r.left, right: r.right });
    const svg = document.querySelector<SVGSVGElement>('#maplens svg.concept-lens__scene');
    if (!svg) throw new Error('no lens in #maplens');
    const f = svg.getBoundingClientRect();
    const panel = document.querySelector('#panel.open');
    const frame = { ...box(f), right: panel ? Math.min(f.right, panel.getBoundingClientRect().left) : f.right };
    const capEl = document.querySelector('.lens-bar .lens-cap');
    if (!capEl) throw new Error('no lens caption');
    const cap = box(capEl.getBoundingClientRect());
    const k = svg.getScreenCTM()?.a ?? NaN;
    const links = [...svg.querySelectorAll<SVGPathElement>('path.lens-edge')].map((p) => p.getTotalLength() * k);
    const ring = [...svg.querySelectorAll('g.lens-node--focus, g.lens-node--ring')].map((n) => {
      const hex = n.querySelector('path.lens-hex');
      if (!hex) throw new Error('an idea without its hex');
      return { id: (n.getAttribute('data-testid') ?? '').replace('concept-lens-node-', ''), ...box(hex.getBoundingClientRect()) };
    });
    return { frame, box: box(f), cap, links, ring };
  });
}

function checkMap(at: string, f: MapFit, width: number): void {
  const floor = MIN_LINK_AT_1366 * (width / 1366);
  expect(f.links.length, `${at}: links drawn`).toBeGreaterThanOrEqual(8);
  for (const l of f.links) expect(l, `${at}: a link of ${l.toFixed(1)} px (floor ${floor.toFixed(1)})`).toBeGreaterThanOrEqual(floor);
  expect(f.ring.length, `${at}: the picked idea and its ring`).toBeGreaterThanOrEqual(1);
  for (const n of f.ring) {
    const where = `${at}: ${n.id} (${n.left.toFixed(0)}..${n.right.toFixed(0)}, ${n.top.toFixed(0)}..${n.bottom.toFixed(0)}) in the frame (${f.frame.left.toFixed(0)}..${f.frame.right.toFixed(0)}, ${f.frame.top.toFixed(0)}..${f.frame.bottom.toFixed(0)})`;
    expect(n.left, where).toBeGreaterThanOrEqual(f.frame.left - 0.5);
    expect(n.right, where).toBeLessThanOrEqual(f.frame.right + 0.5);
    expect(n.top, where).toBeGreaterThanOrEqual(f.frame.top - 0.5);
    expect(n.bottom, where).toBeLessThanOrEqual(f.frame.bottom + 0.5);
    // K204: and clear of the caption card over the frame's top-left corner.
    const under = n.left < f.cap.right - 0.5 && n.right > f.cap.left + 0.5 && n.top < f.cap.bottom - 0.5 && n.bottom > f.cap.top + 0.5;
    expect(under, `${at}: ${n.id} lies under the caption card`).toBe(false);
  }
  // The card itself stays inside the corner the lens keeps clear (MAP_LENS_CHROME, at the stage's scale).
  const k = width / 1600;
  expect(f.cap.right, `${at}: the caption card ends inside its corner`).toBeLessThanOrEqual(f.box.left + CHROME.w * k);
  expect(f.cap.bottom, `${at}: the caption card ends inside its corner`).toBeLessThanOrEqual(f.box.top + CHROME.h * k);
}

for (const size of [{ width: 1366, height: 768 }, { width: 1600, height: 900 }] as const) {
  for (const lang of ['en', 'zh'] as const) {
    test(`K202, K204: the water map's links, its ring in the frame, and the lens captions (${size.width}, ${lang})`, async ({ page }) => {
      await page.setViewportSize(size);
      await page.goto('/');
      if (lang === 'zh') await page.click('[data-act="lang"][data-lang="zh"]');
      await jump(page, 'maps');
      await page.click('[data-act="region"][data-id="goal.water"]');
      await expect(page.locator('#maplens g.lens-node--focus')).toHaveCount(1);
      await settled(page);
      const at = `${size.width} ${lang}`;

      // K204: each tab, on click, its caption under the tabs: two lines, the lead bold, clear of the HUD.
      for (const [i, paint] of (['growth', 'mastery', 'explore'] as const).entries()) {
        await page.click(`.lens-pill[data-paint="${paint}"]`);
        await settled(page);
        const cap = await page.evaluate(() => {
          const r = (s: string) => {
            const e = document.querySelector(s);
            if (!e) throw new Error(`no ${s}`);
            const b = e.getBoundingClientRect();
            return { top: b.top, bottom: b.bottom, left: b.left, right: b.right };
          };
          const p = document.querySelector('.lens-cap') as HTMLElement;
          const cs = getComputedStyle(p);
          const inner = p.getBoundingClientRect().height - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom) - parseFloat(cs.borderTopWidth) - parseFloat(cs.borderBottomWidth);
          return {
            pills: r('.lens-pills'),
            cap: r('.lens-cap'),
            hud: r('.camp-hud'),
            lines: inner / parseFloat(cs.lineHeight),
            lead: document.querySelector('.lens-cap b')?.textContent ?? '',
            leadWeight: getComputedStyle(document.querySelector('.lens-cap b') as Element).fontWeight,
            width: window.innerWidth,
          };
        });
        fits[`${at} ${paint}`] = cap;
        const lead = LEADS[lang][[ 'explore', 'growth', 'mastery' ].indexOf(paint)];
        expect(cap.lead, `${at} ${paint}: the bold lead`).toBe(lead);
        expect(Number(cap.leadWeight), `${at} ${paint}: the lead is bold`).toBeGreaterThanOrEqual(700);
        expect(cap.cap.top, `${at} ${paint}: the caption sits under the tabs`).toBeGreaterThanOrEqual(cap.pills.bottom);
        expect(cap.hud.left, `${at} ${paint}: the campaign line sits beside the tabs`).toBeGreaterThanOrEqual(cap.pills.right);
        expect(Math.abs((cap.hud.top + cap.hud.bottom) / 2 - (cap.pills.top + cap.pills.bottom) / 2), `${at} ${paint}: on the tabs' row`).toBeLessThanOrEqual(1);
        expect(cap.cap.top, `${at} ${paint}: the caption sits under the campaign line too`).toBeGreaterThanOrEqual(cap.hud.bottom);
        expect(Math.abs(cap.cap.left - cap.pills.left), `${at} ${paint}: aligned with the tabs`).toBeLessThanOrEqual(1);
        expect(Math.round(cap.lines), `${at} ${paint}: ${cap.lines.toFixed(2)} lines`).toBe(2);
        expect(cap.cap.right, `${at} ${paint}: inside the window`).toBeLessThanOrEqual(cap.width);
        expect(cap.hud.right, `${at} ${paint}: the campaign line inside the window`).toBeLessThanOrEqual(cap.width);
        if (i === 0) await page.screenshot({ path: `test-results/map-fit-${size.width}-${lang}-growth.png`, animations: 'disabled' });
      }

      // K202: the map with nothing picked (the root and its ring), then each idea picked in turn, its drawer open.
      const shut = await mapFit(page);
      fits[`${at} shut`] = shut;
      checkMap(`${at} shut`, shut, size.width);
      await page.screenshot({ path: `test-results/map-fit-${size.width}-${lang}-shut.png`, animations: 'disabled' });
      for (const c of WATER) {
        await page.locator(`#maplens [data-testid="concept-lens-node-${c.conceptId}"]`).dispatchEvent('click');
        await expect(page.locator('#panel')).toHaveClass(/open/);
        await expect(page.locator(`#maplens [data-testid="concept-lens-node-${c.conceptId}"]`)).toHaveClass(/lens-node--focus/);
        await settled(page);
        const open = await mapFit(page);
        fits[`${at} open ${c.title}`] = open;
        checkMap(`${at} open ${c.title}`, open, size.width);
        await page.screenshot({ path: `test-results/map-fit-${size.width}-${lang}-open-${WATER.indexOf(c)}.png`, animations: 'disabled' });
      }
    });
  }
}
