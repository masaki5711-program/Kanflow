#!/usr/bin/env node
/**
 * PreToolUse Hook: GitLab MR Conventional-Commit Guard
 *
 * Intercepts `glab mr create|new|update` BEFORE it runs and blocks when the
 * MR title or description would violate this project's Conventional Commits
 * rule or carry GitLab/git default merge text ("Merge branch 'x' into 'y'").
 *
 * Why a PreToolUse Bash hook (not a pre-push git hook or an opt-in wrapper):
 *   - MR title/description are NOT part of the `git push` payload, so a
 *     pre-push hook cannot see them — wrong layer.
 *   - A standalone create-mr.js wrapper is opt-in; calling `glab mr create`
 *     directly bypasses it. This hook captures the command unconditionally.
 *
 * Behavior (CLAUDE.md §7):
 *   - Not a glab MR command           → pass through (exit 0).
 *   - MR command, only warnings       → print warnings, allow (exit 0).
 *   - MR command, hard violations     → exit 2 with cause + exact fix command.
 *   - Any parse/internal error        → fail open (exit 0).
 *
 * Exit codes: 0 allow · 2 block.
 * Compatible with run-with-flags.js and bash-hook-dispatcher via module.exports.run().
 */

'use strict';

const { validateMrCommand } = require('../lib/mr-conventional');

const MAX_STDIN = 1024 * 1024; // 1 MB safety cap

const FIX_EXAMPLE = [
  '  glab mr create \\',
  '    --title "feat(scope): short imperative summary in lowercase" \\',
  '    --description "What changed and why. Fill the required sections of',
  '  .gitlab/merge_request_templates/default.md (layer impact, test plan,',
  '  data-migration + confidential-data declarations)." \\',
  '    --target-branch main --yes',
].join('\n');

function formatBlockMessage(result, command) {
  const lines = [
    '[mr-validate] BLOCKED — `glab mr ' + result.action + '` would create a non-conformant MR.',
    '',
    'Command:  ' + command,
    '',
    'Error cause(s):',
  ];
  for (const e of result.errors) lines.push('  • [' + e.code + '] ' + e.message);
  for (const w of result.warnings) lines.push('  • [' + w.code + '] (warning) ' + w.message);
  lines.push('');
  lines.push('Conventional Commits title:  type(scope)?: <subject>');
  lines.push('  - type ∈ feat|fix|docs|style|refactor|test|chore|perf|ci|build|revert');
  lines.push('  - subject: start with a lowercase verb; must NOT end with ".".');
  lines.push('    (ALL-CAPS acronyms like README/API and product nouns like Rust are fine.)');
  lines.push('  - never leave GitLab default "Merge branch \'…\' into \'…\'" text in title/body.');
  lines.push('  - --target-branch must be main or release/* (never a sibling branch).');
  lines.push('');
  lines.push('Next, re-issue with explicit, valid fields (do NOT rely on --fill):');
  lines.push(FIX_EXAMPLE);
  lines.push('');
  lines.push('To disable temporarily:  ECC_DISABLED_HOOKS=pre:bash:mr-validate');
  return lines.join('\n') + '\n';
}

function evaluate(rawInput) {
  let input;
  try {
    input = JSON.parse(rawInput);
  } catch (_) {
    return { stdout: rawInput, exitCode: 0 };
  }

  const command = (input && input.tool_input && input.tool_input.command) || '';
  const result = validateMrCommand(command);

  if (!result.triggered) return { stdout: rawInput, exitCode: 0 };

  if (result.errors.length > 0) {
    return { stderr: formatBlockMessage(result, command), exitCode: 2 };
  }
  if (result.warnings.length > 0) {
    const warn = result.warnings.map(w => '[mr-validate] WARNING [' + w.code + '] ' + w.message).join('\n');
    return { stdout: rawInput, stderr: warn + '\n', exitCode: 0 };
  }
  return { stdout: rawInput, exitCode: 0 };
}

function run(rawInput) {
  try {
    return evaluate(rawInput);
  } catch (err) {
    process.stderr.write('[mr-validate] internal error (fail-open): ' + err.message + '\n');
    return { stdout: rawInput, exitCode: 0 };
  }
}

// ── stdin entry point (when invoked directly, not via run-with-flags) ─────
if (require.main === module) {
  let data = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', chunk => {
    if (data.length < MAX_STDIN) {
      data += chunk.substring(0, MAX_STDIN - data.length);
    }
  });
  process.stdin.on('end', () => {
    const r = run(data);
    if (r.stderr) process.stderr.write(r.stderr);
    if (r.stdout) process.stdout.write(r.stdout);
    process.exit(r.exitCode || 0);
  });
  process.stdin.on('error', () => process.exit(0)); // fail-open
}

module.exports = { run, evaluate, formatBlockMessage };
