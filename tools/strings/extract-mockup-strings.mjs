#!/usr/bin/env node
// T3.2: the kiosk's interface strings, ported from the approved mockup's tables.
//
// The mockup's string tables are built by its own script (STR, then later additions), so
// this tool loads the mockup in headless Chromium and reads the live STR, PSTR (the
// presenter panel) and CONTENT_KEYS. It then:
//   - drops the content keys: content is English in every language (K41) and comes from
//     the APIs, never from a string table (no demo content in the code);
//   - names the presenter's strings `presenter.<key>`;
//   - names the talking points (TALK) `talk.<key>`;
//   - applies the rulings made after the mockup (tools/strings/rulings.json `overrides`), and
//     adds the keys the build needs that the mockup never had (`additions`, each with its source),
//     and drops the ones a ruling retired (`retired`);
//   - converts the mockup's {name} placeholders to ngx-translate's {{name}}.
// and writes src/app/i18n/en.json and zh.json. With --check it writes nothing and exits 1
// if the committed tables differ from what it would write.
//
// Usage: node tools/strings/extract-mockup-strings.mjs [--check]
import { chromium } from '@playwright/test';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..');
const MOCKUP = join(ROOT, '..', 'docs', 'design', 'kiosk', 'apollo-kiosk-mockup.html');
const OUT = { en: join(ROOT, 'src', 'app', 'i18n', 'en.json'), zh: join(ROOT, 'src', 'app', 'i18n', 'zh.json') };
const LANGS = ['en', 'zh'];

const toNgx = (s) => s.replace(/\{([a-zA-Z0-9_]+)\}/g, '{{$1}}');

async function readMockup() {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    await page.goto('file://' + MOCKUP);
    if (errors.length) throw new Error(`the mockup threw while loading: ${errors.join('; ')}`);
    return await page.evaluate(() => ({ STR, PSTR, CONTENT_KEYS, TALK }));
  } finally {
    await browser.close();
  }
}

export function buildTables({ STR, PSTR, CONTENT_KEYS, TALK = {} }, rulings) {
  const content = new Set(CONTENT_KEYS);
  const tables = { en: {}, zh: {} };
  for (const lang of LANGS) {
    for (const [key, value] of Object.entries(STR[lang])) {
      if (content.has(key)) continue;
      tables[lang][key] = value;
    }
    for (const [key, value] of Object.entries(PSTR[lang])) tables[lang][`presenter.${key}`] = value;
    for (const [key, value] of Object.entries(TALK)) tables[lang][`talk.${key}`] = value[lang];
  }
  for (const [key, o] of Object.entries(rulings.overrides)) {
    for (const lang of LANGS) {
      if (!(key in tables[lang])) throw new Error(`ruling ${o.ruling} overrides ${key}, which the mockup's ${lang} table lacks`);
      tables[lang][key] = o[lang];
    }
  }
  for (const [key, ruling] of Object.entries(rulings.retired ?? {})) {
    for (const lang of LANGS) {
      if (!(key in tables[lang])) throw new Error(`ruling ${ruling} retires ${key}, which the mockup's ${lang} table lacks`);
      delete tables[lang][key];
    }
  }
  for (const [key, a] of Object.entries(rulings.additions ?? {})) {
    if (!a.source) throw new Error(`addition ${key} names no source`);
    for (const lang of LANGS) {
      if (key in tables[lang]) throw new Error(`addition ${key} is already in the mockup`);
      tables[lang][key] = a[lang];
    }
  }
  for (const lang of LANGS) for (const key of Object.keys(tables[lang])) tables[lang][key] = toNgx(tables[lang][key]);
  return tables;
}

async function main() {
  const check = process.argv.includes('--check');
  const rulings = JSON.parse(readFileSync(join(HERE, 'rulings.json'), 'utf8'));
  const tables = buildTables(await readMockup(), rulings);
  let differs = false;
  for (const lang of LANGS) {
    const text = JSON.stringify(tables[lang], null, 2) + '\n';
    if (check) {
      let committed = '';
      try {
        committed = readFileSync(OUT[lang], 'utf8');
      } catch {
        committed = '';
      }
      if (committed !== text) {
        differs = true;
        process.stdout.write(`strings: ${OUT[lang]} differs from the mockup plus rulings\n`);
      }
    } else {
      writeFileSync(OUT[lang], text);
    }
    process.stdout.write(`strings: ${lang} ${Object.keys(tables[lang]).length} keys\n`);
  }
  if (check) {
    process.stdout.write(differs ? 'strings: CHECK FAIL\n' : 'strings: CHECK PASS\n');
    process.exit(differs ? 1 : 0);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    process.stderr.write(`strings: FAIL, ${err.message}\n`);
    process.exit(2);
  });
}
