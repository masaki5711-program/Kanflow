'use strict';

/**
 * validate-contract-compat.js — pure-function tests for the breaking-change
 * gate (MQTT JSON Schemas + proto3 contracts). Git plumbing is exercised only
 * against a real checkout; the diff logic is what carries the guarantees.
 */

const test = require('node:test');
const assert = require('node:assert');

const { parseProtoMessages, diffProto, diffMqttSchema } = require('../validate-contract-compat');

// --- proto parsing --------------------------------------------------------------

const BASE_PROTO = `
syntax = "proto3";
package zeva.v1;

message DeepDiveRequest {
  string edge_id = 1;
  string window_start_at = 2;
  repeated string signals = 3;
  map<string, string> context = 4;
}

message DeepDiveResponse {
  string verdict = 1;
  Nested detail = 2;
  message Nested {
    double score = 1;
  }
}
`;

test('proto parse: extracts messages, fields, and nested message paths', () => {
  const msgs = parseProtoMessages(BASE_PROTO);
  assert.ok(msgs.DeepDiveRequest);
  assert.strictEqual(msgs.DeepDiveRequest.fields[1].name, 'edge_id');
  assert.strictEqual(msgs.DeepDiveRequest.fields[3].type, 'string');
  assert.strictEqual(msgs.DeepDiveRequest.fields[4].type, 'map<string, string>');
  assert.ok(msgs['DeepDiveResponse.Nested']);
  assert.strictEqual(msgs['DeepDiveResponse.Nested'].fields[1].name, 'score');
});

test('proto parse: reserved statements collect numbers and ranges', () => {
  const msgs = parseProtoMessages('message M { reserved 2, 4 to 6; string a = 1; }');
  assert.deepStrictEqual([...msgs.M.reserved].sort(), [2, 4, 5, 6]);
});

// --- proto compatibility ----------------------------------------------------------

test('proto diff: identical contract has no errors', () => {
  assert.deepStrictEqual(diffProto(BASE_PROTO, BASE_PROTO, 'x.proto'), []);
});

test('proto diff: adding a new field is compatible', () => {
  const curr = BASE_PROTO.replace('map<string, string> context = 4;', 'map<string, string> context = 4;\n  int32 depth = 5;');
  assert.deepStrictEqual(diffProto(BASE_PROTO, curr, 'x.proto'), []);
});

test('proto diff: removing a field without reserving it is breaking', () => {
  const curr = BASE_PROTO.replace('repeated string signals = 3;', '');
  const errors = diffProto(BASE_PROTO, curr, 'x.proto');
  assert.strictEqual(errors.length, 1);
  assert.match(errors[0], /field #3.*removed without 'reserved 3;'/);
});

test('proto diff: removing a field WITH reserved is the sanctioned path', () => {
  const curr = BASE_PROTO.replace('repeated string signals = 3;', 'reserved 3;');
  assert.deepStrictEqual(diffProto(BASE_PROTO, curr, 'x.proto'), []);
});

test('proto diff: in-place type change is breaking', () => {
  const curr = BASE_PROTO.replace('string edge_id = 1;', 'int64 edge_id = 1;');
  const errors = diffProto(BASE_PROTO, curr, 'x.proto');
  assert.strictEqual(errors.length, 1);
  assert.match(errors[0], /changed type string -> int64/);
});

test('proto diff: in-place rename is breaking', () => {
  const curr = BASE_PROTO.replace('string verdict = 1;', 'string judgment = 1;');
  const errors = diffProto(BASE_PROTO, curr, 'x.proto');
  assert.strictEqual(errors.length, 1);
  assert.match(errors[0], /renamed 'verdict' -> 'judgment'/);
});

test('proto diff: removing a whole message is breaking', () => {
  const curr = BASE_PROTO.replace(/message DeepDiveRequest \{[\s\S]*?\n\}/, '');
  const errors = diffProto(BASE_PROTO, curr, 'x.proto');
  assert.ok(errors.some(e => /message 'DeepDiveRequest' was removed/.test(e)));
});

// --- MQTT schema compatibility -------------------------------------------------------

const BASE_SCHEMA = {
  'x-topic': 'iotpf/v1/fact/<shard>/<edge_system_id>',
  additionalProperties: false,
  required: ['plant_code', 'time'],
  properties: {
    plant_code: { type: 'string' },
    time: { type: 'string', pattern: '^.*(Z|[+-]\\d{2}:\\d{2})$' },
    value: { type: 'number' },
  },
};

function clone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

test('mqtt diff: identical schema has no errors', () => {
  assert.deepStrictEqual(diffMqttSchema(BASE_SCHEMA, clone(BASE_SCHEMA), 'telemetry'), []);
});

test('mqtt diff: adding an optional property is compatible', () => {
  const curr = clone(BASE_SCHEMA);
  curr.properties.unit = { type: 'string' };
  assert.deepStrictEqual(diffMqttSchema(BASE_SCHEMA, curr, 'telemetry'), []);
});

test('mqtt diff: removing a property is breaking', () => {
  const curr = clone(BASE_SCHEMA);
  delete curr.properties.value;
  const errors = diffMqttSchema(BASE_SCHEMA, curr, 'telemetry');
  assert.strictEqual(errors.length, 1);
  assert.match(errors[0], /property 'value' was removed/);
});

test('mqtt diff: in-place type change is breaking', () => {
  const curr = clone(BASE_SCHEMA);
  curr.properties.value.type = 'string';
  const errors = diffMqttSchema(BASE_SCHEMA, curr, 'telemetry');
  assert.strictEqual(errors.length, 1);
  assert.match(errors[0], /changed type "number" -> "string"/);
});

test('mqtt diff: newly-required field is breaking', () => {
  const curr = clone(BASE_SCHEMA);
  curr.required.push('value');
  const errors = diffMqttSchema(BASE_SCHEMA, curr, 'telemetry');
  assert.strictEqual(errors.length, 1);
  assert.match(errors[0], /'value' became required/);
});

test('mqtt diff: identical array types (["string","null"]) are NOT flagged', () => {
  const base = clone(BASE_SCHEMA);
  base.properties.reason = { type: ['string', 'null'] };
  const curr = clone(base);
  assert.deepStrictEqual(diffMqttSchema(base, curr, 'health'), []);
});

test('mqtt diff: array-type narrowing is breaking', () => {
  const base = clone(BASE_SCHEMA);
  base.properties.reason = { type: ['string', 'null'] };
  const curr = clone(base);
  curr.properties.reason.type = 'string';
  const errors = diffMqttSchema(base, curr, 'health');
  assert.strictEqual(errors.length, 1);
  assert.match(errors[0], /changed type \["string","null"\] -> "string"/);
});

test('mqtt diff: x-topic change is breaking', () => {
  const curr = clone(BASE_SCHEMA);
  curr['x-topic'] = 'iotpf/v2/fact/<shard>/<edge_system_id>';
  const errors = diffMqttSchema(BASE_SCHEMA, curr, 'telemetry');
  assert.strictEqual(errors.length, 1);
  assert.match(errors[0], /x-topic changed/);
});
