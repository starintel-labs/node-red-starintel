module.exports = function (RED) {
  'use strict';

  const http = require('../lib/starintel-http');

  const docs = require('../lib/starintel-docs');
  function manifestDocument(config, msg) {
    const actor = config.actor || msg.actor || 'starintel-node';
    return docs.actorManifestDocument({ actor_id: actor, consumer_path: config.consumerPath }, {
      name: config.actorName || actor, manifest_type: config.manifestType || 'node',
      target_options: resolveList(config.targetOptions, msg.target_options)
    });
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
