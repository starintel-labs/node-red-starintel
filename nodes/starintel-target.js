module.exports = function (RED) {
  'use strict';

  const http = require('../lib/starintel-http');
  const docs = require('../lib/starintel-docs');

  // Canonical target dispatch per starintel-server
  // normalize-legacy-target-document: dtype "target" with
  // data{actor, target, delay, recurring, options}; the URL actor is
  // authoritative for routing.
  function StarintelTargetNode(config) {
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
      const actor = config.actor || msg.actor || '';
      if (!actor) {
        const e = new Error('no actor: set the node actor or msg.actor');
        e.code = 'STAR_CONFIG';
        return done(e);
      }
      const payload = msg.payload;
      let target = config.target;
      if (!target) {
        if (payload === undefined || payload === null) {
          const e = new Error('no target: set the node target or provide msg.payload');
          e.code = 'STAR_CONFIG';
          return done(e);
        }
        target = typeof payload === 'string' ? payload : JSON.stringify(payload);
      }
      let options = {};
      if (msg.options) options = msg.options;
      else if (config.options) {
        try { options = JSON.parse(config.options) || {}; }
        catch (_) {
          const e = new Error('options is not valid JSON');
          e.code = 'STAR_CONFIG';
          return done(e);
        }
      }
      const document = docs.targetDocument(actor, {
        target,
        delay: Number(config.delay) || msg.delay || 0,
        recurring: !!config.recurring || !!msg.recurring,
        options
      });

      if (config.op === 'build') {
        msg.payload = document;
        send(msg);
        return done();
      }
      node.status({ fill: 'blue', shape: 'dot', text: 'dispatch ' + actor });
      http.request(node.server, 'POST', '/new/target/' + encodeURIComponent(actor), {
        body: document
      }).then((result) => {
        msg.payload = result;
        node.status({ fill: 'green', shape: 'dot', text: 'dispatched' });
        send(msg);
        done();
      }, (err) => {
        node.status({ fill: 'red', shape: 'ring', text: err.code || 'error' });
        done(err);
      });
    });
  }

  RED.nodes.registerType('starintel-target', StarintelTargetNode);
};
