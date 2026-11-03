#!/usr/bin/env node
/**
 * PreToolUse Hook: Confidential-Data Scan
 *
 * Intercepts `git commit ...` invocations and scans the staged diff
 * (`git diff --cached --unified=0`) plus the commit message for content
 * matching CLAUDE.md §2 (Data sovereignty) bans:
 *   - Real plant codes, MAC addresses, internal IPs, serial/lot numbers
 *   - Credentials of any kind (PAT, AWS key, Bearer, PEM, generic assignments)
 *   - Local Windows / UNC paths
 *   - Raw data file extensions (.pcap critical; .csv/.parquet/.bin warning)
 *
 * Behavior:
 *   - A file that declares its example data synthetic (CLAUDE.md §6) has its
 *     plant-code / serial matches demoted to EXEMPT and listed for audit;
 *     credentials, IPs, MACs and local paths are never exempted.
 *   - Not a `git commit` command → pass through (exit 0).
 *   - `git commit` with critical findings → exit 2 with findings list.
 *   - `git commit` with only warnings → print warnings, exit 0.
 *   - Any internal error → fail-open with exit 0.
 *
 * Bypass:
 *   ECC_DISABLED_HOOKS=pre:bash:confidential-scan
 *
 * Cross-platform: spawns `git` via spawnSync; works on Windows / macOS / Linux.
 * Compatible with run-with-flags.js via module.exports.run().
 */

'use strict';

const { spawnSync } = require('child_process');
const { scanDiff, scanText, hasCritical } = require('../lib/confidential-patterns');

const MAX_STDIN = 1024 * 1024;
const MAX_DIFF = 4 * 1024 * 1024; // 4 MB cap on diff size
const MAX_BLOB = 2 * 1024 * 1024; // 2 MB cap when reading one staged file

// Match `git commit` at the start of a command position only, not inside
// quoted string arguments to echo / cat / printf etc. Acceptable positions:
//   - start of string                 → "git commit -m ..."
//   - after a shell separator         → "cd repo && git commit ..."
const GIT_COMMIT_CMD = /(?:^|[\n;&|]\s*)git\s+commit(?:\s|$)/;
const GIT_COMMIT_HELP = /(?:^|[\n;&|]\s*)git\s+commit\s+(?:--help|-h)\b/;

/**
 * Extract -m / --message values from a shell command string.
 * Best-effort; doesn't fully tokenize but handles the common forms:
 *   -m "msg"     -m 'msg'     --message=msg     --message "msg"
 */
function extractCommitMessages(command) {
  const messages = [];
  const re = /(?:-m|--message)(?:\s+|=)(?:"((?:[^"\\]|\\.)*)"|'((?:[^'\\]|\\.)*)'|(\S+))/g;
  let m;
  while ((m = re.exec(command)) !== null) {
    messages.push(m[1] || m[2] || m[3] || '');
  }
  return messages;
}

/**
 * Run `git diff --cached --unified=0` and return its stdout.
 * Returns empty string on any failure (fail-open).
 */
/**
 * Read one file's staged content (`git show :path`). Cached per path.
 * Returns null on any failure, so the scan stays strict when in doubt.
 */
function makeStagedFileReader() {
  const cache = new Map();
  return function readStagedFile(path) {
    if (typeof path !== 'string' || path.length === 0) return null;
    if (cache.has(path)) return cache.get(path);
    let text = null;
    try {
      const r = spawnSync('git', ['show', `:${path}`], {
        encoding: 'utf8', timeout: 10000, maxBuffer: MAX_BLOB, windowsHide: true,
      });
      if (!r.error && r.status === 0 && typeof r.stdout === 'string') text = r.stdout;
    } catch (_) {
      text = null;
    }
    cache.set(path, text);
    return text;
  };
}

function readStagedDiff() {
  const result = spawnSync(
    'git',
    ['diff', '--cached', '--unified=0', '--no-color'],
    { encoding: 'utf8', timeout: 10000, maxBuffer: MAX_DIFF, windowsHide: true },
  );
  if (result.error || result.status !== 0) return '';
  return typeof result.stdout === 'string' ? result.stdout : '';
}

function formatFindings(findings, command) {
  const critical = findings.filter(f => f.severity === 'critical');
  const warning = findings.filter(f => f.severity === 'warning');
  const exempt = findings.filter(f => f.exempt);

  const lines = [];
  const blocked = critical.length > 0 || warning.length > 0;
  lines.push(blocked
    ? '[confidential-scan] Staged content matched patterns banned by CLAUDE.md §2.'
    : '[confidential-scan] All matches are exempt — commit allowed. Listed for audit.');
  lines.push('');
  lines.push(`Command:  ${command}`);
  lines.push('');

  if (critical.length > 0) {
    lines.push(`CRITICAL — ${critical.length} match(es) — commit BLOCKED:`);
    for (const f of critical) {
      const loc = f.source || f.file || '(commit message)';
      const what = f.match ? `"${f.match}"` : '(filename match)';
      lines.push(`  • ${f.pattern} @ ${loc}: ${what}`);
      lines.push(`      → ${f.hint}`);
    }
    lines.push('');
  }

  if (warning.length > 0) {
    lines.push(`WARNING — ${warning.length} match(es) — review before commit:`);
    for (const f of warning) {
      const loc = f.source || f.file || '(commit message)';
      const what = f.match ? `"${f.match}"` : '(filename match)';
      lines.push(`  • ${f.pattern} @ ${loc}: ${what}`);
      lines.push(`      → ${f.hint}`);
    }
    lines.push('');
  }

  if (exempt.length > 0) {
    lines.push(`EXEMPT — ${exempt.length} match(es) — allowed, listed for audit:`);
    for (const f of exempt) {
      const loc = f.source || f.file || '(commit message)';
      const what = f.match ? `"${f.match}"` : '(filename match)';
      lines.push(`  • ${f.pattern} @ ${loc}: ${what}`);
      lines.push(`      → ${f.exempt}`);
    }
    lines.push('');
  }

  lines.push('Fix one of:');
  lines.push('  1. Remove the offending content / file from staging.');
  lines.push('     git restore --staged <path>');
  lines.push('  2. Replace real values with synthetic placeholders.');
  lines.push('  3. If a credential leaked: rotate it immediately, then purge from history.');
  lines.push('');
  lines.push('To disable temporarily:  ECC_DISABLED_HOOKS=pre:bash:confidential-scan');
  return lines.join('\n') + '\n';
}

/**
 * Pure evaluation: takes rawInput JSON, returns hook result.
 */
function evaluate(rawInput) {
  let input;
  try {
    input = JSON.parse(rawInput);
  } catch (_) {
    return { stdout: rawInput, exitCode: 0 };
  }

  const command = (input && input.tool_input && input.tool_input.command) || '';
  if (typeof command !== 'string' || command.length === 0) {
    return { stdout: rawInput, exitCode: 0 };
  }
  if (!GIT_COMMIT_CMD.test(command) || GIT_COMMIT_HELP.test(command)) {
    return { stdout: rawInput, exitCode: 0 };
  }

  let diff;
  try {
    diff = readStagedDiff();
  } catch (_) {
    return { stdout: rawInput, exitCode: 0 };
  }

  const findings = [];
  if (diff && diff.length < MAX_DIFF) {
    findings.push(...scanDiff(diff, { fileText: makeStagedFileReader() }));
  }

  // Also scan commit messages passed inline with -m.
  for (const msg of extractCommitMessages(command)) {
    findings.push(...scanText(msg, '(commit message)'));
  }

  const blocking = findings.filter(f => !f.exempt);
  if (blocking.length === 0) {
    // Exemptions are never silent: list them so the clearance is auditable.
    if (findings.length > 0) {
      return { stderr: formatFindings(findings, command), stdout: rawInput, exitCode: 0 };
    }
    return { stdout: rawInput, exitCode: 0 };
  }

  if (!hasCritical(findings)) {
    // Warnings only — print but allow commit.
    return {
      stderr: formatFindings(findings, command),
      stdout: rawInput,
      exitCode: 0,
    };
  }

  return {
    stderr: formatFindings(findings, command),
    exitCode: 2,
  };
}

/**
 * Public entry point — used by run-with-flags.js. Fail-open wrapper.
 */
function run(rawInput) {
  try {
    return evaluate(rawInput);
  } catch (err) {
    process.stderr.write(`[confidential-scan] internal error (fail-open): ${err.message}\n`);
    return { stdout: rawInput, exitCode: 0 };
  }
}

// ── stdin entry point (when invoked directly) ─────────────────────────────
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

module.exports = { run, evaluate, extractCommitMessages };
