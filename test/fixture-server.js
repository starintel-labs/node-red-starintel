'use strict';

const http = require('node:http');

// Deterministic local stand-in for the starintel-server HTTP API.
// Records every request into `requests` and answers canned routes.
function startFixtureServer() {
  const requests = [];
  const server = http.createServer((req, res) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      const body = Buffer.concat(chunks).toString('utf8');
      const record = { method: req.method, url: req.url, body: body ? tryJson(body) : null };
      requests.push(record);
      res.setHeader('content-type', 'application/json');
      const path = req.url.split('?')[0];
      if (path === '/flows' && req.method === 'GET') {
        res.writeHead(200);
        res.end(JSON.stringify({ rev: 'x1', flows: [{ id: 't0', type: 'tab', label: 'base' }] }));
        return;
      }
      if (path === '/flows' && req.method === 'POST') {
        res.writeHead(200);
        res.end(JSON.stringify({ rev: 'x2' }));
        return;
      }
      if (path === '/slow') {
        setTimeout(() => {
          res.writeHead(200);
          res.end('{"ok":true}');
        }, 2000);
        return;
      }
      if (path === '/api/v1/documents' && req.method === 'POST') {
        res.writeHead(201);
        res.end(JSON.stringify({ ok: true, id: 'doc1', received: record.body }));
        return;
      }
      if (path === '/api/v1/documents/bulk' && req.method === 'POST') {
        const n = Array.isArray(record.body) ? record.body.length : 0;
        res.writeHead(201);
        res.end(JSON.stringify({ ok: true, count: n }));
        return;
      }
      if (path === '/api/v1/documents/search' && req.method === 'GET') {
        const params = new URL(req.url, 'http://x').searchParams;
        res.writeHead(200);
        res.end(JSON.stringify({
          total_rows: 1,
          docs: [{ id: 'm1', dtype: 'actor-manifest', data: { actor: 'bluesky' } }],
          echoed_q: params.get('q')
        }));
        return;
      }
      const docMatch = path.match(/^\/api\/v1\/documents\/([^/]+)$/);
      if (docMatch) {
        res.writeHead(200);
        res.end(JSON.stringify({ ok: true, id: decodeURIComponent(docMatch[1]), method: req.method }));
        return;
      }
      const targetMatch = path.match(/^\/new\/target\/([^/]+)$/);
      if (targetMatch && req.method === 'POST') {
        res.writeHead(201);
        res.end(JSON.stringify({ ok: true, actor: decodeURIComponent(targetMatch[1]), received: record.body }));
        return;
      }
      const targetsMatch = path.match(/^\/targets\/([^/]+)$/);
      if (targetsMatch && req.method === 'GET') {
        res.writeHead(200);
        res.end(JSON.stringify({ ok: true, actor: decodeURIComponent(targetsMatch[1]), targets: [] }));
        return;
      }
      res.writeHead(500);
      res.end(JSON.stringify({ ok: false, error: 'unhandled fixture route' }));
    });
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      resolve({ server, requests, baseUrl: 'http://127.0.0.1:' + server.address().port });
    });
  });
}

function tryJson(text) {
  try { return JSON.parse(text); } catch (_) { return text; }
}

module.exports = { startFixtureServer };
