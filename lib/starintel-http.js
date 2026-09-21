'use strict';

// Shared HTTP client for the StarIntel palette. Contract verified against
// starintel-server source (http-capabilities.lisp, http-authorization-routes.lisp):
//   POST   /api/v1/documents          documents:write
//   POST   /api/v1/documents/bulk     documents:bulk
//   GET    /api/v1/documents/:id      documents:read
//   PUT    /api/v1/documents/:id      documents:write
//   DELETE /api/v1/documents/:id      documents:delete
//   GET    /api/v1/documents/search   search:read  (q, limit, dataset, tenant, bookmark, sort)
//   POST   /new/target/:actor         targets:dispatch (legacy)
//   GET    /targets/:actor            targets:read (legacy)
// The server is an experimental operator system with no ambient
// authentication on most deployments: LAN-only by contract.

function baseUrl(config) {
  return String(config.baseUrl || '').replace(/\/+$/, '');
}

function buildUrl(base, path, query) {
  let url = base + (path.startsWith('/') ? path : '/' + path);
  const entries = Object.entries(query || {}).filter(([, v]) => v !== undefined && v !== null && v !== '');
  if (entries.length) {
    const qs = entries.map(([k, v]) => encodeURIComponent(k) + '=' + encodeURIComponent(v)).join('&');
    url += (url.includes('?') ? '&' : '?') + qs;
  }
  return url;
}

function request(serverConfig, method, path, options) {
  options = options || {};
  const timeoutMs = Number(serverConfig.timeoutMs) || 8000;
  const url = buildUrl(baseUrl(serverConfig), path, options.query);
  const init = {
    method,
    signal: AbortSignal.timeout(timeoutMs),
    headers: { accept: 'application/json' }
  };
  if (options.body !== undefined) {
    init.method = method;
    init.headers['content-type'] = 'application/json';
    init.body = typeof options.body === 'string' ? options.body : JSON.stringify(options.body);
  }
  return fetch(url, init).then((res) => {
    return res.text().then((text) => {
      let parsed = null;
      if (text) {
        try { parsed = JSON.parse(text); } catch (_) { parsed = undefined; }
      }
      if (!res.ok) {
        const e = new Error('starintel-server ' + res.status + ' on ' + method + ' ' + path +
          (text ? ': ' + text.slice(0, 2000) : ''));
        e.code = 'STARHTTP_STATUS';
        e.statusCode = res.status;
        e.body = parsed;
        throw e;
      }
      if (parsed === undefined) {
        const e = new Error('starintel-server returned non-JSON body on ' + method + ' ' + path);
        e.code = 'STARHTTP_PARSE';
        throw e;
      }
      return parsed;
    });
  }, (err) => {
    if (err && (err.name === 'TimeoutError' || err.name === 'AbortError')) {
      const e = new Error('starintel-server request timed out after ' + timeoutMs + 'ms');
      e.code = 'STARHTTP_TIMEOUT';
      throw e;
    }
    const e = new Error('starintel-server unreachable: ' + (err && err.message ? err.message : err));
    e.code = 'STARHTTP_UNREACHABLE';
    throw e;
  });
}

module.exports = { request, buildUrl, baseUrl };
