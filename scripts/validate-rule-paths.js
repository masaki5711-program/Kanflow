#!/usr/bin/env node
'use strict';

/*
 * validate-rule-paths.js — on-demand rule loading gate (context-bloat guard).
 *
 * CLAUDE.md §9 contract: only the rules @-imported from CLAUDE.md load into
 * every session; every OTHER file under .claude/rules/ must carry `paths:`
 * frontmatter so the harness attaches it on demand (a rule without `paths:`
 * loads into EVERY session). Until now this was convention-only — the 2026-07
 * harness audit flagged that a new rule file forgetting `paths:` would
 * silently re-inflate the always-loaded context. This gate makes the
 * convention machine-checked (11th self-heal gate).
 *
 * ERROR when a .claude/rules/**.md file is neither
 *   (a) @-imported from CLAUDE.md (always-on by design), nor
 *   (b) carrying a `paths:` key in its YAML frontmatter (on-demand / sentinel).
 *
 * Node built-ins only. CI gate, not a Claude Code hook: does NOT fail open —
 * silent context bloat is exactly what it must block.
 *
 * Run: node scripts/validate-rule-paths.js
 */

const fs = require('fs');
const path = require('path');

const ROOT = process.env.CLAUDE_PROJECT_DIR || process.cwd();
const RULES_DIR = path.join(ROOT, '.claude', 'rules');
const CLAUDE_MD = path.join(ROOT, 'CLAUDE.md');

function readOr(fallback, p) {
  try {
    return fs.readFileSync(p, 'utf8');
  } catch {
    return fallback;
  }
}

/** Repo-relative paths (posix separators) @-imported from CLAUDE.md. */
function alwaysImportedRules() {
  const text = readOr('', CLAUDE_MD);
  const imports = new Set();
  for (const m of text.matchAll(/^@(\.claude\/rules\/\S+\.md)\s*$/gm)) {
    imports.add(m[1]);
  }
  return imports;
}

function listRuleFiles(dir, out = []) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) listRuleFiles(full, out);
    else if (e.isFile() && e.name.endsWith('.md')) out.push(full);
  }
  return out;
}

/** True when the file's YAML frontmatter block contains a `paths:` key. */
function hasPathsFrontmatter(file) {
  const text = readOr('', file);
  if (!text.startsWith('---')) return false;
  const end = text.indexOf('\n---', 3);
  if (end < 0) return false;
  return /^paths:/m.test(text.slice(0, end));
}

function validate() {
  const always = alwaysImportedRules();
  const errors = [];
  for (const file of listRuleFiles(RULES_DIR)) {
    const rel = path.relative(ROOT, file).split(path.sep).join('/');
    if (always.has(rel)) continue; // always-on by design (CLAUDE.md §9 import)
    if (hasPathsFrontmatter(file)) continue; // on-demand (or sentinel) — OK
    errors.push(
      `${rel}: not @-imported from CLAUDE.md and has no \`paths:\` frontmatter — ` +
        'it would load into EVERY session. Add `paths:` (or a never-matching sentinel ' +
        'for human-only files), or add it to the CLAUDE.md §9 import list deliberately.',
    );
  }
  return { errors, always };
}

function main() {
  const { errors, always } = validate();
  if (errors.length > 0) {
    console.error(`[validate-rule-paths] FAILED — ${errors.length} violation(s):`);
    for (const e of errors) console.error(`  ERROR ${e}`);
    process.exit(1);
  }
  const total = listRuleFiles(RULES_DIR).length;
  console.log(
    `[validate-rule-paths] OK — ${total} rule files: ${always.size} always-imported, ` +
      `${total - always.size} on-demand (all carry paths:)`,
  );
  process.exit(0);
}

if (require.main === module) main();
module.exports = { validate, alwaysImportedRules, hasPathsFrontmatter };
