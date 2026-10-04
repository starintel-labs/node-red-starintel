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

function makeNode(RED, config, serverCfg) {
  RED._nodesById.srv = Object.assign({ id: 'srv', baseUrl: 'http://invalid.example', timeoutMs: 8000 }, serverCfg);
  return instantiate(RED, 'starintel-actors', Object.assign({ server: 'srv' }, config));
}

test('actors manifests searches the dataset for actor-manifests', async () => {
  await withServer(async (fixture) => {
    const RED = loadModules('nodes/starintel-server.js', 'nodes/starintel-actors.js');
    const node = makeNode(RED, { op: 'manifests' }, { baseUrl: fixture.baseUrl });
    const result = await driveInput(node, {});
    assert.strictEqual(result.err, undefined);
    const url = fixture.requests[0].url;
    assert.match(url, /\/api\/v1\/documents\/search\?/);
    assert.match(url, /q=dtype%3Aactor-manifest/);
    assert.match(url, /limit=100/);
    assert.strictEqual(result.sent[0].payload.docs[0].data.actor, 'bluesky');
  });
});

test('actors dispatch posts msg.payload to /new/target/:actor', async () => {
  await withServer(async (fixture) => {
    const RED = loadModules('nodes/starintel-server.js', 'nodes/starintel-actors.js');
    const node = makeNode(RED, { op: 'dispatch', actor: 'bluesky' }, { baseUrl: fixture.baseUrl });
    const result = await driveInput(node, { payload: { usernames: ['a'] } });
    assert.strictEqual(result.err, undefined);
    const req = fixture.requests[0];
    assert.strictEqual(req.method, 'POST');
    assert.strictEqual(req.url, '/new/target/bluesky');
    assert.deepStrictEqual(req.body, { usernames: ['a'] });
  });
});

test('actors targets lists targets for an actor', async () => {
  await withServer(async (fixture) => {
    const RED = loadModules('nodes/starintel-server.js', 'nodes/starintel-actors.js');
    const node = makeNode(RED, { op: 'targets', actor: 'reddit' }, { baseUrl: fixture.baseUrl });
    const result = await driveInput(node, {});
    assert.strictEqual(result.err, undefined);
    assert.strictEqual(fixture.requests[0].method, 'GET');
    assert.strictEqual(fixture.requests[0].url, '/targets/reddit');
  });
});

test('actors publish ingests a strict actor-manifest 0.10.1 document', async () => {
  await withServer(async (fixture) => {
    const RED = loadModules('nodes/starintel-server.js', 'nodes/starintel-actors.js');
    const node = makeNode(RED, {
      op: 'publish',
      actor: 'starintel-rlm-probe',
      actorName: 'starintel-rlm-probe',
      manifestType: 'agentic',
      targetOptions: 'deep, json',
      consumerPath: '/agents/probe'
    }, { baseUrl: fixture.baseUrl });
    const result = await driveInput(node, {});
    assert.strictEqual(result.err, undefined);
    const req = fixture.requests[0];
    assert.strictEqual(req.method, 'POST');
    assert.strictEqual(req.url, '/api/v1/documents');
    const doc = req.body;
    assert.strictEqual(doc.dtype, 'actor-manifest');
    assert.strictEqual(doc.actor, 'starintel-rlm-probe');
    assert.strictEqual(doc.metadata.manifestType, 'agentic');
    assert.strictEqual(doc.consumerPaths[0], '/agents/probe');
    assert.deepStrictEqual(doc.targetOptions.names, ['deep', 'json']);
    assert.ok(Array.isArray(doc.metadata.schemaVersions));
    assert.ok(doc.createdAt);
    require('../lib/starintel-contract').validate(doc);
    assert.strictEqual(doc.data, undefined);
  });
});

test('actors node refuses dispatch without an actor', async () => {
  await withServer(async (fixture) => {
    const RED = loadModules('nodes/starintel-server.js', 'nodes/starintel-actors.js');
    const node = makeNode(RED, { op: 'dispatch' }, { baseUrl: fixture.baseUrl });
    const result = await driveInput(node, { payload: {} });
    assert.strictEqual(result.sent.length, 0);
    assert.strictEqual(result.err.code, 'STAR_CONFIG');
  });
});
