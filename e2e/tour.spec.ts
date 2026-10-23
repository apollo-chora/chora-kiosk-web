import { expect, test, type Page } from '@playwright/test';

import { REC, routeDose, routeGrading, routeGreeting, routeTake } from './world-routes';

// K173 (W47; web's beat table, ruled 21 Oct): from the hall, Next alone walks every beat to the Engine
// Room's last page and back to the hall, each beat showing its view and the marker naming it, and Next
// at the same spot on every beat and on the hall (the owner: "next should consistently stay at the
// right-most so that a visitor can click at the same spot to move forward"). Measured at 1366 x 768
// (K2) and at the stage's own 1600 x 900. Next calls no model: G3's approve and release are the only
// writes besides C4's dose read, and the strong sample is the one released (F52).

/** G3's release of the strong sample, answered as delivery does; the grading read after it says RELEASED. */
async function routeRelease(page: Page): Promise<{ approves: () => number }> {
  const s = REC.samples['sample.strong'];
  const sub = `**/api/v1/assessments/${s['assessment_id']}/submissions/${s['submission_id']}`;
  let approved = 0;
  await page.route(`${sub}/approve`, (route) => {
    approved++;
    return route.fulfill({ json: { submission_id: s['submission_id'], state: 'GRADED', review_status: 'APPROVED' } });
  });
  await page.route(`**/api/v1/assessments/${s['assessment_id']}/release-results`, (route) => route.fulfill({ json: { assessment_id: s['assessment_id'] } }));
  await page.route(`${sub}/grading`, (route) =>
    route.fulfill({ json: approved ? { ...REC.reads['sample.strong'], state: 'RELEASED', review_status: 'APPROVED' } : REC.reads['sample.strong'] }),
  );
  return { approves: () => approved };
}

interface Beat {
  readonly marker: string;
  /** What must show once the beat is on screen. */
  readonly shows: (page: Page) => Promise<void>;
}

const h2 = (page: Page, title: string) => expect(page.locator('#scene .ex-head h2')).toHaveText(title);
const ability = (page: Page, ab: string) => expect(page.locator(`[data-act="ability"][data-ab="${ab}"]`)).toHaveClass(/\bon\b/);

const BEATS: readonly Beat[] = [
  { marker: 'Wander the maps, 1 of 2', shows: async (p) => expect(p.locator('svg.atlas > g.region')).toHaveCount(3) },
  { marker: 'Wander the maps, 2 of 2', shows: async (p) => (await h2(p, 'Singapore’s water'), await expect(p.locator('#panel.open')).toHaveCount(0)) },
  { marker: 'Meet the Companions, 1 of 6', shows: async (p) => expect(p.locator('.comp-intro')).toBeVisible() },
  { marker: 'Meet the Companions, 2 of 6', shows: async (p) => ability(p, 'suggest') },
  { marker: 'Meet the Companions, 3 of 6', shows: async (p) => (await ability(p, 'quiz'), await expect(p.locator('.q-stem').first()).toBeVisible()) },
  { marker: 'Meet the Companions, 4 of 6', shows: async (p) => (await ability(p, 'dose'), await expect(p.locator('.cx-dose')).toBeVisible()) },
  { marker: 'Meet the Companions, 5 of 6', shows: async (p) => (await ability(p, 'weak'), await expect(p.locator('.cx-weak__paper')).toBeVisible(), await expect(p.locator('.paper-pop')).toHaveCount(0)) },
  // W52 (K182): how Pingu read its marked test, the popup inside the scene; the footer's Next stays put.
  { marker: 'Meet the Companions, 6 of 6', shows: async (p) => (await expect(p.locator('.paper-pop [data-act="paperClose"]')).toBeVisible(), await expect(p.locator('.paper-pop .pp-q')).toHaveCount(3)) },
  { marker: 'Take an assessment, 1 of 2', shows: async (p) => expect(p.locator('.db-assess .db-empty')).toBeVisible() },
  { marker: 'Take an assessment, 2 of 2', shows: async (p) => (await expect(p.locator('.db-bank[data-id="bank.water"]')).toHaveClass(/\bon\b/), await expect(p.locator('.db-qs .db-q')).toHaveCount(3)) },
  { marker: 'Get an answer graded, 1 of 3', shows: async (p) => (await expect(p.locator('[data-act="release"]')).toHaveCount(0), await expect(p.locator('.result')).toHaveCount(0)) },
  { marker: 'Get an answer graded, 2 of 3', shows: async (p) => expect(p.locator('[data-act="release"]')).toBeVisible() },
  { marker: 'Get an answer graded, 3 of 3', shows: async (p) => expect(p.locator('.result .score')).toBeVisible() },
  { marker: 'The Engine Room, 1 of 5', shows: async (p) => h2(p, 'The Engine Room') },
  { marker: 'The Engine Room, 2 of 5', shows: async (p) => h2(p, 'Agent crews at work') },
  { marker: 'The Engine Room, 3 of 5', shows: async (p) => h2(p, 'AI safety and evaluation') },
  { marker: 'The Engine Room, 4 of 5', shows: async (p) => h2(p, 'Governance and DevSecOps') },
  { marker: 'The Engine Room, 5 of 5', shows: async (p) => h2(p, 'How this demo runs') },
];

/** Next's box in page pixels, with the pointer away (`.btn:hover` lifts a button 1 px). */
async function nextBox(page: Page): Promise<{ x: number; y: number; w: number; h: number }> {
  await page.mouse.move(1, 1);
  const next = page.locator('#bottom [data-act="next"]');
  await expect(next).toBeEnabled();
  // The hover lift eases out over 0.2 s after the click: measure once it has.
  await expect.poll(() => next.evaluate((el) => getComputedStyle(el).transform)).toMatch(/^(none|matrix\(1, 0, 0, 1, 0, 0\))$/);
  const b = await next.boundingBox();
  if (!b) throw new Error('Next is not on screen');
  return { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height) };
}

/** Next is the footer's last button, and a tap at its centre lands on it (the footer does not cover it). */
async function nextIsRightMost(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const buttons = [...document.querySelectorAll('#bottom .fb-right > button')];
    const next = document.querySelector('#bottom [data-act="next"]') as HTMLElement;
    const r = next.getBoundingClientRect();
    return buttons[buttons.length - 1] === next && document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)?.closest('[data-act="next"]') === next;
  });
}

/** The footer's two halves do not overlap and stay inside the stage: the marker never runs under the buttons. */
async function footerFits(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const foot = (document.querySelector('#bottom') as HTMLElement).getBoundingClientRect();
    const marker = (document.querySelector('#bottom .tour-marker') as HTMLElement).getBoundingClientRect();
    const right = (document.querySelector('#bottom .fb-right') as HTMLElement).getBoundingClientRect();
    return marker.right <= right.left && marker.left >= foot.left && right.right <= foot.right;
  });
}

/** Starts at the hall with the tour's routes, in the given language. */
async function atHall(page: Page, size: { width: number; height: number }, lang: 'en' | 'zh'): Promise<{ approves: () => number }> {
  await page.setViewportSize(size);
  await routeTake(page);
  await routeGrading(page);
  const release = await routeRelease(page);
  await routeDose(page);
  await routeGreeting(page, 'Hello from Pingu.');
  await page.goto('/');
  if (lang === 'zh') await page.click('[data-act="lang"][data-lang="zh"]');
  await page.keyboard.press('Backquote');
  await page.click('[data-act="jump"][data-to="hall"]');
  await page.keyboard.press('Backquote');
  await expect(page.locator('#scene .hall')).toBeVisible();
  return release;
}

const boxes: Record<string, unknown> = {};

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
  console.log(`[tour] ${JSON.stringify(boxes)}`);
});

for (const size of [{ width: 1366, height: 768 }, { width: 1600, height: 900 }] as const) {
  test(`K173: Next alone walks the tour from the hall to the end and back, Next never moving (${size.width})`, async ({ page }) => {
    test.setTimeout(120_000);
    const release = await atHall(page, size, 'en');
    await expect(page.locator('#bottom .tour-marker')).toHaveText('Next starts the tour at Wander the maps');
    await expect(page.locator('#bottom [data-act="back"]')).toHaveCount(0);
    const hall = await nextBox(page);
    expect(await nextIsRightMost(page)).toBe(true);
    const seen: Record<string, unknown> = { hall };
    for (const beat of BEATS) {
      await page.locator('#bottom [data-act="next"]').click();
      await expect(page.locator('#bottom .tour-marker')).toHaveText(beat.marker);
      await beat.shows(page);
      const box = await nextBox(page);
      seen[beat.marker] = box;
      expect(box, beat.marker).toEqual(hall);
      expect(await nextIsRightMost(page), beat.marker).toBe(true);
      expect(await footerFits(page), beat.marker).toBe(true);
      await expect(page.locator('#bottom [data-act="back"]')).toBeVisible();
    }
    expect(release.approves()).toBe(1);
    // W55: Next on the last beat ends the tour in a dialog; "Stay in the hall" goes back to the hub.
    await page.locator('#bottom [data-act="next"]').click();
    await expect(page.locator('#tour-end-box[role="dialog"]')).toBeVisible();
    await page.locator('[data-act="tourEndStay"]').click();
    await expect(page.locator('#scene .hall')).toBeVisible();
    expect(await nextBox(page)).toEqual(hall);
    boxes[String(size.width)] = seen;
  });
}

test('W52: C6 by Back from D1 opens the popup again, Back from C6 closes it to C5, and Esc closes it before the hall (W100: an open paper is C6)', async ({ page }) => {
  test.setTimeout(60_000);
  await atHall(page, { width: 1366, height: 768 }, 'en');
  const marker = page.locator('#bottom .tour-marker');
  const pop = page.locator('.paper-pop');
  await page.click('[data-act="open"][data-to="dash"]');
  await expect(marker).toHaveText('Take an assessment, 1 of 2');
  await page.locator('#bottom [data-act="back"]').click();
  await expect(marker).toHaveText('Meet the Companions, 6 of 6');
  await expect(pop.locator('.pp-q')).toHaveCount(3);
  await page.locator('#bottom [data-act="back"]').click();
  await expect(marker).toHaveText('Meet the Companions, 5 of 6');
  await expect(pop).toHaveCount(0);
  await expect(page.locator('.cx-weak__paper')).toBeVisible();
  // A free click on the paper opens it on C5, which is C6's view, so C6 would show nothing new: Next passes it to
  // D1 (W100); Back from D1 opens it again on C6.
  await page.click('[data-act="paperOpen"]');
  await expect(pop).toBeVisible();
  await page.locator('#bottom [data-act="next"]').click();
  await expect(marker).toHaveText('Take an assessment, 1 of 2');
  await page.locator('#bottom [data-act="back"]').click();
  await expect(marker).toHaveText('Meet the Companions, 6 of 6');
  await expect(pop).toBeVisible();
  // Esc closes the popup first, and the tour stays on C6; a second Esc goes to the hall.
  await page.keyboard.press('Escape');
  await expect(pop).toHaveCount(0);
  await expect(marker).toHaveText('Meet the Companions, 6 of 6');
  await page.keyboard.press('Escape');
  await expect(page.locator('#scene .hall')).toBeVisible();
});

test('K173 in Chinese: the same walk at 1366 x 768, Next never moving and the footer fitting on every beat', async ({ page }) => {
  test.setTimeout(120_000);
  await atHall(page, { width: 1366, height: 768 }, 'zh');
  const marker = page.locator('#bottom .tour-marker');
  await expect(marker).toHaveText('按“下一步”从“漫游学习者的知识地图”开始导览');
  const hall = await nextBox(page);
  for (let i = 0; i < BEATS.length; i++) {
    const before = await marker.textContent();
    await page.locator('#bottom [data-act="next"]').click();
    await expect(marker).not.toHaveText(before ?? '');
    const box = await nextBox(page);
    expect(box, `beat ${i + 1}`).toEqual(hall);
    expect(await footerFits(page), `beat ${i + 1}`).toBe(true);
  }
  await expect(marker).toHaveText('引擎室：第 5 步，共 5 步');
  boxes['1366 zh'] = hall;
});
