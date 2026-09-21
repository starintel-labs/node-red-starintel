module.exports = function (RED) {
  'use strict';

  const http = require('../lib/starintel-http');
  const docs = require('../lib/starintel-docs');

  // StarIntel operation lifecycle (dtype "operation"; required data fields
  // mission/status/phases per the v0.9 lock). Phases are free-form objects;
  // status is a free string with common presets offered in the editor.
  const STATUS_PRESETS = ['planned', 'active', 'paused', 'complete', 'abandoned'];

  function StarintelOperationsNode(config) {
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
      const op = config.op || 'create';

      if (op === 'create') {
        const mission = config.mission || (typeof msg.payload === 'string' ? msg.payload : msg.mission);
        if (!mission) {
          const e = new Error('no mission: set the node mission or msg.payload');
          e.code = 'STAR_CONFIG';
          return done(e);
        }
        let phases = [];
        try { phases = config.phases ? JSON.parse(config.phases) : (msg.phases || []); }
        catch (_) {
          const e = new Error('phases is not valid JSON');
          e.code = 'STAR_CONFIG';
          return done(e);
        }
        const document = docs.operationDocument(mission, phases, config.status || msg.status);
        msg.payload = document;
        if (config.emit) {
          http.request(node.server, 'POST', '/api/v1/documents', { body: document })
            .then((result) => { msg.emit_result = result; send(msg); done(); }, done);
        } else { send(msg); done(); }
        return;
      }

      const id = config.documentId || msg.id || msg.topic;
      if (!id) {
        const e = new Error('no operation id: set the node field or msg.id');
        e.code = 'STAR_CONFIG';
        return done(e);
      }
      const path = '/api/v1/documents/' + encodeURIComponent(id);

      if (op === 'get') {
        http.request(node.server, 'GET', path).then((doc) => {
          msg.payload = doc; send(msg); done();
        }, done);
        return;
      }
      if (op === 'set-status') {
        const status = config.status || msg.status;
        if (!status) {
          const e = new Error('no status: set the node status or msg.status');
          e.code = 'STAR_CONFIG';
          return done(e);
        }
        http.request(node.server, 'GET', path).then((doc) => {
          doc.data = doc.data || {};
          const previous = doc.data.status;
          doc.data.status = status;
          doc.data.status_history = Array.isArray(doc.data.status_history) ? doc.data.status_history : [];
          if (previous && previous !== status) {
            doc.data.status_history.push({ status: previous, at: docs.utcNow() });
          }
          doc.date_updated = docs.utcNow();
          return http.request(node.server, 'PUT', path, { body: doc });
        }).then((doc) => {
          msg.payload = doc; send(msg); done();
        }, done);
        return;
      }
      if (op === 'add-phase') {
        let phase = msg.phase;
        try { if (!phase && config.phase) phase = JSON.parse(config.phase); }
        catch (_) {
          const e = new Error('phase is not valid JSON');
          e.code = 'STAR_CONFIG';
          return done(e);
        }
        http.request(node.server, 'GET', path).then((doc) => {
          doc.data = doc.data || {};
          doc.data.phases = Array.isArray(doc.data.phases) ? doc.data.phases : [];
          doc.data.phases.push(phase || { name: 'unnamed' });
          doc.date_updated = docs.utcNow();
          return http.request(node.server, 'PUT', path, { body: doc });
        }).then((doc) => {
          msg.payload = doc; send(msg); done();
        }, done);
        return;
      }
      const e = new Error('unknown operation ' + op);
      e.code = 'STAR_CONFIG';
      done(e);
    });
  }

  RED.nodes.registerType('starintel-operations', StarintelOperationsNode);
};
