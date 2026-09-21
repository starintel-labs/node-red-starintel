module.exports = function (RED) {
  'use strict';

  // Node-RED admin API client: lets flows (and agents driving them, e.g.
  // starintel-rlm) fully reconfigure the running Node-RED instance.
  // Ops: get-flows | put-flows | get-nodes. Auth, when enabled on the admin
  // API, is an Authorization header taken from an env var referenced by NAME.
  function request(admin, method, path, body) {
    const init = {
      method,
      headers: { accept: 'application/json', 'node-red-api-version': 'v2' }
    };
    const timeoutMs = Number(admin.timeoutMs) || 8000;
    if (admin.authEnv && process.env[admin.authEnv]) {
      init.headers.authorization = process.env[admin.authEnv];
    }
    if (body !== undefined) {
      init.headers['content-type'] = 'application/json';
      init.body = JSON.stringify(body);
    }
    return fetch(String(admin.baseUrl || 'http://127.0.0.1:1880').replace(/\/+$/, '') + path,
      Object.assign(init, { signal: AbortSignal.timeout(timeoutMs) }))
      .then((res) => res.text().then((text) => {
        if (!res.ok) {
          const e = new Error('node-red admin API ' + res.status + ' on ' + method + ' ' + path);
          e.code = 'NRADMIN_STATUS';
          e.statusCode = res.status;
          throw e;
        }
        return text ? JSON.parse(text) : null;
      }));
  }

  function StarintelFlowManagerNode(config) {
    RED.nodes.createNode(this, config);
    const node = this;
    node.baseUrl = config.baseUrl || 'http://127.0.0.1:1880';
    node.authEnv = config.authEnv || '';
    node.timeoutMs = config.timeoutMs || 8000;

    node.on('input', function (msg, send, done) {
      send = send || function () { node.send.apply(node, arguments); };
      done = done || function (err) { if (err) node.error(err, msg); };

      const op = config.op || 'get-flows';
      if (op === 'get-flows') {
        request(node, 'GET', '/flows').then((flows) => {
          msg.payload = flows; send(msg); done();
        }, done);
        return;
      }
      if (op === 'put-flows') {
        const flows = Array.isArray(msg.payload) ? msg.payload : null;
        if (!flows) {
          const e = new Error('put-flows requires msg.payload to be a flow array');
          e.code = 'NRADMIN_CONFIG';
          return done(e);
        }
        request(node, 'GET', '/flows').then((current) => {
          const rev = current && current.rev;
          const body = rev ? { flows, rev } : { flows };
          return request(node, 'POST', '/flows', body);
        }).then((result) => {
          msg.payload = result; send(msg); done();
        }, done);
        return;
      }
      if (op === 'get-nodes') {
        request(node, 'GET', '/nodes').then((nodes) => {
          msg.payload = nodes; send(msg); done();
        }, done);
        return;
      }
      const e = new Error('unknown operation ' + op);
      e.code = 'NRADMIN_CONFIG';
      done(e);
    });
  }

  RED.nodes.registerType('starintel-flow-manager', StarintelFlowManagerNode);
};
