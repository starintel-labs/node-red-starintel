'use strict';

// Canonical StarIntel v0.9 document builders, derived from the real
// starintel-server normalization (source/frontends/http-boundary-core.lisp:
// normalize-legacy-target-document) and the pro-actors manifest registry
// (python/src/starintel_pro_actors/manifests.py). Base wire family 0.9.0.

const DOC_VERSION = '0.9.0';

function utcNow() {
  return new Date().toISOString().replace(/(\.\d{3})Z$/, 'Z');
}

function baseDocument(dtype, data) {
  return {
    dtype,
    data,
    schema_version: DOC_VERSION,
    version: 1,
    date_added: utcNow(),
    date_updated: utcNow(),
    sources: [],
    evidence: []
  };
}

function targetDocument(actor, fields) {
  fields = fields || {};
  const data = {
    actor,
    target: fields.target !== undefined ? fields.target : null,
    delay: fields.delay !== undefined ? fields.delay : 0,
    recurring: !!fields.recurring,
    options: fields.options || {}
  };
  return baseDocument('target', data);
}

function operationDocument(mission, phases, status) {
  const data = {
    mission: String(mission || ''),
    status: status || 'planned',
    phases: Array.isArray(phases) ? phases : []
  };
  return baseDocument('operation', data);
}

function actorManifestDocument(spec, overrides) {
  const data = {
    actor: spec.actor_id,
    name: spec.actor_id,
    manifest_type: (overrides && overrides.manifest_type) || 'service',
    generated_at: utcNow(),
    schema_versions: [DOC_VERSION]
  };
  if (spec.consumer_path) data.consumer_path = spec.consumer_path;
  const targetOptions = (overrides && overrides.target_options) ||
    (spec.target_options || []);
  if (targetOptions.length) data.target_options = targetOptions;
  return baseDocument('actor-manifest', data);
}

function alertDocument(displayLabel, description, fields) {
  fields = fields || {};
  const data = {
    display_label: String(displayLabel || ''),
    description: String(description || ''),
    first_triggered_at: utcNow(),
    last_triggered_at: utcNow(),
    occurrence_count: 1
  };
  if (fields.rule_id) data.rule_id = String(fields.rule_id);
  if (fields.resolution) data.resolution = String(fields.resolution);
  return baseDocument('alert', data);
}

module.exports = {
  DOC_VERSION,
  utcNow,
  baseDocument,
  targetDocument,
  operationDocument,
  actorManifestDocument,
  alertDocument
};
