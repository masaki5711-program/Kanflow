'use strict';

/*
 * Tests for scripts/validate-edge-mcp-conformance.js — the profile-aware
 * Edge MCP conformance gate (pfe-edge-mcp-toolset §Conformance profiles).
 * All fixtures are synthetic, built in a temp sandbox that mimics apps/edge/.
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs');
const { spawnSync } = require('node:child_process');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const SCRIPT = path.join(REPO_ROOT, 'scripts', 'validate-edge-mcp-conformance.js');

// ── Sandbox with one edge dir per violation class ───────────────────────────

const SANDBOX = fs.mkdtempSync(path.join(os.tmpdir(), 'ecc-edge-conf-'));
const EDGE_ROOT = path.join(SANDBOX, 'apps', 'edge');

function makeEdge(edgeId, { manifest, mcpSource, migrations } = {}) {
  const dir = path.join(EDGE_ROOT, edgeId);
  fs.mkdirSync(path.join(dir, 'mcp'), { recursive: true });
  if (manifest !== undefined) {
    fs.writeFileSync(path.join(dir, 'edge.manifest.json'),
      typeof manifest === 'string' ? manifest : JSON.stringify(manifest, null, 2));
  }
  if (mcpSource !== undefined) {
    fs.writeFileSync(path.join(dir, 'mcp', 'schemas.js'), mcpSource);
  }
  for (const [name, content] of Object.entries(migrations || {})) {
    fs.mkdirSync(path.join(dir, 'migrations'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'migrations', name), content);
  }
  return dir;
}

const CORE_TOOLS = ['edge_health', 'describe_local_data', 'slice_by_4axis', 'slice_dataset'];
const coreSource = `const TOOLS = [${CORE_TOOLS.map(t => `{ name: '${t}' }`).join(', ')}];`;

// Tier-1 DDL the dataset declarations below are checked against (spec 41 §2).
const T1_DEMO_SQL = `CREATE TABLE pfe.t1_demo (
  id uuid NOT NULL,
  measured_at timestamptz NOT NULL,
  nozzle_id varchar(20),
  offset_x_mm double precision
);`;
const CATALOG_SYNC_SQL =
  "INSERT INTO pfs.me_edge_primary_data_table (table_name) VALUES ('t1_demo');";

const goodDataset = {
  dataset_id: 'demo_detail',
  table_name: 't1_demo',
  tier1_class: 2,
  archetype: 'E',
  grain: 'cycle_detail',
  read_with: 'slice_dataset',
  time_column: 'measured_at',
  filterable: [{ name: 'nozzle_id', type: 'string' }],
  measures: [{ name: 'offset_x_mm', unit: 'mm' }],
  retention: '14 days',
  row_estimate_per_cycle: 2400,
  description: '合成: 1サイクル N 行の明細',
};

makeEdge('good-core', {
  manifest: {
    edge_id: 'good-core', profile: 'core', tools: CORE_TOOLS,
    datasets: [goodDataset],
  },
  mcpSource: coreSource,
  migrations: { 't1_0001_init.sql': T1_DEMO_SQL, 'pfs_catalog_sync_0001.sql': CATALOG_SYNC_SQL },
});
makeEdge('no-manifest', { mcpSource: coreSource });
makeEdge('bad-profile', {
  manifest: { edge_id: 'bad-profile', profile: 'mega', tools: [] },
  mcpSource: coreSource,
});
makeEdge('wrong-id', {
  manifest: { edge_id: 'other-name', profile: 'core', tools: CORE_TOOLS },
  mcpSource: coreSource,
});
makeEdge('full-missing-tool', {
  manifest: {
    edge_id: 'full-missing-tool', profile: 'full',
    tools: CORE_TOOLS, // far short of the 9-tool full surface
    supported_4m_factors: ['machine'],
  },
  mcpSource: coreSource,
});
makeEdge('undeclared-source-tool', {
  manifest: { edge_id: 'undeclared-source-tool', profile: 'core', tools: CORE_TOOLS },
  mcpSource: "const TOOLS = [{ name: 'edge_health' }];", // 2 declared tools absent from source
});
makeEdge('forwarder-with-lake', {
  manifest: { edge_id: 'forwarder-with-lake', profile: 'forwarder', tools: ['edge_health'] },
  mcpSource: "const TOOLS = [{ name: 'edge_health' }];",
  migrations: { 't1_0001_init.sql': 'CREATE TABLE pfe.t1_demo (id uuid);' },
});
makeEdge('t1-no-catalog', {
  manifest: { edge_id: 't1-no-catalog', profile: 'core', tools: CORE_TOOLS },
  mcpSource: coreSource,
  migrations: { 't1_0001_init.sql': 'CREATE TABLE pfe.t1_demo (id uuid);' },
});
makeEdge('4m-without-factors', {
  manifest: {
    edge_id: '4m-without-factors', profile: 'core',
    tools: [...CORE_TOOLS, 'compute_4m_correlation'],
  },
  mcpSource: `const TOOLS = [${[...CORE_TOOLS, 'compute_4m_correlation'].map(t => `{ name: '${t}' }`).join(', ')}];`,
});

// ── Dataset-declaration violations (spec 41 §2) ─────────────────────────────

function coreEdgeWithDatasets(edgeId, datasets, extraTools = []) {
  const tools = [...CORE_TOOLS, ...extraTools];
  makeEdge(edgeId, {
    manifest: { edge_id: edgeId, profile: 'core', tools, datasets },
    mcpSource: `const TOOLS = [${tools.map(t => `{ name: '${t}' }`).join(', ')}];`,
    migrations: { 't1_0001_init.sql': T1_DEMO_SQL, 'pfs_catalog_sync_0001.sql': CATALOG_SYNC_SQL },
  });
}

// t1 present, no datasets key at all
makeEdge('t1-no-datasets', {
  manifest: { edge_id: 't1-no-datasets', profile: 'core', tools: CORE_TOOLS },
  mcpSource: coreSource,
  migrations: { 't1_0001_init.sql': T1_DEMO_SQL, 'pfs_catalog_sync_0001.sql': CATALOG_SYNC_SQL },
});
coreEdgeWithDatasets('ds-missing-fields', [
  { dataset_id: 'd1', grain: 'snapshot', read_with: 'slice_dataset', row_estimate_per_hour: 1 },
]);
coreEdgeWithDatasets('ds-bad-grain', [
  { ...goodDataset, grain: 'timeseries' },
]);
// read_with names a tool this edge does not declare → unreadable dataset
coreEdgeWithDatasets('ds-unreadable', [
  { ...goodDataset, grain: 'frame', read_with: 'raw_waveform_query' },
]);
// grain=series but summarize_series absent
coreEdgeWithDatasets('ds-series-no-summary', [
  { ...goodDataset, dataset_id: 'temp', grain: 'series', read_with: 'summarize_series',
    archetype: 'A' },
]);
coreEdgeWithDatasets('ds-no-retention', [
  { ...goodDataset, retention: undefined },
]);
coreEdgeWithDatasets('ds-no-estimate', [
  { ...goodDataset, row_estimate_per_cycle: undefined },
]);
coreEdgeWithDatasets('ds-measure-no-unit', [
  { ...goodDataset, measures: [{ name: 'offset_x_mm' }] },
]);
coreEdgeWithDatasets('ds-phantom-column', [
  { ...goodDataset, filterable: [{ name: 'feeder_slot', type: 'string' }] },
]);
coreEdgeWithDatasets('ds-enum-no-values', [
  { ...goodDataset, filterable: [{ name: 'nozzle_id', type: 'enum' }] },
]);
coreEdgeWithDatasets('ds-duplicate-id', [goodDataset, { ...goodDataset }]);
// forwarder must not declare datasets
makeEdge('forwarder-with-datasets', {
  manifest: {
    edge_id: 'forwarder-with-datasets', profile: 'forwarder', tools: ['edge_health'],
    datasets: [goodDataset],
  },
  mcpSource: "const TOOLS = [{ name: 'edge_health' }];",
});

// Stray t1 migrations outside apps/edge (repo-wide R3 half).
function writeFileAt(rel, content) {
  const p = path.join(SANDBOX, rel);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, content);
}
writeFileAt('apps/schemas/sql/pfedb/migrations/t1_0001_stray.sql', 'CREATE TABLE pfe.t1_stray (id uuid);');
writeFileAt('apps/hub/migrations/0001_paired.sql', 'CREATE TABLE hub_meta (id uuid);');
writeFileAt('apps/hub/migrations/t1_0002_paired.sql', 'CREATE TABLE pfe.t1_paired (id uuid);');
writeFileAt('apps/hub/migrations/catalog_sync.sql', "INSERT INTO pfs.me_edge_primary_data_table (table_name) VALUES ('t1_paired');");

// Module-level ROOT is fixed at require time — point it at the sandbox.
process.env.CLAUDE_PROJECT_DIR = SANDBOX;
const { validateEdge, listEdgeDirs, validateStrayT1Migrations, PROFILES } = require('../validate-edge-mcp-conformance');

test.after(() => {
  delete process.env.CLAUDE_PROJECT_DIR;
  try { fs.rmSync(SANDBOX, { recursive: true, force: true }); } catch { /* best-effort */ }
});

// ── Table shape ─────────────────────────────────────────────────────────────

test('profiles: edge_health is universal; describe_local_data on every lake-bearing profile', () => {
  for (const tools of Object.values(PROFILES)) assert.ok(tools.includes('edge_health'));
  for (const p of ['full', 'forms', 'core']) assert.ok(PROFILES[p].includes('describe_local_data'), p);
  assert.deepEqual(PROFILES.forwarder, ['edge_health']);
});

test('discovery: every sandbox edge dir with mcp/ or migrations/ is picked up', () => {
  // Count from the sandbox rather than a literal, so adding a fixture for a new
  // violation class does not force an unrelated edit here.
  const onDisk = fs.readdirSync(EDGE_ROOT, { withFileTypes: true })
    .filter(e => e.isDirectory()).map(e => e.name);
  assert.deepEqual(listEdgeDirs().sort(), onDisk.sort());
  assert.ok(onDisk.length >= 9, `expected the fixture set, got ${onDisk.length}`);
});

// ── Pass case ───────────────────────────────────────────────────────────────

test('conformant core edge with t1+catalog-sync passes', () => {
  assert.deepEqual(validateEdge('good-core'), []);
});

// ── Violation classes ───────────────────────────────────────────────────────

test('missing manifest is an error', () => {
  const errs = validateEdge('no-manifest');
  assert.equal(errs.length, 1);
  assert.match(errs[0], /edge\.manifest\.json is missing/);
});

test('invalid profile is an error', () => {
  assert.match(validateEdge('bad-profile').join('\n'), /invalid profile 'mega'/);
});

test('edge_id ≠ directory name is an error', () => {
  assert.match(validateEdge('wrong-id').join('\n'), /does not match directory name/);
});

test('full profile missing mandated tools lists each one', () => {
  const errs = validateEdge('full-missing-tool').join('\n');
  for (const tool of ['raw_waveform_query', 'compute_4m_correlation', 'get_event_context',
    'trace_tier1_to_tier2', 'validate_etl_run', 'list_channels']) {
    assert.match(errs, new RegExp(`mandates tool '${tool}'`));
  }
});

test('manifest tool absent from mcp sources is an error', () => {
  const errs = validateEdge('undeclared-source-tool').join('\n');
  assert.match(errs, /tool 'describe_local_data' but no mcp\/\*\.js source names it/);
  assert.match(errs, /tool 'slice_by_4axis' but no mcp\/\*\.js source names it/);
});

test('forwarder with a t1_* migration is an error (no Tier-1 lake by definition)', () => {
  assert.match(validateEdge('forwarder-with-lake').join('\n'), /'forwarder' has no Tier-1 lake/);
});

test('t1_* migration without catalog sync violates R3', () => {
  assert.match(validateEdge('t1-no-catalog').join('\n'), /me_edge_primary_data/);
});

test('compute_4m_correlation without supported_4m_factors is an error', () => {
  assert.match(validateEdge('4m-without-factors').join('\n'), /supported_4m_factors is missing\/empty/);
});

// ── Dataset declarations (spec 41 §2) ───────────────────────────────────────

test('slice_dataset is mandatory on every lake-bearing profile', () => {
  for (const p of ['full', 'forms', 'core']) {
    assert.ok(PROFILES[p].includes('slice_dataset'), `${p} must mandate slice_dataset`);
  }
  assert.ok(!PROFILES.forwarder.includes('slice_dataset'), 'forwarder has no lake to read');
});

test('a Tier-1 lake without dataset declarations is an error', () => {
  assert.match(validateEdge('t1-no-datasets').join('\n'), /declares no 'datasets'/);
});

test('dataset missing required fields names each one', () => {
  const out = validateEdge('ds-missing-fields').join('\n');
  for (const f of ['table_name', 'description']) {
    assert.match(out, new RegExp(`missing required field '${f}'`));
  }
});

test('unknown grain is an error', () => {
  assert.match(validateEdge('ds-bad-grain').join('\n'), /unknown grain 'timeseries'/);
});

test('a dataset no declared tool can read is an error', () => {
  // core does not ship raw_waveform_query, so a frame dataset is unreadable here
  assert.match(validateEdge('ds-unreadable').join('\n'),
    /read_with 'raw_waveform_query' is not declared in manifest\.tools/);
});

test('a series dataset without summarize_series is an error', () => {
  assert.match(validateEdge('ds-series-no-summary').join('\n'),
    /summarize_series is not in manifest\.tools/);
});

test('volatile grain without retention, and any dataset without a row estimate, are errors', () => {
  assert.match(validateEdge('ds-no-retention').join('\n'), /declare 'retention'/);
  assert.match(validateEdge('ds-no-estimate').join('\n'), /row_estimate_per_cycle/);
});

test('a measure without a unit is an error (units are declared, not embedded)', () => {
  assert.match(validateEdge('ds-measure-no-unit').join('\n'),
    /measure 'offset_x_mm' has no 'unit'/);
});

test('a filterable column absent from the t1 DDL is an error', () => {
  assert.match(validateEdge('ds-phantom-column').join('\n'),
    /filterable column 'feeder_slot' is not in this edge's t1_\* migrations/);
});

test('enum filterable without values, and duplicate dataset ids, are errors', () => {
  assert.match(validateEdge('ds-enum-no-values').join('\n'), /type enum but declares no 'values'/);
  assert.match(validateEdge('ds-duplicate-id').join('\n'), /duplicate dataset_id/);
});

test('forwarder declaring datasets is an error', () => {
  assert.match(validateEdge('forwarder-with-datasets').join('\n'),
    /forwarder' has no Tier-1 lake, so it declares no datasets/);
});

test('stray t1 migration outside apps/edge without catalog sync is an error; paired dir passes', () => {
  const errors = validateStrayT1Migrations();
  assert.equal(errors.length, 1, JSON.stringify(errors));
  assert.match(errors[0], /pfedb\/migrations/);
  assert.match(errors[0], /me_edge_primary_data/);
});

// ── CLI against the real repo: edge-ref must conform ────────────────────────

test('CLI: real repo — edge-ref conforms when present, clean skip when the workspace is empty', () => {
  const res = spawnSync(process.execPath, [SCRIPT], {
    encoding: 'utf8',
    env: { ...process.env, CLAUDE_PROJECT_DIR: REPO_ROOT },
    timeout: 30_000,
  });
  assert.equal(res.status, 0, res.stderr || res.stdout);
  // Workspace model (iotpf-git-workflow §1.1): apps/ holds product checkouts
  // cloned per project. edge-ref lives there only when the IoTPF product repo
  // is cloned in; an empty workspace must skip cleanly, not fail.
  const fs = require('node:fs');
  if (fs.existsSync(path.join(REPO_ROOT, 'apps', 'edge', 'edge-ref'))) {
    assert.match(res.stdout, /OK — 1 edge\(s\) conform.*edge-ref/);
  } else {
    assert.match(res.stdout, /no edge implementations under apps\/edge\/ — skipping/);
  }
});
