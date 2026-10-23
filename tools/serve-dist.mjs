#!/usr/bin/env node
// Serves the built bundle (dist/kiosk-web/browser) on 127.0.0.1 for T3's own Playwright
// checks of the production build. Static files, with the SPA fallback to index.html, and
// with --api, /api/ and /bff/ proxied to that target (the dev fixture server), as T1's
// static server proxies them to the edge gateway; /KIOSK_DEV_FIXTURE/ (the fixture pictures)
// goes there too, as in the dev proxy (proxy.conf.mjs). Not the kiosk's static server (that is
// T1's, kiosk/stack/).
//
// Usage: node tools/serve-dist.mjs --port 18310 [--api http://127.0.0.1:18301]
import { createServer, request } from 'node:http';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { extname, join, normalize, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', 'dist', 'kiosk-web', 'browser');
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.woff2': 'font/woff2',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
};

const arg = (name) => {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const port = Number(arg('--port'));
const api = arg('--api') ? new URL(arg('--api')) : null;
if (!port) {
  process.stderr.write('usage: serve-dist.mjs --port <port> [--api <target>]\n');
  process.exit(2);
}
if (api && api.hostname !== '127.0.0.1') {
  process.stderr.write(`[serve-dist] --api must be on 127.0.0.1, got ${api.hostname}\n`);
  process.exit(2);
}
if (!existsSync(join(ROOT, 'index.html'))) {
  process.stderr.write(`[serve-dist] no build at ${ROOT}; run npm run build first\n`);
  process.exit(2);
}

createServer((req, res) => {
  const url = new URL(req.url, 'http://serve-dist.invalid');
  if (/^\/(api|bff|KIOSK_DEV_FIXTURE)\//.test(url.pathname)) {
    if (!api) {
      res.writeHead(502, { 'content-type': 'text/plain' });
      res.end('[serve-dist] no --api target for this request\n');
      return;
    }
    const upstream = request(
      { host: api.hostname, port: api.port, method: req.method, path: req.url, headers: req.headers },
      (up) => {
        res.writeHead(up.statusCode ?? 502, up.headers);
        up.pipe(res);
      },
    );
    upstream.on('error', (err) => {
      res.writeHead(502, { 'content-type': 'text/plain' });
      res.end(`[serve-dist] upstream failed: ${err.message}\n`);
    });
    req.pipe(upstream);
    return;
  }
  const path = normalize(decodeURIComponent(url.pathname));
  let file = join(ROOT, path);
  if (!file.startsWith(ROOT) || !existsSync(file) || statSync(file).isDirectory()) file = join(ROOT, 'index.html');
  res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' });
  createReadStream(file).pipe(res);
}).listen(port, '127.0.0.1', () =>
  process.stderr.write(`[serve-dist] ${ROOT} on http://127.0.0.1:${port}${api ? `, /api and /bff to ${api.origin}` : ''}\n`),
);
