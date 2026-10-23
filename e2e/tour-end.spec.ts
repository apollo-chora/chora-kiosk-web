import { expect, test, type Page } from '@playwright/test';

// W55 (the owner: "after the last 'Engine room' tour is played (via 'Next'), it is basically the end of
// the tour. Show a message saying that visitor has reached the end of their tour and offer an exit
// option (modal/popup) or choose to remain in the hall to explore"): Next on the Engine Room's last page
// opens a modal dialog over it, the focus on Done, the footer behind it out of reach. Stay in the hall,
// and Esc, go to the hall; Done ends the demo session as the footer's Done does (the reset card, then
// the start screen). Reached by the hall's Engine Room card, then Next to its fifth page (the earlier
// exhibits are tour.spec.ts's walk), at the showroom's 1366 x 768 (K2).

const TITLE = 'You have reached the end of the tour';

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

/** The hall, the Engine Room's card, Next to its fifth page, then Next once more: the dialog, checked. */
async function atTheEnd(page: Page): Promise<void> {
  await page.goto('/');
  await page.keyboard.press('Backquote');
  await page.click('[data-act="jump"][data-to="hall"]');
  await page.keyboard.press('Backquote');
  await expect(page.locator('#scene .hall')).toBeVisible();
  await page.click('#scene [data-act="open"][data-to="engine"]');
  const marker = page.locator('#bottom .tour-marker');
  await expect(marker).toHaveText('The Engine Room, 1 of 5');
  for (const n of [2, 3, 4, 5]) {
    await page.locator('#bottom [data-act="next"]').click();
    await expect(marker).toHaveText(`The Engine Room, ${n} of 5`);
  }
  await expect(page.locator('#scene .ex-head h2')).toHaveText('How this demo runs');
  await expect(page.getByRole('dialog')).toHaveCount(0);

  await page.locator('#bottom [data-act="next"]').click();
  const dialog = page.getByRole('dialog', { name: TITLE });
  await expect(dialog).toBeVisible();
  await expect(dialog).toHaveAttribute('aria-modal', 'true');
  await expect(dialog.locator('h2')).toHaveText(TITLE);
  await expect(dialog.locator('p')).toHaveText(
    'That was the last stop on the tour. End the demo session so the next visitor starts fresh, or stay in the hall and explore on your own.',
  );
  await expect(dialog.locator('button')).toHaveText(['Done, end the demo session', 'Stay in the hall and explore']);
  await expect(dialog.locator('[data-act="tourEndDone"]')).toBeFocused();
  // Over the page it ended on: E5 stays under it, and a tap on the footer's Next lands on the overlay.
  await expect(page.locator('#scene .ex-head h2')).toHaveText('How this demo runs');
  await expect(marker).toHaveText('The Engine Room, 5 of 5');
  const fit = await page.evaluate(() => {
    const inside = (a: DOMRect, b: DOMRect) => a.left >= b.left && a.right <= b.right && a.top >= b.top && a.bottom <= b.bottom;
    const box = (document.querySelector('#tour-end-box') as HTMLElement).getBoundingClientRect();
    const win = new DOMRect(0, 0, window.innerWidth, window.innerHeight);
    const next = (document.querySelector('#bottom [data-act="next"]') as HTMLElement).getBoundingClientRect();
    return {
      boxInWindow: inside(box, win),
      buttonsInBox: [...document.querySelectorAll('#tour-end-box button')].every((b) => inside(b.getBoundingClientRect(), box)),
      nextCovered: document.elementFromPoint(next.left + next.width / 2, next.top + next.height / 2)?.closest('#ov-tour-end') !== null,
    };
  });
  expect(fit).toEqual({ boxInWindow: true, buttonsInBox: true, nextCovered: true });
}

for (const how of ['Stay', 'Esc'] as const) {
  test(`W55: at the end of the tour the arrow keys wait, and ${how === 'Stay' ? '"Stay in the hall and explore"' : 'Esc'} goes to the hall`, async ({ page }) => {
    test.setTimeout(60_000);
    await atTheEnd(page);
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('ArrowRight');
    await expect(page.getByRole('dialog', { name: TITLE })).toBeVisible();
    await expect(page.locator('#bottom .tour-marker')).toHaveText('The Engine Room, 5 of 5');

    if (how === 'Stay') await page.getByRole('dialog').locator('[data-act="tourEndStay"]').click();
    else await page.keyboard.press('Escape');
    await expect(page.locator('#scene .hall')).toBeVisible();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.locator('#ov-tour-end')).not.toHaveClass(/show/);
    await expect(page.locator('#bottom .tour-marker')).toHaveText('Next starts the tour at Wander the maps');
  });
}

test('W55: Done at the end of the tour ends the demo session: the reset card, then the start screen', async ({ page }) => {
  test.setTimeout(60_000);
  await atTheEnd(page);
  await page.getByRole('dialog').locator('[data-act="tourEndDone"]').click();
  await expect(page.locator('#resetcard')).toHaveClass(/show/);
  await expect(page.locator('#resetcard h2')).toHaveText('Getting ready for the next visitor');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.locator('#resetcard')).not.toHaveClass(/show/, { timeout: 15_000 });
  await expect(page.locator('#scene h1')).toHaveText('Where does Singapore’s water come from?');
});
