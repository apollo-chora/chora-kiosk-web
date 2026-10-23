import { expect, test, type Locator, type Page } from '@playwright/test';

// K138 walk W2, in a real browser at the showroom's 1366 x 768 (K2): the grading exhibit's left
// card holds the golden run's own question (a 319-character stem, far longer than the mockup's),
// and everything on it must sit above the footer: "Submit for grading", the LIVE button, the LIVE
// row while the crew runs, and its result line after (K186: no repeat). The dev world has no grading reads, so
// this spec answers them with the records the stack gave on 18 Oct (e2e/fixtures/grading-recorded.json).

import { routeGrading } from './world-routes';

/** How far the box's bottom sits below the footer's top, in screen pixels (positive = covered). */
async function under(box: Locator, page: Page): Promise<number> {
  const b = await box.boundingBox();
  const f = await page.locator('#bottom').boundingBox();
  if (!b || !f) throw new Error('a box to measure is not on screen');
  return Math.round(b.y + b.height - f.y);
}

/** The element a tap at the box's centre lands on is the box itself (the footer does not take it). */
async function tappable(box: Locator): Promise<boolean> {
  return box.evaluate((el) => {
    const r = el.getBoundingClientRect();
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return !!hit && (hit === el || el.contains(hit));
  });
}

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

test('the grading card fits above the footer at 1366 x 768: Submit, the LIVE button, LIVE calling and LIVE done (no repeat, K186)', async ({ page }) => {
  const live = await routeGrading(page);
  await page.goto('/');
  await page.keyboard.press('Backquote');
  await page.click('[data-act="jump"][data-to="grade"]');
  await page.keyboard.press('Backquote');
  const card = page.locator('.qcard');
  await expect(card.locator('p.q')).toContainText('four water sources');

  const submit = page.locator('[data-act="submitGrade"]');
  await expect(submit).toBeVisible();
  const report: Record<string, number> = { card: await under(card, page), submit: await under(submit, page) };
  const taps: Record<string, boolean> = { submit: await tappable(submit) };

  await page.locator('textarea#gradetext').fill('Johor’s water ends in 2061, and NEWater needs no rain.');
  const liveBtn = card.locator('.grade-go [data-act="live"]');
  await expect(liveBtn).toBeEnabled();
  report['liveButton'] = await under(liveBtn, page);
  taps['liveButton'] = await tappable(liveBtn);

  // Dispatched on the button itself: a covered button cannot be pressed by a tap (taps.liveButton says so).
  await liveBtn.dispatchEvent('click');
  const status = card.locator('.grade-go .live-status');
  await expect(status).toBeVisible();
  report['liveCalling'] = await under(card.locator('.grade-go'), page);

  live.answerGrade();
  await expect(card.locator('.grade-go .stamp.live-done')).toBeVisible({ timeout: 10_000 });
  report['liveDone'] = await under(card.locator('.grade-go'), page);
  report['cardAfter'] = await under(card, page);
  // K186: the same answer is never graded live twice, so its LIVE button is gone after the live result.
  await expect(card.locator('.grade-go [data-act="live"]')).toHaveCount(0);
  const overflow = await card.evaluate((el) => el.scrollHeight - el.clientHeight);
  console.log(`[grade-fit] px below the footer's top: ${JSON.stringify(report)}; taps ${JSON.stringify(taps)}; card overflow ${overflow}`);

  // The grade card beside it keeps to the same row: on review, then released with the crew's comment.
  const acard = page.locator('.acard');
  const aOver = { review: await acard.evaluate((el) => el.scrollHeight - el.clientHeight), reviewUnder: await under(acard, page) };
  await page.locator('[data-act="release"]').dispatchEvent('click');
  await expect(page.locator('.result .score b')).toHaveText('10');
  const released = { released: await acard.evaluate((el) => el.scrollHeight - el.clientHeight), releasedUnder: await under(acard, page) };
  console.log(`[grade-fit] grade card: ${JSON.stringify({ ...aOver, ...released })}`);

  // From the dashboard the header names the assessment and wraps to two lines (the dev world
  // cannot drive the dashboard's take, so its header's words stand in here): both cards still end
  // above the footer.
  await page.locator('.ex-head p').evaluate((p) => {
    p.textContent = 'Your answer from “Water for Life: Unit 1 quiz”. Press LIVE to have it graded; the grade goes back to your assessment.';
  });
  const spill = (box: Locator) => box.evaluate((el) => el.scrollHeight - el.clientHeight);
  const twoLines = {
    headLines: await page.locator('.ex-head p').evaluate((p) => Math.round((p as HTMLElement).offsetHeight / 26)),
    dashCard: await under(card, page),
    dashCardSpill: await spill(card),
    dashGradeCard: await under(acard, page),
    dashGradeCardSpill: await spill(acard),
  };
  console.log(`[grade-fit] dashboard header: ${JSON.stringify(twoLines)}`);
  expect(twoLines.headLines).toBe(2);
  for (const [what, px] of Object.entries(twoLines).filter(([k]) => k !== 'headLines')) expect(px, `under a two-line header, ${what} ${px}`).toBeLessThanOrEqual(0);

  for (const [what, hit] of Object.entries(taps)) expect(hit, `a tap at ${what}'s centre lands elsewhere`).toBe(true);
  for (const [what, px] of Object.entries({ ...aOver, ...released })) expect(px, `the grade card: ${what} ${px}`).toBeLessThanOrEqual(0);

  for (const [what, px] of Object.entries(report)) expect(px, `${what} sits ${px} px under the footer`).toBeLessThanOrEqual(0);
  expect(overflow, 'the card overflows itself').toBeLessThanOrEqual(0);
});

// W29 (the owner, 19 Oct, 22:15 +08: "some visual imbalance for the 10 out of 10 element"): the circle
// holds the score alone; the stamp sits under it, outside it, on one line with its icon, at 1366 x 768,
// in both languages and for both stamps (the live one, and the prepared one's longer words).
for (const lang of ['en', 'zh'] as const) {
  test(`W29: the released score circle holds the score alone, its stamp under it on one line (${lang})`, async ({ page }) => {
    const live = await routeGrading(page);
    await page.goto('/');
    if (lang === 'zh') await page.click('[data-act="lang"][data-lang="zh"]');
    await page.keyboard.press('Backquote');
    await page.click('[data-act="jump"][data-to="grade"]');
    await page.keyboard.press('Backquote');
    const card = page.locator('.qcard');
    await page.locator('textarea#gradetext').fill('Johor’s water ends in 2061, and NEWater needs no rain.');
    await card.locator('.grade-go [data-act="live"]').dispatchEvent('click');
    await expect(card.locator('.grade-go .live-status')).toBeVisible();
    live.answerGrade();
    await expect(card.locator('.grade-go .stamp.live-done')).toBeVisible({ timeout: 10_000 });
    await page.locator('[data-act="release"]').dispatchEvent('click');
    await expect(page.locator('.result .score b')).toHaveText('10');
    const prepared = lang === 'en' ? 'Prepared 18 Oct, 12:56' : '10月18日 12:56 预先备好';
    for (const words of [null, prepared]) {
      const m = await page.locator('.result').evaluate((el, w) => {
        const circle = (el.querySelector('.score') as HTMLElement).getBoundingClientRect();
        const stamp = el.querySelector('.score-src .stamp') as HTMLElement;
        if (w) stamp.lastChild!.textContent = w;
        const s = stamp.getBoundingClientRect();
        const icon = (stamp.querySelector('svg') as SVGElement).getBoundingClientRect();
        const line = parseFloat(getComputedStyle(stamp).lineHeight);
        return {
          inCircle: !!el.querySelector('.score .stamp'),
          below: Math.round(s.top - circle.bottom),
          lines: Math.round(s.height / line),
          iconInRow: icon.top >= s.top - 1 && icon.bottom <= s.bottom + 1,
          right: Math.round(s.right),
          cardRight: Math.round((el.closest('.acard') as HTMLElement).getBoundingClientRect().right),
        };
      }, words);
      console.log(`[grade-fit] W29 ${lang} ${words ?? 'live'}: ${JSON.stringify(m)}`);
      expect(m.inCircle, 'the stamp is not inside the circle').toBe(false);
      expect(m.below, 'the stamp starts under the circle').toBeGreaterThanOrEqual(0);
      expect(m.lines, 'the stamp is one line').toBe(1);
      expect(m.iconInRow, 'its icon sits in that line').toBe(true);
      expect(m.right, 'the stamp stays inside its card').toBeLessThanOrEqual(m.cardRight);
    }
  });
}
