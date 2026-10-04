'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { validate } = require('../lib/starintel-contract');
const docs = require('../lib/starintel-docs');
const { loadModules, instantiate, driveInput } = require('./helpers');
test('builders emit flat canonical documents and losslessly preserve opaque payloads', () => {
  for (const doc of [docs.targetDocument('probe', {target:'x',options:{snake_key:false}}),
    docs.actorManifestDocument({actor_id:'probe',target_options:['deep']}),
    docs.operationDocument('inspect', [{snake_key: null}]), docs.alertDocument('notice','detail')]) {
    assert.equal(validate(doc), doc); assert.equal(doc.data, undefined);
    assert.equal(doc.schemaVersion, '0.10.1'); assert.equal(typeof doc.createdAt,'number');
  }
});
test('canonical validator rejects legacy writes, undeclared fields and numeric confidence', () => {
  const d = docs.baseDocument('document', {});
  for(const bad of [{...d,schemaVersion:'0.9.0'}, {...d,data:{}}, {...d,confidence:0.5},
    {...d,confidence:'1.1'}, {...d,createdAt:-1}, {...d,dtype:'observation'}]) assert.throws(()=>validate(bad));
  validate({...d, confidence:'0.5', extensions:{snake_key:{null_value:null}}});
});
test('emit rejects mixed legacy batches before any network request', async () => {
  const RED=loadModules('nodes/starintel-emit.js'); RED._nodesById.srv={baseUrl:'http://unused.invalid'};
  const node=instantiate(RED,'starintel-emit',{server:'srv'});
  const result=await driveInput(node,{payload:[docs.baseDocument('document',{}),{dtype:'document',schema_version:'0.9.0',data:{}}]});
  assert.equal(result.err.code,'STAR_SCHEMA'); assert.equal(result.sent.length,0);
});
