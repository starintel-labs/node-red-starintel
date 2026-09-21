#!/usr/bin/env node
// Metaprogramming: scaffold a new node-red-starintel node end to end.
//   node scripts/generate-node.js <node-name> "<editor label>" [--server]
// Writes nodes/<name>.js, nodes/<name>.html, test/<name>.test.js and
// registers the node in package.json.
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const [name, label, ...flags] = process.argv.slice(2);
if (!name || !/^[a-z][a-z0-9-]*$/.test(name) || !label) {
  console.error('usage: node scripts/generate-node.js <node-name> "<editor label>" [--server]');
  process.exit(1);
}
const needsServer = flags.includes('--server');
const root = path.resolve(__dirname, '..');

const js = `module.exports = function (RED) {
  'use strict';

  function ${pascal(name)}Node(config) {
    RED.nodes.createNode(this, config);
    const node = this;${needsServer ? `
    node.server = RED.nodes.getNode(config.server);` : ''}

    node.on('input', function (msg, send, done) {
      send = send || function () { node.send.apply(node, arguments); };
      done = done || function (err) { if (err) node.error(err, msg); };
      // TODO: implement ${name}
      msg.payload = msg.payload;
      send(msg);
      done();
    });
  }

  RED.nodes.registerType('${name}', ${pascal(name)}Node);
};
`;

const html = `<script type="text/javascript">
    RED.nodes.registerType('${name}', {
        category: 'starintel',
        color: '#e67e22',
        defaults: {
            name: { value: '' }${needsServer ? `,\n            server: { type: 'starintel-server', required: true }` : ''}
        },
        inputs: 1,
        outputs: 1,
        icon: 'file.svg',
        label: function () {
            return this.name || '${label}';
        }
    });
</script>

<script type="text/html" data-template-name="${name}">
    <div class="form-row">
        <label for="node-input-name"><i class="fa fa-tag"></i> Name</label>
        <input type="text" id="node-input-name">
    </div>${needsServer ? `
    <div class="form-row">
        <label for="node-input-server"><i class="fa fa-server"></i> Server</label>
        <input type="text" id="node-input-server">
    </div>` : ''}
</script>

<script type="text/html" data-help-name="${name}">
    <p>${label} (generated scaffold — implement the TODO in nodes/${name}.js).</p>
</script>
`;

const test = `'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { loadModules, instantiate, driveInput } = require('./helpers');

test('${name} generated scaffold passes messages through', async () => {
  const RED = loadModules('nodes/${name}.js');
  const node = instantiate(RED, '${name}', {${needsServer ? " server: 'srv'" : ''} });${needsServer ? "\n  RED._nodesById.srv = { id: 'srv', baseUrl: 'http://unused.example', timeoutMs: 8000 };" : ''}
  const result = await driveInput(node, { payload: 'x' });
  assert.strictEqual(result.err, undefined);
  assert.strictEqual(result.sent[0].payload, 'x');
});
`;

const pkgPath = path.join(root, 'package.json');
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
pkg['node-red'].nodes[name] = `nodes/${name}.js`;
if (!pkg.devDependencies) pkg.devDependencies = {};

fs.writeFileSync(path.join(root, 'nodes', `${name}.js`), js);
fs.writeFileSync(path.join(root, 'nodes', `${name}.html`), html);
fs.writeFileSync(path.join(root, 'test', `${name}.test.js`), test);
fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');
console.log(`generated nodes/${name}.js nodes/${name}.html test/${name}.test.js and registered ${name}`);

function pascal(s) {
  return s.split('-').map((p) => p[0].toUpperCase() + p.slice(1)).join('');
}
