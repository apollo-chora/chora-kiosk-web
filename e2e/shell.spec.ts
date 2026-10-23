import { expect, test } from '@playwright/test';

// T3.5 in a real browser, against the production build and the dev fixture server (the
// conductor's API.md examples). The fixture server's reset answers phase by phase.

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

test('the start screen, the credits and About the app', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#scene h1')).toHaveText('Where does Singapore’s water come from?');
  await page.click('[data-act="credits"]');
  await expect(page.locator('#credits')).toHaveClass(/show/);
  await expect(page.locator('#credits')).toContainText('Darryl Ng');
  await page.locator('#credits').click();
  await expect(page.locator('#credits')).not.toHaveClass(/show/);
  await page.click('[data-act="disclosure"]');
  await expect(page.locator('#ov-disclosure')).toHaveClass(/show/);
  // K128, K168 (W33): the embeddings row after the pictures; K172 (W43): payments after sign-in. Eleven rows.
  await expect(page.locator('#ov-disclosure tbody tr')).toHaveCount(11);
  await expect(page.locator('#ov-disclosure tbody tr').nth(7).locator('td').first()).toHaveText('Payments');
  await expect(page.locator('#ov-disclosure tbody tr').nth(3).locator('td').first()).toHaveText('AI for matching topics');
  await page.click('#ov-disclosure [data-act="closeOverlay"]');
  await expect(page.locator('#ov-disclosure')).not.toHaveClass(/show/);
  await page.click('[data-act="lang"][data-lang="zh"]');
  await expect(page.locator('#scene h1')).toHaveText('新加坡的水从哪里来？');
  await expect(page.locator('[data-act="start"][data-lang="en"]')).toHaveText('Start in English');
});

test('the presenter panel reads the conductor: readiness with no spend row, and the counts', async ({ page }) => {
  await page.goto('/');
  await page.keyboard.press('Backquote');
  await expect(page.locator('#presenter')).toHaveClass(/open/);
  await page.click('[data-act="ptab"][data-tab="ready"]');
  await expect(page.locator('#presenter .p-row').first()).toHaveText(
    'Live calls: on. The opening check at 20 Oct, 09:00 reached every model.',
  );
  await expect(page.locator('#presenter')).toContainText('Ollama key: works');
  await expect(page.locator('#presenter')).toContainText('Prepared start: made 20 Oct, 14:02; restored 20 Oct, 14:31');
  await expect(page.locator('#presenter')).not.toContainText('spend');
  await page.click('[data-act="ptab"][data-tab="visits"]');
  await expect(page.locator('#presenter .p-visit').first()).toContainText('41');
});

test('Reset everything shows the conductor’s phases ticking off, then the start screen', async ({ page }) => {
  await page.goto('/');
  await page.keyboard.press('Backquote');
  await page.click('[data-act="resetAll"]');
  await expect(page.locator('#resetcard')).toHaveClass(/show/);
  await expect(page.locator('#resetcard h2')).toHaveText('Getting ready for the next visitor');
  await expect(page.locator('#resetcard .rc-steps li')).toHaveCount(4);
  await expect(page.locator('#resetcard')).toContainText('This takes about 31 seconds.');
  await expect(page.locator('#resetcard .rc-steps li.done')).toHaveCount(2, { timeout: 10_000 });
  await page.screenshot({ path: 'test-results/reset-card.png' });
  await expect(page.locator('#resetcard')).not.toHaveClass(/show/, { timeout: 15_000 });
  await expect(page.locator('#scene h1')).toBeVisible();
});

test('the reset card’s steps read clearly on its dark card, the running step brightest (D8, 19 Oct)', async ({ page }) => {
  // The mockup styled the steps for a light card (text-main #1e293b running, success-strong done), but
  // #resetcard is dark navy, so the running step read at about 1.3:1. Each state's text is measured against
  // the card composited over white, its lightest possible backing (the worst case for light text).
  const measure = () =>
    page.evaluate(() => {
      const rgba = (c: string) => (c.match(/[\d.]+/g) ?? []).map(Number);
      const over = (fg: number[], bg: number[]) => [0, 1, 2].map((i) => fg[i] * (fg[3] ?? 1) + bg[i] * (1 - (fg[3] ?? 1)));
      const lum = (c: number[]) => {
        const [r, g, b] = c.map((v) => {
          const x = v / 255;
          return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
        });
        return 0.2126 * r + 0.7152 * g + 0.0722 * b;
      };
      const card = over(rgba(getComputedStyle(document.querySelector('#resetcard') as Element).backgroundColor), [255, 255, 255]);
      const ratio = (sel: string): number | null => {
        const el = document.querySelector(`#resetcard .rc-steps ${sel}`);
        if (!el) return null;
        const [a, b] = [lum(over(rgba(getComputedStyle(el).color), card)), lum(card)].sort((x, y) => y - x);
        return Math.round(((a + 0.05) / (b + 0.05)) * 10) / 10;
      };
      return { run: ratio('li.run'), done: ratio('li.done'), next: ratio('li:not(.run):not(.done)') };
    });
  await page.goto('/');
  await page.keyboard.press('Backquote');
  await page.click('[data-act="resetAll"]');
  await expect(page.locator('#resetcard')).toHaveClass(/show/);
  // One moment with a step of each state: done, running and still to come.
  let r: Awaited<ReturnType<typeof measure>> | null = null;
  for (const until = Date.now() + 10_000; Date.now() < until && !r; await page.waitForTimeout(100)) {
    const m = await measure();
    if (m.run !== null && m.done !== null && m.next !== null) r = m;
  }
  expect(r, 'no moment showed a done, a running and a waiting step together').not.toBeNull();
  expect(r?.run).toBeGreaterThanOrEqual(7);
  expect(r?.done).toBeGreaterThanOrEqual(4.5);
  expect(r?.next).toBeGreaterThanOrEqual(4.5);
});

for (const lang of ['en', 'zh'] as const) {
  test(`K151's "Start fresh for a new visitor?" reads both its answers at WCAG AA on its light card (W15, ${lang})`, async ({ page }) => {
    // K138 pass 4 (W15): "Continue" was the mockup's ghost button, white text for a dark surface, on this
    // light card. Each answer's text is measured against its own background composited over the card, the
    // card over white and over black: the lower ratio counts (the card is translucent over the scene).
    await page.route(/\/api\/v1\/kiosk\/readiness$/, async (route) => {
      const res = await route.fetch();
      await route.fulfill({ response: res, json: { ...(await res.json()), session_started_since_reset: true } });
    });
    await page.goto('/');
    await page.click(`[data-act="start"][data-lang="${lang}"]`);
    await expect(page.locator('#ov-fresh')).toHaveClass(/show/);
    await expect(page.locator('#ov-fresh [data-act="keepSession"]')).toBeVisible();
    const ratios = await page.evaluate(() => {
      const rgba = (c: string) => (c.match(/[\d.]+/g) ?? []).map(Number);
      const over = (fg: number[], bg: number[]) => [0, 1, 2].map((i) => fg[i] * (fg[3] ?? 1) + bg[i] * (1 - (fg[3] ?? 1)));
      const lum = (c: number[]) => {
        const [r, g, b] = c.map((v) => {
          const x = v / 255;
          return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
        });
        return 0.2126 * r + 0.7152 * g + 0.0722 * b;
      };
      const contrast = (a: number[], b: number[]) => {
        const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
        return (hi + 0.05) / (lo + 0.05);
      };
      const box = document.querySelector('#fresh-box') as Element;
      const ratio = (sel: string) => {
        const btn = document.querySelector(`#fresh-box ${sel}`) as Element;
        return Math.min(
          ...[[255, 255, 255], [0, 0, 0]].map((backing) => {
            const card = over(rgba(getComputedStyle(box).backgroundColor), backing);
            const face = over(rgba(getComputedStyle(btn).backgroundColor), card);
            return contrast(over(rgba(getComputedStyle(btn).color), face), face);
          }),
        );
      };
      return { fresh: Math.round(ratio('[data-act="freshStart"]') * 10) / 10, keep: Math.round(ratio('[data-act="keepSession"]') * 10) / 10 };
    });
    console.log(`[shell] W15 ${lang} ${JSON.stringify(ratios)}`);
    expect(ratios.keep, '"Continue"').toBeGreaterThanOrEqual(4.5);
    expect(ratios.fresh, '"Start fresh"').toBeGreaterThanOrEqual(4.5);
  });
}

test('"Still there?" can be answered with a click', async ({ page }) => {
  await page.clock.install();
  await page.goto('/');
  await page.click('[data-act="start"][data-lang="en"]');
  await page.clock.runFor(8 * 60_000 + 1_000); // K143: 8 minutes by default
  await expect(page.locator('#ov-idle')).toHaveClass(/show/);
  await expect(page.locator('#ov-idle h2')).toHaveText('Still there?');
  await page.click('[data-act="stay"]');
  await expect(page.locator('#ov-idle')).not.toHaveClass(/show/);
});
