module.exports = function (RED) {
  'use strict';

  const http = require('../lib/starintel-http');
  const docs = require('../lib/starintel-docs');

  // Canonical StarIntel emit: complete the v0.9 envelope client-side and
  // ingest via POST /api/v1/documents (single) or /api/v1/documents/bulk
  // (arrays or forced bulk). Accepts raw data (dtype config set), full
  // documents, or arrays of either.
  function StarintelEmitNode(config) {
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
      const raw = msg.payload;
      const items = Array.isArray(raw) ? raw : [raw];
      const built = items.map((item) => {
        if (item && typeof item === 'object' && item.dtype && item.data) {
          return item;
        }
        return docs.baseDocument(config.dtype || 'observation', item);
      });

      const useBulk = config.bulk || items.length > 1;
      node.status({ fill: 'blue', shape: 'dot', text: 'emit ' + built.length });
      const work = useBulk
        ? http.request(node.server, 'POST', '/api/v1/documents/bulk', { body: built })
        : http.request(node.server, 'POST', '/api/v1/documents', { body: built[0] });
      work.then((result) => {
        msg.payload = result;
        node.status({ fill: 'green', shape: 'dot', text: 'emitted' });
        send(msg);
        done();
      }, (err) => {
        node.status({ fill: 'red', shape: 'ring', text: err.code || 'error' });
        done(err);
      });
    });
  }

  RED.nodes.registerType('starintel-emit', StarintelEmitNode);
};
