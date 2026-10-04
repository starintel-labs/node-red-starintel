'use strict';

// All new wire documents consume the immutable StarLang-generated 0.10.1 contract.
const { randomUUID } = require('node:crypto');
const { validate } = require('./starintel-contract');
const DOC_VERSION = '0.10.1';
const utcNow = () => Math.floor(Date.now() / 1000);

function baseDocument(dtype, fields) {
  if (!fields || typeof fields !== 'object' || Array.isArray(fields)) {
    throw new TypeError('canonical document fields must be an object');
  }
  return validate({
    id: 'starintel:' + dtype + ':' + randomUUID(),
    dataset: 'node-red', dtype, schemaVersion: DOC_VERSION,
    createdAt: utcNow(), updatedAt: utcNow(), ...fields
  });
}
function targetDocument(actor, fields = {}) {
  return baseDocument('target', {
    actor, target: fields.target !== undefined ? String(fields.target) : '',
    delay: fields.delay !== undefined ? fields.delay : 0,
    recurring: !!fields.recurring, options: fields.options || {}
  });
}
// Operation and alert are not document types in the canonical release. Preserve
// their application payload explicitly in an opaque extension, not invented fields.
function operationDocument(mission, phases, status) {
  return baseDocument('document', { extensions: { nodeRed: { operation: {
    mission: String(mission || ''), status: status || 'planned',
    phases: Array.isArray(phases) ? phases : []
  } } } });
}
function actorManifestDocument(spec, overrides = {}) {
  const options = overrides.target_options || spec.target_options || [];
  const fields = { actor: spec.actor_id, metadata: {
    name: overrides.name || spec.actor_id,
    manifestType: overrides.manifest_type || 'service',
    schemaVersions: [DOC_VERSION]
  } };
  if (spec.consumer_path) fields.consumerPaths = [spec.consumer_path];
  if (Array.isArray(options) && options.length) fields.targetOptions = { names: options };
  else if (options && !Array.isArray(options)) fields.targetOptions = options;
  return baseDocument('actor-manifest', fields);
}
function alertDocument(displayLabel, description, fields = {}) {
  return baseDocument('document', { extensions: { nodeRed: { alert: {
    displayLabel: String(displayLabel || ''), description: String(description || ''),
    firstTriggeredAt: utcNow(), lastTriggeredAt: utcNow(), occurrenceCount: 1,
    ...(fields.rule_id ? { ruleId: String(fields.rule_id) } : {}),
    ...(fields.resolution ? { resolution: String(fields.resolution) } : {})
  } } } });
}
module.exports = { DOC_VERSION, utcNow, baseDocument, targetDocument,
  operationDocument, actorManifestDocument, alertDocument };
