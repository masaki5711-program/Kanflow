#!/usr/bin/env node
'use strict';

/*
 * validate-ecc-config.js — config-integrity gate for this ECC repo.
 *
 * Verifies that the Claude Code configuration conforms to the official
 * placement/syntax and that nothing references a deleted component, so that
 * "git clone -> open -> it just works" holds for everyone on the team.
 *
 * Node built-ins only (no deps), per CLAUDE.md. Exit 0 = clean, 1 = errors.
 * Run: node scripts/validate-ecc-config.js
 */

const fs = require('fs');
const path = require('path');

const ROOT = process.env.CLAUDE_PROJECT_DIR || process.cwd();
const CLAUDE = path.join(ROOT, '.claude');

const errors = [];
const warnings = [];
const err = (m) => errors.push(m);
const warn = (m) => warnings.push(m);

function read(p) {
  return fs.readFileSync(p, 'utf8');
}
function listFiles(dir, predicate) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter(predicate).map((f) => path.join(dir, f));
}
function frontmatter(text) {
  if (!text.startsWith('---')) return null;
  const end = text.indexOf('\n---', 3);
  if (end < 0) return null;
  return text.slice(3, end).replace(/^\n/, '');
}
function fmValue(fm, key) {
  const m = fm.match(new RegExp('^' + key + ':\\s*(.*)$', 'm'));
  return m ? m[1].trim() : null;
}
function fmKeys(fm) {
  return fm
    .split('\n')
    .map((l) => l.match(/^([A-Za-z0-9_-]+):/))
    .filter(Boolean)
    .map((m) => m[1]);
}

const VALID_MODELS = ['sonnet', 'opus', 'haiku', 'inherit'];

// ---------------------------------------------------------------------------
// 1. Agents — official subagent format
// ---------------------------------------------------------------------------
const agentFiles = listFiles(path.join(CLAUDE, 'agents'), (f) => f.endsWith('.md'));
const agentNames = new Set();
for (const p of agentFiles) {
  const base = path.basename(p, '.md');
  const fm = frontmatter(read(p));
  if (!fm) {
    err(`agent ${base}: missing or malformed frontmatter`);
    continue;
  }
  const name = fmValue(fm, 'name');
  if (!name) err(`agent ${base}: missing 'name'`);
  else {
    agentNames.add(name);
    if (name !== base) err(`agent ${base}: name '${name}' != filename`);
  }
  if (!fmValue(fm, 'description')) err(`agent ${base}: missing 'description'`);
  const tools = fmValue(fm, 'tools');
  if (tools && tools.startsWith('[')) err(`agent ${base}: 'tools' must be a comma-separated string, not a YAML array`);
  const model = fmValue(fm, 'model');
  if (model && !VALID_MODELS.includes(model)) err(`agent ${base}: invalid model '${model}' (use ${VALID_MODELS.join('/')})`);
  for (const k of fmKeys(fm)) {
    if (!['name', 'description', 'tools', 'model'].includes(k)) warn(`agent ${base}: non-standard frontmatter key '${k}'`);
  }
}

// ---------------------------------------------------------------------------
// 2. Commands — official slash-command format
// ---------------------------------------------------------------------------
const ALLOWED_CMD_KEYS = ['description', 'argument-hint', 'allowed-tools', 'model', 'disable-model-invocation'];
for (const p of listFiles(path.join(CLAUDE, 'commands'), (f) => f.endsWith('.md'))) {
  const base = path.basename(p, '.md');
  const fm = frontmatter(read(p));
  if (!fm) continue; // frontmatter is optional for commands
  for (const k of fmKeys(fm)) {
    if (!ALLOWED_CMD_KEYS.includes(k)) err(`command ${base}: unknown frontmatter key '${k}' (allowed: ${ALLOWED_CMD_KEYS.join(', ')})`);
  }
  const model = fmValue(fm, 'model');
  if (model && !VALID_MODELS.includes(model)) err(`command ${base}: invalid model '${model}'`);
}

// ---------------------------------------------------------------------------
// 3. Skills — name==dir, description present, no self-nested duplicates
// ---------------------------------------------------------------------------
const skillsDir = path.join(CLAUDE, 'skills');
const skillNames = new Set();
if (fs.existsSync(skillsDir)) {
  for (const name of fs.readdirSync(skillsDir)) {
    const dir = path.join(skillsDir, name);
    if (!fs.statSync(dir).isDirectory()) continue;
    const skillMd = path.join(dir, 'SKILL.md');
    if (!fs.existsSync(skillMd)) {
      err(`skill ${name}: missing SKILL.md`);
      continue;
    }
    skillNames.add(name);
    const fm = frontmatter(read(skillMd));
    if (!fm) {
      err(`skill ${name}: missing/malformed frontmatter`);
    } else {
      const n = fmValue(fm, 'name');
      if (n && n !== name) err(`skill ${name}: name '${n}' != directory`);
      if (!n) err(`skill ${name}: missing 'name'`);
      if (!fmValue(fm, 'description')) err(`skill ${name}: missing 'description'`);
    }
    // self-nested duplicate (e.g. skills/foo/foo/SKILL.md)
    if (fs.existsSync(path.join(dir, name, 'SKILL.md'))) err(`skill ${name}: self-nested duplicate dir '${name}/${name}/' — remove it`);
  }
}

// ---------------------------------------------------------------------------
// 4. CLAUDE.md @-import targets must exist
// ---------------------------------------------------------------------------
const claudeMd = path.join(ROOT, 'CLAUDE.md');
if (fs.existsSync(claudeMd)) {
  for (const line of read(claudeMd).split('\n')) {
    const m = line.match(/^@(\S+)/);
    if (m && !fs.existsSync(path.join(ROOT, m[1]))) err(`CLAUDE.md: @import target missing: ${m[1]}`);
  }
}

// ---------------------------------------------------------------------------
// 5. settings.json — referenced hook scripts must exist
// ---------------------------------------------------------------------------
const settingsPath = path.join(CLAUDE, 'settings.json');
if (fs.existsSync(settingsPath)) {
  let raw;
  try {
    raw = read(settingsPath);
    JSON.parse(raw);
  } catch (e) {
    err(`settings.json: invalid JSON (${e.message})`);
  }
  if (raw) {
    const re = /scripts\/hooks\/[A-Za-z0-9._-]+\.js/g;
    let mm;
    const seen = new Set();
    while ((mm = re.exec(raw))) {
      if (seen.has(mm[0])) continue;
      seen.add(mm[0]);
      if (!fs.existsSync(path.join(ROOT, mm[0]))) err(`settings.json: hook script missing: ${mm[0]}`);
    }
  }
}

// ---------------------------------------------------------------------------
// 6. Referential integrity — agent names cited in rules must exist
//    (conservative: only tokens that clearly name an agent)
// ---------------------------------------------------------------------------
const AGENT_SUFFIX = /(reviewer|resolver|guard|auditor|checker|validator|architect|hunter|optimizer|orchestrator|analyzer|explorer|runner|cleaner|updater|lookup)$/;
const KNOWN_AGENTS_NO_SUFFIX = new Set(['planner', 'tdd-guide']);
const ruleDirs = [path.join(CLAUDE, 'rules')];
function walk(dir, out) {
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir)) {
    const p = path.join(dir, e);
    const st = fs.statSync(p);
    if (st.isDirectory()) walk(p, out);
    else if (e.endsWith('.md')) out.push(p);
  }
  return out;
}
const ruleMdFiles = ruleDirs.flatMap((d) => walk(d, []));
for (const p of ruleMdFiles) {
  const rel = path.relative(ROOT, p);
  for (const m of read(p).matchAll(/`([a-z][a-z0-9-]{2,})`/g)) {
    const tok = m[1];
    if (skillNames.has(tok) || agentNames.has(tok)) continue;
    if (AGENT_SUFFIX.test(tok) || KNOWN_AGENTS_NO_SUFFIX.has(tok)) {
      // Looks like an agent name but no such agent file exists.
      err(`${rel}: references agent '${tok}' which has no .claude/agents/${tok}.md`);
    }
  }
}

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------
const counts = `agents=${agentNames.size} commands=${listFiles(path.join(CLAUDE, 'commands'), (f) => f.endsWith('.md')).length} skills=${skillNames.size}`;
if (warnings.length) {
  console.log(`\n[validate-ecc-config] ${warnings.length} warning(s):`);
  for (const w of warnings) console.log('  WARN  ' + w);
}
if (errors.length) {
  console.error(`\n[validate-ecc-config] FAILED — ${errors.length} error(s) [${counts}]:`);
  for (const e of errors) console.error('  ERROR ' + e);
  process.exit(1);
}
console.log(`[validate-ecc-config] OK — config is conformant [${counts}]`);
process.exit(0);
