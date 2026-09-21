module.exports = function (RED) {
  'use strict';

  const http = require('../lib/starintel-http');

  // Custom data UI for StarIntel workflows: each instance serves one page at
  // GET <base>/starintel-ui/<path> rendering a live dataset search as a table
  // or card list, with optional auto-refresh. Pure HTML/JS served from the
  // node; data fetched through the same page's JSON endpoint.
  function pageHtml(node, cfg) {
    const refresh = Number(cfg.refreshSec) || 0;
    return '<!doctype html><html><head><meta charset="utf-8">' +
      '<title>' + escapeHtml(cfg.title || 'StarIntel') + '</title>' +
      '<style>body{font-family:system-ui,sans-serif;margin:2rem;background:#14171c;color:#e6e6e6}' +
      'h1{color:#f0b429}table{border-collapse:collapse;width:100%}th,td{border:1px solid #2c3440;padding:.4rem .6rem;text-align:left;font-size:.9rem}' +
      'th{background:#1d232c}tr:hover{background:#1b2129}.cards{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:1rem}' +
      '.card{border:1px solid #2c3440;border-radius:8px;padding:.8rem;background:#1a2028}' +
      '.muted{color:#8b98a5}.meta{font-size:.75rem;color:#8b98a5}</style></head><body>' +
      '<h1>' + escapeHtml(cfg.title || 'StarIntel') + '</h1>' +
      '<p class="meta">q=' + escapeHtml(cfg.q || '*:*') + (refresh ? ' · refresh ' + refresh + 's' : '') + '</p>' +
      '<div id="root"><p class="muted">loading…</p></div>' +
      '<script>const DATA=' + JSON.stringify({ columns: splitCsv(cfg.columns), mode: cfg.view || 'table' }) + ';' +
      'async function load(){const r=await fetch(location.pathname+"/data");const j=await r.json();' +
      'const docs=j.docs||[];const root=document.getElementById("root");' +
      'if(!docs.length){root.innerHTML="<p class=\\"muted\\">no documents</p>";return;}' +
      'const cols=DATA.columns.length?DATA.columns:Object.keys(docs[0]);' +
      'if(DATA.mode==="cards"){root.innerHTML="<div class=\\"cards\\">"+docs.map(d=>"<div class=\\"card\\">"+cols.map(c=>"<div><b>"+c+"</b>: "+String(d[c]!==undefined?d[c]:"").slice(0,200)+"</div>").join("")+"</div>").join("")+"</div>";}' +
      'else{root.innerHTML="<table><thead><tr>"+cols.map(c=>"<th>"+c+"</th>").join("")+"</tr></thead><tbody>"+docs.map(d=>"<tr>"+cols.map(c=>"<td>"+String(d[c]!==undefined?d[c]:"").slice(0,200)+"</td>").join("")+"</tr>").join("")+"</tbody></table>";}}' +
      'load();' + (refresh ? 'setInterval(load,' + (refresh * 1000) + ');' : '') +
      '</script></body></html>';
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function splitCsv(text) {
    return String(text || '').split(',').map((s) => s.trim()).filter(Boolean);
  }

  function StarintelUiNode(config) {
    RED.nodes.createNode(this, config);
    const node = this;
    node.server = RED.nodes.getNode(config.server);
    const mount = String(config.path || 'starintel').replace(/[^a-z0-9-]/gi, '-').toLowerCase();

    const handler = function (req, res) {
      if (req.url.endsWith('/data')) {
        const params = {
          q: config.q || '*:*',
          limit: config.limit || 25,
          include_docs: 'true'
        };
        http.request(node.server, 'GET', '/api/v1/documents/search', { query: params })
          .then((result) => {
            res.setHeader('content-type', 'application/json');
            res.end(JSON.stringify(result));
          }, (err) => {
            res.statusCode = 502;
            res.end(JSON.stringify({ error: err.message }));
          });
        return;
      }
      res.setHeader('content-type', 'text/html; charset=utf-8');
      res.end(pageHtml(node, config));
    };

    RED.httpNode.get('/starintel-ui/' + mount, handler);
    RED.httpNode.get('/starintel-ui/' + mount + '/data', handler);

    node.on('close', function () {
      // Node-RED removes express routes only on restart; documenting that
      // remounting uses the same deterministic path.
    });
  }

  RED.nodes.registerType('starintel-ui', StarintelUiNode);
};
