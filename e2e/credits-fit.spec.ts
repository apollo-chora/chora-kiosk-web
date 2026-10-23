import { expect, test, type Page } from '@playwright/test';

// K201 (amends K183, K184's layout and K185): the full-window credits read the programme line; two
// columns about a hairline rule, aligned at the top, the team on the left ("Project team members" over the
// three names stacked) and the Programme Chief over the Academic Supervisor on the right; then "Contact for
// this project" over the owner's email; then how to close. Every line sits inside the window in its order;
// each official title (English in both languages) fits on one line; no asterisk. One type system: the four
// labels share one size, weight and gold, the five names one size and weight, the two titles one size; on
// the showroom's 1366 x 768 screen (K2) each lands at the size the owner approved on the design page (its
// units are 1/1366 of the screen; the stage is 1600 wide, so the CSS sizes are the units times 1600/1366).
// Measured in both languages at 1366 x 768 and at 1600 x 900.

interface Box {
  readonly top: number;
  readonly bottom: number;
  readonly left: number;
  readonly right: number;
}

interface Type {
  readonly text: string;
  /** The type size on screen, in px: its CSS size times the stage's scale. */
  readonly px: number;
  readonly weight: string;
  readonly color: string;
}

interface CreditsFit {
  readonly lines: readonly (Box & { readonly cls: string })[];
  readonly team: Box;
  readonly fac: Box & { readonly ruleWidth: string; readonly ruleStyle: string };
  readonly titles: readonly { readonly text: string; readonly box: Box; readonly lines: number }[];
  readonly labels: readonly Type[];
  readonly names: readonly Type[];
  readonly titleType: readonly Type[];
  readonly org: Type;
  readonly mail: Type;
  readonly close: Type;
  readonly text: string;
  readonly sups: number;
  readonly width: number;
  readonly height: number;
}

async function creditsFit(page: Page): Promise<CreditsFit> {
  return page.evaluate(() => {
    const box = (n: Element) => {
      const r = n.getBoundingClientRect();
      return { top: Math.round(r.top), bottom: Math.round(r.bottom), left: Math.round(r.left), right: Math.round(r.right) };
    };
    const scale = (document.querySelector('#stage') as HTMLElement).getBoundingClientRect().width / 1600;
    const type = (n: Element) => {
      const s = getComputedStyle(n);
      return { text: n.textContent!.trim(), px: Math.round(parseFloat(s.fontSize) * scale * 10) / 10, weight: s.fontWeight, color: s.color };
    };
    const lineCount = (n: Element) => {
      const r = document.createRange();
      r.selectNodeContents(n);
      // One client rect per line box the text wraps onto (rounded tops, so a sub-pixel split is not a line).
      return new Set(Array.from(r.getClientRects()).map((x) => Math.round(x.top))).size;
    };
    const fac = document.querySelector('#credits .c-cols > .c-col.fac') as HTMLElement;
    return {
      lines: Array.from(document.querySelectorAll('#credits .c-line')).map((n) => ({ cls: n.className, ...box(n) })),
      team: box(document.querySelector('#credits .c-cols > .c-col.team')!),
      fac: { ...box(fac), ruleWidth: getComputedStyle(fac).borderLeftWidth, ruleStyle: getComputedStyle(fac).borderLeftStyle },
      titles: Array.from(document.querySelectorAll('#credits .c-title')).map((t) => ({ text: t.textContent!, box: box(t), lines: lineCount(t) })),
      labels: Array.from(document.querySelectorAll('#credits .c-lbl')).map(type),
      names: Array.from(document.querySelectorAll('#credits .c-names > div, #credits .c-person')).map(type),
      titleType: Array.from(document.querySelectorAll('#credits .c-title')).map(type),
      org: type(document.querySelector('#credits .c-org')!),
      mail: type(document.querySelector('#credits .c-mail')!),
      close: type(document.querySelector('#credits .c-close')!),
      text: (document.querySelector('#credits') as HTMLElement).innerText,
      sups: document.querySelectorAll('#credits sup').length,
      width: window.innerWidth,
      height: window.innerHeight,
    };
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

const fits: Record<string, CreditsFit> = {};
test.afterAll(() => {
  console.log(`[credits-fit] ${JSON.stringify(fits)}`);
});

const GOLD = 'rgb(255, 210, 154)';
const WHITE = 'rgb(255, 255, 255)';

for (const size of [{ width: 1366, height: 768 }, { width: 1600, height: 900 }] as const) {
  for (const lang of ['en', 'zh'] as const) {
    test(`K201: the credits fit the window in order, two columns about the rule, one type system, no asterisk (${size.width}, ${lang})`, async ({ page }) => {
      await page.setViewportSize(size);
      await page.goto('/');
      if (lang === 'zh') await page.click('[data-act="lang"][data-lang="zh"]');
      await page.click('[data-act="credits"]');
      await expect(page.locator('#credits')).toHaveClass(/show/);
      // The lines fade in one after another: measure once the last is in place.
      await expect.poll(() => page.locator('#credits .c-close').evaluate((el) => getComputedStyle(el).opacity)).toBe('1');
      await expect.poll(() => page.locator('#credits .c-close').evaluate((el) => getComputedStyle(el).transform)).toMatch(/^(none|matrix\(1, 0, 0, 1, 0, 0\))$/);
      const at = `${size.width} ${lang}`;
      const f = await creditsFit(page);
      fits[at] = f;
      await page.screenshot({ path: `test-results/credits-fit-${size.width}-${lang}.png`, animations: 'disabled' });

      expect(f.lines.map((l) => l.cls.replace('c-line', '').trim())).toEqual(['c-org', 'c-cols', 'c-contact', 'c-close']);
      for (const [i, l] of f.lines.entries()) {
        expect(l.top, `${at}: line ${i + 1} starts above the window`).toBeGreaterThanOrEqual(0);
        expect(l.bottom, `${at}: line ${i + 1} ends ${l.bottom} px, the window ${f.height} px`).toBeLessThanOrEqual(f.height);
        expect(l.left, `${at}: line ${i + 1} starts left of the window`).toBeGreaterThanOrEqual(0);
        expect(l.right, `${at}: line ${i + 1} ends right of the window`).toBeLessThanOrEqual(f.width);
        if (i > 0) expect(l.top, `${at}: line ${i + 1} overlaps line ${i}`).toBeGreaterThanOrEqual(f.lines[i - 1].bottom);
      }
      // The team left of the rule, the faculty right of it, both columns starting on one row.
      expect(f.team.right, `${at}: the team column is not left of the faculty column`).toBeLessThanOrEqual(f.fac.left);
      expect(Math.abs(f.team.top - f.fac.top), `${at}: the two columns are not aligned at the top`).toBeLessThanOrEqual(1);
      expect([f.fac.ruleStyle, f.fac.ruleWidth], `${at}: no hairline rule between the columns`).toEqual(['solid', '1px']);
      for (const t of f.titles) {
        expect(t.lines, `${at}: "${t.text}" wraps onto ${t.lines} lines`).toBe(1);
        expect(t.box.right, `${at}: "${t.text}" ends right of the window`).toBeLessThanOrEqual(f.width);
      }
      // One type system: four labels alike in gold, five names alike in white, two titles alike.
      expect(f.labels).toHaveLength(4);
      expect(f.names.map((n) => n.text)).toEqual(['Dale Leung', 'Walfarid Hermawan Limbong', 'Htet Aung', 'Heng Boon Kui', 'Darryl Ng']);
      expect(new Set(f.labels.map((l) => `${l.px} ${l.weight} ${l.color}`)), `${at}: the labels differ`).toEqual(new Set([`${f.labels[0].px} 600 ${GOLD}`]));
      expect(new Set(f.names.map((n) => `${n.px} ${n.weight} ${n.color}`)), `${at}: the names differ`).toEqual(new Set([`${f.names[0].px} 500 ${WHITE}`]));
      expect(new Set(f.titleType.map((t) => `${t.px} ${t.weight}`)), `${at}: the titles differ`).toEqual(new Set([`${f.titleType[0].px} 400`]));
      if (size.width === 1366) {
        // On screen, as approved: the programme line 14 px, a label 12, a name 22, a title 14, the email 15, the close hint 13.
        expect([f.org.px, f.labels[0].px, f.names[0].px, f.titleType[0].px, f.mail.px, f.close.px], `${at}: on-screen sizes`).toEqual([14, 12, 22, 14, 15, 13]);
      }
      expect(f.sups, `${at}: a sup on the page`).toBe(0);
      expect(f.text, `${at}: an asterisk on the page`).not.toContain('*');
      expect(f.text).toContain('daleleung76@gmail.com');
    });
  }
}
