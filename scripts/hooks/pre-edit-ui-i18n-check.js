#!/usr/bin/env node
/**
 * PreToolUse Hook: UI i18n Gate
 *
 * The first time a UI file (.tsx/.jsx/.vue/.svelte/.astro) is created or
 * edited in a session, this hook blocks once and reminds Claude to confirm
 * the internationalization requirement WITH THE USER before building UI.
 *
 * It fires at most once per session (a state file records that it fired), so
 * it is not noisy. A hook cannot ask the user a question — only Claude can
 * (AskUserQuestion). This hook guarantees the prompt is raised; Claude then
 * asks the user and follows the `ui-i18n-gate` skill.
 *
 * Fails OPEN: any parse error passes through. Disable with
 * ECC_DISABLED_HOOKS=pre:edit:ui-i18n-check.
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
const UI_EXT = /\.(tsx|jsx|vue|svelte|astro)$/i;

function stateFile() {
  const raw =
    process.env.CLAUDE_SESSION_ID ||
    crypto.createHash('sha1').update(process.cwd()).digest('hex').slice(0, 12);
  const id = raw.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 64);
  return path.join(os.tmpdir(), `ecc-ui-i18n-${id}.json`);
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
    '[UI i18n Gate] You are about to create or edit a UI file:',
    `  ${file}`,
    '',
    'Before building UI, confirm the internationalization requirement WITH THE USER',
    '(use the AskUserQuestion tool — do not assume):',
    '  1. Is multilingual (i18n) support required for this UI?',
    '  2. If yes, which of the supported languages apply — English / Japanese / Indonesian / Chinese?',
    '',
    'Then follow the `ui-i18n-gate` skill. If i18n is required, every user-facing string',
    'MUST go through an i18n key — no hardcoded strings. Once confirmed with the user,',
    'retry the edit (this gate fires only once per session).',
  ].join('\n');
}

function run(rawInput) {
  try {
    const input = typeof rawInput === 'string' ? JSON.parse(rawInput) : rawInput;
    const file = uiFilePath(input);
    if (!file) return rawInput; // not a UI file
    if (alreadyFired()) return rawInput; // already confirmed this session
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
