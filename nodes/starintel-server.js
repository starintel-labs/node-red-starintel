module.exports = function (RED) {
  'use strict';

  function StarintelServerNode(config) {
    RED.nodes.createNode(this, config);
    this.baseUrl = String(config.baseUrl || '').replace(/\/+$/, '');
    this.timeoutMs = Number(config.timeoutMs) || 8000;
  }

  RED.nodes.registerType('starintel-server', StarintelServerNode);
};
