module.exports = function (RED) {
  'use strict';

  const http = require('../lib/starintel-http');

  // Local copy of the prolog-rlm subprocess contract (documented CLI:
  // swipl -q -s <rlmHome>/bin/prolog-rlm.pl -- rlm QUERY ... --json).
  // Duplicated deliberately so this palette does not require the
  // node-red-prolog-rlm package at require() time; the shared runtime
  // *configuration* crosses packages via the global config-node type
  // "prolog-rlm-runtime".
  function buildArgv(config, command, extras) {
    const script = joinPath(config.rlmHome, 'bin', 'prolog-rlm.pl');
    const argv = ['-q', '-s', script, '--', command];
    for (const extra of extras || []) {
      if (extra !== undefined && extra !== null && extra !== '') argv.push(String(extra));
    }
    argv.push('--json');
    if (config.model) argv.push('--model', String(config.model));
    if (config.endpoint) {
      argv.push('--endpoint', String(config.endpoint));
      if (config.noCredential) argv.push('--no-credential');
      else if (config.credentialEnv) argv.push('--credential-env', String(config.credentialEnv));
    }
    if (config.maxTokens) argv.push('--max-tokens', String(config.maxTokens));
    if (config.maxCost) argv.push('--max-cost', String(config.maxCost));
    if (config.timeLimit) argv.push('--time-limit', String(config.timeLimit));
    if (config.contextBytes) argv.push('--context-bytes', String(config.contextBytes));
    return argv;
  }

  function joinPath(base, ...rest) {
    if (!base) return rest.join('/');
    return [String(base).replace(/\/+$/, '')].concat(rest).join('/');
  }

  function truncate(text, max) {
    const s = String(text || '');
    const limit = max || 4000;
    return s.length > limit ? s.slice(0, limit) + '...[truncated]' : s;
  }

  function runPrologRlm(config, command, extras, callback) {
    const { execFile } = require('node:child_process');
    const fs = require('node:fs');
    const swipl = config.swipl || 'swipl';
    const argv = buildArgv(config, command, extras);
    const hardMs = config.hardTimeoutMs ||
      ((config.timeLimit ? Number(config.timeLimit) * 1000 : 120000) + 15000);
    let cwd;
    if (config.rlmHome) {
      try { fs.statSync(config.rlmHome); cwd = config.rlmHome; } catch (_) { cwd = undefined; }
    }
    execFile(swipl, argv, {
      cwd,
      timeout: hardMs,
      killSignal: 'SIGKILL',
      maxBuffer: 16 * 1024 * 1024,
      env: process.env
    }, (err, stdout, stderr) => {
      if (err) {
        if (err.code === 'ENOENT') {
          const e = new Error('failed to start runtime binary ' + swipl);
          e.code = 'RLM_SPAWN';
          return callback(e);
        }
        if (err.killed || err.signal === 'SIGKILL') {
          const e = new Error('prolog-rlm process timed out or was killed');
          e.code = 'RLM_TIMEOUT';
          return callback(e);
        }
        const e = new Error('prolog-rlm exited with status ' + err.code +
          (stderr ? ': ' + truncate(stderr, 2000) : ''));
        e.code = 'RLM_EXIT';
        e.exitCode = err.code;
        return callback(e);
      }
      let envelope;
      try {
        envelope = JSON.parse(stdout);
      } catch (_) {
        const e = new Error('prolog-rlm stdout was not valid JSON: ' + truncate(stdout, 2000));
        e.code = 'RLM_PARSE';
        return callback(e);
      }
      callback(null, envelope);
    });
  }

  function manifestDocument(node, config, msg) {
    const data = {
      actor: config.actorName || 'starintel-rlm',
      name: config.actorName || 'starintel-rlm',
      manifest_type: 'agentic',
      generated_at: new Date().toISOString(),
      schema_versions: ['0.9.0']
    };
    const opts = String(config.targetOptions || '').split(',').map((s) => s.trim()).filter(Boolean);
    if (opts.length) data.target_options = opts;
    return { dtype: 'actor-manifest', data };
  }

  function StarintelRlmNode(config) {
    RED.nodes.createNode(this, config);
    const node = this;
    node.server = RED.nodes.getNode(config.server);
    node.runtime = RED.nodes.getNode(config.runtime);

    node.on('input', function (msg, send, done) {
      send = send || function () { node.send.apply(node, arguments); };
      done = done || function (err) { if (err) node.error(err, msg); };

      if (!node.runtime) {
        const e = new Error('missing prolog-rlm-runtime configuration (install/configure node-red-prolog-rlm)');
        e.code = 'RLM_CONFIG';
        return done(e);
      }
      if (!node.server) {
        const e = new Error('missing starintel-server configuration');
        e.code = 'STAR_CONFIG';
        return done(e);
      }

      let query = (config.query || '').trim();
      if (!query) {
        if (msg.payload === undefined || msg.payload === null) {
          const e = new Error('no query: set the node query or provide msg.payload');
          e.code = 'RLM_CONFIG';
          return done(e);
        }
        query = String(msg.payload);
      }

      node.status({ fill: 'blue', shape: 'dot', text: 'context' });
      prepareContext(config, msg).then((context) => {
        node.status({ fill: 'blue', shape: 'dot', text: 'rlm' });
        const extras = [query];
        if (context) extras.push('--context', context);
        runPrologRlm(node.runtime, 'rlm', extras, (err, envelope) => {
          if (err) {
            node.status({ fill: 'red', shape: 'ring', text: err.code || 'error' });
            return done(err);
          }
          msg.payload = envelope;
          const finish = () => {
            node.status({ fill: 'green', shape: 'dot', text: 'done' });
            send(msg);
            done();
          };
          if (config.publishManifest) {
            node.status({ fill: 'blue', shape: 'dot', text: 'manifest' });
            http.request(node.server, 'POST', '/api/v1/documents', {
              body: manifestDocument(node, config, msg)
            }).then(finish, (manifestErr) => {
              // The agent result still flows; manifest failure is surfaced
              // on msg.manifest_error without failing the agent output.
              msg.manifest_error = manifestErr.message;
              finish();
            });
          } else {
            finish();
          }
        });
      }, (err) => {
        node.status({ fill: 'red', shape: 'ring', text: err.code || 'error' });
        done(err);
      });
    });

    function prepareContext(config, msg) {
      const mode = config.contextMode || 'none';
      if (mode === 'none') return Promise.resolve('');
      if (mode === 'static') return Promise.resolve(config.contextStatic || '');
      if (mode === 'dataset') {
        const q = config.datasetQ || msg.q || '*:*';
        const limit = config.datasetLimit || 10;
        return http.request(node.server, 'GET', '/api/v1/documents/search', {
          query: { q, limit, include_docs: 'true' }
        }).then((result) => {
          const docs = (result && result.docs) || [];
          const budget = Number(node.runtime.contextBytes) || 8192;
          let serialized = JSON.stringify(docs);
          if (serialized.length > budget) serialized = serialized.slice(0, budget);
          return serialized;
        });
      }
      if (mode === 'msg') {
        const c = msg.context;
        if (c === undefined || c === null) return Promise.resolve('');
        return Promise.resolve(typeof c === 'string' ? c : JSON.stringify(c));
      }
      return Promise.resolve('');
    }
  }

  RED.nodes.registerType('starintel-rlm', StarintelRlmNode);
};
