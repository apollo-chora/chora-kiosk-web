#!/usr/bin/env node
// The offline gate (T3.1): the production bundle names no external URL, so the kiosk
// loads nothing from the internet (fonts, icons and scripts are all bundled).
//
// Usage: node tools/gates/offline-gate.mjs <bundle dir>
// Exit 0: no external URL. Exit 1: the URLs found, one per line with their file.
// Exit 2: the bundle is missing or empty (never a pass).
//
// Every file is scanned as text, binaries included, because a URL in any file can be
// fetched by something. The exemptions are strings that are never fetched, each matched
// exactly, so any other URL (even on the same host) still fails.
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { join, relative } from 'node:path';
import { pathToFileURL } from 'node:url';

const EXEMPT = new Set([
  // XML namespace identifiers: compared as strings by the DOM, never fetched.
  'http://www.w3.org/2000/svg',
  'http://www.w3.org/1999/xlink',
  'http://www.w3.org/1999/xhtml',
  'http://www.w3.org/XML/1998/namespace',
  'http://www.w3.org/2000/xmlns/',
  'http://www.w3.org/1998/Math/MathML',
  // @angular/core's XSS_SECURITY_URL constant, interpolated into its own error messages.
  // It is in every Angular bundle and only ever printed, never fetched.
  'https://angular.dev/best-practices/security#preventing-cross-site-scripting-xss',
]);

// An absolute URL with a scheme that reaches a network, or a protocol-relative one
// (`//host/...`) in a place a browser resolves it (a CSS url(), a src or href attribute,
// a string literal).
const ABSOLUTE = /\b(?:https?|wss?|ftp):\/\/[^\s"'`()<>\\]+/gi;
const PROTOCOL_RELATIVE = /(?:url\(\s*["']?|(?:src|href)\s*=\s*["']?|["'`])(\/\/[a-z0-9.-]+\.[a-z]{2,}[^\s"'`()<>\\]*)/gi;

export function findExternalUrls(text) {
  const found = [];
  for (const m of text.matchAll(ABSOLUTE)) {
    const url = m[0];
    if (!EXEMPT.has(url)) found.push(url);
  }
  for (const m of text.matchAll(PROTOCOL_RELATIVE)) {
    found.push(m[1]);
  }
  return found;
}

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) out.push(...walk(path));
    else out.push(path);
  }
  return out;
}

export function scanBundle(dir) {
  if (!existsSync(dir) || !statSync(dir).isDirectory()) {
    throw new Error(`offline gate: bundle directory ${dir} does not exist`);
  }
  if (!existsSync(join(dir, 'index.html'))) {
    throw new Error(`offline gate: no index.html in ${dir}; build first`);
  }
  const files = walk(dir);
  const hits = [];
  for (const file of files) {
    const text = readFileSync(file).toString('latin1');
    for (const url of findExternalUrls(text)) hits.push({ file: relative(dir, file), url });
  }
  return { files: files.length, hits };
}

function main(argv) {
  const dir = argv[2];
  if (!dir) {
    process.stderr.write('usage: offline-gate.mjs <bundle dir>\n');
    return 2;
  }
  let result;
  try {
    result = scanBundle(dir);
  } catch (err) {
    process.stderr.write(`${err.message}\n`);
    return 2;
  }
  if (result.hits.length > 0) {
    process.stdout.write(`offline gate: FAIL, ${result.hits.length} external URL(s) in ${result.files} files\n`);
    for (const h of result.hits) process.stdout.write(`  ${h.file}: ${h.url}\n`);
    return 1;
  }
  process.stdout.write(`offline gate: PASS, no external URL in ${result.files} files\n`);
  return 0;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exit(main(process.argv));
}
