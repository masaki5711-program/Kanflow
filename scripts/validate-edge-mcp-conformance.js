#!/usr/bin/env node
'use strict';

/*
 * validate-edge-mcp-conformance.js — profile-aware Edge MCP conformance gate.
 *
 * pfe-edge-mcp-toolset SKILL.md declares the platform's flagship conformance
 * rule: a PFE DB ships WITH its Edge MCP toolset, sized by the edge's
 * declared conformance profile (full / forms / core / forwarder) — and a
 * Tier-1 migration ships WITH its central-catalog sync (R3). Before this
 * gate, that rule was enforced only by the advisory edge-mcp-toolset-reviewer
 * agent. This gate makes the deterministic half machine-checked:
 *
 *   Per edge directory apps/edge/<edge_id>/ (one containing migrations/ or mcp/):
 *   1. ERROR — edge.manifest.json missing or unparseable.
 *   2. ERROR — manifest.edge_id ≠ directory name, or invalid profile.
 *   3. ERROR — a tool mandated by the profile is missing from manifest.tools.
 *   4. ERROR — a manifest tool is not found as a name in mcp/schemas.js
 *      (textual presence check — deterministic, no JS evaluation).
 *   5. ERROR — t1_* migration present but no catalog-sync migration
 *      (a migrations/ file whose content references me_edge_primary_data) —
 *      except profile=forwarder, for which t1_ tables / catalog rows are
 *      themselves an ERROR (a forwarder has no Tier-1 lake by definition).
 *   6. ERROR — manifest.supported_4m_factors invalid (unknown factor) when
 *      compute_4m_correlation is declared.
 *
 * Tier-1 local-data access (docs/spec/IoT.md/41-edge-mcp-local-data-access.md)
 * adds the dataset-declaration half. A dataset the LLM cannot read is the
 * defect this catches — the old surface let an edge advertise a table with no
 * tool able to return its rows:
 *
 *   7. ERROR — a declared dataset omits a required field, or uses an unknown
 *      grain / read_with value.
 *   8. ERROR — read_with names a tool the manifest does not declare
 *      (a dataset nothing can read).
 *   9. ERROR — grain requires a tool the edge lacks: any dataset ⇒
 *      slice_dataset for tabular grains, summarize_series when grain=series.
 *  10. ERROR — retention missing on a volatile grain (series/frame/cycle_detail),
 *      or the row estimate is missing.
 *  11. ERROR — a measure has no unit (units are declared, never embedded in
 *      the value column — pfe-database.md §2.2).
 *  12. ERROR — a filterable/measure column is not present in the edge's t1_*
 *      migrations (declared predicate over a column that does not exist).
 *
 * The judgment half (stub detection, description quality, bounds semantics,
 * sovereignty intent) stays with the edge-mcp-toolset-reviewer agent.
 *
 * No apps/edge/ directory, or no edge dirs yet -> skip cleanly (pre-code
 * scaffold). apps/edge/edge-ref is a real edge and IS validated.
 *
 * Node built-ins only. CI gate, not a Claude Code hook: does NOT fail open —
 * blocking non-conformant edges is the point.
 *
 * Run: node scripts/validate-edge-mcp-conformance.js
 */

const fs = require('fs');
const path = require('path');

const ROOT = process.env.CLAUDE_PROJECT_DIR || process.cwd();
const EDGE_ROOT = path.join(ROOT, 'apps', 'edge');

// slice_dataset is mandatory wherever a Tier-1 lake exists — same standing as
// describe_local_data. summarize_series is conditional (grain=series), so it is
// enforced by dataset declaration (check 9), not by the profile floor.
const PROFILES = {
  full: [
    'raw_waveform_query', 'compute_4m_correlation', 'slice_by_4axis',
    'get_event_context', 'trace_tier1_to_tier2', 'validate_etl_run',
    'list_channels', 'edge_health', 'describe_local_data', 'slice_dataset',
  ],
  forms: [
    'compute_4m_correlation', 'slice_by_4axis', 'get_event_context',
    'trace_tier1_to_tier2', 'validate_etl_run', 'edge_health',
    'describe_local_data', 'query_inspection_records', 'slice_dataset',
  ],
  core: ['edge_health', 'describe_local_data', 'slice_by_4axis', 'slice_dataset'],
  forwarder: ['edge_health'],
};

const VALID_4M = new Set(['material', 'person', 'machine', 'method']);

// --- dataset declaration (spec 41 §2) -------------------------------------
const VALID_GRAINS = new Set([
  'series', 'frame', 'cycle', 'cycle_detail', 'event', 'snapshot',
]);
const VALID_ARCHETYPES = new Set(['A', 'B', 'C', 'D', 'E']);
// Which tool each grain is read with. A dataset may declare only its grain's tool.
const GRAIN_READER = {
  series: 'summarize_series',   // then raw_waveform_query for the samples
  frame: 'raw_waveform_query',
  cycle: 'slice_dataset',
  cycle_detail: 'slice_dataset',
  snapshot: 'slice_dataset',
  event: 'slice_by_4axis',      // class ①: the 4M-axis surface
};
// Grains whose rows keep arriving — they must declare a retention policy.
const VOLATILE_GRAINS = new Set(['series', 'frame', 'cycle_detail']);
const DATASET_REQUIRED = ['dataset_id', 'table_name', 'grain', 'read_with', 'description'];

function listEdgeDirs() {
  if (!fs.existsSync(EDGE_ROOT)) return [];
  return fs.readdirSync(EDGE_ROOT, { withFileTypes: true })
    .filter(e => e.isDirectory())
    .map(e => e.name)
    .filter(name => {
      const dir = path.join(EDGE_ROOT, name);
      return fs.existsSync(path.join(dir, 'migrations')) || fs.existsSync(path.join(dir, 'mcp'));
    });
}

function readManifest(edgeDir) {
  const p = path.join(edgeDir, 'edge.manifest.json');
  if (!fs.existsSync(p)) return { error: 'edge.manifest.json is missing' };
  try {
    return { manifest: JSON.parse(fs.readFileSync(p, 'utf8')) };
  } catch (e) {
    return { error: `edge.manifest.json is not valid JSON (${e.message})` };
  }
}

function readMcpSource(edgeDir) {
  const mcpDir = path.join(edgeDir, 'mcp');
  if (!fs.existsSync(mcpDir)) return '';
  return fs.readdirSync(mcpDir)
    .filter(f => f.endsWith('.js'))
    .map(f => fs.readFileSync(path.join(mcpDir, f), 'utf8'))
    .join('\n');
}

/**
 * Column names present in this edge's t1_* migrations.
 *
 * Deterministic and deliberately loose: every identifier that appears at the
 * start of a line inside a CREATE TABLE body, plus anything added by ALTER
 * TABLE ... ADD COLUMN. A declared filter column that appears nowhere in the
 * DDL is a certain defect; the reverse (a column we fail to spot) only costs a
 * missed catch, never a false block.
 */
function t1Columns(edgeDir) {
  const migDir = path.join(edgeDir, 'migrations');
  if (!fs.existsSync(migDir)) return null;
  const files = fs.readdirSync(migDir).filter(f => /(^|[_/])t1_/i.test(f) && f.endsWith('.sql'));
  if (files.length === 0) return null;
  const cols = new Set();
  for (const f of files) {
    const sql = fs.readFileSync(path.join(migDir, f), 'utf8');
    for (const m of sql.matchAll(/^\s{2,}"?([a-z_][a-z0-9_]*)"?\s+[A-Za-z]/gim)) {
      cols.add(m[1].toLowerCase());
    }
    for (const m of sql.matchAll(/ADD\s+COLUMN\s+(?:IF\s+NOT\s+EXISTS\s+)?"?([a-z_][a-z0-9_]*)"?/gi)) {
      cols.add(m[1].toLowerCase());
    }
  }
  return cols;
}

/**
 * Checks 7-12: every declared dataset is readable, bounded and self-describing.
 */
function validateDatasets(manifest, edgeDir, rel, tools) {
  const errors = [];
  const datasets = manifest.datasets;

  if (datasets === undefined) return errors; // not yet declared — see requireDatasets()
  if (!Array.isArray(datasets)) {
    return [`${rel}: manifest.datasets must be an array (spec 41 §2)`];
  }

  const cols = t1Columns(edgeDir);
  const seen = new Set();

  for (const ds of datasets) {
    const id = (ds && ds.dataset_id) || '(unnamed)';
    const at = `${rel}: dataset '${id}'`;

    if (!ds || typeof ds !== 'object') {
      errors.push(`${rel}: datasets[] entries must be objects (spec 41 §2)`);
      continue;
    }
    for (const field of DATASET_REQUIRED) {
      if (ds[field] === undefined || ds[field] === '') {
        errors.push(`${at}: missing required field '${field}' (spec 41 §2)`);
      }
    }
    if (seen.has(ds.dataset_id)) {
      errors.push(`${at}: duplicate dataset_id — ids are unique within an edge`);
    }
    seen.add(ds.dataset_id);

    if (ds.grain !== undefined && !VALID_GRAINS.has(ds.grain)) {
      errors.push(`${at}: unknown grain '${ds.grain}' (one of: ${[...VALID_GRAINS].join(', ')})`);
      continue; // downstream checks key off the grain
    }
    if (ds.archetype !== undefined && ds.archetype !== null
        && !VALID_ARCHETYPES.has(ds.archetype)) {
      errors.push(`${at}: unknown archetype '${ds.archetype}' (A|B|C|D|E, or null for class ①)`);
    }

    // 8 + 9: the declared reader must exist on this edge, and must be the
    // reader this grain is read with. A dataset nothing can read is the exact
    // failure this gate exists to stop.
    const expected = GRAIN_READER[ds.grain];
    if (ds.read_with !== undefined) {
      if (expected && ds.read_with !== expected) {
        errors.push(`${at}: grain '${ds.grain}' is read with '${expected}', but read_with says '${ds.read_with}' (spec 41 §2.1)`);
      }
      if (!tools.includes(ds.read_with)) {
        errors.push(`${at}: read_with '${ds.read_with}' is not declared in manifest.tools — a dataset no tool can read (spec 41 §2.2)`);
      }
    }

    // 10: volatile grains must be bounded, and every dataset states its size.
    if (VOLATILE_GRAINS.has(ds.grain) && !ds.retention) {
      errors.push(`${at}: grain '${ds.grain}' grows without bound — declare 'retention' (pfe-database.md §2.1)`);
    }
    if (ds.row_estimate_per_cycle === undefined && ds.row_estimate_per_hour === undefined) {
      errors.push(`${at}: declare 'row_estimate_per_cycle' or 'row_estimate_per_hour' — the LLM sizes a request before making it (spec 41 §2.2)`);
    }

    // 11: units are declared here, never embedded in the value column.
    for (const m of ds.measures || []) {
      if (!m || !m.name) {
        errors.push(`${at}: measures[] entries need a 'name'`);
      } else if (!m.unit) {
        errors.push(`${at}: measure '${m.name}' has no 'unit' — units are declared, never embedded in the value (pfe-database.md §2.2)`);
      }
    }

    // 12: predicates and measures must address columns that exist.
    if (cols) {
      for (const f of ds.filterable || []) {
        if (f && f.name && !cols.has(String(f.name).toLowerCase())) {
          errors.push(`${at}: filterable column '${f.name}' is not in this edge's t1_* migrations`);
        }
      }
      for (const m of ds.measures || []) {
        if (m && m.name && !cols.has(String(m.name).toLowerCase())) {
          errors.push(`${at}: measure column '${m.name}' is not in this edge's t1_* migrations`);
        }
      }
    }

    for (const f of ds.filterable || []) {
      if (f && f.type === 'enum' && !Array.isArray(f.values)) {
        errors.push(`${at}: filterable '${f.name}' is type enum but declares no 'values'`);
      }
    }
  }

  // summarize_series is mandatory exactly when a series dataset exists.
  const hasSeries = datasets.some(d => d && d.grain === 'series');
  if (hasSeries && !tools.includes('summarize_series')) {
    errors.push(`${rel}: a 'series' dataset is declared but summarize_series is not in manifest.tools — statistics come before waveform retrieval (spec 41 §4)`);
  }

  return errors;
}

function validateEdge(edgeId) {
  const errors = [];
  const edgeDir = path.join(EDGE_ROOT, edgeId);
  const rel = `apps/edge/${edgeId}`;

  const { manifest, error } = readManifest(edgeDir);
  if (error) return [`${rel}: ${error} — every edge declares its conformance profile (pfe-edge-mcp-toolset §Conformance profiles)`];

  if (manifest.edge_id !== edgeId) {
    errors.push(`${rel}: manifest edge_id '${manifest.edge_id}' does not match directory name '${edgeId}'`);
  }
  const required = PROFILES[manifest.profile];
  if (!required) {
    errors.push(`${rel}: invalid profile '${manifest.profile}' (must be one of: ${Object.keys(PROFILES).join(', ')})`);
    return errors; // remaining checks depend on the profile
  }

  const tools = Array.isArray(manifest.tools) ? manifest.tools : [];
  for (const tool of required) {
    if (!tools.includes(tool)) {
      errors.push(`${rel}: profile '${manifest.profile}' mandates tool '${tool}' but the manifest does not declare it`);
    }
  }

  // Declared tools must exist in the MCP sources (name-string presence).
  const mcpSource = readMcpSource(edgeDir);
  if (tools.length > 0 && mcpSource === '') {
    errors.push(`${rel}: manifest declares ${tools.length} tool(s) but there is no mcp/ directory with sources`);
  } else {
    for (const tool of tools) {
      if (!mcpSource.includes(`'${tool}'`) && !mcpSource.includes(`"${tool}"`)) {
        errors.push(`${rel}: manifest declares tool '${tool}' but no mcp/*.js source names it`);
      }
    }
  }

  // 4M factor declaration sanity.
  if (tools.includes('compute_4m_correlation')) {
    const factors = manifest.supported_4m_factors;
    if (!Array.isArray(factors) || factors.length === 0) {
      errors.push(`${rel}: compute_4m_correlation is declared but supported_4m_factors is missing/empty — declare which factors this edge actually measures`);
    } else {
      for (const f of factors) {
        if (!VALID_4M.has(f)) errors.push(`${rel}: unknown 4M factor '${f}' in supported_4m_factors`);
      }
    }
  }

  // Tier-1 ⇔ catalog-sync pairing (R3), profile-aware.
  const migDir = path.join(edgeDir, 'migrations');
  const migrations = fs.existsSync(migDir) ? fs.readdirSync(migDir).filter(f => f.endsWith('.sql')) : [];
  const t1Migrations = migrations.filter(f => /(^|[_/])t1_/i.test(f));
  const hasCatalogSync = migrations.some(f =>
    /me_edge_primary_data/i.test(fs.readFileSync(path.join(migDir, f), 'utf8')));

  if (manifest.profile === 'forwarder') {
    if (t1Migrations.length > 0) {
      errors.push(`${rel}: profile 'forwarder' has no Tier-1 lake, but t1_* migration(s) exist: ${t1Migrations.join(', ')} — pick a lake-bearing profile or drop the tables`);
    }
    if (hasCatalogSync) {
      errors.push(`${rel}: profile 'forwarder' must not register central catalog rows (nothing to catalog)`);
    }
  } else if (t1Migrations.length > 0 && !hasCatalogSync) {
    errors.push(`${rel}: t1_* migration(s) present but no migration references me_edge_primary_data_* — the central catalog sync ships in the same change set (iotpf-pfs-data-model.md R3)`);
  }

  // Dataset declarations (spec 41). An edge with a Tier-1 lake must declare
  // what the LLM can read; a forwarder has no lake and declares none.
  if (manifest.profile !== 'forwarder' && t1Migrations.length > 0
      && manifest.datasets === undefined) {
    errors.push(`${rel}: t1_* migration(s) present but manifest declares no 'datasets' — every Tier-1 table states its grain and which tool reads it (spec 41 §2)`);
  }
  if (manifest.profile === 'forwarder' && Array.isArray(manifest.datasets)
      && manifest.datasets.length > 0) {
    errors.push(`${rel}: profile 'forwarder' has no Tier-1 lake, so it declares no datasets`);
  }
  errors.push(...validateDatasets(manifest, edgeDir, rel, tools));

  return errors;
}

/**
 * R3 repo-wide: a t1_* migration authored OUTSIDE apps/edge/<id>/ (where the
 * per-edge checks cannot see it) must still pair with a catalog-sync
 * migration in the same migrations directory. The commit-time hook
 * (pre-bash-db-migration-check.js) only WARNs; this is the merge-blocking
 * ERROR half.
 */
function validateStrayT1Migrations() {
  const errors = [];
  const SKIP_DIRS = new Set(['node_modules', '.git', 'edge']); // apps/edge covered per-edge
  const migrationDirs = [];

  (function walk(dir) {
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (!e.isDirectory()) continue;
      if (SKIP_DIRS.has(e.name)) continue;
      const child = path.join(dir, e.name);
      if (e.name === 'migrations') migrationDirs.push(child);
      walk(child);
    }
  })(ROOT);

  for (const dir of migrationDirs) {
    const files = fs.readdirSync(dir).filter(f => f.endsWith('.sql'));
    const t1Files = files.filter(f => /(^|[_/])t1_/i.test(f));
    if (t1Files.length === 0) continue;
    const hasCatalogSync = files.some(f =>
      /me_edge_primary_data/i.test(fs.readFileSync(path.join(dir, f), 'utf8')));
    if (!hasCatalogSync) {
      const rel = path.relative(ROOT, dir).replace(/\\/g, '/');
      errors.push(`${rel}: t1_* migration(s) (${t1Files.join(', ')}) without a me_edge_primary_data_* catalog sync in the same directory (iotpf-pfs-data-model.md R3)`);
    }
  }
  return errors;
}

function main() {
  const edges = listEdgeDirs();
  const strayErrors = validateStrayT1Migrations();
  if (edges.length === 0 && strayErrors.length === 0) {
    console.log('[validate-edge-mcp-conformance] no edge implementations under apps/edge/ — skipping');
    process.exit(0);
  }

  const errors = [...edges.flatMap(validateEdge), ...strayErrors];
  if (errors.length > 0) {
    console.error(`[validate-edge-mcp-conformance] FAILED — ${errors.length} violation(s):`);
    for (const e of errors) console.error(`  ERROR ${e}`);
    process.exit(1);
  }
  console.log(`[validate-edge-mcp-conformance] OK — ${edges.length} edge(s) conform to their declared profile (${edges.join(', ')})`);
  process.exit(0);
}

if (require.main === module) main();
module.exports = {
  validateEdge, listEdgeDirs, validateStrayT1Migrations, validateDatasets,
  t1Columns, PROFILES, VALID_GRAINS, GRAIN_READER,
};
