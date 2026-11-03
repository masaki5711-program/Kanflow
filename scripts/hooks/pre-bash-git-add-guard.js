#!/usr/bin/env node
/**
 * PreToolUse Hook: Bulk `git add` Guard
 *
 * Blocks `git add -A|.|--all` when it would sweep in dangerous paths
 * (node_modules, dist/build, .env files, virtualenvs, *.pyc, coverage, …)
 * — i.e. things that .gitignore should be catching but isn't.
 *
 * Why this exists: an over-broad bulk add already shipped 335 files of
 * apps/tetris/node_modules to origin/main in commit d2b045c. The right
 * fix is an incomplete-.gitignore-aware physical block.
 *
 * Behavior:
 *   - Not a bulk add  → pass through.
 *   - Bulk add, no dangerous match in untracked/modified set → pass through.
 *   - Bulk add, dangerous match found → exit 2, list the matches, suggest
 *     explicit paths or .gitignore fix.
 *
 * Fail-open: any parse error, git failure, or unexpected exception passes
 * through with exit 0. The only intentional block is a dangerous match.
 *
 * Exit codes:
 *   0 — allow
 *   2 — block (dangerous paths would be staged)
 *
 * Compatible with run-with-flags.js via module.exports.run().
 * Cross-platform (Windows, macOS, Linux).
 */

'use strict';

const { spawnSync } = require('child_process');

const MAX_STDIN = 1024 * 1024; // 1 MB safety cap

const BULK_GIT_ADD = /\bgit\s+add\s+(-A|--all|\.)(?:\s|$)/i;

// Paths matching any of these patterns should NEVER be auto-swept into git.
const DANGEROUS = [
  { pattern: /(^|\/)node_modules(\/|$)/,   label: 'node_modules/' },
  { pattern: /(^|\/)\.venv(\/|$)/,         label: '.venv/' },
  { pattern: /(^|\/)venv(\/|$)/,           label: 'venv/' },
  { pattern: /(^|\/)__pycache__(\/|$)/,    label: '__pycache__/' },
  { pattern: /(^|\/)dist(\/|$)/,           label: 'dist/' },
  { pattern: /(^|\/)build(\/|$)/,          label: 'build/' },
  { pattern: /(^|\/)\.next(\/|$)/,         label: '.next/' },
  { pattern: /(^|\/)\.turbo(\/|$)/,        label: '.turbo/' },
  { pattern: /(^|\/)coverage(\/|$)/,       label: 'coverage/' },
  { pattern: /(^|\/)\.env(\.|$)/,          label: '.env files' },
  { pattern: /\.pyc$/,                     label: '*.pyc' },
];

function detectBulkAdd(command) {
  return BULK_GIT_ADD.test(command);
}

/**
 * Return paths that bulk `git add` would touch — untracked + modified + deleted.
 * Uses `git status --porcelain=v1 -z -uall`. Returns [] on any git failure.
 */
function listAffectedPaths() {
  const result = spawnSync(
    'git',
    ['status', '--porcelain=v1', '-z', '-uall'],
    { encoding: 'utf8', timeout: 5000, windowsHide: true },
  );
  if (result.error || result.status !== 0 || typeof result.stdout !== 'string') {
    return [];
  }
  // Each entry: "XY path\0" — for R/C also a second NUL-delimited "from" path.
  const entries = result.stdout.split('\0').filter(s => s.length > 0);
  const paths = [];
  for (let i = 0; i < entries.length; i += 1) {
    const e = entries[i];
    const status = e.substring(0, 2);
    const p = e.substring(3);
    paths.push(p);
    if (status[0] === 'R' || status[0] === 'C') {
      // Skip the paired "from" path that follows.
      i += 1;
    }
  }
  return paths;
}

function findDangerous(paths) {
  const hits = {};
  for (const p of paths) {
    for (const { pattern, label } of DANGEROUS) {
      if (pattern.test(p)) {
        if (!hits[label]) hits[label] = [];
        hits[label].push(p);
      }
    }
  }
  return hits;
}

function formatBlockMessage(hits, command) {
  const lines = [
    '[git-add-guard] BLOCKED — bulk `git add` would stage dangerous paths.',
    '',
    `Command:  ${command}`,
    '',
    'Dangerous matches:',
  ];
  for (const label of Object.keys(hits)) {
    const ps = hits[label];
    const shown = ps.slice(0, 5).join(', ');
    const more = ps.length > 5 ? ` (and ${ps.length - 5} more)` : '';
    lines.push(`  • ${label}: ${shown}${more}`);
  }
  lines.push('');
  lines.push('Fix one of:');
  lines.push('  1. Use explicit paths:   git add <path1> <path2> ...');
  lines.push('  2. Add patterns to .gitignore, then re-run.');
  lines.push('');
  lines.push('To disable temporarily:  ECC_DISABLED_HOOKS=pre:bash:git-add-guard');
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
  if (!detectBulkAdd(command)) {
    return { stdout: rawInput, exitCode: 0 };
  }

  let paths;
  try {
    paths = listAffectedPaths();
  } catch (_) {
    return { stdout: rawInput, exitCode: 0 };
  }

  const hits = findDangerous(paths);
  if (Object.keys(hits).length === 0) {
    return { stdout: rawInput, exitCode: 0 };
  }

  return {
    stderr: formatBlockMessage(hits, command),
    exitCode: 2,
  };
}

function run(rawInput) {
  try {
    return evaluate(rawInput);
  } catch (err) {
    process.stderr.write(`[git-add-guard] internal error (fail-open): ${err.message}\n`);
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
  process.stdin.on('error', () => {
    process.exit(0); // fail-open
  });
}

module.exports = { run, evaluate, detectBulkAdd, findDangerous };
