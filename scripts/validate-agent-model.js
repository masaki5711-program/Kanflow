#!/usr/bin/env node
'use strict';

/*
 * validate-agent-model.js — agent-model integrity gate.
 *
 * validate-ecc-config.js checks that each component is well-formed in
 * isolation. This gate checks the agent MODEL as a system:
 *   1. Every agent/skill named in the routing rule actually exists
 *      (so the documented "layer -> agent -> skill" routing is executable).
 *   2. Each ZEVA-Link layer maps to its mandated reviewer/role, and that
 *      agent exists (routing coverage).
 *   3. Orphan agents (defined but never cited in routing) are surfaced as
 *      warnings, to keep the 36-agent fleet discoverable.
 *
 * Node built-ins only (CLAUDE.md). Exit 0 = clean, 1 = errors. This is a CI
 * gate, not a Claude Code hook, so it does NOT fail open — a broken routing
 * map must block the merge.
 *
 * Run: node scripts/validate-agent-model.js
 */

const fs = require('fs');
const path = require('path');

const ROOT = process.env.CLAUDE_PROJECT_DIR || process.cwd();
const CLAUDE = path.join(ROOT, '.claude');
const ROUTING = path.join(CLAUDE, 'rules', 'iotpf-agents-skills.md');

const errors = [];
const warnings = [];
const err = (m) => errors.push(m);
const warn = (m) => warnings.push(m);

function readSafe(p) {
  try {
    return fs.readFileSync(p, 'utf8');
  } catch {
    return null;
  }
}
function dirNames(dir, isDir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((e) => {
    const st = fs.statSync(path.join(dir, e));
    return isDir ? st.isDirectory() : st.isFile();
  });
}

// --- inventory of real assets ---------------------------------------------
const agentNames = new Set(
  dirNames(path.join(CLAUDE, 'agents'), false)
    .filter((f) => f.endsWith('.md'))
    .map((f) => f.replace(/\.md$/, ''))
);
const skillNames = new Set(
  dirNames(path.join(CLAUDE, 'skills'), true).filter((d) =>
    fs.existsSync(path.join(CLAUDE, 'skills', d, 'SKILL.md'))
  )
);

if (agentNames.size === 0) {
  // Nothing to validate (not an ECC repo / partial checkout) — stay quiet.
  console.log('[validate-agent-model] no agents found — skipping');
  process.exit(0);
}

// --- 1 + 3: routing referential integrity + orphan detection ---------------
const routingText = readSafe(ROUTING);
const citedAgents = new Set();
const citedSkills = new Set();
if (!routingText) {
  err(`routing rule missing: ${path.relative(ROOT, ROUTING)}`);
} else {
  for (const m of routingText.matchAll(/`([a-z][a-z0-9-]{2,})`/g)) {
    const tok = m[1];
    if (agentNames.has(tok)) citedAgents.add(tok);
    else if (skillNames.has(tok)) citedSkills.add(tok);
    else if (/(reviewer|resolver|guard|auditor|checker|validator|architect|hunter|optimizer|orchestrator|analyzer|explorer|runner|cleaner|updater|lookup|guide)$/.test(tok)) {
      // Looks like an agent name but no such agent exists -> dead routing entry.
      err(`routing cites agent '${tok}' but .claude/agents/${tok}.md does not exist`);
    }
  }
  // Orphans: defined agents never cited in routing (discoverability warning).
  for (const a of agentNames) {
    if (!citedAgents.has(a)) warn(`agent '${a}' is not referenced in routing (orphan / not discoverable via routing)`);
  }
}

// --- 2: mandated layer coverage --------------------------------------------
// Minimal role each ZEVA-Link layer MUST route to (CLAUDE.md §5 + routing).
const COVERAGE = [
  { layer: 'L1/L2 (Edge/Gateway · Rust)', roles: ['rust-reviewer', 'rust-build-resolver'] },
  { layer: 'L3 (Platform/API · TS/Rust)', roles: ['typescript-reviewer', 'database-reviewer', 'security-reviewer'] },
  { layer: 'L4 (UI · Next.js)', roles: ['typescript-reviewer', 'a11y-architect'] },
  { layer: 'AI service (Python)', roles: ['python-reviewer'] },
  { layer: 'cross-cutting', roles: ['security-reviewer', 'data-sovereignty-guard', 'silent-failure-hunter'] },
];
for (const { layer, roles } of COVERAGE) {
  for (const role of roles) {
    if (!agentNames.has(role)) err(`layer ${layer}: mandated agent '${role}' does not exist`);
    else if (routingText && !citedAgents.has(role)) err(`layer ${layer}: mandated agent '${role}' exists but is not wired into routing`);
  }
}

// --- report ----------------------------------------------------------------
const summary = `agents=${agentNames.size} cited=${citedAgents.size} skills_cited=${citedSkills.size}`;
if (warnings.length) {
  console.log(`\n[validate-agent-model] ${warnings.length} warning(s):`);
  for (const w of warnings) console.log('  WARN  ' + w);
}
if (errors.length) {
  console.error(`\n[validate-agent-model] FAILED — ${errors.length} error(s) [${summary}]:`);
  for (const e of errors) console.error('  ERROR ' + e);
  process.exit(1);
}
console.log(`[validate-agent-model] OK — routing is executable & layers covered [${summary}]`);
process.exit(0);
