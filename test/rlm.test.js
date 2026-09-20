'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { loadModules, instantiate, driveInput, fixturePath, readCapture } = require('./helpers');
const { startFixtureServer } = require('./fixture-server');

const RUNTIME = {
  id: 'rt1',
  swipl: fixturePath('fake-swipl'),
  rlmHome: '/opt/prolog-rlm',
  contextBytes: 8192,
  hardTimeoutMs: 15000
};

async function withServer(fn) {
  const fixture = await startFixtureServer();
  try {
    return await fn(fixture);
  } finally {
    await new Promise((resolve) => fixture.server.close(resolve));
  }
}

function makeNode(RED, config, fixture, runtime) {
  RED._nodesById.srv = { id: 'srv', baseUrl: fixture.baseUrl, timeoutMs: 8000 };
  RED._nodesById.rt1 = Object.assign({}, RUNTIME, runtime || {});
  return instantiate(RED, 'starintel-rlm', Object.assign({ server: 'srv', runtime: 'rt1' }, config));
}

function captureFile() {
  return path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'srlm-')), 'cap.json');
}

test('starintel-rlm feeds dataset context into the rlm loop', async () => {
  await withServer(async (fixture) => {
    const cap = captureFile();
    const restore = { ...process.env };
    Object.assign(process.env, { FAKE_SWIPL_CAPTURE: cap, FAKE_SWIPL_MODE: 'ok' });
    const RED = loadModules('nodes/starintel-server.js', 'nodes/starintel-rlm.js');
    const node = makeNode(RED, { query: 'summarize the dataset', contextMode: 'dataset', datasetQ: '*:*', datasetLimit: 10 }, fixture);
    const result = await driveInput(node, {});
    for (const k of Object.keys(restore)) process.env[k] = restore[k];
    delete process.env.FAKE_SWIPL_MODE;

    assert.strictEqual(result.err, undefined, result.err && result.err.message);
    // HTTP context fetch hit the fixture search route.
    assert.match(fixture.requests[0].url, /\/api\/v1\/documents\/search\?/);
    assert.match(fixture.requests[0].url, /q=\*%3A\*/);
    // The rlm subprocess received the dataset docs as --context.
    const argv = readCapture(cap).argv.join(' ');
    assert.match(argv, /rlm summarize the dataset/);
    const ctxIndex = argv.indexOf('--context');
    assert.ok(ctxIndex > 0, 'no --context flag');
    assert.match(argv.slice(ctxIndex, ctxIndex + 200), /actor-manifest/);
    // Envelope flowed to msg.payload.
    assert.strictEqual(result.sent[0].payload.ok, true);
  });
});

test('starintel-rlm publishes an agentic actor-manifest when enabled', async () => {
  await withServer(async (fixture) => {
    const cap = captureFile();
    const restore = { ...process.env };
    Object.assign(process.env, { FAKE_SWIPL_CAPTURE: cap, FAKE_SWIPL_MODE: 'ok' });
    const RED = loadModules('nodes/starintel-server.js', 'nodes/starintel-rlm.js');
    const node = makeNode(RED, {
      query: 'q',
      contextMode: 'static',
      contextStatic: 'CTX',
      publishManifest: true,
      actorName: 'probe-agent',
      targetOptions: 'deep'
    }, fixture);
    const result = await driveInput(node, {});
    for (const k of Object.keys(restore)) process.env[k] = restore[k];
    delete process.env.FAKE_SWIPL_MODE;

    assert.strictEqual(result.err, undefined, result.err && result.err.message);
    assert.strictEqual(result.sent[0].payload.ok, true);
    const manifestReq = fixture.requests.find((r) => r.method === 'POST' && r.url === '/api/v1/documents');
    assert.ok(manifestReq, 'manifest was not ingested');
    assert.strictEqual(manifestReq.body.dtype, 'actor-manifest');
    assert.strictEqual(manifestReq.body.data.actor, 'probe-agent');
    assert.strictEqual(manifestReq.body.data.manifest_type, 'agentic');
    assert.deepStrictEqual(manifestReq.body.data.target_options, ['deep']);
  });
});

test('starintel-rlm keeps agent output when manifest ingest fails', async () => {
  await withServer(async (fixture) => {
    const cap = captureFile();
    const restore = { ...process.env };
    Object.assign(process.env, { FAKE_SWIPL_CAPTURE: cap, FAKE_SWIPL_MODE: 'ok' });
    const RED = loadModules('nodes/starintel-server.js', 'nodes/starintel-rlm.js');
    // Timeout of 1ms makes the manifest POST fail after the rlm run.
    const node = makeNode(RED, {
      query: 'q',
      contextMode: 'none',
      publishManifest: true,
      actorName: 'probe-agent'
    }, fixture, {});
    // Override server timeout after wiring: manifest POST aborts fast.
    RED._nodesById.srv.timeoutMs = 1;
    const result = await driveInput(node, {});
    for (const k of Object.keys(restore)) process.env[k] = restore[k];
    delete process.env.FAKE_SWIPL_MODE;

    assert.strictEqual(result.err, undefined, result.err && result.err.message);
    assert.strictEqual(result.sent[0].payload.ok, true);
    assert.ok(result.sent[0].manifest_error, 'manifest_error missing');
  });
});

test('starintel-rlm refuses to run without the prolog-rlm runtime config', async () => {
  await withServer(async (fixture) => {
    const RED = loadModules('nodes/starintel-server.js', 'nodes/starintel-rlm.js');
    const node = instantiate(RED, 'starintel-rlm', { server: 'srv', runtime: 'missing' });
    RED._nodesById.srv = { id: 'srv', baseUrl: fixture.baseUrl, timeoutMs: 8000 };
    const result = await driveInput(node, { payload: 'q' });
    assert.strictEqual(result.sent.length, 0);
    assert.strictEqual(result.err.code, 'RLM_CONFIG');
  });
});

test('starintel-rlm static context reaches the subprocess verbatim', async () => {
  await withServer(async (fixture) => {
    const cap = captureFile();
    const restore = { ...process.env };
    Object.assign(process.env, { FAKE_SWIPL_CAPTURE: cap, FAKE_SWIPL_MODE: 'ok' });
    const RED = loadModules('nodes/starintel-server.js', 'nodes/starintel-rlm.js');
    const node = makeNode(RED, { query: 'q', contextMode: 'static', contextStatic: 'TOKEN_42' }, fixture);
    const result = await driveInput(node, {});
    for (const k of Object.keys(restore)) process.env[k] = restore[k];
    delete process.env.FAKE_SWIPL_MODE;
    assert.strictEqual(result.err, undefined);
    assert.match(readCapture(cap).argv.join(' '), /--context TOKEN_42/);
  });
});
