module.exports = function (RED) {
  'use strict';

  const http = require('../lib/starintel-http');
  const docs = require('../lib/starintel-docs');
  const catalog = require('../lib/pro-actor-catalog.json');

  // Pro-actor catalog node. Catalog is generated from
  // starintel-pro-actors python/src/starintel_pro_actors/manifests.py
  // (17 actors; regenerate with the script in scripts/).
  function StarintelProActorsNode(config) {
    RED.nodes.createNode(this, config);
    const node = this;
    node.server = RED.nodes.getNode(config.server);

    node.on('input', function (msg, send, done) {
      send = send || function () { node.send.apply(node, arguments); };
      done = done || function (err) { if (err) node.error(err, msg); };
      const op = config.op || 'list';

      if (op === 'list') {
        msg.payload = Object.keys(catalog).map((id) => summarize(catalog[id]));
        send(msg);
        return done();
      }
      const actorId = config.actor || msg.actor;
      const spec = actorId && catalog[actorId];
      if (!spec) {
        const e = new Error('unknown pro-actor: ' + actorId + ' (use op:list for the catalog)');
        e.code = 'STAR_CONFIG';
        return done(e);
      }
      if (op === 'options') {
        msg.payload = {
          actor: spec.actor_id,
          actor_type: spec.actor_type,
          operations: spec.operations,
          input_dtypes: spec.input_dtypes,
          output_dtypes: spec.output_dtypes,
          target_options: spec.target_options,
          configuration_schema: spec.configuration_schema,
          capabilities: spec.capabilities,
          dependencies: spec.dependencies
        };
        send(msg);
        return done();
      }
      if (op === 'manifest') {
        const document = docs.actorManifestDocument(spec);
        msg.payload = document;
        if (config.emit) {
          if (!node.server) {
            const e = new Error('missing starintel-server configuration');
            e.code = 'STAR_CONFIG';
            return done(e);
          }
          http.request(node.server, 'POST', '/api/v1/documents', { body: document })
            .then((result) => {
              msg.emit_result = result;
              send(msg);
              done();
            }, done);
        } else {
          send(msg);
          return done();
        }
        return;
      }
      const e = new Error('unknown operation ' + op);
      e.code = 'STAR_CONFIG';
      done(e);
    });
  }

  function summarize(spec) {
    return {
      actor: spec.actor_id,
      actor_type: spec.actor_type,
      runtime: spec.runtime,
      operations: spec.operations,
      output_dtypes: spec.output_dtypes,
      capabilities: spec.capabilities
    };
  }

  RED.nodes.registerType('starintel-pro-actors', StarintelProActorsNode);
};
