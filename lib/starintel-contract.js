'use strict';
// Dependency-free interpreter of the locked generated schema subset. Semantics
// are read from the release, never maintained as a parallel field inventory.
const schema = require('../schema/starintel-0.10.1/generated/schema.json');
const manifest = require('../schema/starintel-0.10.1/generated/portable-manifest.json');
const nameOf = (name) => name.split('/').pop().split('-').map(s => s[0].toUpperCase() + s.slice(1)).join('');
const types = Object.fromEntries(manifest.types.filter(t => t.kind === 'document').map(t => [t.name.split('/').pop(), nameOf(t.name)]));
const decimals = Object.fromEntries(manifest.types.filter(t => t.kind === 'scalar' && t.base === 'decimal').map(t => [nameOf(t.name), t]));
function fail(path, reason) { const e = new Error(path + ': ' + reason); e.code = 'STAR_SCHEMA'; throw e; }
function decimalCompare(a, b) {
  const scale = Math.max(String(a).split('.')[1]?.length || 0, String(b).split('.')[1]?.length || 0);
  const integer = value => { const [whole, fraction = ''] = String(value).split('.'); return BigInt(whole + fraction.padEnd(scale, '0')); };
  const x = integer(a), y = integer(b); return x < y ? -1 : x > y ? 1 : 0;
}
function visit(value, rule, path) {
  if (rule.$ref) {
    const key = rule.$ref.split('/').pop(); visit(value, schema.$defs[key], path);
    const decimal = decimals[key];
    if (decimal) {
      if (decimal.minimum !== undefined && decimalCompare(value, decimal.minimum) < 0) fail(path, 'below decimal minimum');
      if (decimal.maximum !== undefined && decimalCompare(value, decimal.maximum) > 0) fail(path, 'above decimal maximum');
      if (decimal.scale !== undefined && (value.split('.')[1]?.length || 0) > decimal.scale) fail(path, 'decimal scale exceeded');
    }
  }
  for (const part of rule.allOf || []) visit(value, part, path);
  if (rule.type === 'object') {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) fail(path, 'expected object');
    for (const key of rule.required || []) if (!Object.hasOwn(value, key)) fail(path, 'missing ' + key);
    for (const [key, child] of Object.entries(value)) {
      if (Object.hasOwn(rule.properties || {}, key)) visit(child, rule.properties[key], path + '.' + key);
      else if (rule.additionalProperties === false) fail(path, 'unknown field ' + key);
      else if (typeof rule.additionalProperties === 'object') visit(child, rule.additionalProperties, path + '.' + key);
    }
  } else if (rule.type === 'array') {
    if (!Array.isArray(value)) fail(path, 'expected array');
    value.forEach((item, i) => visit(item, rule.items || {}, path + '[' + i + ']'));
  } else if (rule.type === 'integer') {
    if (!Number.isSafeInteger(value)) fail(path, 'expected safe integer');
  } else if (rule.type && typeof value !== rule.type) fail(path, 'expected ' + rule.type);
  if (typeof value === 'number' && !Number.isFinite(value)) fail(path, 'non-finite number');
  if (rule.minimum !== undefined && value < rule.minimum) fail(path, 'below minimum');
  if (rule.maximum !== undefined && value > rule.maximum) fail(path, 'above maximum');
  if (rule.pattern && !(new RegExp(rule.pattern)).test(value)) fail(path, 'pattern mismatch');
  if (rule.enum && !rule.enum.includes(value)) fail(path, 'invalid enum');
  if (rule.format === 'uri') { try { new URL(value); } catch (_) { fail(path, 'invalid URI'); } }
}
function validate(document) {
  if (!document || document.schemaVersion !== '0.10.1') fail('$', 'requires canonical schemaVersion 0.10.1; legacy input is read-only');
  const type = types[document.dtype];
  if (!type) fail('$.dtype', 'unsupported canonical document type');
  visit(document, schema.$defs[type], '$'); return document;
}
module.exports = { validate };
