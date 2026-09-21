'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { loadModules, instantiate, driveInput } = require('./helpers');
const { startFixtureServer } = require('./fixture-server');

async function withServer(fn) {
  const fixture = await startFixtureServer();
  try {
    return await fn(fixture);
  } finally {
    await new Promise((resolve) => fixture.server.close(resolve));
  }
}

function wire(RED, typeName, config, fixture, serverCfg) {
  RED._nodesById.srv = Object.assign({ id: 'srv', baseUrl: 'http://invalid.example', timeoutMs: 8000 }, serverCfg);
  return instantiate(RED, typeName, Object.assign({ server: 'srv' }, config));
}

test('starintel-target builds a canonical v0.9 target document', async () => {
  const RED = loadModules('nodes/starintel-server.js', 'nodes/starintel-target.js');
  RED._nodesById.srv = { id: 'srv', baseUrl: 'http://unused.example', timeoutMs: 8000 };
  const node = instantiate(RED, 'starintel-target', {
    server: 'srv', op: 'build', actor: 'bluesky', target: 'alice',
    options: '{"deep": true}', delay: 5, recurring: true
  });
  const result = await driveInput(node, {});
  assert.strictEqual(result.err, undefined);
  const doc = result.sent[0].payload;
  assert.strictEqual(doc.dtype, 'target');
  assert.strictEqual(doc.data.actor, 'bluesky');
  assert.strictEqual(doc.data.target, 'alice');
  assert.strictEqual(doc.data.delay, 5);
  assert.strictEqual(doc.data.recurring, true);
  assert.deepStrictEqual(doc.data.options, { deep: true });
  assert.strictEqual(doc.schema_version, '0.9.0');
  assert.ok(Array.isArray(doc.sources) && Array.isArray(doc.evidence));
});

test('starintel-target dispatches through /new/target/:actor', async () => {
  await withServer(async (fixture) => {
    const RED = loadModules('nodes/starintel-server.js', 'nodes/starintel-target.js');
    const node = wire(RED, 'starintel-target', { op: 'dispatch', actor: 'reddit' }, fixture, { baseUrl: fixture.baseUrl });
    const result = await driveInput(node, { payload: 'bob' });
    assert.strictEqual(result.err, undefined);
    const req = fixture.requests[0];
    assert.strictEqual(req.method, 'POST');
    assert.strictEqual(req.url, '/new/target/reddit');
    assert.strictEqual(req.body.dtype, 'target');
    assert.strictEqual(req.body.data.actor, 'reddit');
    assert.strictEqual(req.body.data.target, 'bob');
  });
});

test('starintel-pro-actors lists the 17-actor catalog', async () => {
  const RED = loadModules('nodes/starintel-pro-actors.js');
  const node = instantiate(RED, 'starintel-pro-actors', { op: 'list' });
  const result = await driveInput(node, {});
  assert.strictEqual(result.err, undefined);
  assert.strictEqual(result.sent[0].payload.length, 17);
  const bluesky = result.sent[0].payload.find((a) => a.actor === 'bluesky');
  assert.strictEqual(bluesky.actor_type, 'collector');
  assert.ok(bluesky.operations.includes('collect-account'));
});

test('starintel-pro-actors emits options and manifest for one actor', async () => {
  const RED = loadModules('nodes/starintel-pro-actors.js');
  const node = instantiate(RED, 'starintel-pro-actors', { op: 'options', actor: 'youtube' });
  const result = await driveInput(node, {});
  assert.strictEqual(result.sent[0].payload.actor, 'youtube');
  assert.ok(Array.isArray(result.sent[0].payload.operations));

  const RED2 = loadModules('nodes/starintel-pro-actors.js');
  const mnode = instantiate(RED2, 'starintel-pro-actors', { op: 'manifest', actor: 'x', emit: false });
  const m = await driveInput(mnode, {});
  assert.strictEqual(m.sent[0].payload.dtype, 'actor-manifest');
  assert.strictEqual(m.sent[0].payload.data.actor, 'x');
  assert.deepStrictEqual(m.sent[0].payload.data.schema_versions, ['0.9.0']);
});

test('starintel-pro-actors rejects unknown actors', async () => {
  const RED = loadModules('nodes/starintel-pro-actors.js');
  const node = instantiate(RED, 'starintel-pro-actors', { op: 'options', actor: 'nope' });
  const result = await driveInput(node, {});
  assert.strictEqual(result.sent.length, 0);
  assert.strictEqual(result.err.code, 'STAR_CONFIG');
});

test('starintel-filter applies rules, dtypes, dedupe, sort, paging', async () => {
  const RED = loadModules('nodes/starintel-filter.js');
  const node = instantiate(RED, 'starintel-filter', {
    rules: '[{"field":"data.actor","op":"eq","value":"bluesky"}]',
    includeDtypes: 'post,account',
    dedupeField: 'data.canonical_key',
    sortField: 'data.actor',
    sortDir: 'asc',
    limit: 2, offset: 0
  });
  const result = await driveInput(node, {
    payload: { docs: [
      { dtype: 'post', data: { actor: 'bluesky', canonical_key: 'k1' } },
      { dtype: 'post', data: { actor: 'bluesky', canonical_key: 'k1' } },
      { dtype: 'post', data: { actor: 'bluesky', canonical_key: 'k2' } },
      { dtype: 'post', data: { actor: 'reddit', canonical_key: 'k3' } },
      { dtype: 'breach', data: { actor: 'bluesky', canonical_key: 'k4' } }
    ] }
  });
  assert.strictEqual(result.err, undefined);
  const out = result.sent[0].payload;
  assert.strictEqual(out.length, 2);
  assert.ok(out.every((d) => d.data.canonical_key !== 'k3' && d.dtype !== 'breach'));
  assert.strictEqual(result.sent[0].filter_stats.in, 5);
  assert.strictEqual(result.sent[0].filter_stats.out, 2);
});

test('starintel-filter regex and exists operators', async () => {
  const RED = loadModules('nodes/starintel-filter.js');
  const node = instantiate(RED, 'starintel-filter', {
    rules: '[{"field":"email","op":"regex","value":"@starintel\\\\.actor$"},{"field":"age","op":"exists"}]'
  });
  const result = await driveInput(node, { payload: [
    { email: 'a@starintel.actor', age: 3 },
    { email: 'a@example.com', age: 1 },
    { email: 'b@starintel.actor' }
  ] });
  assert.deepStrictEqual(result.sent[0].payload, [{ email: 'a@starintel.actor', age: 3 }]);
});

test('starintel-operations creates a strict operation document', async () => {
  await withServer(async (fixture) => {
    const RED = loadModules('nodes/starintel-server.js', 'nodes/starintel-operations.js');
    const node = wire(RED, 'starintel-operations', {
      op: 'create', mission: 'map the org', status: 'planned',
      phases: '[{"name":"recon"}]', emit: true
    }, fixture, { baseUrl: fixture.baseUrl });
    const result = await driveInput(node, {});
    assert.strictEqual(result.err, undefined);
    const req = fixture.requests[0];
    assert.strictEqual(req.url, '/api/v1/documents');
    assert.strictEqual(req.body.dtype, 'operation');
    assert.strictEqual(req.body.data.mission, 'map the org');
    assert.strictEqual(req.body.data.status, 'planned');
    assert.deepStrictEqual(req.body.data.phases, [{ name: 'recon' }]);
  });
});

test('starintel-operations set-status appends status history', async () => {
  await withServer(async (fixture) => {
    const RED = loadModules('nodes/starintel-server.js', 'nodes/starintel-operations.js');
    const node = wire(RED, 'starintel-operations', { op: 'set-status', status: 'active', documentId: 'op1' }, fixture, { baseUrl: fixture.baseUrl });
    const result = await driveInput(node, {});
    assert.strictEqual(result.err, undefined);
    const put = fixture.requests.find((r) => r.method === 'PUT');
    assert.ok(put, 'no PUT issued');
    assert.strictEqual(put.body.data.status, 'active');
    assert.ok(Array.isArray(put.body.data.status_history));
  });
});

test('starintel-input search splits documents', async () => {
  await withServer(async (fixture) => {
    const RED = loadModules('nodes/starintel-server.js', 'nodes/starintel-input.js');
    const node = wire(RED, 'starintel-input', { mode: 'search', q: 'dtype:post', split: true, limit: 10 }, fixture, { baseUrl: fixture.baseUrl });
    const result = await driveInput(node, {});
    assert.strictEqual(result.err, undefined);
    assert.ok(result.sent.length >= 1);
    assert.strictEqual(result.sent[0].payload.docs === undefined, true);
    assert.match(fixture.requests[0].url, /q=dtype%3Apost/);
  });
});

test('starintel-emit wraps raw data and bulk-flows arrays', async () => {
  await withServer(async (fixture) => {
    const RED = loadModules('nodes/starintel-server.js', 'nodes/starintel-emit.js');
    const node = wire(RED, 'starintel-emit', { dtype: 'observation' }, fixture, { baseUrl: fixture.baseUrl });
    const result = await driveInput(node, { payload: { note: 'saw a thing' } });
    assert.strictEqual(result.err, undefined);
    assert.strictEqual(fixture.requests[0].url, '/api/v1/documents');
    assert.strictEqual(fixture.requests[0].body.dtype, 'observation');
    assert.strictEqual(fixture.requests[0].body.data.note, 'saw a thing');

    const RED2 = loadModules('nodes/starintel-server.js', 'nodes/starintel-emit.js');
    const node2 = wire(RED2, 'starintel-emit', {}, fixture, { baseUrl: fixture.baseUrl });
    const r2 = await driveInput(node2, { payload: [{ note: 'a' }, { note: 'b' }] });
    assert.strictEqual(r2.err, undefined);
    assert.strictEqual(fixture.requests[1].url, '/api/v1/documents/bulk');
    assert.strictEqual(fixture.requests[1].body.length, 2);
  });
});

test('starintel-flow-manager gets and deploys flows with rev', async () => {
  await withServer(async (fixture) => {
    const RED = loadModules('nodes/starintel-flow-manager.js');
    const node = instantiate(RED, 'starintel-flow-manager', {
      op: 'get-flows', baseUrl: fixture.baseUrl, authEnv: 'NR_TEST_TOKEN', timeoutMs: 3000
    });
    process.env.NR_TEST_TOKEN = 'Bearer x';
    const result = await driveInput(node, {});
    delete process.env.NR_TEST_TOKEN;
    assert.strictEqual(result.err, undefined);
    assert.ok(Array.isArray(result.sent[0].payload.flows));
    assert.strictEqual(result.sent[0].payload.rev, 'x1');
    assert.strictEqual(fixture.requests[0].url, '/flows');

    const RED2 = loadModules('nodes/starintel-flow-manager.js');
    const node2 = instantiate(RED2, 'starintel-flow-manager', { op: 'put-flows', baseUrl: fixture.baseUrl });
    const r2 = await driveInput(node2, { payload: [{ id: 't1', type: 'tab', label: 'agent-made' }] });
    assert.strictEqual(r2.err, undefined, r2.err && r2.err.message);
    const post = fixture.requests.find((r) => r.method === 'POST' && r.url === '/flows');
    assert.ok(post, 'no flows POST');
    assert.ok(post.body.rev);
    assert.strictEqual(post.body.flows[0].label, 'agent-made');
  });
});

test('starintel-ui mounts a page and a JSON data endpoint', async () => {
  await withServer(async (fixture) => {
    const routes = {};
    const RED = loadModules('nodes/starintel-server.js', 'nodes/starintel-ui.js');
    RED.httpNode = { get(path, handler) { routes[path] = handler; } };
    const node = wire(RED, 'starintel-ui', {
      path: 'ops-board', title: 'Ops board', q: 'dtype:operation', view: 'cards', columns: '', refreshSec: 0
    }, fixture, { baseUrl: fixture.baseUrl });
    assert.ok(routes['/starintel-ui/ops-board'], 'page route missing');
    assert.ok(routes['/starintel-ui/ops-board/data'], 'data route missing');

    const htmlRes = await captureReply(routes['/starintel-ui/ops-board'], reqStub('/starintel-ui/ops-board'));
    assert.match(htmlRes.body, /Ops board/);
    assert.match(htmlRes.body, /load\(\)/);

    const dataRes = await captureReply(routes['/starintel-ui/ops-board/data'], reqStub('/starintel-ui/ops-board/data'));
    assert.match(fixture.requests[0].url, /q=dtype%3Aoperation/);
    assert.strictEqual(JSON.parse(dataRes.body).docs[0].data.actor, 'bluesky');
  });
});

test('message2org renders message documents with drawer, tags, timestamps', async () => {
  const RED = loadModules('nodes/message2org.js');
  const node = instantiate(RED, 'message2org', { headingLevel: 2, drawer: true, timestamps: 'org', tags: 'full', quoteLevel: 0 });
  const result = await driveInput(node, { payload: { docs: [
    { id: 'm1', dtype: 'message', schema_version: '0.9.0',
      data: { from: 'alice', channel: 'sigint', message: 'line one\nline two', tags: ['urgent'] },
      date_added: '2026-09-20T10:00:00Z' }
  ] } });
  assert.strictEqual(result.err, undefined);
  const org = result.sent[0].payload;
  assert.match(org, /^\*\* alice @ sigint\s+\(/);
  assert.match(org, /:PROPERTIES:/);
  assert.match(org, /:ID: m1/);
  assert.match(org, /:DTYPE: message/);
  assert.match(org, /:message:sigint:urgent:/);
  assert.match(org, /line one\nline two/);
});

function reqStub(url) { return { url }; }
function captureReply(handler, req) {
  return new Promise((resolve) => {
    const res = {
      setHeader() {},
      statusCode: 200,
      end(body) { resolve({ body: body || '', statusCode: this.statusCode }); }
    };
    handler(req, res);
  });
}
