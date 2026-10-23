// W20 (K158): render each paper's A4 HTML page (make_papers.py) to a PNG picture, as a scanned page would look.
// Usage: node render.mjs <dir with paper-*.html>   (writes paper-*.png beside each page)
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';

const require = createRequire(new URL('../../../kiosk-web/package.json', import.meta.url));
const { chromium } = require('playwright-core');

const dir = process.argv[2];
if (!dir) throw new Error('usage: node render.mjs <dir>');
const pages = fs.readdirSync(dir).filter((f) => /^paper-.*\.html$/.test(f)).sort();
if (!pages.length) throw new Error(`no paper-*.html in ${dir}`);
const browser = await chromium.launch();
try {
  const ctx = await browser.newContext({ viewport: { width: 794, height: 1123 }, deviceScaleFactor: 1.5 });
  const page = await ctx.newPage();
  for (const f of pages) {
    await page.goto('file://' + path.resolve(dir, f));
    await page.evaluate(() => document.fonts.ready);
    const overflow = await page.evaluate(() => {
      const p = document.querySelector('.page');
      const last = [...document.querySelectorAll('li, .essay')].pop(); // a marked test's last question, or the essay (W90)
      const foot = document.querySelector('.foot');
      return { pageH: p.scrollHeight, lastBottom: Math.round(last.getBoundingClientRect().bottom), footTop: Math.round(foot.getBoundingClientRect().top) };
    });
    if (overflow.pageH > 1123 || overflow.lastBottom > overflow.footTop) throw new Error(`${f} does not fit one page: ${JSON.stringify(overflow)}`);
    const out = path.resolve(dir, f.replace(/\.html$/, '.png'));
    await page.screenshot({ path: out, fullPage: false });
    console.log(out, JSON.stringify(overflow), fs.statSync(out).size, 'bytes');
  }
} finally {
  await browser.close();
}
