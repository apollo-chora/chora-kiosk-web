import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { expect, test, type Page } from '@playwright/test';

// K161 at the showroom's 1366 x 768 (K2), on the dev fixtures. W21 and W36 (both sizes): the Companion's intro sits in the
// closed drawer's place until an ability is picked, so it must show whole, above the footer, beside the
// profile card and under the ability buttons. W30: a prepared stamp's note is placed in the window
// (fixed), so a drawer's scroll box must not clip it: it shows whole, and a tap at its middle lands on it.

const ROOT = join(__dirname, '..');
const WORLD = (JSON.parse(readFileSync(join(ROOT, 'dev/fixtures/world/manifest.json'), 'utf8')) as { body: { world: Record<string, string> } }).body.world;

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

async function toCompanions(page: Page): Promise<void> {
  await page.goto('/');
  await page.keyboard.press('Backquote');
  await page.click('[data-act="jump"][data-to="comp"]');
  await page.keyboard.press('Backquote');
  await page.click(`[data-act="mate"][data-id="${WORLD['companion.pingu']}"]`);
}

/** The box's rectangle, and whether a tap at its middle lands on it (nothing covers it). */
async function seen(page: Page, sel: string): Promise<{ top: number; bottom: number; left: number; right: number; hit: boolean }> {
  return page.locator(sel).evaluate((el) => {
    const r = el.getBoundingClientRect();
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return { top: Math.round(r.top), bottom: Math.round(r.bottom), left: Math.round(r.left), right: Math.round(r.right), hit: !!hit && (hit === el || el.contains(hit)) };
  });
}

for (const size of [{ width: 1366, height: 768 }, { width: 1600, height: 900 }] as const)
for (const lang of ['en', 'zh'] as const) {
  test(`W21, W36: the Companion's intro and the hint both show whole until an ability is picked, beside the profile and above the footer (${size.width}, ${lang})`, async ({ page }) => {
    await page.setViewportSize(size);
    await toCompanions(page);
    if (lang === 'zh') await page.click('[data-act="lang"][data-lang="zh"]');
    await expect(page.locator('.comp-intro')).toBeVisible();
    const intro = await seen(page, '.comp-intro');
    const footer = await page.locator('#bottom').boundingBox();
    const abilities = await page.locator('.comp-abilities').boundingBox();
    const left = await page.locator('.comp-left').boundingBox();
    console.log(`[prepared-info] W21 ${lang} intro ${JSON.stringify(intro)} footer ${footer?.y} abilities ${abilities && abilities.y + abilities.height} left ${left && left.x + left.width}`);
    expect(intro.hit, 'nothing covers the intro').toBe(true);
    expect(intro.bottom, 'the intro ends above the footer').toBeLessThanOrEqual(Math.floor(footer?.y ?? 0) - 8);
    expect(intro.top, 'the intro starts under the ability buttons').toBeGreaterThanOrEqual(Math.ceil((abilities?.y ?? 0) + (abilities?.height ?? 0)));
    expect(intro.left, 'the intro clears the profile card').toBeGreaterThanOrEqual(Math.ceil((left?.x ?? 0) + (left?.width ?? 0)));
    // W36: the hint "Pick one of the four above" docks on the HUD's row (mockup.css); the intro sat on it.
    const hint = await seen(page, '.comp-pick .pill-in');
    console.log(`[prepared-info] W36 ${size.width} ${lang} hint ${JSON.stringify(hint)}`);
    // The hint takes no taps (pointer-events: none), so a tap test cannot see it: its box must meet no other box.
    const hud = await seen(page, '.comp-hud');
    const meets = (a: typeof hint, b: typeof hint) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
    expect(meets(hint, intro), `the intro ${JSON.stringify(intro)} meets the hint ${JSON.stringify(hint)}`).toBe(false);
    expect(meets(hint, hud), `the HUD ${JSON.stringify(hud)} meets the hint`).toBe(false);
    expect(intro.top, `the intro starts ${intro.top} px, the hint ends ${hint.bottom} px`).toBeGreaterThanOrEqual(hint.bottom + 4);
    expect(hint.top, 'the hint starts under the ability buttons').toBeGreaterThanOrEqual(Math.ceil((abilities?.y ?? 0) + (abilities?.height ?? 0)));
    await page.click('[data-act="ability"][data-ab="quiz"]');
    await expect(page.locator('.comp-intro')).toHaveCount(0);
  });
}

test("W30: a prepared stamp's note opens whole inside a drawer, on top, and a tap elsewhere closes it", async ({ page }) => {
  await toCompanions(page);
  await page.click('[data-act="ability"][data-ab="quiz"]');
  const info = page.locator('#panel kiosk-live-row .stamp kiosk-prepared-info button');
  await expect(info).toBeVisible();
  await info.click();
  await expect(page.locator('.prep-note')).toBeVisible();
  const note = await seen(page, '.prep-note');
  const button = await info.boundingBox();
  console.log(`[prepared-info] W30 note ${JSON.stringify(note)} button ${JSON.stringify(button)}`);
  expect(note.hit, 'nothing covers or clips the note').toBe(true);
  expect(note.left).toBeGreaterThanOrEqual(16);
  expect(note.right).toBeLessThanOrEqual(1366 - 16);
  expect(note.bottom).toBeLessThanOrEqual(768);
  const b = { top: Math.round(button?.y ?? 0), bottom: Math.round((button?.y ?? 0) + (button?.height ?? 0)) };
  expect(note.top >= b.bottom || note.bottom <= b.top, 'the note opens under its mark or above it, never over it').toBe(true);
  const gap = note.top >= b.bottom ? note.top - b.bottom : b.top - note.bottom;
  expect(gap, 'the note sits by its mark (the scaled stage is its containing block)').toBeLessThanOrEqual(12);
  expect(note.left <= Math.round(button?.x ?? 0) && note.right >= Math.round((button?.x ?? 0) + (button?.width ?? 0)), 'the note spans its mark').toBe(true);
  expect(note.top).toBeGreaterThanOrEqual(0);
  await page.mouse.click(40, 400);
  await expect(page.locator('.prep-note')).toHaveCount(0);
});
