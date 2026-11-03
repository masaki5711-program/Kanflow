#!/usr/bin/env node
'use strict';

/**
 * PostToolUse Hook (matcher: Skill) — record every Skill invocation to
 * ~/.claude/state/skill-runs.jsonl via the skill-evolution tracker.
 *
 * This is the OBSERVE wiring that /skill-health and /evolve consume
 * (.claude/rules/iotpf-self-improvement.md). Before this hook existed the
 * tracker lib was write-side dead code: skills-health.js read a file nothing
 * produced. Now each Skill tool completion appends one execution record.
 *
 * Outcome heuristic: a tool_response that is an error (is_error / success:false
 * / a string starting with "Error") records `failure`; everything else records
 * `success`. `partial` is reserved for explicit callers of the tracker lib.
 *
 * Fails open (CLAUDE.md §7): any parse or tracker error passes the payload
 * through untouched.
 *
 * Hook ID : post:skill-run-tracker
 * Profiles: standard, strict
 */

const fs = require('fs');
const path = require('path');
const { recordSkillExecution } = require('../lib/skill-evolution/tracker');

const MAX_TASK_DESCRIPTION = 200;

function log(message) {
  process.stderr.write(`[SkillRunTracker] ${message}\n`);
}

/**
 * Resolve the skill's version from its SKILL.md frontmatter, if present.
 * Plugin-namespaced names ("plugin:skill") resolve by their last segment.
 */
function resolveSkillVersion(skillName, projectDir) {
  try {
    const dirName = String(skillName).split(':').pop();
    const skillMd = path.join(projectDir, '.claude', 'skills', dirName, 'SKILL.md');
    if (!fs.existsSync(skillMd)) return 'unversioned';
    const head = fs.readFileSync(skillMd, 'utf8').slice(0, 2000);
    const match = head.match(/^version:\s*["']?([^"'\r\n]+)["']?\s*$/m);
    return match ? match[1].trim() : 'unversioned';
  } catch {
    return 'unversioned';
  }
}

function detectOutcome(toolResponse) {
  if (toolResponse == null) return 'success';
  if (typeof toolResponse === 'string') {
    return /^\s*error\b/i.test(toolResponse) ? 'failure' : 'success';
  }
  if (typeof toolResponse === 'object') {
    if (toolResponse.is_error === true || toolResponse.isError === true) return 'failure';
    if (toolResponse.success === false) return 'failure';
  }
  return 'success';
}

function run(rawInput) {
  const raw = typeof rawInput === 'string' ? rawInput : '';
  try {
    const input = raw.trim() ? JSON.parse(raw) : {};
    const toolName = String(input.tool_name || input.name || '');
    if (toolName !== 'Skill') return raw;

    const skillName = input.tool_input && input.tool_input.skill;
    if (typeof skillName !== 'string' || !skillName.trim()) return raw;

    const projectDir = process.env.CLAUDE_PROJECT_DIR || process.cwd();
    const args = input.tool_input && typeof input.tool_input.args === 'string'
      ? ` ${input.tool_input.args}`
      : '';

    const result = recordSkillExecution(
      {
        skill_id: skillName.trim(),
        skill_version: resolveSkillVersion(skillName, projectDir),
        task_description: `/${skillName}${args}`.slice(0, MAX_TASK_DESCRIPTION),
        outcome: detectOutcome(input.tool_response),
      },
      process.env.ECC_SKILL_RUNS_PATH
        ? { runsFilePath: process.env.ECC_SKILL_RUNS_PATH }
        : {},
    );
    log(`recorded ${skillName.trim()} -> ${result.storage}`);
  } catch (err) {
    // Fail open: observation must never block or corrupt the tool result.
    log(`skipped: ${err.message}`);
  }
  return raw;
}

module.exports = { run };

// Legacy stdin path (when invoked directly rather than via run-with-flags)
if (require.main === module) {
  const MAX_STDIN = 1024 * 1024;
  let data = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', chunk => {
    if (data.length < MAX_STDIN) {
      data += chunk.substring(0, MAX_STDIN - data.length);
    }
  });
  process.stdin.on('end', () => {
    process.stdout.write(run(data));
    process.exit(0);
  });
  process.stdin.on('error', () => process.exit(0));
}
