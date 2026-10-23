import { expect, test, type Page } from '@playwright/test';

import { TEH_TARIK, WORLD, routeDose, routeGrading } from './world-routes';

// W97 (the owner's English walk, 22 Oct 17:1x +08): "this UI spills over for the bottom UI element": the
// grading card's LIVE row, calling with its three chips and "Stop waiting", ran past the bottom of the
// white card. Every LIVE row must lie inside its own card, measured on the row's box itself (a click
// would scroll a button into view and pass). A card whose body scrolls (a drawer) may hold the row
// below its fold, so the row is first brought into view in its own scroller. Measured in the running
// state on every card with a LIVE row, and on the grading card in every state, at the showroom's
// 1366 x 768 (K2) and the stage's 1600 x 900.

const SIZES = [
  { width: 1366, height: 768 },
  { width: 1600, height: 900 },
] as const;

/**
 * The grading card as the tour reaches it from the dashboard's take of Food Heritage (the dev world
 * cannot drive that take, so its words stand in, as grade-fit's header does): the header on two lines,
 * the answer held from the take (no sample chips), hawker's open question (TEH_TARIK, the golden run's
 * longest stem) and its rubric's three criteria in the words of its prepared prompt (draft.hawker.q3,
 * kiosk/world/prepared-choices.json). The owner's spill, reproduced: 43 px under the card at 1366 x 768.
 */
const HAWKER_RUBRIC = [
  'Explains that pouring from a height mixes the tea with the condensed milk',
  'Explains that it cools the tea to drinking temperature and gives it a frothy top',
  'Explains that hawkers pass the skill down, and that it is part of the hawker culture UNESCO recognised in 2020',
];

interface Inside {
  readonly row: { top: number; bottom: number; left: number; right: number };
  readonly card: { top: number; bottom: number; left: number; right: number };
  /** px of the row outside the card on its worst side: 0 when inside (half a pixel of rounding allowed). */
  readonly out: number;
}

/**
 * The row's box against its card's box, the row brought into view inside the card's own scroller
 * first. A drawer body scrolls smoothly, and a won banner scrolls itself into view (K138 W4), so the
 * scroller is let settle before it is moved, and moved at once.
 */
async function inside(page: Page, card: string, row: string): Promise<Inside> {
  return page.evaluate(
    async ([cardSel, rowSel]) => {
      const c = document.querySelector(cardSel) as HTMLElement | null;
      if (!c) throw new Error(`no card ${cardSel}`);
      const r = c.querySelector(rowSel) as HTMLElement | null;
      if (!r) throw new Error(`no row ${rowSel} in ${cardSel}`);
      const frame = () => new Promise<void>((done) => requestAnimationFrame(() => done()));
      for (let el: HTMLElement | null = r.parentElement; el && el !== c.parentElement; el = el.parentElement) {
        const oy = getComputedStyle(el).overflowY;
        if ((oy === 'auto' || oy === 'scroll') && el.scrollHeight > el.clientHeight) {
          for (let still = 0, last = -1, n = 0; still < 10 && n < 300; n++) {
            await frame();
            still = el.scrollTop === last ? still + 1 : 0;
            last = el.scrollTop;
          }
          el.style.scrollBehavior = 'auto';
          // The stage is scaled to the window: boxes are in screen px, scrolling in the layout's own.
          const scale = el.getBoundingClientRect().height / el.offsetHeight;
          const top = (r.getBoundingClientRect().top - el.getBoundingClientRect().top) / scale + el.scrollTop;
          el.scrollTop = Math.max(0, top + r.offsetHeight - el.clientHeight);
          await frame();
          break;
        }
      }
      const box = (el: Element) => {
        const b = el.getBoundingClientRect();
        return { top: Math.round(b.top), bottom: Math.round(b.bottom), left: Math.round(b.left), right: Math.round(b.right) };
      };
      const rb = r.getBoundingClientRect();
      const cb = c.getBoundingClientRect();
      const out = Math.max(0, cb.top - rb.top, rb.bottom - cb.bottom, cb.left - rb.left, rb.right - cb.right);
      return { row: box(r), card: box(c), out: out <= 0.5 ? 0 : Math.round(out * 10) / 10 };
    },
    [card, row] as const,
  );
}

async function jump(page: Page, to: string): Promise<void> {
  await page.keyboard.press('Backquote');
  await page.click(`[data-act="jump"][data-to="${to}"]`);
  await page.keyboard.press('Backquote');
}

/** Every LIVE press but grading's is accepted and never answered, so its row stays calling while it is measured. */
async function holdLive(page: Page): Promise<void> {
  const hang = (): void => undefined;
  const onPost = (route: Parameters<Parameters<Page['route']>[1]>[0]) => (route.request().method() === 'POST' ? hang() : route.fallback());
  await page.route(/\/campaign\/questions\/fresh$/, onPost);
  await page.route(/\/concept-graph\/suggestions\/generate$/, onPost);
  await page.route(/\/api\/atoms\/[^/]+\/question-jobs$/, onPost);
  await page.route(/\/regenerate-image$/, onPost);
  await page.route(/\/api\/companion\/greeting$/, onPost);
  await page.route(/\/growth-edges\/uploads$/, onPost);
}

/** Presses the LIVE button of `kind` inside `scope` and waits until its row is calling. */
async function press(page: Page, scope: string, kind: string): Promise<void> {
  const btn = page.locator(`${scope} [data-act="live"][data-key^="${kind}:"]`).first();
  await expect(btn).toBeEnabled();
  await btn.dispatchEvent('click');
  await expect(page.locator(`${scope} .live-status[data-key^="${kind}:"]`).first()).toBeVisible();
}

/** Opens the grading exhibit, with the dashboard's hawker question standing in when `hawker`. */
async function openGrade(page: Page, hawker: boolean): Promise<void> {
  await page.goto('/');
  await jump(page, 'grade');
  await expect(page.locator('.qcard p.q')).toContainText('four water sources');
  await page.locator('textarea#gradetext').fill(hawker ? 'It cools the tea and makes it frothy.' : 'Johor’s water ends in 2061, and NEWater needs no rain.');
  if (!hawker) return;
  await page.evaluate(
    ([stem, rubric]) => {
      (document.querySelector('.ex-head p') as HTMLElement).textContent =
        'Your answer from “Food Heritage: Unit 1 quiz”. Press LIVE to have it graded; the grade goes back to your assessment.';
      (document.querySelector('.qcard p.q') as HTMLElement).textContent = stem;
      document.querySelectorAll('.qcard .rubric > div span').forEach((s, i) => (s.textContent = rubric[i]));
      (document.querySelector('.qcard [data-act="sample"]')?.parentElement as HTMLElement).style.display = 'none';
    },
    [TEH_TARIK, HAWKER_RUBRIC] as const,
  );
}

const fits: Record<string, Inside> = {};

function record(key: string, fit: Inside): void {
  fits[key] = fit;
  expect.soft(fit.out, `${key}: the LIVE row runs ${fit.out} px outside its card ${JSON.stringify(fit)}`).toBe(0);
}

test.beforeEach(async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  (page as unknown as { kioskErrors: string[] }).kioskErrors = errors;
  expect((await page.request.post('/api/v1/kiosk/reset')).ok()).toBe(true);
});

test.afterEach(async ({ page }) => {
  expect((page as unknown as { kioskErrors: string[] }).kioskErrors).toEqual([]);
});

test.afterAll(() => {
  console.log(`[live-fit] ${JSON.stringify(fits)}`);
});

for (const size of SIZES) {
  const at = `${size.width}x${size.height}`;

  test.describe(`at ${at}`, () => {
    test.use({ viewport: size });

    for (const hawker of [false, true]) {
      const which = hawker ? 'from the dashboard, hawker' : 'from the hall';
      test(`the grading card holds its LIVE row idle, calling and done (${which})`, async ({ page }) => {
        const live = await routeGrading(page);
        await openGrade(page, hawker);
        const card = '.qcard';
        const row = '.grade-go .live-row';
        await expect(page.locator(`${card} [data-act="live"]`)).toBeEnabled();
        record(`${at} grade ${which} idle`, await inside(page, card, row));
        await press(page, card, 'grade');
        record(`${at} grade ${which} calling`, await inside(page, card, row));
        record(`${at} grade ${which} calling, Stop waiting`, await inside(page, card, '[data-act="liveCancel"]'));
        live.answerGrade();
        await expect(page.locator(`${card} .grade-go .stamp.live-done`)).toBeVisible({ timeout: 10_000 });
        record(`${at} grade ${which} done`, await inside(page, card, row));
      });

      test(`the grading card holds its LIVE row once the call failed (${which})`, async ({ page }) => {
        await routeGrading(page);
        await page.route('**/api/v1/assessments', (route) => (route.request().method() === 'POST' ? route.fulfill({ status: 502, json: { error: 'e2e' } }) : route.fallback()));
        await openGrade(page, hawker);
        const card = '.qcard';
        await page.locator(`${card} [data-act="live"]`).dispatchEvent('click');
        await expect(page.locator(`${card} .msg-error`)).toBeVisible({ timeout: 10_000 });
        // The miss is said loudly in the console too (fail loud); only page errors fail the case.
        record(`${at} grade ${which} failed`, await inside(page, card, '.grade-go .live-row'));
        record(`${at} grade ${which} failed, its line`, await inside(page, card, '.msg-error'));
      });
    }

    test('the story holds its LIVE rows calling: step 2’s ideas, step 3’s question, step 4’s words and picture', async ({ page }) => {
      await holdLive(page);
      await page.goto('/');
      await jump(page, 'h2');
      await press(page, '#panel', 'sugg');
      record(`${at} story step 2 ideas`, await inside(page, '#panel', '.live-row[data-live^="sugg:"]'));
      await page.locator('#panel [data-act="liveCancel"]').click();
      await page.click('#caption [data-act="accept"]');
      await expect(page.locator('#caption [data-act="accept"]')).toHaveCount(0);
      await page.keyboard.press('ArrowRight');
      await expect(page.locator('#panel .q-stem')).toBeVisible();
      await press(page, '#panel', 'q');
      record(`${at} story step 3 question`, await inside(page, '#panel', '.live-row[data-live^="q:"]'));
      await page.locator('#panel [data-act="liveCancel"]').click();

      await jump(page, 'h4');
      // Step 4 opens on the swap of hats; its button starts the teacher's studio.
      await page.locator('#swap [data-act="swapGo"]').click();
      // "Redo it" (#revstatus) redoes the change just made; the typed change's own LIVE button waits for words.
      await page.locator('.imgcard.words [data-act="revText"]:enabled').first().click();
      await press(page, '.imgcard.words #revstatus', 'words');
      record(`${at} story step 4 words`, await inside(page, '.imgcard.words', '#revstatus .live-row[data-live^="words:"]'));
      await page.locator('.imgcard.words [data-act="liveCancel"]').click();
      await page.keyboard.press('ArrowRight');
      await page.locator('.imgcard [data-act="rev"]:enabled').first().click();
      await press(page, '.imgcard #revstatus', 'picture');
      record(`${at} story step 4 picture`, await inside(page, '.imgcard', '#revstatus .live-row[data-live^="picture:"]'));
    });

    test('the Companions hold their LIVE rows calling: the greeting, the essay, the quiz, the ideas', async ({ page }) => {
      await routeDose(page);
      await holdLive(page);
      // The dose replays the golden run's greeting through the same door (no model call); only the press after it is held.
      let greetings = 0;
      await page.route(/\/api\/companion\/greeting$/, (route) => {
        if (greetings++ > 0) return;
        const body = route.request().postDataJSON() as { companion_id: string; turn_id: string };
        return route.fulfill({ json: { companion_id: body.companion_id, turn_id: body.turn_id, greeting: 'Hello again.', model: 'e2e', replayed: true } });
      });
      await page.goto('/');
      await jump(page, 'comp');
      await page.click(`[data-act="mate"][data-id="${WORLD['companion.pingu']}"]`);
      await page.click('[data-act="ability"][data-ab="dose"]');
      await press(page, '.cx-rail', 'greet');
      record(`${at} companions greeting`, await inside(page, '.cx-rail', '.live-row[data-live^="greet:"]'));
      await page.locator('.cx-rail [data-act="liveCancel"]').click();

      await page.click('[data-act="ability"][data-ab="weak"]');
      await page.click('[data-act="weakDoc"][data-doc="essay"]');
      await press(page, '.cx-weak__side', 'weak');
      record(`${at} companions essay`, await inside(page, '.cx-weak__side', '.live-row[data-live^="weak:"]'));
      await page.locator('.cx-weak__side [data-act="liveCancel"]').dispatchEvent('click');

      // A miss keeps the quiz's question row ("Write a new question"); a win would take it away (K218).
      await page.route(/\/campaign\/questions\/answer$/, (route) =>
        route.fulfill({ json: { correct: false, rung: 6, is_refresher: false, counted: false, cleared_rung: null, won: false, paced_today: false, rungs_cleared: 5, current_rung_correct: 0, needed_correct: 2, retention_r: 1, correct_option_id: 'none', explainer: 'Not quite.' } }),
      );
      await page.click('[data-act="ability"][data-ab="quiz"]');
      await expect(page.locator('#panel .q-stem')).toBeVisible();
      await page.locator('#panel .opt[data-act="answer"]').first().click();
      await expect(page.locator('#panel .verdict')).toBeVisible();
      await press(page, '#panel', 'q');
      record(`${at} companions quiz`, await inside(page, '#panel', '.live-row[data-live^="q:"]'));
      await page.locator('#panel [data-act="liveCancel"]').click();

      await page.click('[data-act="ability"][data-ab="suggest"]');
      await press(page, '#panel', 'sugg');
      record(`${at} companions ideas`, await inside(page, '#panel', '.live-row[data-live^="sugg:"]'));
    });

    test('the Companions quiz, won, holds its fresh-ideas ask calling inside its box (K222)', async ({ page }) => {
      await holdLive(page);
      await page.goto('/');
      await jump(page, 'comp');
      await page.click(`[data-act="mate"][data-id="${WORLD['companion.pingu']}"]`);
      await page.click('[data-act="ability"][data-ab="quiz"]');
      await page.locator('#panel .opt[data-act="answer"]', { hasText: 'Send its rain through drains and canals into a reservoir' }).click();
      await expect(page.locator('#panel .won-banner')).toBeVisible();
      await expect(page.locator('#panel .won-done')).toHaveText('Reservoirs is won: no more questions on it.');
      if (process.env['W97_SHOTS']) await page.screenshot({ path: `${process.env['W97_SHOTS']}/comp-won-${at}.png` });
      await press(page, '#panel .won-ask', 'sugg');
      record(`${at} companions won ask, in its box`, await inside(page, '#panel .won-ask', '.live-row[data-live^="sugg:"]'));
      record(`${at} companions won ask, in the drawer`, await inside(page, '#panel', '.won-ask'));
    });

    test('the maps drawer holds its LIVE rows calling: a climbing idea’s question, a won hex’s ask, the root’s Suggestions tab', async ({ page }) => {
      await holdLive(page);
      await page.goto('/');
      await jump(page, 'maps');
      await page.click('[data-act="region"][data-id="goal.water"]');
      const panel = '#panel';
      await page.locator(`[data-id="${WORLD['concept.water.import']}"]`).first().dispatchEvent('click');
      await page.locator(`${panel} [data-act="practise"]`).click();
      await expect(page.locator(`${panel} .q-stem`)).toBeVisible();
      await press(page, panel, 'q');
      record(`${at} maps question`, await inside(page, panel, '.live-row[data-live^="q:"]'));
      await page.locator(`${panel} [data-act="liveCancel"]`).click();

      await page.locator(`[data-id="${WORLD['concept.water.res']}"]`).first().dispatchEvent('click');
      await page.locator(`${panel} [data-act="practise"]`).click();
      await page.locator(`${panel} .opt[data-act="mapAnswer"]`, { hasText: 'Send its rain through drains and canals into a reservoir' }).click();
      await expect(page.locator(`${panel} .won-banner`)).toBeVisible();
      await press(page, `${panel} .won-ask`, 'sugg');
      record(`${at} maps won ask, in its box`, await inside(page, `${panel} .won-ask`, '.live-row[data-live^="sugg:"]'));
      record(`${at} maps won ask, in the drawer`, await inside(page, panel, '.won-ask'));
      await page.locator(`${panel} [data-act="liveCancel"]`).click();

      await page.locator(`[data-id="${WORLD['concept.water.root']}"]`).first().dispatchEvent('click');
      await page.locator(`${panel} [data-act="kdtab"][data-tab="sugg"]`).click();
      await press(page, panel, 'sugg');
      record(`${at} maps Suggestions tab`, await inside(page, panel, '.live-row[data-live^="sugg:"]'));
    });
  });
}
