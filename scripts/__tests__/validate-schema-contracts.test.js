'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs');
const { spawnSync } = require('node:child_process');

const SCRIPT = path.join(__dirname, '..', 'validate-schema-contracts.js');
const SANDBOX = fs.mkdtempSync(path.join(os.tmpdir(), 'ecc-schema-contracts-'));

test.after(() => {
  try {
    fs.rmSync(SANDBOX, { recursive: true, force: true });
  } catch {
    /* best-effort */
  }
});

function runGate(projectDir) {
  return spawnSync(process.execPath, [SCRIPT], {
    encoding: 'utf8',
    env: { ...process.env, CLAUDE_PROJECT_DIR: projectDir },
  });
}

const VALID_SCHEMA = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  $id: 'https://iotpf.local/schemas/mqtt/telemetry/1.0.0',
  title: 'test',
  'x-topic': 'iotpf/v1/fact/<shard>/<edge_system_id>',
  type: 'object',
  additionalProperties: false,
  required: ['schema_version', 'plant_code', 'time'],
  properties: {
    schema_version: { type: 'string' },
    plant_code: { type: 'string' },
    time: {
      type: 'string',
      pattern:
        '^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(\\.\\d{1,6})?(Z|[+-]\\d{2}:\\d{2})$',
    },
  },
};

function writeTree(dir, { schemas = {}, protos = {}, ddl = null, project = null } = {}) {
  const base = project ? path.join(dir, 'apps', project) : path.join(dir, 'apps');
  const mqttDir = path.join(base, 'schemas', 'mqtt');
  fs.mkdirSync(mqttDir, { recursive: true });
  for (const [name, content] of Object.entries(schemas)) {
    const body = typeof content === 'string' ? content : JSON.stringify(content, null, 2);
    fs.writeFileSync(path.join(mqttDir, name), body, 'utf8');
  }
  for (const [rel, content] of Object.entries(protos)) {
    const p = path.join(base, 'proto', rel);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, content, 'utf8');
  }
  if (ddl) {
    const p = path.join(base, 'schemas', 'sql', 'pfsdb', ddl.name);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, ddl.content, 'utf8');
  }
}

const VALID_PROTO = [
  'syntax = "proto3";',
  '',
  'package zeva.v1;',
  '',
  'service DeepDiveService {',
  '  rpc AnalyzeAnomaly(AnalyzeAnomalyRequest) returns (AnalyzeAnomalyResponse);',
  '}',
  'message AnalyzeAnomalyRequest { string event_id = 1; }',
  'message AnalyzeAnomalyResponse { string event_id = 1; }',
  '',
].join('\n');

test('no apps/ contract dirs -> skips cleanly (exit 0)', () => {
  const dir = path.join(SANDBOX, 'no-apps');
  fs.mkdirSync(dir, { recursive: true });
  const res = runGate(dir);
  assert.equal(res.status, 0);
  assert.match(res.stdout, /skipping/);
});

test('valid schemas + proto + ddl -> exit 0', () => {
  const dir = path.join(SANDBOX, 'all-valid');
  writeTree(dir, {
    schemas: { 'telemetry.schema.json': VALID_SCHEMA },
    protos: { 'zeva/v1/deep_dive.proto': VALID_PROTO },
    ddl: { name: 'SQL-iotdb_Rev1.15.sql', content: 'CREATE TABLE pfs.me_user\n(\n  x INT\n)\n;' },
  });
  const res = runGate(dir);
  assert.equal(res.status, 0, res.stdout + res.stderr);
  assert.match(res.stdout, /OK/);
});

test('schema with invalid JSON -> exit 1', () => {
  const dir = path.join(SANDBOX, 'bad-json');
  writeTree(dir, { schemas: { 'telemetry.schema.json': '{ not json' } });
  const res = runGate(dir);
  assert.equal(res.status, 1);
  assert.match(res.stderr, /not valid JSON/);
});

test('schema missing x-topic or taxonomy mismatch -> exit 1', () => {
  const dir = path.join(SANDBOX, 'bad-topic');
  const noTopic = { ...VALID_SCHEMA };
  delete noTopic['x-topic'];
  const badTopic = { ...VALID_SCHEMA, 'x-topic': 'devices/foo/bar' };
  writeTree(dir, {
    schemas: {
      'telemetry.schema.json': noTopic,
      'status.schema.json': badTopic,
    },
  });
  const res = runGate(dir);
  assert.equal(res.status, 1);
  assert.match(res.stderr, /x-topic/);
  assert.match(res.stderr, /iotpf\/v<N>\/<kind>/);
});

test('topic with an unknown kind -> exit 1', () => {
  const dir = path.join(SANDBOX, 'unknown-kind');
  writeTree(dir, { schemas: { 'x.schema.json': { ...VALID_SCHEMA, 'x-topic': 'iotpf/v1/telemetry/<shard>' } } });
  const res = runGate(dir);
  assert.equal(res.status, 1);
  assert.match(res.stderr, /off-taxonomy/);
});

test('every topic family of the spec is accepted', () => {
  const dir = path.join(SANDBOX, 'spec-topics');
  const topics = [
    'iotpf/v1/etl/<shard>/<edge_system_id>/<t1_table>',
    'iotpf/v1/wm/<shard>/<edge_system_id>',
    'iotpf/v1/ack/<shard>/<edge_system_id>',
    'iotpf/v1/fact/<shard>/<edge_system_id>',
    'iotpf/v1/factwm/<shard>',
    'iotpf/v1/judgment/<shard>/<edge_system_id>',
    'iotpf/v1/alert/<plant_code>/andon',
  ];
  const schemas = {};
  topics.forEach((t, i) => {
    schemas[`t${i}.schema.json`] = { ...VALID_SCHEMA, 'x-topic': t };
  });
  writeTree(dir, { schemas });
  const res = runGate(dir);
  assert.equal(res.status, 0, res.stdout + res.stderr);
  assert.match(res.stdout, /mqtt=7/);
});

test('deprecated factory/ topic -> warns but does not block (exit 0)', () => {
  const dir = path.join(SANDBOX, 'legacy-topic');
  writeTree(dir, {
    schemas: { 'x.schema.json': { ...VALID_SCHEMA, 'x-topic': 'factory/<line>/<machine>/telemetry' } },
  });
  const res = runGate(dir);
  assert.equal(res.status, 0, res.stdout + res.stderr);
  assert.match(res.stdout, /WARN.*deprecated/);
});

test('contracts inside a product checkout apps/<project>/ are checked', () => {
  const dir = path.join(SANDBOX, 'per-project');
  writeTree(dir, {
    project: 'iotpf-zeva-engine',
    protos: { 'iotpf/judgment/v1/judgment.proto': 'syntax = "proto3";\npackage iotpf.judgment;\n' },
  });
  const res = runGate(dir);
  assert.equal(res.status, 1);
  assert.match(res.stderr, /apps\/iotpf-zeva-engine\/proto\/.*versioned package/);
});

test('schema without additionalProperties:false -> exit 1', () => {
  const dir = path.join(SANDBOX, 'open-schema');
  const open = { ...VALID_SCHEMA };
  delete open.additionalProperties;
  writeTree(dir, { schemas: { 'telemetry.schema.json': open } });
  const res = runGate(dir);
  assert.equal(res.status, 1);
  assert.match(res.stderr, /additionalProperties/);
});

test('schema missing plant_code in required -> exit 1', () => {
  const dir = path.join(SANDBOX, 'no-plant');
  const noPlant = { ...VALID_SCHEMA, required: ['schema_version', 'time'] };
  writeTree(dir, { schemas: { 'telemetry.schema.json': noPlant } });
  const res = runGate(dir);
  assert.equal(res.status, 1);
  assert.match(res.stderr, /plant_code/);
});

test('timestamp property without offset-enforcing pattern -> exit 1', () => {
  const dir = path.join(SANDBOX, 'naive-time');
  const naive = JSON.parse(JSON.stringify(VALID_SCHEMA));
  delete naive.properties.time.pattern;
  writeTree(dir, { schemas: { 'telemetry.schema.json': naive } });
  const res = runGate(dir);
  assert.equal(res.status, 1);
  assert.match(res.stderr, /timezone/);
});

test('schema whose JSON is null (valid JSON, not an object) -> exit 1, no crash', () => {
  const dir = path.join(SANDBOX, 'null-json');
  writeTree(dir, { schemas: { 'telemetry.schema.json': 'null' } });
  const res = runGate(dir);
  assert.equal(res.status, 1);
  assert.match(res.stderr, /must be a JSON object/);
  assert.doesNotMatch(res.stderr, /TypeError/);
});

test('alternate-but-valid timezone pattern formulations pass (behavioral check)', () => {
  const dir = path.join(SANDBOX, 'alt-tz');
  const alt = JSON.parse(JSON.stringify(VALID_SCHEMA));
  alt.properties.time.pattern =
    '^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(?:Z|[+-]\\d{2}:\\d{2})$';
  writeTree(dir, { schemas: { 'telemetry.schema.json': alt } });
  const res = runGate(dir);
  assert.equal(res.status, 0, res.stdout + res.stderr);
});

test('pattern that also accepts naive timestamps -> exit 1', () => {
  const dir = path.join(SANDBOX, 'naive-ok-tz');
  const loose = JSON.parse(JSON.stringify(VALID_SCHEMA));
  loose.properties.time.pattern =
    '^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(Z|[+-]\\d{2}:\\d{2})?$'; // offset optional
  writeTree(dir, { schemas: { 'telemetry.schema.json': loose } });
  const res = runGate(dir);
  assert.equal(res.status, 1);
  assert.match(res.stderr, /naive/);
});

test('proto-only tree (no mqtt, no ddl) is still checked', () => {
  const dir = path.join(SANDBOX, 'proto-only');
  writeTree(dir, { protos: { 'zeva/v1/ok.proto': VALID_PROTO } });
  const res = runGate(dir);
  assert.equal(res.status, 0, res.stdout + res.stderr);
  assert.match(res.stdout, /proto=1/);
});

test('proto without proto3 syntax or versioned package -> exit 1', () => {
  const dir = path.join(SANDBOX, 'bad-proto');
  writeTree(dir, {
    schemas: { 'telemetry.schema.json': VALID_SCHEMA },
    protos: {
      'zeva/v1/old.proto': 'syntax = "proto2";\npackage zeva.v1;\n',
      'zeva/unversioned.proto': 'syntax = "proto3";\npackage zeva;\n',
    },
  });
  const res = runGate(dir);
  assert.equal(res.status, 1);
  assert.match(res.stderr, /proto3/);
  assert.match(res.stderr, /versioned package/);
});

test('DDL dir present but empty -> exit 1 (source of truth missing)', () => {
  const dir = path.join(SANDBOX, 'empty-ddl');
  writeTree(dir, { schemas: { 'telemetry.schema.json': VALID_SCHEMA } });
  fs.mkdirSync(path.join(dir, 'apps', 'schemas', 'sql', 'pfsdb'), { recursive: true });
  const res = runGate(dir);
  assert.equal(res.status, 1);
  assert.match(res.stderr, /pfsdb/);
});

test('real repo tree passes (self-check) — OK with contracts, clean skip with empty workspace', () => {
  const repoRoot = path.join(__dirname, '..', '..');
  const res = runGate(repoRoot);
  assert.equal(res.status, 0, res.stdout + res.stderr);
  // Workspace model (iotpf-git-workflow §1.1): contract artifacts live in the
  // per-project product checkouts under apps/; absent workspace → clean skip.
  assert.match(res.stdout, /OK|no contract artifacts under apps\/ yet — skipping/);
});

// Shape of the ETL envelopes of the spec: tolerant reader, scoped by edge,
// RFC 3339 timestamps, no x-topic yet.
const TOLERANT_SCHEMA = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  title: 'lineage-ack (synthetic test fixture)',
  type: 'object',
  additionalProperties: true,
  required: ['schema_version', 'edge_system_id', 'emitted_at'],
  properties: {
    schema_version: { const: 1 },
    edge_system_id: { type: 'integer' },
    emitted_at: { type: 'string', format: 'date-time' },
  },
};

test('tolerant-reader schema with schema_version, edge scope and date-time -> exit 0, warns on missing x-topic', () => {
  const dir = path.join(SANDBOX, 'tolerant-ok');
  writeTree(dir, { project: 'iotpf-etl', schemas: { 'lineage-ack.v1.schema.json': TOLERANT_SCHEMA } });
  const res = runGate(dir);
  assert.equal(res.status, 0, res.stdout + res.stderr);
  assert.match(res.stdout, /WARN.*no x-topic/);
});

test('tolerant-reader schema without a required schema_version -> exit 1', () => {
  const dir = path.join(SANDBOX, 'tolerant-no-version');
  const s = { ...TOLERANT_SCHEMA, required: ['edge_system_id', 'emitted_at'] };
  writeTree(dir, { schemas: { 'x.schema.json': s } });
  const res = runGate(dir);
  assert.equal(res.status, 1);
  assert.match(res.stderr, /tolerant-reader.*schema_version/);
});

test('shard as the scope key is accepted (fact watermark shape)', () => {
  const dir = path.join(SANDBOX, 'shard-scope');
  const s = {
    ...TOLERANT_SCHEMA,
    'x-topic': 'iotpf/v1/factwm/<shard>',
    required: ['schema_version', 'shard', 'emitted_at'],
    properties: { ...TOLERANT_SCHEMA.properties, shard: { type: 'integer' } },
  };
  writeTree(dir, { schemas: { 'fact-watermark.v1.schema.json': s } });
  const res = runGate(dir);
  assert.equal(res.status, 0, res.stdout + res.stderr);
});

test('timestamp declared as a plain string (no format, no pattern) -> exit 1', () => {
  const dir = path.join(SANDBOX, 'plain-string-time');
  const s = JSON.parse(JSON.stringify(TOLERANT_SCHEMA));
  delete s.properties.emitted_at.format;
  writeTree(dir, { schemas: { 'x.schema.json': s } });
  const res = runGate(dir);
  assert.equal(res.status, 1);
  assert.match(res.stderr, /neither format: date-time nor a pattern/);
});
