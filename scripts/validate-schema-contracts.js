#!/usr/bin/env node
'use strict';

/*
 * validate-schema-contracts.js — schema-first contract gate.
 *
 * iotpf-architecture-contracts.md §1 mandates "no cross-service code without
 * a committed schema FIRST" and its Enforcement section warns that a contract
 * without a checker is a suggestion. This gate makes the schema-first
 * contracts structural.
 *
 * Contract roots: the legacy monorepo root `apps/` and every product checkout
 * `apps/<project>/` (workspace model, iotpf-git-workflow §1.1). Under each root:
 *
 *   schemas/mqtt/*.schema.json (MQTT seams):
 *     1. ERROR — file is not valid JSON.
 *     2. ERROR — `x-topic` not matching the taxonomy
 *        iotpf/v<N>/<kind>/<segment>… with a known kind (contracts §3).
 *        WARNING — `x-topic` missing, or the deprecated scaffold form
 *        factory/<line>/<machine>/<signal>.
 *     3. ERROR — top-level `additionalProperties` not declared. `false` =
 *        closed schema; `true` = tolerant reader (independently upgraded
 *        PFEs), allowed only with `schema_version` required.
 *     4. ERROR — none of plant_code / edge_system_id / shard required
 *        (multi-plant isolation, CLAUDE.md §3; edge and shard resolve to
 *        plants through the registry).
 *     5. ERROR — a timestamp-named property (`time`, `*_at`) is neither
 *        `format: date-time` (RFC 3339, offset mandatory) nor constrained by
 *        a pattern enforcing an explicit offset. Patterns are checked
 *        BEHAVIORALLY: reject a naive timestamp, accept both `Z` and
 *        `+09:00` — any regex formulation that does so passes.
 *
 *   proto/**\/*.proto (gRPC seams, e.g. iotpf.judgment.v1):
 *     6. ERROR — missing `syntax = "proto3"`.
 *     7. ERROR — package is not versioned (`<name>.v<N>`), the seam for
 *        non-breaking evolution.
 *
 *   schemas/sql/pfsdb/ (PFS foundation DDL):
 *     8. ERROR — directory exists but holds no SQL-iotdb_Rev*.sql — the
 *        normative DDL went missing while docs still point at it.
 *
 * Nothing landed yet (no mqtt/, proto/ or pfsdb/ content under any root) ->
 * skip cleanly.
 *
 * Node built-ins only. CI gate, not a Claude Code hook: it does NOT fail
 * open — blocking contract drift is the point.
 *
 * Run: node scripts/validate-schema-contracts.js
 */

const fs = require('fs');
const path = require('path');

const ROOT = process.env.CLAUDE_PROJECT_DIR || process.cwd();
const APPS = path.join(ROOT, 'apps');

// Topic kinds of the IoTPF specification (contracts §3). A new kind is a spec
// decision first, then a line here.
const TOPIC_KINDS = ['etl', 'wm', 'ack', 'ackreq', 'ackrep', 'fact', 'factwm', 'judgment', 'alert'];
// A message must say whose data it is: the plant directly, or a key the
// registry resolves to a plant (edge system) or to a set of edges (shard).
const SCOPE_KEYS = ['plant_code', 'edge_system_id', 'shard'];
const TOPIC_PATTERN = new RegExp(
  `^iotpf/v\\d+/(${TOPIC_KINDS.join('|')})(/(<[a-z0-9_]+>|[A-Za-z0-9_.-]+))+$`,
);
const LEGACY_TOPIC_PATTERN = /^factory\/(<line>|[a-z0-9_-]+)\/(<machine>|[a-z0-9_-]+)\/[a-z0-9_]+$/;
const TIMESTAMP_PROP = /^(time|.*_at)$/;

// Directories under apps/ that belong to the legacy monorepo layout itself,
// not to a product checkout.
const LEGACY_DIRS = new Set(['schemas', 'proto']);

// The legacy root apps/ plus every product checkout apps/<project>/.
function contractRoots() {
  const roots = [APPS];
  if (!fs.existsSync(APPS)) return roots;
  const dirs = fs.readdirSync(APPS, { withFileTypes: true })
    .filter(e => e.isDirectory() && !e.name.startsWith('.') && !LEGACY_DIRS.has(e.name))
    .sort((a, b) => a.name.localeCompare(b.name)); // deterministic across platforms
  for (const d of dirs) roots.push(path.join(APPS, d.name));
  return roots;
}

// Behavioral timezone check: any regex that rejects naive local time and
// accepts both Z and ±hh:mm offsets passes — the formulation is free.
function timestampPatternProblem(pattern) {
  let re;
  try {
    re = new RegExp(pattern);
  } catch (e) {
    return `pattern is not a valid regex (${e.message})`;
  }
  if (re.test('2026-01-02T03:04:05')) {
    return 'pattern accepts a naive timestamp without a timezone offset';
  }
  if (!re.test('2026-01-02T03:04:05Z') || !re.test('2026-01-02T03:04:05+09:00')) {
    return 'pattern rejects valid timezone-offset timestamps (Z / +09:00)';
  }
  return null;
}

function listFiles(dir, suffix) {
  if (!fs.existsSync(dir)) return [];
  const out = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true })
    .sort((a, b) => a.name.localeCompare(b.name)); // deterministic across platforms
  for (const entry of entries) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listFiles(p, suffix));
    else if (entry.name.endsWith(suffix)) out.push(p);
  }
  return out;
}

function rel(p) {
  return path.relative(ROOT, p).replace(/\\/g, '/');
}

function checkMqttSchema(file, errors, warnings) {
  const name = rel(file);
  let schema;
  try {
    schema = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    errors.push(`${name}: not valid JSON — ${e.message}`);
    return;
  }
  if (schema === null || typeof schema !== 'object' || Array.isArray(schema)) {
    // JSON.parse('null') / '[]' / '42' succeed but are not schema objects.
    errors.push(`${name}: top level must be a JSON object, got ${JSON.stringify(schema)?.slice(0, 40)}`);
    return;
  }

  const topic = schema['x-topic'];
  if (topic === undefined) {
    warnings.push(`${name}: no x-topic — declare the topic so the taxonomy can be checked (contracts §3)`);
  } else if (typeof topic === 'string' && LEGACY_TOPIC_PATTERN.test(topic)) {
    warnings.push(
      `${name}: x-topic '${topic}' uses the deprecated factory/<line>/<machine>/<signal> form — ` +
        'move to iotpf/v<N>/<kind>/… (contracts §3)',
    );
  } else if (typeof topic !== 'string' || !TOPIC_PATTERN.test(topic)) {
    errors.push(
      `${name}: x-topic missing or off-taxonomy (got ${JSON.stringify(topic)}) — ` +
        `topics are iotpf/v<N>/<kind>/<segment>… with kind in ${TOPIC_KINDS.join(', ')} (contracts §3)`,
    );
  }

  const required = Array.isArray(schema.required) ? schema.required : [];
  if (typeof schema.additionalProperties !== 'boolean') {
    errors.push(
      `${name}: top-level additionalProperties must be declared — false (closed) or true ` +
        '(tolerant reader, with a required schema_version) (contracts §3)',
    );
  } else if (schema.additionalProperties === true && !required.includes('schema_version')) {
    errors.push(
      `${name}: a tolerant-reader schema (additionalProperties: true) must require schema_version, ` +
        'so a breaking change is a new version, not a silent new field (contracts §3)',
    );
  }

  if (!SCOPE_KEYS.some(k => required.includes(k))) {
    errors.push(
      `${name}: one of ${SCOPE_KEYS.join(' / ')} must be required — every message names its plant ` +
        'or a key the registry resolves to one (multi-plant isolation, CLAUDE.md §3)',
    );
  }

  const props = schema.properties && typeof schema.properties === 'object' ? schema.properties : {};
  for (const [prop, def] of Object.entries(props)) {
    if (!TIMESTAMP_PROP.test(prop)) continue;
    const d = def && typeof def === 'object' ? def : {};
    // RFC 3339 date-time (JSON Schema `format: date-time`) mandates an offset.
    if (d.format === 'date-time') continue;
    const problem =
      typeof d.pattern !== 'string'
        ? 'has neither format: date-time nor a pattern'
        : timestampPatternProblem(d.pattern);
    if (problem) {
      errors.push(
        `${name}: timestamp property '${prop}' must enforce an explicit timezone offset ` +
          `(Z or ±hh:mm) — ${problem}; naive local time is banned (CLAUDE.md §3)`,
      );
    }
  }
}

function checkProto(file, errors) {
  const name = rel(file);
  let text;
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch (e) {
    errors.push(`${name}: unreadable — ${e.message}`);
    return;
  }

  if (!/syntax\s*=\s*"proto3"\s*;/.test(text)) {
    errors.push(`${name}: must declare syntax = "proto3" (contracts §1)`);
  }

  const pkg = text.match(/^\s*package\s+([A-Za-z0-9_.]+)\s*;/m);
  if (!pkg || !/\.v\d+$/.test(pkg[1])) {
    errors.push(
      `${name}: package ${pkg ? `'${pkg[1]}'` : '(missing)'} must be a versioned package ` +
        '(e.g. iotpf.judgment.v1) so breaking changes go to a new version, not in-place edits',
    );
  }
}

function main() {
  const mqttFiles = [];
  const protoFiles = [];
  const pfsdbDirs = [];
  for (const root of contractRoots()) {
    mqttFiles.push(...listFiles(path.join(root, 'schemas', 'mqtt'), '.schema.json'));
    protoFiles.push(...listFiles(path.join(root, 'proto'), '.proto'));
    const pfsdb = path.join(root, 'schemas', 'sql', 'pfsdb');
    if (fs.existsSync(pfsdb)) pfsdbDirs.push(pfsdb);
  }

  if (mqttFiles.length === 0 && protoFiles.length === 0 && pfsdbDirs.length === 0) {
    console.log('[validate-schema-contracts] no contract artifacts under apps/ yet — skipping');
    process.exit(0);
  }

  const errors = [];
  const warnings = [];

  for (const f of mqttFiles) checkMqttSchema(f, errors, warnings);
  for (const f of protoFiles) checkProto(f, errors);

  for (const dir of pfsdbDirs) {
    const ddls = listFiles(dir, '.sql').filter(f => /SQL-iotdb_Rev.*\.sql$/i.test(path.basename(f)));
    if (ddls.length === 0) {
      errors.push(
        `${rel(dir)}: exists but holds no SQL-iotdb_Rev*.sql — the normative pfsdb ` +
          'foundation DDL is missing while iotpf-pfs-data-model.md points here',
      );
    }
  }

  if (warnings.length) {
    console.log(`\n[validate-schema-contracts] ${warnings.length} warning(s):`);
    for (const w of warnings) console.log('  WARN  ' + w);
  }

  if (errors.length) {
    console.error(`\n[validate-schema-contracts] FAILED — ${errors.length} error(s):`);
    for (const e of errors) console.error('  ERROR ' + e);
    process.exit(1);
  }

  console.log(
    '[validate-schema-contracts] OK — schema-first contracts hold ' +
      `[mqtt=${mqttFiles.length}, proto=${protoFiles.length}, pfsdb_ddl=${pfsdbDirs.length}]`,
  );
  process.exit(0);
}

main();
