#!/usr/bin/env node
'use strict';

/*
 * validate-contract-compat.js — breaking-change gate for the wire contracts.
 *
 * validate-schema-contracts.js checks that each contract file is WELL-FORMED;
 * this gate checks that a change is COMPATIBLE with what was already merged.
 * iotpf-architecture-contracts.md §1 makes the schemas the single source of
 * truth for cross-service code — an in-place breaking edit silently breaks the
 * other side of the seam, which is exactly the drift the contracts exist to
 * prevent.
 *
 * Compared against a git baseline (first resolvable of ECC_CONTRACT_BASE_REF,
 * CI_MERGE_REQUEST_DIFF_BASE_SHA, merge-base with origin/main, merge-base with
 * main):
 *
 *   apps/schemas/mqtt/*.schema.json (MQTT seams):
 *     1. ERROR — a contract file that existed at the baseline was deleted.
 *     2. ERROR — a property that existed at the baseline was removed
 *        (consumers still reference it).
 *     3. ERROR — a property's `type` changed in place.
 *     4. ERROR — a field became required that was not required at the
 *        baseline (breaks every existing producer).
 *     5. ERROR — `x-topic` changed in place (topics are identity; a new
 *        topic is a new schema file, not an edit).
 *
 *   apps/proto/**\/*.proto (Hub ⇄ AI, Flow B hand-off):
 *     6. ERROR — a message that existed at the baseline was removed.
 *     7. ERROR — a field number was removed without being `reserved`
 *        (the sanctioned deprecation path).
 *     8. ERROR — a field number's type or name changed in place (breaks
 *        wire/JSON mapping and generated code).
 *
 * No baseline resolvable (fresh clone with no trunk ref, or git absent) →
 * logs and exits 0: compatibility is only checkable against history, and the
 * well-formedness gate still runs. Never silent — the skip is printed.
 *
 * Node built-ins only. CI gate, not a Claude Code hook: on a resolvable
 * baseline it does NOT fail open.
 *
 * Run: node scripts/validate-contract-compat.js
 */

const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = process.env.CLAUDE_PROJECT_DIR || process.cwd();
const MQTT_REL = 'apps/schemas/mqtt';
const PROTO_REL = 'apps/proto';

// --- pure diff logic ---------------------------------------------------------

/**
 * Minimal proto3 parser: message blocks (nested names joined with '.'),
 * their fields ({ number: { name, type } }) and reserved field numbers.
 */
function parseProtoMessages(text) {
  const messages = {};
  const stack = [];
  // Strip comments first, then normalize to one statement/brace per line so
  // single-line forms (`message M { reserved 2; string a = 1; }`) parse too.
  const lines = String(text || '')
    .replace(/\/\/.*$/gm, '')
    .replace(/([{};])/g, '$1\n')
    .split('\n');

  for (const line of lines) {
    const open = line.match(/^\s*message\s+([A-Za-z_][A-Za-z0-9_]*)\s*\{/);
    if (open) {
      stack.push(open[1]);
      const name = stack.join('.');
      messages[name] = messages[name] || { fields: {}, reserved: new Set() };
      continue;
    }

    // enum/oneof/service blocks also use braces; track depth without naming.
    if (/^\s*(enum|oneof|service|rpc)\b.*\{/.test(line)) {
      stack.push(null);
      continue;
    }

    if (/^\s*\}/.test(line)) {
      stack.pop();
      continue;
    }

    const current = [...stack].filter(Boolean).join('.');
    if (!current || stack[stack.length - 1] === null) continue;
    const msg = messages[current];
    if (!msg) continue;

    const reserved = line.match(/^\s*reserved\s+([^;]+);/);
    if (reserved && /\d/.test(reserved[1])) {
      for (const part of reserved[1].split(',')) {
        const range = part.trim().match(/^(\d+)(?:\s+to\s+(\d+|max))?$/);
        if (!range) continue;
        const from = Number(range[1]);
        const to = range[2] && range[2] !== 'max' ? Number(range[2]) : from;
        for (let n = from; n <= to; n += 1) msg.reserved.add(n);
      }
      continue;
    }

    const field = line.match(
      /^\s*(?:repeated\s+|optional\s+)?(map<[^>]+>|[A-Za-z_][A-Za-z0-9_.]*)\s+([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(\d+)\s*[;[]/,
    );
    if (field) {
      msg.fields[Number(field[3])] = { type: field[1], name: field[2] };
    }
  }
  return messages;
}

function diffProto(baseText, currText, fileName) {
  const errors = [];
  const base = parseProtoMessages(baseText);
  const curr = parseProtoMessages(currText);

  for (const [msgName, baseMsg] of Object.entries(base)) {
    const currMsg = curr[msgName];
    if (!currMsg) {
      errors.push(`${fileName}: message '${msgName}' was removed — breaking for every caller`);
      continue;
    }
    for (const [numStr, baseField] of Object.entries(baseMsg.fields)) {
      const num = Number(numStr);
      const currField = currMsg.fields[num];
      if (!currField) {
        if (!currMsg.reserved.has(num)) {
          errors.push(
            `${fileName}: ${msgName} field #${num} ('${baseField.name}') removed without ` +
              `'reserved ${num};' — reserve retired field numbers, never silently drop them`,
          );
        }
        continue;
      }
      if (currField.type !== baseField.type) {
        errors.push(
          `${fileName}: ${msgName} field #${num} changed type ${baseField.type} -> ${currField.type} ` +
            '— in-place type changes break the wire contract; add a new field instead',
        );
      } else if (currField.name !== baseField.name) {
        errors.push(
          `${fileName}: ${msgName} field #${num} renamed '${baseField.name}' -> '${currField.name}' ` +
            '— renames break JSON mapping and generated code; add a new field instead',
        );
      }
    }
  }
  return errors;
}

function diffMqttSchema(baseSchema, currSchema, fileName) {
  const errors = [];
  const baseProps = (baseSchema && baseSchema.properties) || {};
  const currProps = (currSchema && currSchema.properties) || {};
  const baseRequired = new Set(Array.isArray(baseSchema?.required) ? baseSchema.required : []);
  const currRequired = Array.isArray(currSchema?.required) ? currSchema.required : [];

  if (baseSchema?.['x-topic'] && currSchema?.['x-topic'] && baseSchema['x-topic'] !== currSchema['x-topic']) {
    errors.push(
      `${fileName}: x-topic changed '${baseSchema['x-topic']}' -> '${currSchema['x-topic']}' — ` +
        'a topic is the contract identity; a new topic is a new schema file',
    );
  }

  for (const [prop, baseDef] of Object.entries(baseProps)) {
    const currDef = currProps[prop];
    if (!currDef) {
      errors.push(`${fileName}: property '${prop}' was removed — consumers still reference it`);
      continue;
    }
    // `type` may be a string or an array (["string","null"]) — compare by value.
    const baseType = baseDef && baseDef.type !== undefined ? JSON.stringify(baseDef.type) : undefined;
    const currType = currDef && currDef.type !== undefined ? JSON.stringify(currDef.type) : undefined;
    if (baseType !== undefined && currType !== undefined && baseType !== currType) {
      errors.push(
        `${fileName}: property '${prop}' changed type ${JSON.stringify(baseDef.type)} -> ` +
          `${JSON.stringify(currDef.type)} — in-place type changes break consumers`,
      );
    }
  }

  for (const req of currRequired) {
    if (!baseRequired.has(req)) {
      errors.push(
        `${fileName}: '${req}' became required (was optional/absent at the baseline) — ` +
          'breaks every existing producer; introduce it as optional first',
      );
    }
  }
  return errors;
}

// --- git plumbing (main only) --------------------------------------------------

function git(args) {
  try {
    return {
      ok: true,
      out: execFileSync('git', args, {
        cwd: ROOT,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
        maxBuffer: 32 * 1024 * 1024,
      }),
    };
  } catch (e) {
    return { ok: false, out: `${e.stdout || ''}${e.stderr || ''}` };
  }
}

function resolveBase() {
  for (const ref of [process.env.ECC_CONTRACT_BASE_REF, process.env.CI_MERGE_REQUEST_DIFF_BASE_SHA].filter(Boolean)) {
    if (git(['rev-parse', '--verify', `${ref}^{commit}`]).ok) return ref;
  }
  for (const trunk of ['origin/main', 'main']) {
    const mb = git(['merge-base', 'HEAD', trunk]);
    if (mb.ok && mb.out.trim()) return mb.out.trim();
  }
  return null;
}

function listBaseFiles(base, relDir) {
  const res = git(['ls-tree', '-r', '--name-only', base, '--', relDir]);
  if (!res.ok) return [];
  return res.out.split('\n').map(s => s.trim()).filter(Boolean);
}

function showAtBase(base, relPath) {
  const res = git(['show', `${base}:${relPath}`]);
  return res.ok ? res.out : null;
}

function main() {
  if (!git(['rev-parse', '--git-dir']).ok) {
    console.log('[validate-contract-compat] not a git checkout — skipping (well-formedness gate still applies)');
    process.exit(0);
  }
  const base = resolveBase();
  if (!base) {
    console.log('[validate-contract-compat] no baseline resolvable (no origin/main or main ref) — skipping');
    process.exit(0);
  }

  const baseMqtt = listBaseFiles(base, MQTT_REL).filter(f => f.endsWith('.schema.json'));
  const baseProto = listBaseFiles(base, PROTO_REL).filter(f => f.endsWith('.proto'));

  if (baseMqtt.length === 0 && baseProto.length === 0) {
    console.log('[validate-contract-compat] no contract files at the baseline — nothing to compare');
    process.exit(0);
  }

  const errors = [];
  let compared = 0;

  // Workspace-split awareness (iotpf-git-workflow §1.1): a baseline contract
  // whose path is now git-IGNORED has moved to a product repository — its
  // identity lives on there (and on archive/apps-iotpf-scaffold), so absence
  // here is a relocation, not a deletion.
  const isIgnoredNow = rel => {
    try {
      execFileSync('git', ['check-ignore', '-q', rel], {
        cwd: ROOT,
        timeout: 10000,
        windowsHide: true,
        stdio: 'ignore',
      });
      return true; // exit 0 — the path is ignored (moved to a product repo)
    } catch {
      return false;
    }
  };
  const missing = rel => {
    if (isIgnoredNow(rel)) {
      console.log(`[validate-contract-compat] ${rel}: moved to a product repo (path now ignored) — skipping`);
      return null;
    }
    return `${rel}: contract file deleted — merged contracts are immutable identities`;
  };

  for (const rel of baseMqtt) {
    const abs = path.join(ROOT, rel);
    if (!fs.existsSync(abs)) {
      const err = missing(rel);
      if (err) errors.push(err);
      continue;
    }
    const baseText = showAtBase(base, rel);
    if (baseText === null) continue;
    let baseSchema;
    let currSchema;
    try {
      baseSchema = JSON.parse(baseText);
      currSchema = JSON.parse(fs.readFileSync(abs, 'utf8'));
    } catch (e) {
      // Malformed JSON is validate-schema-contracts' finding; skip the diff.
      console.log(`[validate-contract-compat] ${rel}: unparseable JSON (${e.message}) — deferring to schema-contracts gate`);
      continue;
    }
    errors.push(...diffMqttSchema(baseSchema, currSchema, rel));
    compared += 1;
  }

  for (const rel of baseProto) {
    const abs = path.join(ROOT, rel);
    if (!fs.existsSync(abs)) {
      const err = missing(rel);
      if (err) errors.push(err);
      continue;
    }
    const baseText = showAtBase(base, rel);
    if (baseText === null) continue;
    errors.push(...diffProto(baseText, fs.readFileSync(abs, 'utf8'), rel));
    compared += 1;
  }

  if (errors.length) {
    console.error(`\n[validate-contract-compat] FAILED — ${errors.length} breaking change(s) vs ${base.slice(0, 12)}:`);
    for (const e of errors) console.error('  ERROR ' + e);
    process.exit(1);
  }
  console.log(
    `[validate-contract-compat] OK — ${compared} contract file(s) compatible with baseline ${base.slice(0, 12)}`,
  );
  process.exit(0);
}

module.exports = { parseProtoMessages, diffProto, diffMqttSchema };

if (require.main === module) main();
