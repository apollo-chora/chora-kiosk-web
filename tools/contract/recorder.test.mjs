// Tests for the contract recorder (W68, T3.3): it records, read only, the product and kiosk reads
// kiosk-web's API clients make, from the running stack through the kiosk edge, so the clients'
// contract specs replay real answers instead of shapes built from the clients' own reading.
// Every test here runs against an in-process fake edge on 127.0.0.1 (port 0): none calls the stack.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtempSync, readFileSync, readdirSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import {
  DEFAULT_BASE,
  checkBase,
  expandPlan,
  findSecrets,
  recordStack,
  validatePlan,
  writeRecordings,
} from './recorder.mjs';

const CLI = fileURLToPath(new URL('./record.mjs', import.meta.url));
const REAL_PLAN = fileURLToPath(new URL('../../src/app/contract/plan.json', import.meta.url));

// A token shaped like the conductor's HS256 JWT, so the JWT pattern would also find it.
const TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIwMWExIiwicm9sZXMiOlsibGVhcm5lciJdfQ.c2lnbmF0dXJlLW9mLXRoZS1raW9zay1zaWduZXI';

const MANIFEST = {
  format: 'chora-kiosk/prewarm-manifest/v1',
  made_at: '2026-10-22T02:30:00Z',
  commit: 'af2462e49',
  world: { 'goal.water': 'g-water', 'goal.hawker': 'g-hawker', 'companion.pingu': 'c-pingu' },
  choices: {
    'set.water.res.r6': { kind: 'practice_set', records: { goal_id: 'g-water', concept_id: 'k-res', rung: 6 } },
    'set.hawker.kopi.r4': { kind: 'practice_set', records: { goal_id: 'g-hawker', concept_id: 'k-kopi', rung: 4 } },
    'greet.pingu': { kind: 'greeting', records: { companion_id: 'c-pingu', turn_id: 't-1' } },
  },
};

const PLAN = {
  format: 'chora-kiosk/contract-plan/v1',
  routes: [
    { id: 'kiosk.readiness', path: '/api/v1/kiosk/readiness' },
    { id: 'kiosk.manifest', path: '/api/v1/kiosk/prewarm/manifest' },
    { id: 'maps.list', path: '/api/v1/me/maps' },
    { id: 'maps.graph', path: '/api/v1/me/maps/{id}/graph', each: { world: 'goal.' } },
    {
      id: 'campaign.serve',
      path: '/api/v1/me/goals/{goal_id}/campaign/questions',
      query: { concept_id: '{concept_id}', rung: '{rung}' },
      each: { kind: 'practice_set' },
    },
  ],
  never: [{ path: '^/api/companion/daily-dose(/|$)', why: 'its first open of a day credits EXP and the streak' }],
};

const READY = {
  overall: 'ready',
  session_started_since_reset: false,
  snapshot: { state: 'ok', prepared_at: '2026-10-22T02:40:00Z', marker: 'match' },
};

/** A fake kiosk edge: the mint, readiness, the manifest and any GET in `reads` (a body, or {httpStatus, body}); it logs every request. */
async function fakeEdge({ readiness = READY, reads = {}, mint = null } = {}) {
  const log = [];
  let inFlight = 0;
  let maxInFlight = 0;
  const server = createServer((req, res) => {
    inFlight += 1;
    maxInFlight = Math.max(maxInFlight, inFlight);
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      log.push({ method: req.method, url: req.url, auth: req.headers.authorization ?? null, body: Buffer.concat(chunks).toString('utf8') });
      const send = (status, body) =>
        setTimeout(() => {
          inFlight -= 1;
          res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify(body));
        }, 5);
      if (req.method === 'POST' && req.url === '/api/v1/kiosk/session') {
        return send(200, mint ?? { access_token: TOKEN, token_type: 'Bearer', expires_in: 3600, gcid: 'gcid-1', tenant_id: 'tenant-1', roles: ['learner', 'author', 'instructor', 'auditor'] });
      }
      if (req.headers.authorization !== `Bearer ${TOKEN}`) return send(401, { error: { code: 'UNAUTHENTICATED' } });
      if (req.method === 'GET' && req.url === '/api/v1/kiosk/readiness') return send(200, readiness);
      if (req.method === 'GET' && req.url === '/api/v1/kiosk/prewarm/manifest') return send(200, MANIFEST);
      if (req.method === 'GET' && req.url in reads) {
        const r = reads[req.url];
        return 'httpStatus' in r ? send(r.httpStatus, r.body) : send(200, r);
      }
      return send(404, { error: { code: 'NOT_FOUND' } });
    });
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  return { base, log, maxInFlight: () => maxInFlight, close: () => new Promise((resolve) => server.close(resolve)) };
}

const GOOD_READS = {
  '/api/v1/me/maps': { maps: [{ goalId: 'g-water' }] },
  '/api/v1/me/maps/g-water/graph': { goalId: 'g-water', concepts: [] },
  '/api/v1/me/maps/g-hawker/graph': { goalId: 'g-hawker', concepts: [] },
  '/api/v1/me/goals/g-water/campaign/questions?concept_id=k-res&rung=6': { status: 'ready', next_page_token: 'page-2' },
  '/api/v1/me/goals/g-hawker/campaign/questions?concept_id=k-kopi&rung=4': { status: 'ready' },
};

const tmp = (prefix) => mkdtempSync(join(tmpdir(), `kiosk-contract-${prefix}-`));
const filesIn = (dir) => (existsSync(dir) ? readdirSync(dir).sort() : []);
const textOf = (dir) => filesIn(dir).map((f) => readFileSync(join(dir, f), 'utf8')).join('\n');

function runCli(args) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [CLI, ...args], { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => (stdout += d));
    child.stderr.on('data', (d) => (stderr += d));
    child.on('close', (status) => resolve({ status, stdout, stderr }));
  });
}

// ---- the edge it may call ----

test('the default edge is the kiosk edge on loopback, port 18080', () => {
  assert.equal(DEFAULT_BASE, 'http://127.0.0.1:18080');
  assert.equal(checkBase(DEFAULT_BASE), 'http://127.0.0.1:18080');
});

test('refuses any edge that is not plain http on loopback', () => {
  for (const base of ['https://127.0.0.1:18080', 'http://10.0.0.5:18080', 'http://chora.site', 'http://127.0.0.1:18080/api', 'http://user@127.0.0.1:18080', 'http://127.0.0.1']) {
    assert.throws(() => checkBase(base), /loopback/, base);
  }
  assert.equal(checkBase('http://localhost:18301/'), 'http://localhost:18301');
});

// ---- the plan ----

test('the plan holds GET routes only, each id once, none on the never list', () => {
  assert.doesNotThrow(() => validatePlan(PLAN));
  assert.throws(() => validatePlan({ ...PLAN, routes: [...PLAN.routes, { id: 'x', method: 'POST', path: '/api/v1/kiosk/reset' }] }), /x: only GET/);
  assert.throws(() => validatePlan({ ...PLAN, routes: [...PLAN.routes, { id: 'maps.list', path: '/api/v1/me/maps' }] }), /maps\.list: listed twice/);
  assert.throws(
    () => validatePlan({ ...PLAN, routes: [...PLAN.routes, { id: 'dose', path: '/api/companion/daily-dose', query: { goal_id: '{goal_id}' }, each: { kind: 'dose_open' } }] }),
    /dose: \/api\/companion\/daily-dose is never recorded: its first open of a day credits EXP and the streak/,
  );
  assert.throws(() => validatePlan({ ...PLAN, routes: [{ id: 'y', path: 'api/no-slash' }] }), /y: a path starts with \/api\//);
  assert.throws(() => validatePlan({ ...PLAN, routes: [{ id: 'z', path: '/api/a/{id}', each: { sideways: 'x' } }] }), /z: each names a world prefix or a manifest kind/);
  assert.throws(() => validatePlan({ ...PLAN, format: 'other' }), /format/);
});

test('the plan must begin with readiness and the manifest, the reads the run checks before any other', () => {
  assert.throws(() => validatePlan({ ...PLAN, routes: PLAN.routes.slice(1) }), /first two routes are kiosk\.readiness and kiosk\.manifest/);
});

test('expands each route over the manifest: one read per world key or per choice, ids encoded', () => {
  const reads = expandPlan(PLAN, { ...MANIFEST, world: { ...MANIFEST.world, 'goal.odd': 'a/../b' } });
  assert.deepEqual(
    reads.map((r) => [r.route, r.key, r.url]),
    [
      ['kiosk.readiness', null, '/api/v1/kiosk/readiness'],
      ['kiosk.manifest', null, '/api/v1/kiosk/prewarm/manifest'],
      ['maps.list', null, '/api/v1/me/maps'],
      ['maps.graph', 'goal.water', '/api/v1/me/maps/g-water/graph'],
      ['maps.graph', 'goal.hawker', '/api/v1/me/maps/g-hawker/graph'],
      ['maps.graph', 'goal.odd', '/api/v1/me/maps/a%2F..%2Fb/graph'],
      ['campaign.serve', 'set.water.res.r6', '/api/v1/me/goals/g-water/campaign/questions?concept_id=k-res&rung=6'],
      ['campaign.serve', 'set.hawker.kopi.r4', '/api/v1/me/goals/g-hawker/campaign/questions?concept_id=k-kopi&rung=4'],
    ],
  );
});

test('expanding refuses a choice without the field a path names, naming the choice', () => {
  const m = { ...MANIFEST, choices: { ...MANIFEST.choices, 'set.bad': { kind: 'practice_set', records: { goal_id: 'g', rung: 1 } } } };
  assert.throws(() => expandPlan(PLAN, m), /campaign\.serve: set\.bad has no records\.concept_id/);
});

test('expanding refuses a route that expands to nothing (a check that cannot fail is no check)', () => {
  const plan = { ...PLAN, routes: [...PLAN.routes, { id: 'banks.get', path: '/api/v1/question-banks/{bank_id}', each: { kind: 'bank' } }] };
  assert.throws(() => expandPlan(plan, MANIFEST), /banks\.get: the manifest has no bank choice/);
});

test('two routes that read the same URL are each recorded: the fold is per route', () => {
  const plan = { ...PLAN, routes: [...PLAN.routes, { id: 'maps.graph-again', path: '/api/v1/me/maps/{id}/graph', each: { world: 'goal.water' } }] };
  const again = expandPlan(plan, MANIFEST).filter((r) => r.url === '/api/v1/me/maps/g-water/graph');
  assert.deepEqual(again.map((r) => r.route), ['maps.graph', 'maps.graph-again']);
});

test('two choices that read the same record are recorded once, under every key that reads it', () => {
  const m = { ...MANIFEST, choices: { ...MANIFEST.choices, 'set.water.res.r6.again': { kind: 'practice_set', records: { goal_id: 'g-water', concept_id: 'k-res', rung: 6 } } } };
  const serve = expandPlan(PLAN, m).filter((r) => r.route === 'campaign.serve');
  assert.deepEqual(serve.map((r) => [r.key, r.keys]), [
    ['set.water.res.r6', ['set.water.res.r6', 'set.water.res.r6.again']],
    ['set.hawker.kopi.r4', ['set.hawker.kopi.r4']],
  ]);
});

// ---- secrets ----

test('finds the session token, any JWT, a bearer, a signed URL, a Google key and credential fields, by path and never by value', () => {
  const found = findSecrets(
    {
      a: { echo: `x ${TOKEN} y` },
      other_jwt: 'eyJhbGciOiJSUzI1NiJ9.eyJpc3MiOiJnb29nbGUifQ.YWJjZGVmZ2hpamtsbW5vcA',
      header: 'Bearer abcdefghijklmnopqrstuvwxyz012345',
      pic: 'https://storage.googleapis.com/b/o.png?X-Goog-Algorithm=GOOG4&X-Goog-Signature=abc',
      key: 'AIzaSyA1234567890abcdefghijklmnopqrstuv',
      list: [{ access_token: 'opaque' }, { client_secret: 's' }, { password: 'p' }, { api_key: 'k' }],
      ok: { next_page_token: 'page-2', input_tokens: 12, turn_id: 't-1', image_url: '/api/v1/kiosk/pictures/a.png' },
    },
    TOKEN,
  );
  assert.deepEqual(
    found.map((f) => [f.at, f.kind]),
    [
      ['$.a.echo', 'the session token'],
      ['$.other_jwt', 'a JWT'],
      ['$.header', 'a bearer credential'],
      ['$.pic', 'a signed URL'],
      ['$.key', 'a Google API key'],
      ['$.list[0].access_token', 'a credential field'],
      ['$.list[1].client_secret', 'a credential field'],
      ['$.list[2].password', 'a credential field'],
      ['$.list[3].api_key', 'a credential field'],
    ],
  );
  assert.ok(!JSON.stringify(found).includes(TOKEN));
  assert.ok(!JSON.stringify(found).includes('AIzaSy'));
});

test('a key name also counts: a credential named by a key is found', () => {
  assert.deepEqual(findSecrets({ [TOKEN]: 1 }, TOKEN).map((f) => f.kind), ['the session token']);
});

// ---- the run ----

test('mints one session, checks readiness, then reads every planned route one at a time with the bearer', async () => {
  const edge = await fakeEdge({ reads: GOOD_READS });
  try {
    const run = await recordStack({ base: edge.base, plan: PLAN, now: () => new Date('2026-10-22T03:00:00Z') });
    assert.deepEqual(
      edge.log.map((r) => `${r.method} ${r.url}`),
      [
        'POST /api/v1/kiosk/session',
        'GET /api/v1/kiosk/readiness',
        'GET /api/v1/kiosk/prewarm/manifest',
        'GET /api/v1/me/maps',
        'GET /api/v1/me/maps/g-water/graph',
        'GET /api/v1/me/maps/g-hawker/graph',
        'GET /api/v1/me/goals/g-water/campaign/questions?concept_id=k-res&rung=6',
        'GET /api/v1/me/goals/g-hawker/campaign/questions?concept_id=k-kopi&rung=4',
      ],
    );
    assert.equal(edge.log[0].auth, null, 'the mint carries no credential');
    assert.equal(edge.log[0].body, '{}');
    assert.ok(edge.log.slice(1).every((r) => r.auth === `Bearer ${TOKEN}`));
    assert.equal(edge.maxInFlight(), 1, 'one request at a time');
    assert.deepEqual(run.session, { gcid: 'gcid-1', tenant_id: 'tenant-1', roles: ['learner', 'author', 'instructor', 'auditor'], expires_in: 3600 });
    assert.equal(run.recordings.length, 7);
    const graph = run.recordings.find((r) => r.route === 'maps.graph' && r.key === 'goal.hawker');
    assert.deepEqual(graph, {
      contract: 'chora-kiosk/contract-recording/v1',
      route: 'maps.graph',
      key: 'goal.hawker',
      keys: ['goal.hawker'],
      method: 'GET',
      path: '/api/v1/me/maps/{id}/graph',
      url: '/api/v1/me/maps/g-hawker/graph',
      recorded_at: '2026-10-22T03:00:00.000Z',
      edge: edge.base,
      manifest_commit: 'af2462e49',
      prepared_at: '2026-10-22T02:40:00Z',
      status: 200,
      body: { goalId: 'g-hawker', concepts: [] },
    });
  } finally {
    await edge.close();
  }
});

for (const [why, readiness, pattern] of [
  ['a session has started since the reset', { ...READY, session_started_since_reset: true }, /a demo session has started since the last reset/],
  ['the snapshot marker does not match', { ...READY, snapshot: { ...READY.snapshot, marker: 'mismatch' } }, /snapshot marker is mismatch, not match/],
  ['a reset is running', { ...READY, overall: 'resetting' }, /overall is resetting/],
  ['the stack is not ready', { ...READY, overall: 'not_ready' }, /overall is not_ready/],
]) {
  test(`refuses before any product read when ${why}`, async () => {
    const edge = await fakeEdge({ readiness, reads: GOOD_READS });
    try {
      await assert.rejects(recordStack({ base: edge.base, plan: PLAN }), pattern);
      assert.deepEqual(edge.log.map((r) => `${r.method} ${r.url}`), ['POST /api/v1/kiosk/session', 'GET /api/v1/kiosk/readiness']);
    } finally {
      await edge.close();
    }
  });
}

test('records through a degraded board (LIVE off changes no prepared record)', async () => {
  const edge = await fakeEdge({ readiness: { ...READY, overall: 'degraded' }, reads: GOOD_READS });
  try {
    const run = await recordStack({ base: edge.base, plan: PLAN });
    assert.equal(run.recordings.length, 7);
  } finally {
    await edge.close();
  }
});

test('a mint that is not a bearer session stops the run before any read', async () => {
  const edge = await fakeEdge({ mint: { access_token: '', token_type: 'Bearer', expires_in: 3600, gcid: 'g' } });
  try {
    await assert.rejects(recordStack({ base: edge.base, plan: PLAN }), /the kiosk session answer is not a bearer token/);
    assert.equal(edge.log.length, 1);
  } finally {
    await edge.close();
  }
});

test('a read that does not answer 2xx stops the run, naming the route, key and status', async () => {
  const reads = { ...GOOD_READS, '/api/v1/me/maps/g-hawker/graph': { httpStatus: 404, body: { error: { code: 'NOT_FOUND' } } } };
  const edge = await fakeEdge({ reads });
  try {
    await assert.rejects(recordStack({ base: edge.base, plan: PLAN }), /maps\.graph goal\.hawker: GET \/api\/v1\/me\/maps\/g-hawker\/graph answered 404/);
    assert.ok(!edge.log.some((r) => r.url.includes('campaign')), 'nothing read after the failure');
  } finally {
    await edge.close();
  }
});

// ---- the serve door's guards (it generates on a miss, goals_campaign_questions_handler.go:147-152) ----

const GUARDED = {
  ...PLAN,
  routes: [
    ...PLAN.routes.slice(0, 4),
    {
      id: 'campaign.serve',
      path: '/api/v1/me/goals/{goal_id}/campaign/questions',
      query: { concept_id: '{concept_id}', rung: '{rung}' },
      each: { kind: 'practice_set' },
      expect: { field: 'status', equals: 'ready', why: 'a serve that is not ready may have spent a tap and started the qgen crew' },
    },
    {
      id: 'kiosk.xray',
      path: '/api/v1/kiosk/xray/{goal_id}',
      query: { kind: 'campaign_set', concept_id: '{concept_id}' },
      each: { kind: 'practice_set' },
      requires: { route: 'campaign.serve', field: 'status', equals: 'ready', why: 'the xray calls the serve door' },
    },
  ],
};

test('a serve answer that is not ready stops the run at once, saying what it may have spent', async () => {
  const reads = { ...GOOD_READS, '/api/v1/me/goals/g-water/campaign/questions?concept_id=k-res&rung=6': { status: 'requested' } };
  const edge = await fakeEdge({ reads });
  try {
    await assert.rejects(
      recordStack({ base: edge.base, plan: GUARDED }),
      /campaign\.serve set\.water\.res\.r6: status is "requested", not "ready": a serve that is not ready may have spent a tap and started the qgen crew; stopped, nothing written/,
    );
    assert.ok(!edge.log.some((r) => r.url.includes('k-kopi') || r.url.includes('xray')), 'no read after it');
  } finally {
    await edge.close();
  }
});

test('an xray is read only after its own set was served ready, each in its key', async () => {
  const reads = {
    ...GOOD_READS,
    '/api/v1/kiosk/xray/g-water?kind=campaign_set&concept_id=k-res': { run_id: 'r1' },
    '/api/v1/kiosk/xray/g-hawker?kind=campaign_set&concept_id=k-kopi': { run_id: 'r2' },
  };
  const edge = await fakeEdge({ reads });
  try {
    const run = await recordStack({ base: edge.base, plan: GUARDED });
    assert.deepEqual(run.recordings.filter((r) => r.route === 'kiosk.xray').map((r) => r.key), ['set.water.res.r6', 'set.hawker.kopi.r4']);
  } finally {
    await edge.close();
  }
});

test('an xray is refused before the call when its set was not served ready, even with no stop on the serve itself', async () => {
  const { expect: _stop, ...serve } = GUARDED.routes[4];
  const plan = { ...GUARDED, routes: [...GUARDED.routes.slice(0, 4), serve, GUARDED.routes[5]] };
  const reads = {
    ...GOOD_READS,
    '/api/v1/me/goals/g-water/campaign/questions?concept_id=k-res&rung=6': { status: 'requested' },
    '/api/v1/kiosk/xray/g-water?kind=campaign_set&concept_id=k-res': { run_id: 'r1' },
  };
  const edge = await fakeEdge({ reads });
  try {
    await assert.rejects(
      recordStack({ base: edge.base, plan }),
      /kiosk\.xray set\.water\.res\.r6: refused before the call: campaign\.serve set\.water\.res\.r6 answered status "requested", not "ready": the xray calls the serve door; stopped, nothing written/,
    );
    assert.ok(!edge.log.some((r) => r.url.includes('xray')), 'the xray was never called');
  } finally {
    await edge.close();
  }
});

test('an xray whose set has no ready serve recording is refused before it is called', () => {
  assert.throws(
    () => validatePlan({ ...GUARDED, routes: [...GUARDED.routes.slice(0, 4), GUARDED.routes[5]] }),
    /kiosk\.xray: requires campaign\.serve, which is not an earlier route/,
  );
  assert.throws(
    () => validatePlan({ ...GUARDED, routes: [...GUARDED.routes.slice(0, 5), { ...GUARDED.routes[5], each: { world: 'goal.' } }] }),
    /kiosk\.xray: requires campaign\.serve, which is read over another each/,
  );
  assert.throws(() => validatePlan({ ...GUARDED, routes: [...GUARDED.routes.slice(0, 4), { ...GUARDED.routes[4], expect: { field: 'status' } }] }), /campaign\.serve: expect names a field, the value it equals and why/);
});

// ---- writing ----

test('writes one file per recording, named by route and key, into an empty folder', async () => {
  const edge = await fakeEdge({ reads: GOOD_READS });
  try {
    const run = await recordStack({ base: edge.base, plan: PLAN });
    const out = join(tmp('write'), 'recorded');
    const written = writeRecordings(out, run.recordings, TOKEN);
    assert.deepEqual(filesIn(out), [
      'campaign.serve.set.hawker.kopi.r4.json',
      'campaign.serve.set.water.res.r6.json',
      'kiosk.manifest.json',
      'kiosk.readiness.json',
      'maps.graph.goal.hawker.json',
      'maps.graph.goal.water.json',
      'maps.list.json',
    ]);
    assert.deepEqual(written, filesIn(out).map((f) => join(out, f)));
    const one = JSON.parse(readFileSync(join(out, 'maps.graph.goal.hawker.json'), 'utf8'));
    assert.equal(one.url, '/api/v1/me/maps/g-hawker/graph');
    assert.ok(!textOf(out).includes(TOKEN));
    assert.ok(!textOf(out).toLowerCase().includes('authorization'));
  } finally {
    await edge.close();
  }
});

test('writes nothing at all when any answer carries a secret, naming the route and path but not the value', async () => {
  const reads = { ...GOOD_READS, '/api/v1/me/maps/g-hawker/graph': { goalId: 'g-hawker', debug: { seen: TOKEN } } };
  const edge = await fakeEdge({ reads });
  try {
    const run = await recordStack({ base: edge.base, plan: PLAN });
    const out = join(tmp('secret'), 'recorded');
    assert.throws(() => writeRecordings(out, run.recordings, TOKEN), (err) => {
      assert.match(err.message, /maps\.graph goal\.hawker: \$\.body\.debug\.seen holds the session token/);
      assert.ok(!err.message.includes(TOKEN));
      return true;
    });
    assert.deepEqual(filesIn(out), []);
  } finally {
    await edge.close();
  }
});

test('refuses a folder that already holds files (a re-recording starts from an empty folder)', () => {
  const out = tmp('busy');
  writeFileSync(join(out, 'old.json'), '{}');
  assert.throws(() => writeRecordings(out, [], TOKEN), /not empty/);
});

// ---- the command ----

test('the command records into the folder it is given and never prints or writes the token', async () => {
  const edge = await fakeEdge({ reads: GOOD_READS });
  const planDir = tmp('plan');
  const planPath = join(planDir, 'plan.json');
  writeFileSync(planPath, JSON.stringify(PLAN));
  const out = join(tmp('cli'), 'recorded');
  try {
    const r = await runCli(['--base', edge.base, '--plan', planPath, '--out', out]);
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /session: gcid gcid-1, roles learner author instructor auditor/);
    assert.match(r.stdout, /GET \/api\/v1\/me\/maps\/g-hawker\/graph 200/);
    assert.match(r.stdout, /recorded 7 reads in 7 files/);
    assert.equal(filesIn(out).length, 7);
    for (const text of [r.stdout, r.stderr, textOf(out)]) assert.ok(!text.includes(TOKEN));
    assert.equal(edge.log.filter((x) => x.method !== 'GET').length, 1, 'the mint is the only request that is not a GET');
  } finally {
    await edge.close();
  }
});

test('the command refuses a non-loopback edge and a missing --out before calling anything', async () => {
  const r1 = await runCli(['--base', 'http://192.168.1.4:18080', '--out', join(tmp('x'), 'o')]);
  assert.equal(r1.status, 2);
  assert.match(r1.stderr, /loopback/);
  const r2 = await runCli([]);
  assert.equal(r2.status, 2);
  assert.match(r2.stderr, /--out/);
});

test('the command exits 1 and writes nothing when the stack refuses', async () => {
  const edge = await fakeEdge({ readiness: { ...READY, session_started_since_reset: true } });
  const planDir = tmp('plan2');
  const planPath = join(planDir, 'plan.json');
  writeFileSync(planPath, JSON.stringify(PLAN));
  const out = join(tmp('cli2'), 'recorded');
  try {
    const r = await runCli(['--base', edge.base, '--plan', planPath, '--out', out]);
    assert.equal(r.status, 1);
    assert.match(r.stderr, /a demo session has started since the last reset/);
    assert.deepEqual(filesIn(out), []);
  } finally {
    await edge.close();
  }
});

// ---- the committed plan ----

test('the committed plan is valid: GET only, readiness and the manifest first, the dose read never', () => {
  const plan = JSON.parse(readFileSync(REAL_PLAN, 'utf8'));
  assert.doesNotThrow(() => validatePlan(plan));
  assert.ok(plan.never.some((n) => new RegExp(n.path).test('/api/companion/daily-dose')), 'the dose read is on the never list');
  assert.ok(plan.never.some((n) => new RegExp(n.path).test('/api/companion/daily-dose/ai')), 'the dose greeting is on the never list');
  assert.ok(Array.isArray(plan.not_read_only) && plan.not_read_only.length > 0, 'the routes left unrecorded are named, each with its reason');
  for (const n of plan.not_read_only) assert.ok(n.route && n.why, JSON.stringify(n));
});

