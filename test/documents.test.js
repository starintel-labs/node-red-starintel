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

function makeNode(RED, typeName, config, serverCfg) {
  RED._nodesById.srv = Object.assign({ id: 'srv', baseUrl: 'http://invalid.example', timeoutMs: 8000 }, serverCfg);
  return instantiate(RED, typeName, Object.assign({ server: 'srv' }, config));
}

test('documents ingest posts msg.payload to /api/v1/documents', async () => {
  await withServer(async (fixture) => {
    const RED = loadModules('nodes/starintel-server.js', 'nodes/starintel-documents.js');
    const node = makeNode(RED, 'starintel-documents', { op: 'ingest' }, { baseUrl: fixture.baseUrl });
    const result = await driveInput(node, { payload: { dtype: 'username', data: { username: 'x' } } });
    assert.strictEqual(result.err, undefined);
    assert.strictEqual(result.sent[0].payload.ok, true);
    const req = fixture.requests[0];
    assert.strictEqual(req.method, 'POST');
    assert.strictEqual(req.url, '/api/v1/documents');
    assert.deepStrictEqual(req.body, { dtype: 'username', data: { username: 'x' } });
  });
});

test('documents bulk posts arrays to /api/v1/documents/bulk', async () => {
  await withServer(async (fixture) => {
    const RED = loadModules('nodes/starintel-server.js', 'nodes/starintel-documents.js');
    const node = makeNode(RED, 'starintel-documents', { op: 'bulk' }, { baseUrl: fixture.baseUrl });
    const result = await driveInput(node, { payload: [{ a: 1 }, { a: 2 }] });
    assert.strictEqual(result.err, undefined);
    assert.strictEqual(result.sent[0].payload.count, 2);
    assert.strictEqual(fixture.requests[0].url, '/api/v1/documents/bulk');
  });
});

test('documents get uses config id then msg.id', async () => {
  await withServer(async (fixture) => {
    const RED = loadModules('nodes/starintel-server.js', 'nodes/starintel-documents.js');
    const node = makeNode(RED, 'starintel-documents', { op: 'get' }, { baseUrl: fixture.baseUrl });
    const result = await driveInput(node, { id: 'abc-123' });
    assert.strictEqual(result.err, undefined);
    assert.strictEqual(fixture.requests[0].method, 'GET');
    assert.strictEqual(fixture.requests[0].url, '/api/v1/documents/abc-123');
  });
});

test('documents search forwards q and params', async () => {
  await withServer(async (fixture) => {
    const RED = loadModules('nodes/starintel-server.js', 'nodes/starintel-documents.js');
    const node = makeNode(RED, 'starintel-documents',
      { op: 'search', q: 'dtype:breach', params: '{"limit": 5}' }, { baseUrl: fixture.baseUrl });
    const result = await driveInput(node, {});
    assert.strictEqual(result.err, undefined);
    const url = fixture.requests[0].url;
    assert.match(url, /\/api\/v1\/documents\/search\?/);
    assert.match(url, /q=dtype%3Abreach/);
    assert.match(url, /limit=5/);
    assert.strictEqual(result.sent[0].payload.echoed_q, 'dtype:breach');
  });
});

test('documents query performs GET on arbitrary path', async () => {
  await withServer(async (fixture) => {
    const RED = loadModules('nodes/starintel-server.js', 'nodes/starintel-documents.js');
    const node = makeNode(RED, 'starintel-documents',
      { op: 'query', path: '/documents/users/by-name/foo' }, { baseUrl: fixture.baseUrl });
    const result = await driveInput(node, {});
    // The fixture has no by-X route; this asserts the request shape only
    // would 500 — instead assert error typing on unhandled route.
    assert.strictEqual(result.err.code, 'STARHTTP_STATUS');
    assert.strictEqual(fixture.requests[0].url, '/documents/users/by-name/foo');
  });
});

test('documents node types server errors as STARHTTP_STATUS', async () => {
  await withServer(async (fixture) => {
    const RED = loadModules('nodes/starintel-server.js', 'nodes/starintel-documents.js');
    const node = makeNode(RED, 'starintel-documents', { op: 'query', path: '/nope' }, { baseUrl: fixture.baseUrl });
    const result = await driveInput(node, {});
    assert.strictEqual(result.sent.length, 0);
    assert.strictEqual(result.err.code, 'STARHTTP_STATUS');
    assert.strictEqual(result.err.statusCode, 500);
  });
});

test('documents node times slow servers out as STARHTTP_TIMEOUT', async () => {
  await withServer(async (fixture) => {
    const RED = loadModules('nodes/starintel-server.js', 'nodes/starintel-documents.js');
    const node = makeNode(RED, 'starintel-documents',
      { op: 'query', path: '/slow' }, { baseUrl: fixture.baseUrl, timeoutMs: 150 });
    const result = await driveInput(node, {});
    assert.strictEqual(result.sent.length, 0);
    assert.strictEqual(result.err.code, 'STARHTTP_TIMEOUT');
  });
});

test('documents node refuses to run without server config', async () => {
  const RED = loadModules('nodes/starintel-server.js', 'nodes/starintel-documents.js');
  const node = instantiate(RED, 'starintel-documents', { op: 'ingest', server: 'missing' });
  const result = await driveInput(node, { payload: {} });
  assert.strictEqual(result.sent.length, 0);
  assert.strictEqual(result.err.code, 'STAR_CONFIG');
});
