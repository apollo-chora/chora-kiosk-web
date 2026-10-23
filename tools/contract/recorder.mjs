// The contract recorder (W68, T3.3): records, read only, the answers kiosk-web's API clients read,
// from the running kiosk stack through its edge, into one JSON file per read. The clients' contract
// specs (src/app/contract/) replay those files through the real clients.
//
// What it calls, and nothing else: one POST /api/v1/kiosk/session (the kiosk session, the same mint
// kiosk-web makes; it signs a token and stores nothing), then GETs only, one at a time, each with
// that session: readiness first, which must show the prepared start untouched (no demo session since
// the last reset, the snapshot marker matching), then the golden run's manifest, then every route of
// the plan (src/app/contract/plan.json) expanded over the manifest's world keys and prepared choices.
// A route on the plan's never list (the dose read credits EXP) is refused before anything is called.
//
// Secrets: the token lives in memory only; no header is recorded; every answer is scanned before
// anything is written, and one finding (the token, any JWT, a bearer, a signed URL, a Google key,
// a credential field) refuses the whole recording, naming where and never the value.
import { existsSync, mkdirSync, readdirSync, renameSync, rmdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

export const DEFAULT_BASE = 'http://127.0.0.1:18080';
export const PLAN_FORMAT = 'chora-kiosk/contract-plan/v1';
export const RECORDING_FORMAT = 'chora-kiosk/contract-recording/v1';
const MANIFEST_FORMAT = 'chora-kiosk/prewarm-manifest/v1';
const MINT_PATH = '/api/v1/kiosk/session';
const FIRST_ROUTES = ['kiosk.readiness', 'kiosk.manifest'];
const READ_TIMEOUT_MS = 30_000;

/** The edge the recorder may call: plain http on loopback with a port, nothing after it. */
export function checkBase(base) {
  let u;
  try {
    u = new URL(base);
  } catch {
    throw new Error(`[contract] ${base} is not a URL: the recorder reads only a loopback edge (the kiosk's is ${DEFAULT_BASE})`);
  }
  const loopback = u.hostname === '127.0.0.1' || u.hostname === 'localhost';
  if (u.protocol !== 'http:' || !loopback || !u.port || u.username || u.password || u.pathname !== '/' || u.search || u.hash) {
    throw new Error(`[contract] ${base}: the recorder reads only plain http on loopback with a port (the kiosk edge is ${DEFAULT_BASE})`);
  }
  return `http://${u.hostname}:${u.port}`;
}

/** The plan's rules: GET routes only, each id once, none on the never list, readiness and the manifest first. */
export function validatePlan(plan) {
  if (plan?.format !== PLAN_FORMAT) throw new Error(`[contract] the plan's format is ${String(plan?.format)}, not ${PLAN_FORMAT}`);
  if (!Array.isArray(plan.routes) || plan.routes.length === 0) throw new Error('[contract] the plan lists no routes');
  const never = Array.isArray(plan.never) ? plan.never : [];
  for (const n of never) {
    if (typeof n?.path !== 'string' || typeof n?.why !== 'string' || !n.why) throw new Error(`[contract] a never entry needs a path pattern and a why: ${JSON.stringify(n)}`);
  }
  const seen = new Map();
  const guard = (g) => g && typeof g.field === 'string' && g.field && g.equals !== undefined && typeof g.why === 'string' && g.why;
  for (const r of plan.routes) {
    const id = r?.id;
    if (typeof id !== 'string' || !/^[a-z][a-z0-9.-]*$/.test(id)) throw new Error(`[contract] a route id is lower case letters, digits, dots and hyphens: ${JSON.stringify(id)}`);
    if (seen.has(id)) throw new Error(`[contract] ${id}: listed twice`);
    seen.set(id, r);
    if (r.method !== undefined && r.method !== 'GET') throw new Error(`[contract] ${id}: only GET routes are recorded (this one is ${r.method})`);
    if (typeof r.path !== 'string' || !r.path.startsWith('/api/')) throw new Error(`[contract] ${id}: a path starts with /api/ (${JSON.stringify(r.path)})`);
    for (const n of never) {
      if (new RegExp(n.path).test(r.path)) throw new Error(`[contract] ${id}: ${r.path} is never recorded: ${n.why}`);
    }
    if (r.each !== undefined) {
      const keys = Object.keys(r.each ?? {});
      const ok = keys.length === 1 && (typeof r.each.world === 'string' || typeof r.each.kind === 'string') && r.each[keys[0]];
      if (!ok) throw new Error(`[contract] ${id}: each names a world prefix or a manifest kind, one of them`);
    } else if (/\{[^}]+\}/.test(r.path) || Object.values(r.query ?? {}).some((v) => /\{[^}]+\}/.test(String(v)))) {
      throw new Error(`[contract] ${id}: a route with placeholders needs an each`);
    }
    if (r.query !== undefined && (typeof r.query !== 'object' || Array.isArray(r.query))) throw new Error(`[contract] ${id}: query is an object of names to values`);
    if (r.expect !== undefined && !guard(r.expect)) throw new Error(`[contract] ${id}: expect names a field, the value it equals and why`);
    if (r.requires !== undefined) {
      if (!guard(r.requires) || typeof r.requires.route !== 'string') throw new Error(`[contract] ${id}: requires names a route, a field, the value it equals and why`);
      const before = r.requires.route === id ? undefined : seen.get(r.requires.route);
      if (!before) throw new Error(`[contract] ${id}: requires ${r.requires.route}, which is not an earlier route`);
      if (JSON.stringify(before.each ?? null) !== JSON.stringify(r.each ?? null)) throw new Error(`[contract] ${id}: requires ${r.requires.route}, which is read over another each`);
    }
  }
  if (plan.routes[0].id !== FIRST_ROUTES[0] || plan.routes[1]?.id !== FIRST_ROUTES[1]) {
    throw new Error(`[contract] the first two routes are ${FIRST_ROUTES.join(' and ')}: the run checks them before any other read`);
  }
  return plan;
}

function neverWhy(plan, path) {
  for (const n of plan.never ?? []) if (new RegExp(n.path).test(path)) return n.why;
  return null;
}

function fill(template, values, where) {
  return template.replace(/\{([^}]+)\}/g, (_, name) => {
    const v = values(name);
    if (v === undefined || v === null || v === '') throw new Error(`[contract] ${where(name)}`);
    return encodeURIComponent(String(v));
  });
}

/** Every planned read, concrete: one per world key or prepared choice, ids encoded, one read per distinct URL of a route. */
export function expandPlan(plan, manifest) {
  const world = manifest?.world ?? {};
  const choices = manifest?.choices ?? {};
  const out = [];
  const byUrl = new Map();
  for (const r of plan.routes) {
    let items;
    if (r.each?.world !== undefined) {
      items = Object.keys(world)
        .filter((k) => k.startsWith(r.each.world))
        .map((k) => ({ key: k, value: (name) => (name === 'id' ? world[k] : undefined), missing: (name) => `${r.id}: ${k} names a world id, so its path takes {id}, not {${name}}` }));
      if (items.length === 0) throw new Error(`[contract] ${r.id}: the manifest has no world key ${r.each.world}*`);
    } else if (r.each?.kind !== undefined) {
      items = Object.entries(choices)
        .filter(([, c]) => c?.kind === r.each.kind)
        .map(([k, c]) => ({ key: k, value: (name) => c.records?.[name], missing: (name) => `${r.id}: ${k} has no records.${name}` }));
      if (items.length === 0) throw new Error(`[contract] ${r.id}: the manifest has no ${r.each.kind} choice`);
    } else {
      items = [{ key: null, value: () => undefined, missing: (name) => `${r.id}: no value for {${name}}` }];
    }
    for (const it of items) {
      const path = fill(r.path, it.value, it.missing);
      const query = Object.entries(r.query ?? {}).map(([k, v]) => `${encodeURIComponent(k)}=${fill(String(v), it.value, it.missing)}`);
      const url = query.length ? `${path}?${query.join('&')}` : path;
      const known = byUrl.get(`${r.id} ${url}`);
      if (known) {
        known.keys.push(it.key);
        continue;
      }
      const read = { route: r.id, key: it.key, keys: it.key === null ? [] : [it.key], path: r.path, url };
      byUrl.set(`${r.id} ${url}`, read);
      out.push(read);
    }
  }
  return out;
}

const CREDENTIAL_NAMES = new Set([
  'access_token', 'refresh_token', 'id_token', 'token', 'bearer', 'authorization', 'secret', 'client_secret',
  'password', 'passwd', 'api_key', 'apikey', 'credential', 'credentials', 'private_key',
]);
const PATTERNS = [
  ['a JWT', /\beyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}/],
  ['a bearer credential', /\bBearer\s+[A-Za-z0-9._~+/-]{16,}/],
  ['a signed URL', /[?&](x-goog-signature|x-goog-credential|x-amz-signature|x-amz-credential|signature|sig|token|access_token|key)=/i],
  ['a Google API key', /AIza[0-9A-Za-z_-]{35}/],
  ['a private key', /-----BEGIN [A-Z ]*PRIVATE KEY-----/],
];

function stringKind(s, token, tokenTail) {
  if (token && (s.includes(token) || (tokenTail && s.includes(tokenTail)))) return 'the session token';
  for (const [kind, re] of PATTERNS) if (re.test(s)) return kind;
  return null;
}

const snake = (k) => k.replace(/([a-z0-9])([A-Z])/g, '$1_$2').replace(/-/g, '_').toLowerCase();
const step = (at, k) => (/^[A-Za-z_$][\w$]*$/.test(k) ? `${at}.${k}` : `${at}[${JSON.stringify(k)}]`);

/** Every place a secret could sit in a JSON value: its path and kind, never the value itself. */
export function findSecrets(value, token) {
  const tail = typeof token === 'string' && token.split('.').length === 3 ? token.split('.')[2] : null;
  const tokenTail = tail && tail.length >= 16 ? tail : null;
  const found = [];
  const walk = (v, at) => {
    if (typeof v === 'string') {
      const kind = stringKind(v, token, tokenTail);
      if (kind) found.push({ at, kind });
      return;
    }
    if (Array.isArray(v)) {
      v.forEach((x, i) => walk(x, `${at}[${i}]`));
      return;
    }
    if (v && typeof v === 'object') {
      for (const [k, x] of Object.entries(v)) {
        const keyKind = stringKind(k, token, tokenTail);
        if (keyKind) {
          found.push({ at: `${at} (a key)`, kind: keyKind });
          continue;
        }
        const here = step(at, k);
        if (typeof x === 'string' && x !== '' && CREDENTIAL_NAMES.has(snake(k)) && !stringKind(x, token, tokenTail)) {
          found.push({ at: here, kind: 'a credential field' });
          continue;
        }
        walk(x, here);
      }
    }
  };
  walk(value, '$');
  return found;
}

async function call(fetchImpl, method, url, headers, body) {
  let res;
  try {
    res = await fetchImpl(url, { method, headers, body, redirect: 'error', signal: AbortSignal.timeout(READ_TIMEOUT_MS) });
  } catch (err) {
    throw new Error(`${method} ${new URL(url).pathname} could not be sent: ${err?.name ?? 'Error'} ${err?.message ?? ''}`.trim());
  }
  const text = await res.text();
  return { status: res.status, type: res.headers.get('content-type') ?? '', text };
}

function parseJson(text, what) {
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`[contract] ${what} answered a body that is not JSON`);
  }
}

/**
 * The run: the mint, readiness (refusing anything but the untouched prepared start), the manifest,
 * then every planned read in order, one at a time. Returns the recordings in memory, the session's
 * identity (never its token in a printable field) and the token, for the secret scan only.
 */
export async function recordStack({ base, plan, fetchImpl = fetch, now = () => new Date(), log = () => {} }) {
  const edge = checkBase(base);
  validatePlan(plan);

  const minted = await call(fetchImpl, 'POST', `${edge}${MINT_PATH}`, { 'content-type': 'application/json', accept: 'application/json' }, '{}');
  if (minted.status < 200 || minted.status > 299) throw new Error(`[contract] the kiosk session could not be minted: POST ${MINT_PATH} answered ${minted.status}`);
  const m = parseJson(minted.text, `POST ${MINT_PATH}`);
  if (m?.token_type !== 'Bearer' || typeof m?.access_token !== 'string' || !m.access_token) {
    throw new Error(`[contract] the kiosk session answer is not a bearer token (${String(m?.token_type)})`);
  }
  if (!(m.expires_in > 0) || typeof m.gcid !== 'string' || !m.gcid) throw new Error('[contract] the kiosk session answer has no lifetime or no gcid');
  const token = m.access_token;
  const session = { gcid: m.gcid, tenant_id: m.tenant_id, roles: m.roles, expires_in: m.expires_in };
  log(`session: gcid ${session.gcid}, roles ${(session.roles ?? []).join(' ')}, expires in ${session.expires_in} s`);

  const answers = [];
  const routes = new Map(plan.routes.map((x) => [x.id, x]));
  const said = (v) => JSON.stringify(v);
  const read = async (r) => {
    const why = neverWhy(plan, r.url.split('?')[0]);
    if (why) throw new Error(`[contract] ${r.route}: ${r.url} is never recorded: ${why}`);
    const def = routes.get(r.route);
    const label = r.key === null ? r.route : `${r.route} ${r.key}`;
    if (def?.requires) {
      const q = def.requires;
      const prior = answers.find((a) => a.route === q.route && (a.key === r.key || a.keys.includes(r.key)));
      const v = prior?.body?.[q.field];
      if (!prior || v !== q.equals) {
        throw new Error(`[contract] ${label}: refused before the call: ${q.route} ${r.key} ${prior ? `answered ${q.field} ${said(v)}` : 'was not read'}, not ${said(q.equals)}: ${q.why}; stopped, nothing written`);
      }
    }
    const res = await call(fetchImpl, 'GET', `${edge}${r.url}`, { authorization: `Bearer ${token}`, accept: 'application/json' });
    const name = label;
    if (res.status < 200 || res.status > 299) throw new Error(`[contract] ${name}: GET ${r.url} answered ${res.status}`);
    if (!/^application\/json\b/i.test(res.type)) throw new Error(`[contract] ${name}: GET ${r.url} answered ${res.type || 'no content type'}, not JSON`);
    const body = parseJson(res.text, `${name}: GET ${r.url}`);
    log(`GET ${r.url} ${res.status} ${Buffer.byteLength(res.text)} B`);
    answers.push({ ...r, status: res.status, at: now().toISOString(), body });
    if (def?.expect && body?.[def.expect.field] !== def.expect.equals) {
      throw new Error(`[contract] ${label}: ${def.expect.field} is ${said(body?.[def.expect.field])}, not ${said(def.expect.equals)}: ${def.expect.why}; stopped, nothing written`);
    }
    return body;
  };

  const [readinessRead, manifestRead] = expandPlan({ ...plan, routes: plan.routes.slice(0, 2) }, {});
  const board = await read(readinessRead);
  if (board?.overall !== 'ready' && board?.overall !== 'degraded') {
    throw new Error(`[contract] readiness: overall is ${String(board?.overall)}, not ready or degraded; record on the prepared start only`);
  }
  if (board?.snapshot?.marker !== 'match') throw new Error(`[contract] readiness: the snapshot marker is ${String(board?.snapshot?.marker)}, not match`);
  if (board?.session_started_since_reset !== false) {
    throw new Error('[contract] readiness: a demo session has started since the last reset (session_started_since_reset); reset first, so the recording reads the prepared start');
  }
  const manifest = await read(manifestRead);
  if (manifest?.format !== MANIFEST_FORMAT) throw new Error(`[contract] the manifest's format is ${String(manifest?.format)}, not ${MANIFEST_FORMAT}`);

  for (const r of expandPlan(plan, manifest).slice(2)) await read(r);

  const recordings = answers.map((a) => ({
    contract: RECORDING_FORMAT,
    route: a.route,
    key: a.key,
    keys: a.keys,
    method: 'GET',
    path: a.path,
    url: a.url,
    recorded_at: a.at,
    edge,
    manifest_commit: manifest.commit ?? null,
    prepared_at: board.snapshot.prepared_at ?? null,
    status: a.status,
    body: a.body,
  }));
  return { recordings, session, token };
}

/** One file per recording into an empty folder, only after every recording passed the secret scan. */
export function writeRecordings(dir, recordings, token) {
  if (existsSync(dir) && readdirSync(dir).length > 0) throw new Error(`[contract] ${dir} is not empty: a re-recording starts from an empty folder`);
  const findings = [];
  const files = new Map();
  for (const rec of recordings) {
    const name = rec.key === null ? rec.route : `${rec.route} ${rec.key}`;
    if (rec.contract !== RECORDING_FORMAT || rec.method !== 'GET' || !(rec.status >= 200 && rec.status <= 299)) {
      throw new Error(`[contract] ${name}: not a recorded GET answer`);
    }
    for (const f of findSecrets(rec, token)) findings.push(`${name}: ${f.at} holds ${f.kind}`);
    const file = `${rec.key === null ? rec.route : `${rec.route}.${rec.key}`}.json`;
    if (!/^[A-Za-z0-9._-]+\.json$/.test(file)) throw new Error(`[contract] ${name}: ${JSON.stringify(file)} is not a plain file name`);
    if (files.has(file)) throw new Error(`[contract] ${name}: two recordings would share ${file}`);
    files.set(file, rec);
  }
  if (findings.length > 0) throw new Error(`[contract] refused, nothing written:\n${findings.join('\n')}`);
  const staging = join(dirname(dir), `.${Date.now()}-${process.pid}.contract-writing`);
  mkdirSync(staging, { recursive: true });
  for (const [file, rec] of files) writeFileSync(join(staging, file), `${JSON.stringify(rec, null, 2)}\n`);
  if (existsSync(dir)) rmdirSync(dir);
  renameSync(staging, dir);
  return [...files.keys()].sort().map((f) => join(dir, f));
}
