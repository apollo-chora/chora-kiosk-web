// Tests for the dev-only fixture server. It serves recorded or mockup-derived JSON so the
// UI runs before the stack is up; it never ships (the no-fixture gate checks the bundle).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { loadFixtureRoutes, createFixtureServer } from './fixture-server.mjs';

const MARK = 'KIOSK_DEV_FIXTURE';

function dirWith(files) {
  const dir = mkdtempSync(join(tmpdir(), 'kiosk-fixtures-'));
  for (const [name, obj] of Object.entries(files)) writeFileSync(join(dir, name), JSON.stringify(obj));
  return dir;
}

async function serve(routes) {
  const server = createFixtureServer(routes, { log: () => {} });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const { port } = server.address();
  return { server, base: `http://127.0.0.1:${port}` };
}

test('serves a fixture body with its status for the exact method and path', async () => {
  const routes = loadFixtureRoutes(
    dirWith({ 'r.json': { fixture: MARK, method: 'GET', path: '/api/v1/kiosk/readiness', status: 200, body: { overall: 'ready' } } }),
  );
  const { server, base } = await serve(routes);
  try {
    const res = await fetch(`${base}/api/v1/kiosk/readiness`);
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('content-type'), 'application/json; charset=utf-8');
    assert.deepEqual(await res.json(), { overall: 'ready' });
    const post = await fetch(`${base}/api/v1/kiosk/readiness`, { method: 'POST' });
    assert.equal(post.status, 404);
  } finally {
    server.close();
  }
});

test('an unknown route is a loud 404 in the gateway error envelope, never an empty 200', async () => {
  const logs = [];
  const routes = loadFixtureRoutes(dirWith({ 'a.json': { fixture: MARK, method: 'GET', path: '/a', status: 200, body: {} } }));
  const server = createFixtureServer(routes, { log: (l) => logs.push(l) });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  try {
    const res = await fetch(`http://127.0.0.1:${server.address().port}/api/v1/me/goals`);
    assert.equal(res.status, 404);
    const body = await res.json();
    assert.equal(body.error.code, 'NOT_FOUND');
    assert.match(body.error.message, /no fixture for GET \/api\/v1\/me\/goals/);
    assert.ok(logs.some((l) => /no fixture for GET \/api\/v1\/me\/goals/.test(l)));
  } finally {
    server.close();
  }
});

test('a query match picks between fixtures of one path', async () => {
  const routes = loadFixtureRoutes(
    dirWith({
      'a.json': { fixture: MARK, method: 'GET', path: '/q', query: { concept_id: 'c1' }, status: 200, body: { c: 1 } },
      'b.json': { fixture: MARK, method: 'GET', path: '/q', query: { concept_id: 'c2' }, status: 200, body: { c: 2 } },
    }),
  );
  const { server, base } = await serve(routes);
  try {
    assert.deepEqual(await (await fetch(`${base}/q?concept_id=c2`)).json(), { c: 2 });
    assert.deepEqual(await (await fetch(`${base}/q?concept_id=c1&x=1`)).json(), { c: 1 });
    assert.equal((await fetch(`${base}/q?concept_id=c3`)).status, 404);
  } finally {
    server.close();
  }
});

test('a sequence answers each call in turn, then repeats its last step (polling)', async () => {
  const routes = loadFixtureRoutes(
    dirWith({
      's.json': {
        fixture: MARK,
        method: 'GET',
        path: '/api/v1/kiosk/reset',
        sequence: [
          { status: 200, body: { state: 'running' } },
          { status: 200, body: { state: 'done' } },
        ],
      },
    }),
  );
  const { server, base } = await serve(routes);
  try {
    const states = [];
    for (let i = 0; i < 3; i++) states.push((await (await fetch(`${base}/api/v1/kiosk/reset`)).json()).state);
    assert.deepEqual(states, ['running', 'done', 'done']);
  } finally {
    server.close();
  }
});

test('a 204 fixture answers with no body', async () => {
  const routes = loadFixtureRoutes(dirWith({ 'v.json': { fixture: MARK, method: 'POST', path: '/v', status: 204 } }));
  const { server, base } = await serve(routes);
  try {
    const res = await fetch(`${base}/v`, { method: 'POST', body: '{}' });
    assert.equal(res.status, 204);
    assert.equal(await res.text(), '');
  } finally {
    server.close();
  }
});

test('refuses a fixture without the marker, a duplicate route, and an empty folder', () => {
  assert.throws(
    () => loadFixtureRoutes(dirWith({ 'x.json': { method: 'GET', path: '/x', status: 200, body: {} } })),
    /x\.json.*marker/,
  );
  assert.throws(
    () =>
      loadFixtureRoutes(
        dirWith({
          'a.json': { fixture: MARK, method: 'GET', path: '/x', status: 200, body: {} },
          'b.json': { fixture: MARK, method: 'GET', path: '/x', status: 200, body: {} },
        }),
      ),
    /duplicate.*GET \/x/,
  );
  assert.throws(() => loadFixtureRoutes(dirWith({})), /no fixture files/);
});

async function post(base, path, body) {
  return fetch(`${base}${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
}

test('a body match picks between fixtures of one path (an answer per chosen option)', async () => {
  const routes = loadFixtureRoutes(
    dirWith({
      'right.json': { fixture: MARK, method: 'POST', path: '/answer', match_body: { selected_option_id: 'o2' }, status: 200, body: { correct: true } },
      'wrong.json': { fixture: MARK, method: 'POST', path: '/answer', match_body: { selected_option_id: 'o1' }, status: 200, body: { correct: false } },
    }),
  );
  const { server, base } = await serve(routes);
  try {
    assert.deepEqual(await (await post(base, '/answer', { concept_id: 'c', selected_option_id: 'o2' })).json(), { correct: true });
    assert.deepEqual(await (await post(base, '/answer', { concept_id: 'c', selected_option_id: 'o1' })).json(), { correct: false });
    assert.equal((await post(base, '/answer', { selected_option_id: 'o9' })).status, 404);
    const notJson = await fetch(`${base}/answer`, { method: 'POST', body: 'selected_option_id=o2' });
    assert.equal(notJson.status, 404);
  } finally {
    server.close();
  }
});

test('a variant answers once the requests it names were served, until a reset fixture clears that state', async () => {
  const routes = loadFixtureRoutes(
    dirWith({
      'graph.json': {
        fixture: MARK,
        method: 'GET',
        path: '/graph',
        status: 200,
        body: { concepts: ['root'] },
        variants: [
          { after: ['^POST /s/a1/accept$', '^POST /s/a2/accept$'], status: 200, body: { concepts: ['root', 'a1', 'a2'] } },
          { after: ['^POST /s/b1/(accept|dismiss)$'], status: 200, body: { concepts: ['root', 'b1'] } },
        ],
      },
      'a1.json': { fixture: MARK, method: 'POST', path: '/s/a1/accept', status: 200, body: {} },
      'a2.json': { fixture: MARK, method: 'POST', path: '/s/a2/accept', status: 200, body: {} },
      'b1.json': { fixture: MARK, method: 'POST', path: '/s/b1/accept', status: 200, body: {} },
      'poll.json': {
        fixture: MARK,
        method: 'GET',
        path: '/poll',
        sequence: [
          { status: 200, body: { n: 1 } },
          { status: 200, body: { n: 2 } },
        ],
      },
      'reset.json': { fixture: MARK, method: 'POST', path: '/reset', resets: true, status: 202, body: { state: 'running' } },
    }),
  );
  const { server, base } = await serve(routes);
  const graph = async () => (await (await fetch(`${base}/graph`)).json()).concepts;
  try {
    assert.deepEqual(await graph(), ['root']);
    await post(base, '/s/a1/accept', {});
    assert.deepEqual(await graph(), ['root'], 'one of the two named requests is not enough');
    await post(base, '/s/a2/accept', {});
    assert.deepEqual(await graph(), ['root', 'a1', 'a2']);
    await post(base, '/s/b1/accept', {});
    assert.deepEqual(await graph(), ['root', 'b1'], 'the last satisfied variant wins');
    assert.equal((await (await fetch(`${base}/poll`)).json()).n, 1);
    assert.equal((await (await fetch(`${base}/poll`)).json()).n, 2);
    assert.equal((await post(base, '/reset', {})).status, 202);
    assert.deepEqual(await graph(), ['root'], 'a reset puts back the prepared state');
    assert.equal((await (await fetch(`${base}/poll`)).json()).n, 1, 'and restarts every sequence');
  } finally {
    server.close();
  }
});

test('W69: a variant can wait for the fixture that answered, so one chosen option (the winning answer) is told apart from another', async () => {
  const routes = loadFixtureRoutes(
    dirWith({
      'right.json': { fixture: MARK, method: 'POST', path: '/answer', match_body: { selected_option_id: 'o2' }, status: 200, body: { won: true } },
      'wrong.json': { fixture: MARK, method: 'POST', path: '/answer', match_body: { selected_option_id: 'o1' }, status: 200, body: { won: false } },
      'ledger.json': { fixture: MARK, method: 'GET', path: '/ledger', status: 200, body: { exp: 32 }, variants: [{ after: ['^FIXTURE right\\.json$'], status: 200, body: { exp: 65 } }] },
      'reset.json': { fixture: MARK, method: 'POST', path: '/reset', resets: true, status: 202, body: {} },
    }),
  );
  const { server, base } = await serve(routes);
  const exp = async () => (await (await fetch(`${base}/ledger`)).json()).exp;
  try {
    await post(base, '/answer', { selected_option_id: 'o1' });
    assert.equal(await exp(), 32, 'the same route answered by another fixture is not the win');
    await post(base, '/answer', { selected_option_id: 'o2' });
    assert.equal(await exp(), 65);
    await post(base, '/reset', {});
    assert.equal(await exp(), 32, 'a reset forgets which fixtures answered too');
  } finally {
    server.close();
  }
});

test('a request that was refused (404) does not count toward a variant', async () => {
  const routes = loadFixtureRoutes(
    dirWith({
      'g.json': { fixture: MARK, method: 'GET', path: '/g', status: 200, body: { v: 0 }, variants: [{ after: ['^POST /x$'], status: 200, body: { v: 1 } }] },
      'x.json': { fixture: MARK, method: 'POST', path: '/x', status: 409, body: { error: { code: 'NO' } } },
    }),
  );
  const { server, base } = await serve(routes);
  try {
    await post(base, '/nothing', {});
    await post(base, '/x', {});
    assert.equal((await (await fetch(`${base}/g`)).json()).v, 0);
  } finally {
    server.close();
  }
});

test('a file fixture serves the file bytes with its content type (a prepared picture)', async () => {
  const dir = dirWith({ 'p.json': { fixture: MARK, method: 'GET', path: '/pic/a.png', status: 200, file: 'pictures/a.png', content_type: 'image/png' } });
  const bytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0xff]);
  mkdirSync(join(dir, 'pictures'));
  writeFileSync(join(dir, 'pictures', 'a.png'), bytes);
  const { server, base } = await serve(loadFixtureRoutes(dir));
  try {
    const res = await fetch(`${base}/pic/a.png`);
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('content-type'), 'image/png');
    assert.deepEqual(Buffer.from(await res.arrayBuffer()), bytes);
  } finally {
    server.close();
  }
});

test('refuses a bad variant, a body match on a GET, and a file fixture whose file is missing or has a body', () => {
  const one = (f) => () => loadFixtureRoutes(dirWith({ 'f.json': { fixture: MARK, method: 'GET', path: '/f', status: 200, ...f } }));
  assert.throws(one({ body: {}, variants: [{ status: 200, body: {} }] }), /f\.json.*variant 0.*after/);
  assert.throws(one({ body: {}, variants: [{ after: ['('], status: 200, body: {} }] }), /f\.json.*variant 0.*regular expression/);
  assert.throws(one({ body: {}, variants: [{ after: ['^GET /x$'], body: {} }] }), /f\.json.*variant 0.*status/);
  assert.throws(one({ body: {}, match_body: { a: 1 } }), /f\.json.*match_body.*GET/);
  assert.throws(one({ file: 'missing.png', content_type: 'image/png' }), /f\.json.*missing\.png/);
  assert.throws(one({ file: 'f.json', content_type: 'image/png', body: {} }), /f\.json.*file.*body/);
  assert.throws(one({ file: 'f.json' }), /f\.json.*content_type/);
});

test('every satisfied patch adds to the answer, on top of the chosen variant, so several accepts show together', async () => {
  const routes = loadFixtureRoutes(
    dirWith({
      'graph.json': {
        fixture: MARK,
        method: 'GET',
        path: '/graph',
        status: 200,
        body: { concepts: ['root'], edges: [], campaign: { nodes: { root: 1 } } },
        variants: [{ after: ['^POST /s/b1/accept$'], status: 200, body: { concepts: ['root', 'b1'], edges: ['root-b1'], campaign: { nodes: { root: 1, b1: 0 } } } }],
        patches: [
          { after: ['^POST /s/l1/accept$'], append: { edges: ['l1'] } },
          { after: ['^POST /s/c1/accept$'], append: { concepts: ['c1'], edges: ['root-c1'] }, assign: { 'campaign.nodes': { c1: 0 } } },
        ],
      },
      'b1.json': { fixture: MARK, method: 'POST', path: '/s/b1/accept', status: 200, body: {} },
      'l1.json': { fixture: MARK, method: 'POST', path: '/s/l1/accept', status: 200, body: {} },
      'c1.json': { fixture: MARK, method: 'POST', path: '/s/c1/accept', status: 200, body: {} },
      'reset.json': { fixture: MARK, method: 'POST', path: '/reset', resets: true, status: 202, body: {} },
    }),
  );
  const { server, base } = await serve(routes);
  const graph = async () => (await fetch(`${base}/graph`)).json();
  try {
    await post(base, '/s/l1/accept', {});
    assert.deepEqual(await graph(), { concepts: ['root'], edges: ['l1'], campaign: { nodes: { root: 1 } } });
    await post(base, '/s/b1/accept', {});
    await post(base, '/s/c1/accept', {});
    assert.deepEqual(await graph(), { concepts: ['root', 'b1', 'c1'], edges: ['root-b1', 'l1', 'root-c1'], campaign: { nodes: { root: 1, b1: 0, c1: 0 } } }, 'patches stack on the variant, in file order');
    await post(base, '/reset', {});
    assert.deepEqual(await graph(), { concepts: ['root'], edges: [], campaign: { nodes: { root: 1 } } }, 'a reset drops them');
  } finally {
    server.close();
  }
});

test('a patch with "until" stops adding once any of those requests is answered (W41: a LIVE press lists its ideas as pending until each is decided)', async () => {
  const routes = loadFixtureRoutes(
    dirWith({
      'list.json': {
        fixture: MARK,
        method: 'GET',
        path: '/list',
        status: 200,
        body: { suggestions: ['prepared'] },
        patches: [
          { after: ['^GET /requests/r1$'], until: ['^POST /s/n1/(accept|dismiss)$'], append: { suggestions: ['n1'] } },
          { after: ['^GET /requests/r1$'], until: ['^POST /s/n2/(accept|dismiss)$'], append: { suggestions: ['n2'] } },
        ],
      },
      'r1.json': { fixture: MARK, method: 'GET', path: '/requests/r1', status: 200, body: {} },
      'n1.json': { fixture: MARK, method: 'POST', path: '/s/n1/dismiss', status: 200, body: {} },
      'reset.json': { fixture: MARK, method: 'POST', path: '/reset', resets: true, status: 202, body: {} },
    }),
  );
  const { server, base } = await serve(routes);
  const list = async () => (await (await fetch(`${base}/list`)).json()).suggestions;
  try {
    assert.deepEqual(await list(), ['prepared'], 'before the press, the prepared rows alone');
    await fetch(`${base}/requests/r1`);
    assert.deepEqual(await list(), ['prepared', 'n1', 'n2'], 'the press lists its ideas as pending');
    await post(base, '/s/n1/dismiss', {});
    assert.deepEqual(await list(), ['prepared', 'n2'], 'a decided idea leaves the pending list');
    await post(base, '/reset', {});
    assert.deepEqual(await list(), ['prepared'], 'a reset drops them');
  } finally {
    server.close();
  }
});

test('refuses a patch that names no requests, adds nothing, or adds to what is not a list or an object', async () => {
  const one = (patches, body = { edges: [], meta: { n: 1 } }) => () =>
    loadFixtureRoutes(dirWith({ 'f.json': { fixture: MARK, method: 'GET', path: '/f', status: 200, body, patches } }));
  assert.throws(one([{ append: { edges: [1] } }]), /f\.json.*patch 0.*after/);
  assert.throws(one([{ after: ['^POST /x$'] }]), /f\.json.*patch 0.*adds nothing/);
  assert.throws(one([{ after: ['^POST /x$'], append: { edges: 'x' } }]), /f\.json.*patch 0.*edges.*list/);
  assert.throws(one([{ after: ['^POST /x$'], until: [], append: { edges: [1] } }]), /f\.json.*patch 0.*until/);
  assert.throws(one([{ after: ['^POST /x$'], until: ['('], append: { edges: [1] } }]), /f\.json.*patch 0.*\(.*regular expression/);
  const routes = loadFixtureRoutes(dirWith({ 'g.json': { fixture: MARK, method: 'GET', path: '/g', status: 200, body: { edges: {} }, patches: [{ after: ['^POST /x$'], append: { edges: [1] } }] }, 'x.json': { fixture: MARK, method: 'POST', path: '/x', status: 200, body: {} } }));
  const logs = [];
  const server = createFixtureServer(routes, { log: (l) => logs.push(l) });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  try {
    const base = `http://127.0.0.1:${server.address().port}`;
    await post(base, '/x', {});
    const res = await fetch(`${base}/g`);
    assert.equal(res.status, 500, 'a patch that does not fit its answer is a loud failure, never a silent skip');
    assert.match((await res.json()).error.message, /g\.json patch 0: edges is not a list/);
  } finally {
    server.close();
  }
});
