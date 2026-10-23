import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { expect, test, type Locator, type Page } from '@playwright/test';

// The owner's round 1 (A), 19 Oct: in step 3's concept drawer, scrolled to the bottom, the LIVE row
// (the calling line, the mini trace, "Stop waiting") sat flush against the drawer's bottom edge and
// looked cut. Every scrolling drawer body must end with room to spare below its last row. Measured at
// the showroom's 1366 x 768 (K2) on the longest content the golden run made: the rung-6 Reservoirs
// question (serve-res-r6.recorded.json, a GET through the kiosk edge on 19 Oct), its verdict, and a
// LIVE call held open (this spec answers the press and never lets it finish).

const ROOT = join(__dirname, '..');
const LONG = (JSON.parse(readFileSync(join(ROOT, 'src/app/exhibits/companions/serve-res-r6.recorded.json'), 'utf8')) as { questions: unknown }).questions as {
  candidates: { options: { option_id: string }[] }[];
};
const MISS_BODY = (JSON.parse(readFileSync(join(ROOT, 'dev/fixtures/world/answer-set.water.res.r6-1.json'), 'utf8')) as { body: Record<string, unknown> }).body;
const WORLD = (JSON.parse(readFileSync(join(ROOT, 'dev/fixtures/world/manifest.json'), 'utf8')) as { body: { world: Record<string, string> } }).body.world;

/** Room to spare: the last row's bottom at least this far above the drawer body's bottom edge. */
const ROOM_PX = 24;

/** Every practice drawer serves the golden run's long question; every answer is a miss with its explainer. */
async function routeLongPractice(page: Page): Promise<void> {
  await page.route(/\/campaign\/questions\?/, async (route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    const res = await route.fetch();
    const body = (await res.json()) as Record<string, unknown>;
    await route.fulfill({ response: res, json: { ...body, questions: LONG } });
  });
  const wrong = LONG.candidates[0].options[1].option_id;
  await page.route(/\/campaign\/questions\/answer$/, (route) =>
    route.fulfill({ json: { ...MISS_BODY, correct: false, counted: false, won: false, cleared_rung: null, correct_option_id: wrong } }),
  );
}

/** A LIVE press is accepted and then never finishes, so its row stays calling while the drawer is measured. */
async function holdLive(page: Page): Promise<void> {
  await page.route(/\/campaign\/questions\/fresh$/, (route) =>
    route.fulfill({ json: { fresh_set_id: 'e2e-fresh', status: 'requested', concept_id: 'x', concept_key: 'x', rung: 1 } }),
  );
  await page.route(/\/campaign\/questions\/fresh\/e2e-fresh$/, (route) =>
    route.fulfill({ json: { fresh_set_id: 'e2e-fresh', status: 'requested', concept_id: 'x', concept_key: 'x', rung: 1 } }),
  );
  await page.route(/\/concept-graph\/suggestions\/generate$/, (route) => route.fulfill({ json: { status: 'requested', requestId: 'e2e-sugg' } }));
  await page.route(/\/concept-graph\/suggestions\/requests\/e2e-sugg$/, (route) => route.fulfill({ json: { status: 'requested', requestId: 'e2e-sugg' } }));
}

interface Fit {
  /** px of content below the fold at the top of the scroll. */
  readonly overflow: number;
  /** px between the last row's bottom and the body's bottom edge, scrolled to the end. */
  readonly gap: number;
}

/** Scrolls the drawer body to its end and measures the room under its last row. */
async function bottomFit(body: Locator): Promise<Fit> {
  return body.evaluate((el) => {
    const box = el as HTMLElement;
    box.style.scrollBehavior = 'auto';
    box.scrollTop = 0;
    const overflow = box.scrollHeight - box.clientHeight;
    box.scrollTop = box.scrollHeight;
    const edge = box.getBoundingClientRect().bottom - parseFloat(getComputedStyle(box).borderBottomWidth);
    let last = -Infinity;
    for (const d of Array.from(box.querySelectorAll('*'))) {
      const r = d.getBoundingClientRect();
      if (r.width === 0 || r.height === 0 || getComputedStyle(d).visibility === 'hidden') continue;
      last = Math.max(last, r.bottom);
    }
    return { overflow, gap: Math.round(edge - last) };
  });
}

/** Presses the drawer's LIVE button and waits until its row is calling. */
async function pressLive(panel: Locator, kind: 'q' | 'sugg'): Promise<void> {
  await panel.locator(`[data-act="live"][data-key^="${kind}:"]`).click();
  await expect(panel.locator(`.live-status[data-key^="${kind}:"]`)).toBeVisible();
}

async function stopWaiting(panel: Locator): Promise<void> {
  await panel.locator('[data-act="liveCancel"]').click();
  await expect(panel.locator('.live-status')).toHaveCount(0);
}

async function jump(page: Page, to: string): Promise<void> {
  await page.keyboard.press('Backquote');
  await page.click(`[data-act="jump"][data-to="${to}"]`);
  await page.keyboard.press('Backquote');
}

/** Answers the drawer's question with its first option and waits for the verdict. */
async function answerFirst(panel: Locator, act: string): Promise<void> {
  await panel.locator(`.opt[data-act="${act}"]`).first().click();
  await expect(panel.locator('.verdict.no')).toBeVisible();
}

const fits: Record<string, Fit> = {};

test.beforeEach(async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  (page as unknown as { kioskErrors: string[] }).kioskErrors = errors;
  await routeLongPractice(page);
  await holdLive(page);
  // Each case starts from the prepared world: the fixture server forgets the accepts of an earlier case.
  expect((await page.request.post('/api/v1/kiosk/reset')).ok()).toBe(true);
});

test.afterEach(async ({ page }) => {
  expect((page as unknown as { kioskErrors: string[] }).kioskErrors).toEqual([]);
});

test.afterAll(() => {
  console.log(`[drawer-fit] ${JSON.stringify(fits)}`);
});

test('the story drawers end with room under a calling LIVE row: step 2 ideas, step 3 question', async ({ page }) => {
  await page.goto('/');
  const panel = page.locator('#panel');
  const body = panel.locator('.kd-body');

  await jump(page, 'h2');
  await expect(panel).toHaveClass(/open/);
  await pressLive(panel, 'sugg');
  fits['hook.ideas'] = await bottomFit(body);
  await stopWaiting(panel);

  // Add the idea (step 3's lens), then the forward arrow opens its question.
  await page.click('#caption [data-act="accept"]');
  await expect(page.locator('#caption [data-act="accept"]')).toHaveCount(0);
  await page.keyboard.press('ArrowRight');
  await expect(panel.locator('.q-stem')).toContainText('Four National Taps');
  await answerFirst(panel, 'answer');
  await pressLive(panel, 'q');
  fits['hook.question'] = await bottomFit(body);

  expect(fits['hook.question'].overflow, 'the long question does not scroll step 3, so the case is not measured').toBeGreaterThan(0);
  for (const k of ['hook.ideas', 'hook.question']) expect(fits[k].gap, `${k}: ${fits[k].gap} px under the last row`).toBeGreaterThanOrEqual(ROOM_PX);
});

/** Pingu's Companions quiz on the golden run's long question (the en-28 question itself). */
async function openPingusQuiz(page: Page): Promise<{ panel: Locator; body: Locator }> {
  await page.goto('/');
  await jump(page, 'comp');
  await page.click(`[data-act="mate"][data-id="${WORLD['companion.pingu']}"]`);
  await page.click('[data-act="ability"][data-ab="quiz"]');
  const panel = page.locator('#panel');
  await expect(panel.locator('.q-stem')).toContainText('Four National Taps');
  return { panel, body: panel.locator('.kd-body') };
}

test('the Companions drawers end with room under a calling LIVE row: the quiz, then the ideas', async ({ page }) => {
  const { panel, body } = await openPingusQuiz(page);
  // K158: with four abilities the row is two lines tall; the drawer opens under it, never over its buttons.
  const under = await page.evaluate(() => {
    const row = (document.querySelector('.comp-abilities') as HTMLElement).getBoundingClientRect();
    const drawer = (document.querySelector('#panel') as HTMLElement).getBoundingClientRect();
    return { abilitiesBottom: Math.round(row.bottom), drawerTop: Math.round(drawer.top) };
  });
  expect(under.drawerTop - under.abilitiesBottom, `the abilities end ${under.abilitiesBottom} px, the drawer starts ${under.drawerTop} px`).toBeGreaterThanOrEqual(8);
  await answerFirst(panel, 'answer');
  await pressLive(panel, 'q');
  fits['comp.quiz'] = await bottomFit(body);
  await stopWaiting(panel);

  await page.click('[data-act="ability"][data-ab="suggest"]');
  await expect(panel.locator('.sugg-row').first()).toBeVisible();
  await pressLive(panel, 'sugg');
  fits['comp.ideas'] = await bottomFit(body);

  expect(fits['comp.quiz'].overflow, 'the long question does not scroll the quiz drawer, so the case is not measured').toBeGreaterThan(0);
  for (const k of ['comp.quiz', 'comp.ideas']) expect(fits[k].gap, `${k}: ${fits[k].gap} px under the last row`).toBeGreaterThanOrEqual(ROOM_PX);
});

test('the atlas drawer ends with room under a calling LIVE row on a climbing idea', async ({ page }) => {
  await page.goto('/');
  await jump(page, 'maps');
  await page.click('[data-act="region"][data-id="goal.water"]');
  await page.locator(`[data-id="${WORLD['concept.water.import']}"]`).first().dispatchEvent('click');
  const panel = page.locator('#panel');
  const body = panel.locator('.kd-body');
  await panel.locator('[data-act="practise"]').click();
  await expect(panel.locator('.q-stem')).toContainText('Four National Taps');
  await answerFirst(panel, 'mapAnswer');
  // W54: the story's two badges under the atlas's question and its verdict, as in step 3 and the Companions quiz.
  await expect(panel.locator('.badges .badge')).toHaveText(['Written for you by the writer AI', 'Checked by a second AI']);
  await panel.locator('.badges').scrollIntoViewIfNeeded();
  await page.screenshot({ path: 'test-results/drawer-fit-atlas-badges.png', animations: 'disabled' });
  await pressLive(panel, 'q');
  fits['atlas.question'] = await bottomFit(body);

  expect(fits['atlas.question'].overflow, 'the long question does not scroll the atlas drawer, so the case is not measured').toBeGreaterThan(0);
  expect(fits['atlas.question'].gap, `atlas.question: ${fits['atlas.question'].gap} px under the last row`).toBeGreaterThanOrEqual(ROOM_PX);
});

// D8's stack walk en-28 on the Companions quiz drawer (ruling (a): all four options begin above the
// fold). The dense layout (becb6804f) left option D's first line 45 px below it (19 Oct 03:55 UTC:
// 282 px below the fold before, 146 after); ruling (A) also drops the quiz's top note for a long question.
test('the dense Companions quiz drawer shows a first line of all four options (en-28)', async ({ page }) => {
  const { body } = await openPingusQuiz(page);
  // The drawer as it stands, and a control with its options pushed 400 px down, which must read as hidden
  // (an instrument that cannot report a hidden option proves nothing).
  // K149 draws the options' order at random, so each reading puts the longest options first: the worst
  // case for D's first line. The drawn order is put back after.
  const fold = (pushed: boolean) =>
    body.evaluate((el, push) => {
      const box = el as HTMLElement;
      const opts = box.querySelector('.opts') as HTMLElement;
      const drawn = Array.from(opts.children);
      for (const o of [...drawn].sort((x, y) => (y.textContent?.length ?? 0) - (x.textContent?.length ?? 0))) opts.appendChild(o);
      opts.style.marginTop = push ? '400px' : '';
      box.style.scrollBehavior = 'auto';
      box.scrollTop = 0;
      const foldAt = box.getBoundingClientRect().bottom;
      // How far each option's first line ends below the fold (0 or less: it shows).
      const miss = Array.from(box.querySelectorAll('.opt')).map((o) => {
        const text = o.lastElementChild as HTMLElement;
        return Math.round(text.getBoundingClientRect().top + parseFloat(getComputedStyle(text).lineHeight) - foldAt);
      });
      const out = { below: box.scrollHeight - box.clientHeight, miss: miss.join(','), dense: box.classList.contains('long-q'), note: !!box.querySelector('.tier.t1') };
      opts.style.marginTop = '';
      for (const o of drawn) opts.appendChild(o);
      return out;
    }, pushed);
  const control = await fold(true);
  const now = await fold(false);
  console.log(`[drawer-fit] en-28 now ${JSON.stringify(now)} control ${JSON.stringify(control)}`);
  expect(Number(control.miss.split(',')[3]), 'the control: options pushed down read as hidden').toBeGreaterThan(0);
  expect([now.dense, now.note]).toEqual([true, false]);
  // Ruling (A): every option's first line ends at least 8 px above the fold.
  for (const [i, m] of now.miss.split(',').map(Number).entries()) expect(m, `option ${'ABCD'[i]} ends ${m} px from the fold`).toBeLessThanOrEqual(-8);
});
