'use strict';

const path = require('node:path');
const fs = require('node:fs');

function makeFakeRED() {
  const types = {};
  const nodesById = {};
  const red = {
    nodes: {
      registerType(name, ctor) { types[name] = ctor; },
      getNode(id) { return nodesById[id]; },
      createNode(node) { node.on = function (evt, cb) { node._handlers = node._handlers || {}; node._handlers[evt] = cb; }; },
      prologRlm: undefined
    },
    log: { debug() {}, warn() {}, error() {} }
  };
  red._types = types;
  red._nodesById = nodesById;
  return red;
}

function loadModule(rel) {
  return loadModules(rel);
}

function loadModules(...rels) {
  const RED = makeFakeRED();
  for (const rel of rels) {
    const abs = path.resolve(__dirname, '..', rel);
    delete require.cache[require.resolve(abs)];
    const mod = require(abs);
    mod(RED);
  }
  return RED;
}

function instantiate(RED, typeName, config, overrides) {
  const node = Object.assign({
    status() {},
    send() {},
    error() {},
    _handlers: {}
  }, overrides || {});
  node.on = function (evt, cb) { node._handlers[evt] = cb; };
  RED._types[typeName].call(node, config);
  return node;
}

function driveInput(node, msg) {
  return new Promise((resolve) => {
    const sent = [];
    const send = (m) => sent.push(m);
    const done = (err) => resolve({ sent, err });
    node._handlers.input(msg, send, done);
  });
}

function fixturePath(name) {
  return path.join(__dirname, 'fixtures', name);
}

function readCapture(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

module.exports = { makeFakeRED, loadModule, loadModules, instantiate, driveInput, fixturePath, readCapture };
