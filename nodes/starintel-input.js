module.exports = function (RED) {
  'use strict';

  const http = require('../lib/starintel-http');

  // Canonical StarIntel input: search the dataset (or fetch by id) and emit
  // documents following the canonical flow — one msg per document (split) or
  // the raw result envelope on payload (batch).
  function StarintelInputNode(config) {
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
      const mode = config.mode || 'search';
      let work;
      if (mode === 'get') {
        const id = config.documentId || msg.id || msg.topic;
        if (!id) {
          const e = new Error('no document id: set the node field or msg.id');
          e.code = 'STAR_CONFIG';
          return done(e);
        }
        work = http.request(node.server, 'GET', '/api/v1/documents/' + encodeURIComponent(id))
          .then((doc) => ({ docs: [doc] }));
      } else {
        let params = {};
        try { params = config.params ? JSON.parse(config.params) : {}; }
        catch (_) {
          const e = new Error('params is not valid JSON');
          e.code = 'STAR_CONFIG';
          return done(e);
        }
        const query = Object.assign({}, params, {
          q: config.q || msg.q || (typeof msg.payload === 'string' ? msg.payload : params.q),
          limit: config.limit || params.limit || 25,
          include_docs: 'true'
        });
        work = http.request(node.server, 'GET', '/api/v1/documents/search', { query });
      }
      work.then((result) => {
        const docs = (result && result.docs) || [];
        node.status({ fill: 'green', shape: 'dot', text: docs.length + ' docs' });
        if (config.split) {
          for (const doc of docs) {
            send(Object.assign({}, msg, { payload: doc, topic: doc.id || doc._id }));
          }
          done();
        } else {
          msg.payload = result;
          send(msg);
          done();
        }
      }, (err) => {
        node.status({ fill: 'red', shape: 'ring', text: err.code || 'error' });
        done(err);
      });
    });
  }

  RED.nodes.registerType('starintel-input', StarintelInputNode);
};
