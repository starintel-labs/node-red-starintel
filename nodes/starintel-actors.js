module.exports = function (RED) {
  'use strict';

  const http = require('../lib/starintel-http');

  // actor-manifest v0.9 strict data fields per
  // starintel-pro-actors/docs/actor-manifests.org:
  // actor, consumer_path, target_options, manifest_type, name,
  // generated_at, schema_versions. Richer contracts belong in
  // extensions.starintel.actor_manifest.v1 (follow-up issue).
  function manifestDocument(config, msg) {
    const now = new Date().toISOString();
    const targetOptions = resolveList(config.targetOptions, msg.target_options);
    const data = {
      actor: config.actor || msg.actor || 'starintel-node',
      name: config.actorName || config.actor || msg.actor || 'starintel-node',
      manifest_type: config.manifestType || 'node',
      generated_at: now,
      schema_versions: ['0.9.0']
    };
    if (config.consumerPath) data.consumer_path = config.consumerPath;
    if (targetOptions.length) data.target_options = targetOptions;
    return { dtype: 'actor-manifest', data };
  }

  function resolveList(cfgText, msgValue) {
    if (Array.isArray(msgValue)) return msgValue;
    if (cfgText && String(cfgText).trim()) {
      return String(cfgText).split(',').map((s) => s.trim()).filter(Boolean);
    }
    return [];
  }

  function StarintelActorsNode(config) {
    RED.nodes.createNode(this, config);
    const node = this;
    node.server = RED.nodes.getNode(config.server);

    node.on('input', function (msg, send, done) {
      send = send || function () { node.send.apply(node, arguments); };
      done = done || function (err) { if (err) node.error(err, msg); };

      if (!node.server) {
        const e = new Error('missing starintel-server configuration');
        e.code = 'STAR_CONFIG';
        return done(e);
      }
      const op = config.op || 'manifests';
      node.status({ fill: 'blue', shape: 'dot', text: op });
      let work;
      if (op === 'manifests') {
        work = http.request(node.server, 'GET', '/api/v1/documents/search', {
          query: {
            q: config.q || 'dtype:actor-manifest',
            limit: config.limit || 100,
            include_docs: 'true'
          }
        });
      } else if (op === 'dispatch') {
        const actor = config.actor || msg.actor || '';
        if (!actor) { return done(configError('no actor: set the node actor or msg.actor')); }
        work = http.request(node.server, 'POST', '/new/target/' + encodeURIComponent(actor), { body: msg.payload });
      } else if (op === 'targets') {
        const actor = config.actor || msg.actor || '';
        if (!actor) { return done(configError('no actor: set the node actor or msg.actor')); }
        work = http.request(node.server, 'GET', '/targets/' + encodeURIComponent(actor));
      } else if (op === 'publish') {
        work = http.request(node.server, 'POST', '/api/v1/documents', {
          body: manifestDocument(config, msg)
        });
      } else {
        return done(configError('unknown operation ' + op));
      }
      work.then((result) => {
        msg.payload = result;
        node.status({ fill: 'green', shape: 'dot', text: op });
        send(msg);
        done();
      }, (err) => {
        node.status({ fill: 'red', shape: 'ring', text: err.code || 'error' });
        done(err);
      });
    });
  }

  function configError(message) {
    const e = new Error(message);
    e.code = 'STAR_CONFIG';
    return e;
  }

  RED.nodes.registerType('starintel-actors', StarintelActorsNode);
};
