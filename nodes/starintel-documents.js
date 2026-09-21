module.exports = function (RED) {
  'use strict';

  const http = require('../lib/starintel-http');

  function StarintelDocumentsNode(config) {
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
      const op = config.op || 'ingest';
      const run = handlers[op];
      if (!run) {
        const e = new Error('unknown operation ' + op);
        e.code = 'STAR_CONFIG';
        return done(e);
      }
      run(node, config, msg).then((result) => {
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

  function documentId(config, msg) {
    return config.documentId || msg.id || msg.topic || '';
  }

  const handlers = {
    ingest(node, config, msg) {
      return http.request(node.server, 'POST', '/api/v1/documents', { body: msg.payload });
    },
    bulk(node, config, msg) {
      return http.request(node.server, 'POST', '/api/v1/documents/bulk', { body: msg.payload });
    },
    get(node, config, msg) {
      const id = documentId(config, msg);
      if (!id) return Promise.reject(missingId());
      return http.request(node.server, 'GET', '/api/v1/documents/' + encodeURIComponent(id));
    },
    update(node, config, msg) {
      const id = documentId(config, msg);
      if (!id) return Promise.reject(missingId());
      return http.request(node.server, 'PUT', '/api/v1/documents/' + encodeURIComponent(id), { body: msg.payload });
    },
    delete(node, config, msg) {
      const id = documentId(config, msg);
      if (!id) return Promise.reject(missingId());
      return http.request(node.server, 'DELETE', '/api/v1/documents/' + encodeURIComponent(id));
    },
    search(node, config, msg) {
      const query = Object.assign(
        {},
        msg.params || {},
        parseJsonField(config.params),
        { q: config.q || msg.q || (typeof msg.payload === 'string' ? msg.payload : undefined) }
      );
      return http.request(node.server, 'GET', '/api/v1/documents/search', { query });
    },
    query(node, config, msg) {
      let path = config.path || msg.path || '';
      if (!path) return Promise.reject(missingPath());
      if (!path.startsWith('/')) path = '/' + path;
      return http.request(node.server, 'GET', path, {
        query: Object.assign({}, msg.params || {}, parseJsonField(config.params))
      });
    }
  };

  function missingId() {
    const e = new Error('no document id: set the node field or msg.id');
    e.code = 'STAR_CONFIG';
    return e;
  }

  function missingPath() {
    const e = new Error('no query path: set the node path or msg.path');
    e.code = 'STAR_CONFIG';
    return e;
  }

  function parseJsonField(text) {
    if (!text) return {};
    try { return JSON.parse(text) || {}; } catch (_) { return {}; }
  }

  RED.nodes.registerType('starintel-documents', StarintelDocumentsNode);
};
