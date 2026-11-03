#!/usr/bin/env node
'use strict';

/*
 * validate-harness-wiring.js — harness self-extension gate.
 *
 * The 2026-07-13 domain-fit audit found that nothing mechanically forces a
 * NEW hook or IoTPF skill to be wired, tested, and discoverable — orphaned
 * assets (dev-server-block hook, iot-edge-resilience-validator skill) were
 * only caught by later human audits. This gate closes that class:
 *
 *   Hooks (scripts/hooks/*.js, excluding __tests__):
 *   1. ERROR — hook is not wired: not referenced by filename in
 *      .claude/settings.json, not require()d by another hook (in-process
 *      chain), and not carrying an explicit "@ecc-wiring: standalone" marker
 *      with its rationale in the file header.
 *   2. ERROR — hook basename appears in no test file under
 *      scripts/hooks/__tests__/ (untested hook).
 *
 *   Skills:
 *   3. ERROR — a .claude/skills/<name>/SKILL.md whose frontmatter declares
 *      "origin: IoTPF" is not referenced in the routing table
 *      .claude/rules/iotpf-agents-skills.md (undiscoverable domain skill —
 *      generic skills without that origin stay name-triggered by design).
 *
 * Node built-ins only. CI gate, not a Claude Code hook: does NOT fail open —
 * an unwired/untested extension is exactly what it must block.
 *
 * Run: node scripts/validate-harness-wiring.js
 */

const fs = require('fs');
const path = require('path');

const ROOT = process.env.CLAUDE_PROJECT_DIR || process.cwd();
const HOOKS_DIR = path.join(ROOT, 'scripts', 'hooks');
const HOOK_TESTS_DIR = path.join(HOOKS_DIR, '__tests__');
const SETTINGS_PATH = path.join(ROOT, '.claude', 'settings.json');
const SKILLS_DIR = path.join(ROOT, '.claude', 'skills');
const ROUTING_PATH = path.join(ROOT, '.claude', 'rules', 'iotpf-agents-skills.md');

const STANDALONE_MARKER = /@ecc-wiring:\s*standalone/;

function readOr(fallback, p) {
  try {
    return fs.readFileSync(p, 'utf8');
  } catch {
    return fallback;
  }
}

function listHookFiles() {
  if (!fs.existsSync(HOOKS_DIR)) return [];
  return fs.readdirSync(HOOKS_DIR).filter(f => f.endsWith('.js'));
}

function concatenatedTests() {
  if (!fs.existsSync(HOOK_TESTS_DIR)) return '';
  return fs.readdirSync(HOOK_TESTS_DIR)
    .filter(f => f.endsWith('.js'))
    .map(f => readOr('', path.join(HOOK_TESTS_DIR, f)))
    .join('\n');
}

function validateHooks() {
  const errors = [];
  const hookFiles = listHookFiles();
  const settingsText = readOr('', SETTINGS_PATH);
  const testsText = concatenatedTests();
  const sources = new Map(
    hookFiles.map(f => [f, readOr('', path.join(HOOKS_DIR, f))]),
  );

  for (const file of hookFiles) {
    const base = file.replace(/\.js$/, '');
    const source = sources.get(file);

    const inSettings = settingsText.includes(file);
    const requiredInProcess = hookFiles.some(
      other => other !== file && new RegExp(`require\\((?:[^)]*)['"]\\./${base}['"]\\)`).test(sources.get(other)),
    );
    const markedStandalone = STANDALONE_MARKER.test(source.slice(0, 2000));

    if (!inSettings && !requiredInProcess && !markedStandalone) {
      errors.push(
        `scripts/hooks/${file}: orphan hook — not in .claude/settings.json, not require()d by another hook, ` +
        `and no "@ecc-wiring: standalone" marker with rationale (wire it or mark it deliberate)`,
      );
    }

    if (!testsText.includes(base)) {
      errors.push(
        `scripts/hooks/${file}: no test under scripts/hooks/__tests__/ names '${base}' — every hook ships with a test (CLAUDE.md §7 fail-open at minimum)`,
      );
    }
  }
  return errors;
}

function validateIotpfSkills() {
  const errors = [];
  if (!fs.existsSync(SKILLS_DIR)) return errors;
  const routingText = readOr('', ROUTING_PATH);

  for (const entry of fs.readdirSync(SKILLS_DIR, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const skillMd = readOr('', path.join(SKILLS_DIR, entry.name, 'SKILL.md'));
    if (!skillMd.startsWith('---')) continue;
    const fmEnd = skillMd.indexOf('\n---', 3);
    const frontmatter = fmEnd > 0 ? skillMd.slice(0, fmEnd) : '';
    // Domain skills (origin: IoTPF or origin: project) must be discoverable via
    // the routing table; generic community/ECC skills stay name-triggered.
    if (!/^origin:\s*(IoTPF|project)\s*$/m.test(frontmatter)) continue;

    if (!routingText.includes(`\`${entry.name}\``)) {
      errors.push(
        `.claude/skills/${entry.name}: origin: IoTPF|project skill is not routed in .claude/rules/iotpf-agents-skills.md — domain skills must be discoverable, not name-trigger-only`,
      );
    }
  }
  return errors;
}

function main() {
  const errors = [...validateHooks(), ...validateIotpfSkills()];
  if (errors.length > 0) {
    console.error(`[validate-harness-wiring] FAILED — ${errors.length} violation(s):`);
    for (const e of errors) console.error(`  ERROR ${e}`);
    process.exit(1);
  }
  const hookCount = listHookFiles().length;
  console.log(`[validate-harness-wiring] OK — ${hookCount} hooks wired+tested (or marked standalone); IoTPF skills routed`);
  process.exit(0);
}

if (require.main === module) main();
module.exports = { validateHooks, validateIotpfSkills, STANDALONE_MARKER };
