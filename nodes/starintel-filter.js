module.exports = function (RED) {
  'use strict';

  // Advanced client-side filtering over arrays (dataset search results,
  // document lists). Rules: [{field, op, value}] with op one of
  // eq|ne|contains|gte|lte|gt|lt|in|nin|regex|exists|prefix; field is a
  // dot-path resolved against each item. Plus dtype include/exclude,
  // dedupe by field, sort, limit/offset.
  const OPS = {
    eq: (a, b) => a === b,
    ne: (a, b) => a !== b,
    contains: (a, b) => String(a).includes(String(b)),
    prefix: (a, b) => String(a).startsWith(String(b)),
    gte: (a, b) => Number(a) >= Number(b),
    lte: (a, b) => Number(a) <= Number(b),
    gt: (a, b) => Number(a) > Number(b),
    lt: (a, b) => Number(a) < Number(b),
    in: (a, b) => Array.isArray(b) && b.includes(a),
    nin: (a, b) => Array.isArray(b) && !b.includes(a),
    regex: (a, b) => new RegExp(String(b)).test(String(a)),
    exists: (a) => a !== undefined && a !== null
  };

  function getField(item, path) {
    const parts = String(path).split('.');
    let cur = item;
    for (const p of parts) {
      if (cur === undefined || cur === null) return undefined;
      cur = cur[p];
    }
    return cur;
  }

  function applyRules(items, rules) {
    if (!Array.isArray(rules) || !rules.length) return items;
    return items.filter((item) => rules.every((rule) => {
      const fn = OPS[rule.op || 'eq'];
      if (!fn) return true;
      const value = getField(item, rule.field);
      if (rule.op === 'exists') {
        const present = value !== undefined && value !== null;
        return rule.value === false ? !present : present;
      }
      return fn(value, rule.value);
    }));
  }

  function StarintelFilterNode(config) {
    RED.nodes.createNode(this, config);
    const node = this;

    node.on('input', function (msg, send, done) {
      send = send || function () { node.send.apply(node, arguments); };
      done = done || function (err) { if (err) node.error(err, msg); };

      let rules;
      try {
        rules = config.rules ? JSON.parse(config.rules) : (msg.rules || []);
      } catch (_) {
        const e = new Error('rules is not valid JSON');
        e.code = 'STAR_CONFIG';
        return done(e);
      }
      let items = msg.payload;
      if (!Array.isArray(items)) {
        if (items && Array.isArray(items.docs)) items = items.docs;
        else if (items && Array.isArray(items.rows)) items = items.rows;
      }
      if (!Array.isArray(items)) {
        const e = new Error('payload is not an array (or {docs|rows})');
        e.code = 'STAR_INPUT';
        return done(e);
      }

      let out = applyRules(items, rules);

      const include = splitList(config.includeDtypes);
      const exclude = splitList(config.excludeDtypes);
      if (include.length) out = out.filter((d) => include.includes(d.dtype || getField(d, 'doc.dtype')));
      if (exclude.length) out = out.filter((d) => !exclude.includes(d.dtype || getField(d, 'doc.dtype')));

      if (config.dedupeField) {
        const seen = new Set();
        out = out.filter((item) => {
          const key = JSON.stringify(getField(item, config.dedupeField));
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });
      }
      if (config.sortField) {
        const dir = config.sortDir === 'desc' ? -1 : 1;
        out = out.slice().sort((a, b) => {
          const av = getField(a, config.sortField);
          const bv = getField(b, config.sortField);
          return (av === bv ? 0 : (av > bv ? 1 : -1)) * dir;
        });
      }
      const offset = Number(config.offset) || 0;
      const limit = Number(config.limit) || 0;
      if (offset) out = out.slice(offset);
      if (limit > 0) out = out.slice(0, limit);

      msg.payload = out;
      msg.filter_stats = {
        in: items.length,
        out: out.length
      };
      send(msg);
      done();
    });
  }

  function splitList(text) {
    return String(text || '').split(',').map((s) => s.trim()).filter(Boolean);
  }

  RED.nodes.registerType('starintel-filter', StarintelFilterNode);
};
