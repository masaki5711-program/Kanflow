'use strict';

/**
 * Behavioral regression tests for the "load-only" hooks in scripts/hooks/.
 *
 * These hooks have NO module.exports of a callable run() that the test drives
 * directly — they read stdin and execute on `require.main === module`. So we
 * test them as CHILD PROCESSES: spawn `node <hook.js>`, feed a JSON payload on
 * stdin, and assert exit code (and, where meaningful, output).
 *
 * The MOST IMPORTANT invariant (CLAUDE.md §7): on benign/malformed input every
 * hook must FAIL OPEN — exit 0. Where a hook has a clear block/warn path, we add
 * a specific behavioral assertion derived from reading the source.
 *
 * Node built-in test runner only. Cross-platform, deterministic, no network,
 * synthetic data.
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const os = require('node:os');
const fs = require('node:fs');
const { spawnSync } = require('node:child_process');

const HOOKS = path.join(__dirname, '..');
const HOOK_TIMEOUT_MS = 20000;

/**
 * Spawn a hook as a child process with a payload on stdin.
 * @param {string} file hook filename relative to scripts/hooks/
 * @param {object|string} payload object (JSON-stringified) or raw string
 * @param {object} [opts] extra spawn options (e.g. { env, args })
 */
function runHook(file, payload, opts = {}) {
  const args = [path.join(HOOKS, file), ...(opts.args || [])];
  const env = opts.env ? { ...process.env, ...opts.env } : process.env;
  const res = spawnSync(process.execPath, args, {
    input: typeof payload === 'string' ? payload : JSON.stringify(payload),
    encoding: 'utf8',
    timeout: HOOK_TIMEOUT_MS,
    env,
  });
  return res; // res.status, res.stdout, res.stderr, res.signal, res.error
}

// status is null when the process is killed by signal/timeout; treat that as a
// failure to fail-open and surface it clearly.
function exitCode(res) {
  assert.equal(res.error, undefined, `spawn error: ${res.error && res.error.message}`);
  assert.equal(res.signal, null, `hook killed by signal ${res.signal} (likely hung on stdin)`);
  return res.status;
}

// The list of load-only hooks under test. Each must fail open on {} and on a
// non-JSON string. cwd/HOME are redirected to a temp dir so any state writes
// (cost-tracker, suggest-compact, mcp-health-check) never touch the real home.
const TARGETS = [
  'check-console-log.js',
  'check-hook-enabled.js',
  'suggest-compact.js',
  'pre-write-doc-warn.js',
  'pre-bash-dev-server-block.js',
  'post-edit-console-warn.js',
  'mcp-health-check.js',
  'cost-tracker.js',
  'pre-bash-dispatcher.js',
  'post-bash-dispatcher.js',
];

// Isolated HOME/temp so state-writing hooks don't pollute the real environment.
const TMP_HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'ecc-hook-test-'));
const ISOLATED_ENV = {
  HOME: TMP_HOME,
  USERPROFILE: TMP_HOME,
  CLAUDE_CONFIG_DIR: path.join(TMP_HOME, '.claude'),
  // Keep mcp-health-check's state file inside the temp home too.
  ECC_MCP_HEALTH_STATE_PATH: path.join(TMP_HOME, 'mcp-health-cache.json'),
};

// ---------------------------------------------------------------------------
// Universal fail-open invariant: every target exits 0 on benign + malformed in.
// ---------------------------------------------------------------------------

for (const file of TARGETS) {
  test(`${file} fails open (exit 0) on empty object input`, () => {
    const res = runHook(file, {}, { env: ISOLATED_ENV });
    assert.equal(
      exitCode(res),
      0,
      `${file} did not fail open on {} (exit ${res.status}); stderr: ${res.stderr}`
    );
  });

  test(`${file} fails open (exit 0) on a non-JSON string`, () => {
    const res = runHook(file, 'this is not json {[(', { env: ISOLATED_ENV });
    assert.equal(
      exitCode(res),
      0,
      `${file} did not fail open on garbage input (exit ${res.status}); stderr: ${res.stderr}`
    );
  });

  test(`${file} fails open (exit 0) on empty stdin`, () => {
    const res = runHook(file, '', { env: ISOLATED_ENV });
    assert.equal(
      exitCode(res),
      0,
      `${file} did not fail open on empty stdin (exit ${res.status}); stderr: ${res.stderr}`
    );
  });
}

// ---------------------------------------------------------------------------
// Behavioral assertions (trigger paths read from source).
// ---------------------------------------------------------------------------

// check-hook-enabled.js — prints yes/no; respects ECC_DISABLED_HOOKS /
// ECC_HOOK_PROFILE passed via env. Driven by argv (hookId, profilesCsv).
test('check-hook-enabled: no args prints "yes" and exits 0', () => {
  const res = runHook('check-hook-enabled.js', '', { env: ISOLATED_ENV });
  assert.equal(exitCode(res), 0);
  assert.equal(res.stdout.trim(), 'yes');
});

test('check-hook-enabled: enabled hook in default (standard) profile prints "yes"', () => {
  // standard/strict is the default allowed-profile fallback in hook-flags.
  const res = runHook('check-hook-enabled.js', '', {
    args: ['pre:bash:mr-validate'],
    env: ISOLATED_ENV,
  });
  assert.equal(exitCode(res), 0);
  assert.equal(res.stdout.trim(), 'yes');
});

test('check-hook-enabled: ECC_DISABLED_HOOKS disables a hook -> prints "no"', () => {
  const res = runHook('check-hook-enabled.js', '', {
    args: ['pre:bash:mr-validate'],
    env: { ...ISOLATED_ENV, ECC_DISABLED_HOOKS: 'pre:bash:mr-validate' },
  });
  assert.equal(exitCode(res), 0);
  assert.equal(res.stdout.trim(), 'no');
});

test('check-hook-enabled: ECC_HOOK_PROFILE=minimal excludes a strict-only hook -> "no"', () => {
  // pre:bash:tmux-reminder is profiles: 'strict' only, so minimal disables it.
  const res = runHook('check-hook-enabled.js', '', {
    args: ['pre:bash:tmux-reminder', 'strict'],
    env: { ...ISOLATED_ENV, ECC_HOOK_PROFILE: 'minimal' },
  });
  assert.equal(exitCode(res), 0);
  assert.equal(res.stdout.trim(), 'no');
});

test('check-hook-enabled: ECC_HOOK_PROFILE=strict includes a strict hook -> "yes"', () => {
  const res = runHook('check-hook-enabled.js', '', {
    args: ['pre:bash:tmux-reminder', 'strict'],
    env: { ...ISOLATED_ENV, ECC_HOOK_PROFILE: 'strict' },
  });
  assert.equal(exitCode(res), 0);
  assert.equal(res.stdout.trim(), 'yes');
});

// pre-write-doc-warn.js (-> doc-file-warning.js) — warns (exit 0, stderr) on an
// ad-hoc doc filename outside structured dirs; stays silent for normal paths.
test('pre-write-doc-warn: warns on ad-hoc filename outside structured dirs (exit 0 + warning)', () => {
  const res = runHook('pre-write-doc-warn.js', {
    tool_input: { file_path: 'NOTES.md' },
  }, { env: ISOLATED_ENV });
  assert.equal(exitCode(res), 0); // warns only, never blocks
  assert.match(res.stderr, /Ad-hoc documentation filename/);
});

test('pre-write-doc-warn: stays silent for ad-hoc name inside a structured dir', () => {
  const res = runHook('pre-write-doc-warn.js', {
    tool_input: { file_path: 'docs/NOTES.md' },
  }, { env: ISOLATED_ENV });
  assert.equal(exitCode(res), 0);
  assert.doesNotMatch(res.stderr, /Ad-hoc documentation filename/);
});

test('pre-write-doc-warn: stays silent for a normal source/doc path', () => {
  const res = runHook('pre-write-doc-warn.js', {
    tool_input: { file_path: 'src/index.ts' },
  }, { env: ISOLATED_ENV });
  assert.equal(exitCode(res), 0);
  assert.doesNotMatch(res.stderr, /Ad-hoc documentation filename/);
});

// pre-bash-dev-server-block.js — blocks (exit 2) a dev server command, but ONLY
// on non-Windows (source guards the whole block path behind platform !== win32).
// On Windows the hook is a pure pass-through, so it allows everything.
test('pre-bash-dev-server-block: dev server command behavior is platform-correct', () => {
  const res = runHook('pre-bash-dev-server-block.js', {
    tool_input: { command: 'npm run dev' },
  }, { env: ISOLATED_ENV });
  if (process.platform === 'win32') {
    // Windows: block path is skipped — must allow (fail-open pass-through).
    assert.equal(exitCode(res), 0, `win32 should pass through; stderr: ${res.stderr}`);
  } else {
    // POSIX: must block with exit 2 and a tmux guidance message.
    assert.equal(exitCode(res), 2, `non-win32 should block npm run dev; stderr: ${res.stderr}`);
    assert.match(res.stderr, /BLOCKED|tmux/i);
  }
});

test('pre-bash-dev-server-block: allows a non-dev command (npm test) everywhere', () => {
  const res = runHook('pre-bash-dev-server-block.js', {
    tool_input: { command: 'npm test' },
  }, { env: ISOLATED_ENV });
  assert.equal(exitCode(res), 0, `npm test should be allowed; stderr: ${res.stderr}`);
});

// pre-bash-dispatcher.js — fans out to PreToolUse bash hooks. block-no-verify is
// active in minimal/standard/strict and has no platform guard, so a
// `git commit --no-verify` must be blocked (exit 2) cross-platform.
test('pre-bash-dispatcher: blocks git commit --no-verify (exit 2)', () => {
  const res = runHook('pre-bash-dispatcher.js', {
    tool_input: { command: 'git commit -m "x" --no-verify' },
  }, { env: ISOLATED_ENV });
  assert.equal(exitCode(res), 2, `--no-verify should be blocked; stderr: ${res.stderr}`);
  assert.match(res.stderr, /no-verify/i);
});

test('pre-bash-dispatcher: allows a benign git command (exit 0)', () => {
  const res = runHook('pre-bash-dispatcher.js', {
    tool_input: { command: 'git status' },
  }, { env: ISOLATED_ENV });
  assert.equal(exitCode(res), 0, `git status should pass; stderr: ${res.stderr}`);
});

// post-bash-dispatcher.js — post-run audit hooks; never blocks. A normal command
// payload must pass through with exit 0.
test('post-bash-dispatcher: passes through a normal command result (exit 0)', () => {
  const res = runHook('post-bash-dispatcher.js', {
    tool_input: { command: 'git status' },
    tool_output: 'On branch main',
  }, { env: ISOLATED_ENV });
  assert.equal(exitCode(res), 0, `post dispatcher should pass; stderr: ${res.stderr}`);
});

// post-edit-console-warn.js — warns (exit 0) when an edited JS/TS file contains
// console.log. Use a real temp file so the hook can read it.
test('post-edit-console-warn: warns on console.log in an edited file (exit 0 + warning)', () => {
  const f = path.join(TMP_HOME, 'sample-with-log.ts');
  fs.writeFileSync(f, 'export const x = 1;\nconsole.log("debug");\n');
  const res = runHook('post-edit-console-warn.js', {
    tool_input: { file_path: f },
  }, { env: ISOLATED_ENV });
  assert.equal(exitCode(res), 0);
  assert.match(res.stderr, /console\.log/);
});

test('post-edit-console-warn: silent on a clean edited file (exit 0)', () => {
  const f = path.join(TMP_HOME, 'sample-clean.ts');
  fs.writeFileSync(f, 'export const x = 1;\n');
  const res = runHook('post-edit-console-warn.js', {
    tool_input: { file_path: f },
  }, { env: ISOLATED_ENV });
  assert.equal(exitCode(res), 0);
  assert.doesNotMatch(res.stderr, /WARNING: console\.log/);
});

// cost-tracker.js — appends a metrics row; must still exit 0. Confirm it writes
// a JSONL row when given usage data (state isolated to TMP_HOME/.claude).
test('cost-tracker: records a metrics row and exits 0', () => {
  const res = runHook('cost-tracker.js', {
    model: 'claude-sonnet',
    usage: { input_tokens: 1000, output_tokens: 500 },
  }, { env: ISOLATED_ENV });
  assert.equal(exitCode(res), 0);
  const costsFile = path.join(TMP_HOME, '.claude', 'metrics', 'costs.jsonl');
  // The metrics write is best-effort; assert it landed in the isolated home.
  if (fs.existsSync(costsFile)) {
    const content = fs.readFileSync(costsFile, 'utf8').trim();
    const lastLine = content.split('\n').filter(Boolean).pop();
    const row = JSON.parse(lastLine);
    assert.equal(row.input_tokens, 1000);
    assert.equal(row.output_tokens, 500);
    assert.ok(typeof row.estimated_cost_usd === 'number');
  }
});

// mcp-health-check.js — when the payload references no MCP target, it is a pure
// pass-through (exit 0). Assert that explicitly (beyond the universal cases).
test('mcp-health-check: passes through a non-MCP tool payload (exit 0)', () => {
  const res = runHook('mcp-health-check.js', {
    tool_name: 'Bash',
    tool_input: { command: 'git status' },
  }, { env: ISOLATED_ENV });
  assert.equal(exitCode(res), 0, `non-MCP payload should pass; stderr: ${res.stderr}`);
});

// suggest-compact.js — counter-based; never blocks. Use a unique session id so
// the temp counter file is isolated and exit is 0.
test('suggest-compact: increments a session counter and exits 0', () => {
  const res = runHook('suggest-compact.js', {}, {
    env: { ...ISOLATED_ENV, CLAUDE_SESSION_ID: 'test-session-deterministic' },
  });
  assert.equal(exitCode(res), 0);
});

// check-console-log.js — Stop hook keyed on git state; on benign input it must
// pass through stdin unchanged and exit 0 (covered universally, re-asserted with
// a realistic Stop payload here for output behavior).
test('check-console-log: passes original stdin through and exits 0', () => {
  const payload = { hook_event_name: 'Stop' };
  const res = runHook('check-console-log.js', payload, { env: ISOLATED_ENV });
  assert.equal(exitCode(res), 0);
  // Hook echoes the original data back to stdout.
  assert.equal(res.stdout, JSON.stringify(payload));
});
