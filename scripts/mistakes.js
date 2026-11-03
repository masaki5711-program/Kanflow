#!/usr/bin/env node
/**
 * mistakes.js — CLI for the mistake-memory system (docs/mistake-memory-spec.md).
 *
 * Commands:
 *   add --json '{"title":..,"signature":..,"fix":..}'   record a mistake (or flags:
 *       --title --signature --context --root-cause --fix --tags a,b --severity 3)
 *   search <query...> [--k 3]     rank records against an error text
 *   migrate [--delete]            import legacy .claude_errors.md entries
 *   render-md                     regenerate MISTAKES.md from records.jsonl
 *   check                         gate: schema valid + no duplicate ids + MISTAKES.md in sync (exit 1 on drift)
 *   dedupe                        collapse duplicate ids left by a union merge of two branches
 *   stats                         corpus summary
 *   prune                         apply weight decay to stale records
 *   bench                         recall@3 / precision@1 against the synthetic fixture
 *
 * Node built-ins only. Store logic lives in scripts/lib/mistake-store.js.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const store = require('./lib/mistake-store');
const search = require('./lib/mistake-search');

const ROOT = process.env.CLAUDE_PROJECT_DIR || process.cwd();
const LEGACY_FILE = path.join(ROOT, '.claude_errors.md');
const BENCH_FIXTURE = path.join(ROOT, 'evals', 'fixtures', 'mistake-bench.json');
const BENCH_RECALL3_FLOOR = 0.75;
const BENCH_PRECISION1_FLOOR = 0.6;

function parseArgs(argv) {
  const flags = {};
  const positional = [];
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith('--')) {
        flags[key] = next;
        i += 1;
      } else {
        flags[key] = true;
      }
    } else {
      positional.push(a);
    }
  }
  return { flags, positional };
}

function fieldsFromFlags(flags) {
  if (flags.json) return JSON.parse(flags.json);
  return {
    title: flags.title,
    signature: flags.signature,
    context: flags.context || '',
    root_cause: flags['root-cause'] || flags.root_cause || '',
    fix: flags.fix,
    tags: flags.tags ? String(flags.tags).split(',').map(s => s.trim()).filter(Boolean) : [],
    severity: flags.severity ? parseInt(flags.severity, 10) : 3,
  };
}

function cmdAdd(flags) {
  const res = store.addRecord(ROOT, fieldsFromFlags(flags));
  if (!res.ok) {
    if (res.reason === 'confidential') {
      console.error('[mistakes] REJECTED — confidential content detected:');
      for (const f of res.findings) console.error(`  - ${f.pattern}: ${f.hint}`);
    } else {
      console.error('[mistakes] REJECTED — invalid record:');
      for (const p of res.problems || []) console.error(`  - ${p}`);
    }
    return 1;
  }
  console.log(`[mistakes] ${res.action}: ${res.record.id} "${res.record.title}" (weight ${res.record.weight})`);
  return 0;
}

function cmdSearch(flags, positional) {
  const query = positional.join(' ');
  if (!query) {
    console.error('usage: mistakes.js search <query...>');
    return 1;
  }
  const k = flags.k ? parseInt(flags.k, 10) : 3;
  const ranked = search
    .rank(store.loadRecords(ROOT), query, { nowMs: Date.now() })
    .filter(m => m.lex >= search.INJECT_THRESHOLD)
    .slice(0, k);
  if (ranked.length === 0) {
    console.log('[mistakes] no match above threshold');
    return 0;
  }
  for (const m of ranked) {
    console.log(`lex=${m.lex.toFixed(2)} score=${m.score.toFixed(2)} ${m.record.id}`);
  }
  console.log('');
  console.log(search.formatMatches(ranked));
  return 0;
}

function cmdMigrate(flags) {
  let md;
  try {
    md = fs.readFileSync(LEGACY_FILE, 'utf8');
  } catch {
    console.log('[mistakes] no .claude_errors.md — nothing to migrate');
    return 0;
  }
  const parsed = store.parseLegacy(md);
  let imported = 0;
  for (const fields of parsed) {
    const res = store.addRecord(ROOT, fields);
    if (res.ok) imported += 1;
    else console.error(`[mistakes] skipped "${fields.title}": ${res.reason}`);
  }
  console.log(`[mistakes] migrated ${imported}/${parsed.length} entr${parsed.length === 1 ? 'y' : 'ies'}`);
  if (flags.delete && imported === parsed.length) {
    fs.rmSync(LEGACY_FILE);
    console.log('[mistakes] deleted .claude_errors.md (fully migrated)');
  }
  return 0;
}

function cmdCheck() {
  const records = store.loadRecords(ROOT);
  const problems = [];
  for (const r of records) {
    for (const e of store.validateRecord(r)) problems.push(`${r.id || '<no id>'}: ${e}`);
  }
  if (problems.length) {
    console.error(`[mistakes] check FAILED — ${problems.length} schema problem(s):`);
    for (const p of problems) console.error(`  - ${p}`);
    return 1;
  }
  const dupes = store.duplicateIds(ROOT);
  if (dupes.length) {
    console.error(`[mistakes] check FAILED — ${dupes.length} duplicate id(s) in records.jsonl (union merge of two branches; run: node scripts/mistakes.js dedupe): ${dupes.join(', ')}`);
    return 1;
  }
  if (!store.checkMarkdown(ROOT)) {
    console.error('[mistakes] check FAILED — MISTAKES.md is out of sync with records.jsonl (run: node scripts/mistakes.js render-md)');
    return 1;
  }
  console.log(`[mistakes] check OK — ${records.length} record(s), MISTAKES.md in sync`);
  return 0;
}

function cmdRenderMd() {
  const changed = store.writeMarkdown(ROOT, new Date().toISOString());
  console.log(`[mistakes] MISTAKES.md ${changed ? 'regenerated' : 'already up to date'}`);
  return 0;
}

function cmdDedupe() {
  const removed = store.dedupeStore(ROOT, new Date().toISOString());
  console.log(`[mistakes] dedupe: ${removed ? `collapsed ${removed} duplicate line(s)` : 'no duplicate ids'}`);
  return 0;
}

function cmdStats() {
  const records = store.loadRecords(ROOT);
  const pinned = records.filter(r => r.pinned).length;
  const recurred = records.filter(r => (r.recurrence || 0) > 0).length;
  console.log(`records: ${records.length}, pinned: ${pinned}, recurred: ${recurred}`);
  return 0;
}

function cmdPrune() {
  const decayed = store.pruneDecay(ROOT, new Date().toISOString());
  console.log(`[mistakes] decayed ${decayed} stale record(s)`);
  return 0;
}

function cmdBench(flags) {
  const fixtureFile = flags.fixture ? path.resolve(flags.fixture) : BENCH_FIXTURE;
  const fixture = JSON.parse(fs.readFileSync(fixtureFile, 'utf8'));
  const records = fixture.records.map(f => store.createRecord(f, '2026-01-01T00:00:00.000Z'));
  const byTitle = new Map(records.map(r => [r.title, r.id]));

  let recall3Hits = 0;
  let precision1Hits = 0;
  for (const q of fixture.queries) {
    const expectedId = byTitle.get(q.expect);
    const top3 = search.rank(records, q.q, { now: '2026-01-01T00:00:00.000Z' }).slice(0, 3);
    if (top3.some(m => m.record.id === expectedId && m.lex >= search.INJECT_THRESHOLD)) recall3Hits += 1;
    if (top3[0] && top3[0].record.id === expectedId && top3[0].lex >= search.INJECT_THRESHOLD) precision1Hits += 1;
  }
  let falseInjects = 0;
  for (const q of fixture.negatives || []) {
    const top = search.rank(records, q.q, { now: '2026-01-01T00:00:00.000Z' })[0];
    if (top && top.lex >= search.INJECT_THRESHOLD) falseInjects += 1;
  }

  const n = fixture.queries.length;
  const recall3 = recall3Hits / n;
  const precision1 = precision1Hits / n;
  console.log(`bench: ${n} queries + ${(fixture.negatives || []).length} negatives over ${records.length} synthetic records`);
  console.log(`recall@3    = ${recall3.toFixed(2)} (floor ${BENCH_RECALL3_FLOOR})`);
  console.log(`precision@1 = ${precision1.toFixed(2)} (floor ${BENCH_PRECISION1_FLOOR})`);
  console.log(`false-inject on negatives = ${falseInjects} (must be 0)`);
  if (recall3 < BENCH_RECALL3_FLOOR || precision1 < BENCH_PRECISION1_FLOOR || falseInjects > 0) {
    console.error('[mistakes] bench FAILED — below quality floor; recalibrate thresholds before relying on injection');
    return 1;
  }
  console.log('[mistakes] bench OK');
  return 0;
}

function main() {
  const [, , cmd, ...rest] = process.argv;
  const { flags, positional } = parseArgs(rest);
  const commands = {
    add: () => cmdAdd(flags),
    search: () => cmdSearch(flags, positional),
    migrate: () => cmdMigrate(flags),
    check: () => cmdCheck(),
    'render-md': () => cmdRenderMd(),
    dedupe: () => cmdDedupe(),
    stats: () => cmdStats(),
    prune: () => cmdPrune(),
    bench: () => cmdBench(flags),
  };
  if (!cmd || !commands[cmd]) {
    console.error('usage: mistakes.js <add|search|migrate|check|render-md|dedupe|stats|prune|bench> [options]');
    process.exit(1);
  }
  try {
    process.exit(commands[cmd]());
  } catch (err) {
    console.error(`[mistakes] error: ${err.message}`);
    process.exit(1);
  }
}

if (require.main === module) main();
module.exports = { parseArgs, fieldsFromFlags };
