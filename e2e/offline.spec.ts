import { expect, test } from '@playwright/test';

// T3.1, in a real browser: the production build asks nothing of any other origin, and the
// bundled Inter loads from the kiosk's own origin.
test('the production build loads only from its own origin, and Inter is bundled', async ({ page, baseURL }) => {
  const origin = new URL(baseURL!).origin;
  const requests: string[] = [];
  const failed: string[] = [];
  const errors: string[] = [];
  page.on('request', (r) => requests.push(r.url()));
  page.on('requestfailed', (r) => failed.push(`${r.url()} ${r.failure()?.errorText ?? ''}`));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });

  await page.goto('/');
  await expect(page.locator('#stage')).toBeVisible();

  const faces = await page.evaluate(async () => {
    const loaded = await document.fonts.load('700 16px "Inter Variable"', 'Chora');
    return loaded.map((f) => ({ family: f.family, status: f.status }));
  });
  expect(faces.length).toBeGreaterThan(0);
  expect(faces.every((f) => f.family === 'Inter Variable' && f.status === 'loaded')).toBe(true);

  const fontRequests = requests.filter((u) => u.endsWith('.woff2'));
  expect(fontRequests.length).toBeGreaterThan(0);
  const foreign = requests.filter((u) => !u.startsWith(origin) && !u.startsWith('data:'));
  expect(foreign).toEqual([]);
  expect(failed).toEqual([]);
  expect(errors).toEqual([]);
});

test('the stage fills the 1366x768 window edge to edge', async ({ page }) => {
  await page.goto('/');
  const box = await page.locator('#stage').boundingBox();
  expect(box).not.toBeNull();
  expect(Math.round(box!.width)).toBe(1366);
  expect(Math.round(box!.height)).toBe(768);
  expect(box!.x).toBe(0);
  expect(box!.y).toBe(0);
});
