module.exports = function (RED) {
  'use strict';

  // message2org: render StarIntel message-family documents (message,
  // email-message, socialmpost, post) as Org outlines with custom rendering
  // options. Options control: heading depth, properties drawer on/off,
  // timestamps in Org format vs raw, body quoting level, tag derivation.
  function toOrgTimestamp(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    const pad = (n) => String(n).padStart(2, '0');
    return '[' + d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) +
      ' ' + ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getDay()] + ' ' +
      pad(d.getHours()) + ':' + pad(d.getMinutes()) + ']';
  }

  function pick(doc, names) {
    const data = (doc && doc.data) || {};
    for (const n of names) {
      if (data[n] !== undefined && data[n] !== null && data[n] !== '') return data[n];
    }
    return undefined;
  }

  function renderMessage(doc, opts) {
    const data = (doc && doc.data) || {};
    const lines = [];
    const level = '*'.repeat(Math.max(1, Number(opts.headingLevel) || 1));
    const who = pick(doc, ['from', 'author', 'username', 'sender', 'actor']) || 'unknown';
    const channel = pick(doc, ['channel', 'platform', 'community', 'server']) || '';
    const when = pick(doc, ['date', 'posted_at', 'sent_at', 'created_at']) || doc.date_added;
    const title = String(who) + (channel ? ' @ ' + channel : '') + (opts.timestamps === 'org' && when ? ' (' + toOrgTimestamp(when) + ')' : '');

    let tagLine = '';
    if (opts.tags !== 'none') {
      const tags = [];
      if (doc.dtype) tags.push(doc.dtype);
      if (channel) tags.push(String(channel).replace(/[^a-zA-Z0-9_@#%:]/g, ''));
      if (opts.tags === 'full' && Array.isArray(data.tags)) {
        for (const t of data.tags) tags.push(String(t).replace(/\s+/g, '_'));
      }
      tagLine = tags.filter(Boolean).map((t) => t.replace(/\s+/g, '_')).join(':');
    }
    lines.push(level + ' ' + title + (tagLine ? '   :' + tagLine + ':' : ''));
    if (opts.drawer) {
      lines.push(':PROPERTIES:');
      lines.push(':ID: ' + (doc.id || doc._id || ''));
      lines.push(':DTYPE: ' + (doc.dtype || ''));
      if (doc.schema_version) lines.push(':SCHEMA_VERSION: ' + doc.schema_version);
      if (opts.timestamps === 'raw' && when) lines.push(':DATE: ' + when);
      lines.push(':END:');
    }
    const body = pick(doc, ['message', 'body', 'text', 'content', 'caption']) || '';
    const indent = ' '.repeat(Math.max(0, Number(opts.quoteLevel) || 0));
    for (const line of String(body).split('\n')) lines.push(indent + line);
    return lines.join('\n');
  }

  function Message2OrgNode(config) {
    RED.nodes.createNode(this, config);
    const node = this;
    const opts = {
      headingLevel: config.headingLevel || 2,
      drawer: config.drawer !== false,
      timestamps: config.timestamps || 'org',
      tags: config.tags || 'dtype',
      quoteLevel: Number(config.quoteLevel) || 0,
      separator: config.separator || '\n\n'
    };

    node.on('input', function (msg, send, done) {
      send = send || function () { node.send.apply(node, arguments); };
      done = done || function () {};
      const payload = msg.payload;
      const docs = Array.isArray(payload && payload.docs) ? payload.docs
        : Array.isArray(payload) ? payload : [payload];
      const rendered = docs
        .filter((d) => d && typeof d === 'object')
        .map((d) => renderMessage(d, opts))
        .filter(Boolean)
        .join(opts.separator);
      msg.payload = rendered + (rendered ? '\n' : '');
      send(msg);
      done();
    });
  }

  RED.nodes.registerType('message2org', Message2OrgNode);
};
