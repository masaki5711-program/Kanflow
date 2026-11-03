#!/usr/bin/env node
/**
 * PreToolUse Hook: UI Visual-Direction Gate
 *
 * The first time a UI file (.tsx/.jsx/.vue/.svelte/.astro/.css/.scss) is
 * created or edited in a session, this hook blocks once and reminds Claude to
 * settle the visual direction BEFORE building UI:
 *   - load `.claude/rules/web/design-quality.md` (anti-template policy)
 *   - follow the `frontend-design` skill and its `design-tokens.json`
 *   - confirm style direction / palette / typography with the user
 *
 * Mirrors pre-edit-ui-i18n-check.js: fires at most once per session (a state
 * file records that it fired), so it is not noisy. A hook cannot decide design
 * — only Claude can; this hook guarantees the decision point is raised.
 *
 * Fails OPEN: any parse error passes through. Disable with
 * ECC_DISABLED_HOOKS=pre:edit:design-direction-check.
 *
 * Compatible with run-with-flags.js via module.exports.run().
 * Cross-platform (Windows, macOS, Linux).
 */

'use strict';

const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');

const MAX_STDIN = 1024 * 1024;
const UI_EXT = /\.(tsx|jsx|vue|svelte|astro|css|scss)$/i;

function stateFile() {
  const raw =
    process.env.CLAUDE_SESSION_ID ||
    crypto.createHash('sha1').update(process.cwd()).digest('hex').slice(0, 12);
  const id = raw.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 64);
  return path.join(os.tmpdir(), `ecc-design-direction-${id}.json`);
}

function alreadyFired() {
  try {
    return JSON.parse(fs.readFileSync(stateFile(), 'utf8')).fired === true;
  } catch {
    return false;
  }
}

function markFired() {
  try {
    fs.writeFileSync(stateFile(), JSON.stringify({ fired: true, ts: Date.now() }), 'utf8');
  } catch {
    /* best-effort */
  }
}

/** Return the first UI file path in the tool input, or null. */
function uiFilePath(input) {
  const ti = input.tool_input || {};
  const paths = [];
  if (typeof ti.file_path === 'string') paths.push(ti.file_path);
  if (Array.isArray(ti.edits)) {
    for (const e of ti.edits) {
      if (e && typeof e.file_path === 'string') paths.push(e.file_path);
    }
  }
  return paths.find(p => UI_EXT.test(p)) || null;
}

function buildMessage(file) {
  return [
    '[UI Design Gate] You are about to create or edit a UI file:',
    `  ${file}`,
    '',
    'Before building UI, settle the visual direction (do not default to a generic template):',
    '  1. Load `.claude/rules/web/design-quality.md` — the anti-template policy and its',
    '     banned patterns / required qualities apply to every meaningful UI surface.',
    '  2. Follow the `frontend-design` skill. Its `design-tokens.json` is the default',
    '     token set (palette, type scale, 8pt spacing, dark mode, chart colors) —',
    '     consume tokens instead of ad-hoc values. Recipes live in `recipes.md`.',
    '  3. If the visual direction (style direction / palette / typography) is not already',
    '     decided in this conversation or the project, confirm it WITH THE USER',
    '     (AskUserQuestion) before writing significant UI code.',
    '  4. For charts, use the `dataviz` skill if available; otherwise the `charts`',
    '     section of design-tokens.json.',
    '',
    'Once the direction is settled, retry the edit (this gate fires only once per session).',
  ].join('\n');
}

function run(rawInput) {
  try {
    const input = typeof rawInput === 'string' ? JSON.parse(rawInput) : rawInput;
    const file = uiFilePath(input);
    if (!file) return rawInput; // not a UI file
    if (alreadyFired()) return rawInput; // already settled this session
    markFired();
    return { exitCode: 2, stderr: buildMessage(file) };
  } catch {
    // fail open — never block because of a hook error
  }
  return rawInput;
}

module.exports = { run };

// stdin entry point for direct / spawned execution
if (require.main === module) {
  let raw = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', chunk => {
    if (raw.length < MAX_STDIN) raw += chunk.substring(0, MAX_STDIN - raw.length);
  });
  process.stdin.on('end', () => {
    const result = run(raw);
    if (result && typeof result === 'object') {
      if (result.stderr) process.stderr.write(`${result.stderr}\n`);
      process.stdout.write(String(result.stdout || ''));
      process.exit(Number.isInteger(result.exitCode) ? result.exitCode : 0);
    } else {
      process.stdout.write(String(result));
      process.exit(0);
    }
  });
}
