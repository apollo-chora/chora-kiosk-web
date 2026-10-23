#!/usr/bin/env node
// The dev-only fixture server (T3 brief: "Fakes stay out of the product").
//
// It serves recorded or mockup-derived JSON on 127.0.0.1 so kiosk-web runs before T1's
// stack is up; `ng serve` reaches it through the dev proxy (proxy.conf.mjs). It is never
// part of the production bundle: tools/gates/no-fixture-gate.mjs checks that.
//
// A fixture file (dev/fixtures/**/*.json):
//   { "fixture": "KIOSK_DEV_FIXTURE", "source": "<where its shape and values come from>",
//     "method": "GET", "path": "/api/...", "query": { "goal_id": "..." },   (query optional)
//     "status": 200, "body": { ... } }                                      (body optional for 204)
//   or, for a polled read, "sequence": [ { "status", "body" }, ... ] answered in turn, the
//   last step repeating;
//   or, for a picture, "file": "<path under the fixtures dir>" and "content_type" in place of a body.
// Optional:
//   "match_body": { "selected_option_id": "..." }  a POST, PUT or PATCH whose JSON body holds these
//       top-level values (an answer per chosen option);
//   "variants": [ { "after": ["^POST /api/.../accept$", ...], "status", "body" } ]  the read once
//       every regular expression names a request already answered 2xx (the map after an accept);
//       the last satisfied variant wins. Each 2xx answer is logged twice, "METHOD /path" and
//       "FIXTURE <file>" (its file under the fixtures dir), so "^FIXTURE world/answer-set\.x\.json$"
//       waits for one chosen option where several fixtures share a route (W69: the winning answer);
//   "patches": [ { "after": [...], "append": { "edges": [...] }, "assign": { "campaign.nodes": {...} } } ]
//       additions on top of the answer (its step or variant): EVERY patch whose requests were all
//       answered 2xx applies, in file order, appending items to the lists and keys to the objects its
//       dotted paths name, so several accepts show together (the links a LIVE press's rows add);
//       with "until": [...], a patch stops applying once ANY of those requests was answered 2xx (a
//       LIVE press's idea stays in the pending list until it is accepted or dismissed, W41);
//   "resets": true  answering it forgets every answered request and restarts every sequence, as
//       the conductor's reset restores the prepared start.
// An unknown route is a loud 404 in the gateway's error envelope, never an empty 200.
//
// Usage: node dev/fixture-server.mjs --port 18301 [--dir dev/fixtures]
import { createServer } from 'node:http';
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { join, relative, dirname, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const MARKER = 'KIOSK_DEV_FIXTURE';
const BODY_METHODS = new Set(['POST', 'PUT', 'PATCH']);

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) out.push(...walk(path));
    else if (name.endsWith('.json')) out.push(path);
  }
  return out;
}

export function loadFixtureRoutes(dir) {
  if (!existsSync(dir)) throw new Error(`[fixture-server] no fixtures directory ${dir}`);
  const files = walk(dir);
  if (files.length === 0) throw new Error(`[fixture-server] no fixture files in ${dir}`);
  const routes = [];
  const seen = new Map();
  for (const file of files) {
    // A portable file id: the fixtures' "after" regexes name it with "/" (as the generator writes
    // them), so Windows' "\" would never match.
    const rel = relative(dir, file).split(sep).join('/');
    const f = JSON.parse(readFileSync(file, 'utf8'));
    if (f.fixture !== MARKER) throw new Error(`[fixture-server] ${rel} lacks the "fixture": "${MARKER}" marker`);
    if (!f.method || !f.path) throw new Error(`[fixture-server] ${rel} needs a method and a path`);
    const method = f.method.toUpperCase();
    let picture = null;
    if (f.file !== undefined) {
      if (f.body !== undefined || f.sequence !== undefined) throw new Error(`[fixture-server] ${rel} has a file and a body`);
      if (!f.content_type) throw new Error(`[fixture-server] ${rel} serves a file with no content_type`);
      const path = join(dir, f.file);
      if (!existsSync(path)) throw new Error(`[fixture-server] ${rel} names ${f.file}, which is not there`);
      picture = { bytes: readFileSync(path), contentType: f.content_type };
    }
    const steps = f.sequence ?? [{ status: f.status, body: f.body }];
    if (steps.length === 0 || steps.some((s) => !Number.isInteger(s.status))) {
      throw new Error(`[fixture-server] ${rel} needs an integer status on every step`);
    }
    const variants = (f.variants ?? []).map((v, i) => {
      if (!Array.isArray(v.after) || v.after.length === 0) throw new Error(`[fixture-server] ${rel} variant ${i} names no "after" requests`);
      if (!Number.isInteger(v.status)) throw new Error(`[fixture-server] ${rel} variant ${i} needs an integer status`);
      const after = v.after.map((a) => {
        try {
          return new RegExp(a);
        } catch {
          throw new Error(`[fixture-server] ${rel} variant ${i}: ${a} is not a regular expression`);
        }
      });
      return { after, step: { status: v.status, body: v.body } };
    });
    const patches = (f.patches ?? []).map((p, i) => {
      if (!Array.isArray(p.after) || p.after.length === 0) throw new Error(`[fixture-server] ${rel} patch ${i} names no "after" requests`);
      const append = Object.entries(p.append ?? {});
      const assign = Object.entries(p.assign ?? {});
      if (append.length + assign.length === 0) throw new Error(`[fixture-server] ${rel} patch ${i} adds nothing`);
      for (const [path, items] of append) if (!Array.isArray(items)) throw new Error(`[fixture-server] ${rel} patch ${i}: ${path} must append a list`);
      for (const [path, keys] of assign) if (!isObject(keys)) throw new Error(`[fixture-server] ${rel} patch ${i}: ${path} must assign an object`);
      const regex = (a) => {
        try {
          return new RegExp(a);
        } catch {
          throw new Error(`[fixture-server] ${rel} patch ${i}: ${a} is not a regular expression`);
        }
      };
      if (p.until !== undefined && (!Array.isArray(p.until) || p.until.length === 0)) throw new Error(`[fixture-server] ${rel} patch ${i}: "until" must name requests`);
      return { index: i, after: p.after.map(regex), until: (p.until ?? []).map(regex), append, assign };
    });
    const matchBody = f.match_body ?? null;
    if (matchBody && !BODY_METHODS.has(method)) throw new Error(`[fixture-server] ${rel} has a match_body on a ${method}, which sends no body`);
    const query = f.query ?? {};
    const key = `${method} ${f.path} ${JSON.stringify(Object.entries(query).sort())} ${JSON.stringify(Object.entries(matchBody ?? {}).sort())}`;
    if (seen.has(key)) throw new Error(`[fixture-server] duplicate route ${f.method} ${f.path} in ${seen.get(key)} and ${rel}`);
    seen.set(key, rel);
    routes.push({ file: rel, method, path: f.path, query, matchBody, steps, variants, patches, resets: f.resets === true, picture, calls: 0 });
  }
  return routes;
}

function matches(route, method, url, body) {
  if (route.method !== method || route.path !== url.pathname) return false;
  if (!Object.entries(route.query).every(([k, v]) => url.searchParams.get(k) === v)) return false;
  if (!route.matchBody) return true;
  if (body === null || typeof body !== 'object') return false;
  return Object.entries(route.matchBody).every(([k, v]) => JSON.stringify(body[k]) === JSON.stringify(v));
}

function isObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

/** The node a dotted path names in a body, or a loud error naming the fixture and patch. */
function nodeAt(body, path, where) {
  let node = body;
  for (const part of path.split('.')) {
    if (!isObject(node) || !(part in node)) throw new Error(`${where}: the answer has no ${path}`);
    node = node[part];
  }
  return node;
}

/** The answer's body with every satisfied patch applied, in file order (a copy: the fixture is never changed). */
export function patched(route, body, satisfied) {
  const out = structuredClone(body);
  for (const p of route.patches) {
    if (!p.after.every((re) => satisfied(re)) || p.until.some((re) => satisfied(re))) continue;
    const where = `${route.file} patch ${p.index}`;
    for (const [path, items] of p.append) {
      const list = nodeAt(out, path, where);
      if (!Array.isArray(list)) throw new Error(`${where}: ${path} is not a list`);
      list.push(...structuredClone(items));
    }
    for (const [path, keys] of p.assign) {
      const obj = nodeAt(out, path, where);
      if (!isObject(obj)) throw new Error(`${where}: ${path} is not an object`);
      Object.assign(obj, structuredClone(keys));
    }
  }
  return out;
}

function specificity(route) {
  return Object.keys(route.query).length + Object.keys(route.matchBody ?? {}).length;
}

function parseJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export function createFixtureServer(routes, { log = (l) => process.stderr.write(l + '\n') } = {}) {
  // "METHOD /path" and "FIXTURE <file>" of every request answered 2xx since the start or the last reset.
  const answered = [];
  return createServer(async (req, res) => {
    const url = new URL(req.url, 'http://fixture.invalid');
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const body = BODY_METHODS.has(req.method) ? parseJson(Buffer.concat(chunks).toString('utf8')) : null;
    // The most specific match wins: a route naming more query or body values beats one naming fewer.
    const route = routes
      .filter((r) => matches(r, req.method, url, body))
      .sort((a, b) => specificity(b) - specificity(a))[0];
    if (!route) {
      const message = `no fixture for ${req.method} ${url.pathname}${url.search}`;
      log(`[fixture-server] ${message}`);
      res.writeHead(404, { 'content-type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error: { code: 'NOT_FOUND', message, correlation_id: 'fixture-server' } }));
      return;
    }
    const seen = (re) => answered.some((a) => re.test(a));
    const variant = route.variants.filter((v) => v.after.every(seen)).pop();
    const step = variant ? variant.step : route.steps[Math.min(route.calls, route.steps.length - 1)];
    let answer = step.body;
    if (route.patches.length > 0 && answer !== undefined) {
      try {
        answer = patched(route, answer, seen);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        log(`[fixture-server] ${message}`);
        res.writeHead(500, { 'content-type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ error: { code: 'FIXTURE_PATCH', message, correlation_id: 'fixture-server' } }));
        return;
      }
    }
    route.calls += 1;
    log(`[fixture-server] ${req.method} ${url.pathname}${url.search} -> ${step.status} (${route.file}${variant ? ', after ' + variant.after.map(String).join(' + ') : ''})`);
    if (route.resets) {
      answered.length = 0;
      for (const r of routes) r.calls = 0;
    } else if (step.status >= 200 && step.status < 300) {
      answered.push(`${req.method} ${url.pathname}`, `FIXTURE ${route.file}`);
    }
    if (route.picture) {
      res.writeHead(step.status, { 'content-type': route.picture.contentType });
      res.end(route.picture.bytes);
      return;
    }
    if (step.status === 204 || answer === undefined) {
      res.writeHead(step.status);
      res.end();
      return;
    }
    res.writeHead(step.status, { 'content-type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(answer));
  });
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  const pi = args.indexOf('--port');
  const di = args.indexOf('--dir');
  if (pi < 0) {
    process.stderr.write('usage: fixture-server.mjs --port <port> [--dir <fixtures dir>]\n');
    process.exit(2);
  }
  const port = Number(args[pi + 1]);
  const dir = di >= 0 ? args[di + 1] : join(dirname(fileURLToPath(import.meta.url)), 'fixtures');
  const routes = loadFixtureRoutes(dir);
  createFixtureServer(routes).listen(port, '127.0.0.1', () => {
    process.stderr.write(`[fixture-server] DEV FIXTURES on http://127.0.0.1:${port}, ${routes.length} route(s) from ${dir}\n`);
  });
}
