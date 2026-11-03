'use strict';

/**
 * In-process unit tests for the refactored "load-only" hooks in scripts/hooks/.
 *
 * The companion suite load-only-hooks.test.js exercises these hooks as CHILD
 * PROCESSES (proving spawn behavior is unchanged). This suite instead require()s
 * each hook and calls its exported run()/helper DIRECTLY in-process, so the
 * hook's lines are counted by `node --test --experimental-test-coverage`.
 *
 * Contract (see scripts/hooks/run-with-flags.js emitHookResult):
 *   - run(rawInput, opts) MUST NOT call process.exit() or read stdin.
 *   - It returns either the raw string (plain pass-through) or
 *     { stdout?, stderr?, exitCode? } (exitCode 0/absent = allow, 2 = block).
 *
 * All FS/state is isolated in os.tmpdir(); HOME/USERPROFILE/CLAUDE_* env is
 * redirected and restored in test.after. Node built-ins only; synthetic data.
 */

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const os = require('node:os');
const fs = require('node:fs');

const HOOKS = path.join(__dirname, '..');

// ---------------------------------------------------------------------------
// Isolated environment: redirect HOME/USERPROFILE/CLAUDE_* so any state write
// (cost-tracker, suggest-compact, mcp-health-check) lands in a temp dir.
// ---------------------------------------------------------------------------

const TMP_HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'ecc-inproc-hook-'));
const SAVED_ENV = {};
const ENV_KEYS = [
  'HOME',
  'USERPROFILE',
  'CLAUDE_CONFIG_DIR',
  'CLAUDE_SESSION_ID',
  'ECC_SESSION_ID',
  'CLAUDE_MODEL',
  'COMPACT_THRESHOLD',
  'ECC_MCP_HEALTH_STATE_PATH',
];

before(() => {
  for (const k of ENV_KEYS) SAVED_ENV[k] = process.env[k];
  process.env.HOME = TMP_HOME;
  process.env.USERPROFILE = TMP_HOME;
  process.env.CLAUDE_CONFIG_DIR = path.join(TMP_HOME, '.claude');
});

after(() => {
  for (const k of ENV_KEYS) {
    if (SAVED_ENV[k] === undefined) delete process.env[k];
    else process.env[k] = SAVED_ENV[k];
  }
  try {
    fs.rmSync(TMP_HOME, { recursive: true, force: true });
  } catch {
    /* best-effort cleanup */
  }
});

function tmpFile(name, content) {
  const p = path.join(TMP_HOME, name);
  fs.writeFileSync(p, content);
  return p;
}

// ---------------------------------------------------------------------------
// check-console-log.js — plain pass-through; warns to stderr via log().
// ---------------------------------------------------------------------------

test('check-console-log: run() passes raw input through unchanged', () => {
  const hook = require(path.join(HOOKS, 'check-console-log.js'));
  const payload = JSON.stringify({ hook_event_name: 'Stop' });
  const out = hook.run(payload);
  assert.equal(out, payload, 'should return the raw input unchanged');
});

test('check-console-log: run() fails open on non-JSON (returns raw string)', () => {
  const hook = require(path.join(HOOKS, 'check-console-log.js'));
  const garbage = 'this is not json {[(';
  const out = hook.run(garbage);
  assert.equal(out, garbage);
});

test('check-console-log: run() tolerates non-string input (returns "")', () => {
  const hook = require(path.join(HOOKS, 'check-console-log.js'));
  assert.equal(hook.run(undefined), '');
});

test('check-console-log: exposes EXCLUDED_PATTERNS that skip test/scripts files', () => {
  const hook = require(path.join(HOOKS, 'check-console-log.js'));
  assert.ok(Array.isArray(hook.EXCLUDED_PATTERNS));
  const excluded = (f) => hook.EXCLUDED_PATTERNS.some((re) => re.test(f));
  assert.ok(excluded('foo.test.ts'));
  assert.ok(excluded('scripts/thing.js'));
  assert.ok(!excluded('src/app.ts'));
});

// ---------------------------------------------------------------------------
// post-edit-console-warn.js — warns (stderr) on console.log; pass-through.
// ---------------------------------------------------------------------------

test('post-edit-console-warn: run() flags console.log in an edited file', () => {
  const hook = require(path.join(HOOKS, 'post-edit-console-warn.js'));
  const f = tmpFile('warn-with-log.ts', 'export const x = 1;\nconsole.log("debug");\n');

  // Capture stderr to assert the warning without relying on a child process.
  const origErr = process.stderr.write.bind(process.stderr);
  let captured = '';
  process.stderr.write = (chunk) => {
    captured += String(chunk);
    return true;
  };
  // console.error routes through process.stderr.write.
  let out;
  try {
    out = hook.run(JSON.stringify({ tool_input: { file_path: f } }));
  } finally {
    process.stderr.write = origErr;
  }

  assert.equal(out, JSON.stringify({ tool_input: { file_path: f } }), 'passes input through');
  assert.match(captured, /console\.log/, 'warns about console.log');
});

test('post-edit-console-warn: run() is silent on a clean edited file', () => {
  const hook = require(path.join(HOOKS, 'post-edit-console-warn.js'));
  const f = tmpFile('warn-clean.ts', 'export const x = 1;\n');

  const origErr = process.stderr.write.bind(process.stderr);
  let captured = '';
  process.stderr.write = (chunk) => {
    captured += String(chunk);
    return true;
  };
  try {
    hook.run(JSON.stringify({ tool_input: { file_path: f } }));
  } finally {
    process.stderr.write = origErr;
  }
  assert.doesNotMatch(captured, /WARNING: console\.log/);
});

test('post-edit-console-warn: run() fails open on non-JSON', () => {
  const hook = require(path.join(HOOKS, 'post-edit-console-warn.js'));
  assert.equal(hook.run('not json'), 'not json');
});

// ---------------------------------------------------------------------------
// pre-write-doc-warn.js — re-exports run() from doc-file-warning.js; returns
// { exitCode, stderr? }. Warns on ad-hoc doc names outside structured dirs.
// ---------------------------------------------------------------------------

test('pre-write-doc-warn: run() warns on ad-hoc filename, never blocks', () => {
  const hook = require(path.join(HOOKS, 'pre-write-doc-warn.js'));
  const res = hook.run(JSON.stringify({ tool_input: { file_path: 'NOTES.md' } }));
  assert.equal(res.exitCode, 0, 'warns only, never blocks');
  assert.match(res.stderr, /Ad-hoc documentation filename/);
});

test('pre-write-doc-warn: run() stays silent inside a structured dir', () => {
  const hook = require(path.join(HOOKS, 'pre-write-doc-warn.js'));
  const res = hook.run(JSON.stringify({ tool_input: { file_path: 'docs/NOTES.md' } }));
  assert.equal(res.exitCode, 0);
  assert.ok(!res.stderr, 'no warning for structured-dir doc');
});

test('pre-write-doc-warn: run() fails open on non-JSON (exitCode 0)', () => {
  const hook = require(path.join(HOOKS, 'pre-write-doc-warn.js'));
  const res = hook.run('not json {');
  assert.equal(res.exitCode, 0);
});

// ---------------------------------------------------------------------------
// suggest-compact.js — counter-based; never blocks; pass-through. Each call
// increments a per-session counter file in the temp dir.
// ---------------------------------------------------------------------------

test('suggest-compact: run() increments a session counter without blocking', () => {
  const hook = require(path.join(HOOKS, 'suggest-compact.js'));
  process.env.CLAUDE_SESSION_ID = 'inproc-test-session';
  // Force a deterministic small threshold so we don't loop 50 times.
  process.env.COMPACT_THRESHOLD = '3';

  const payload = JSON.stringify({ tool_name: 'Bash' });
  const out1 = hook.run(payload);
  assert.equal(out1, payload, 'passes input through (does not block)');

  // Locate the counter file the hook wrote (via lib/utils getTempDir()).
  const { getTempDir } = require(path.join(HOOKS, '..', 'lib', 'utils.js'));
  const counterFile = path.join(getTempDir(), 'claude-tool-count-inproc-test-session');
  const after1 = parseInt(fs.readFileSync(counterFile, 'utf8').trim(), 10);

  hook.run(payload);
  const after2 = parseInt(fs.readFileSync(counterFile, 'utf8').trim(), 10);
  assert.equal(after2, after1 + 1, 'counter increments by one per run()');

  // Cleanup this hook's counter file (lives in the OS temp dir, not TMP_HOME).
  try {
    fs.rmSync(counterFile, { force: true });
  } catch {
    /* best-effort */
  }
});

test('suggest-compact: suggestCompact() returns raw input unchanged', () => {
  const hook = require(path.join(HOOKS, 'suggest-compact.js'));
  process.env.CLAUDE_SESSION_ID = 'inproc-test-session-2';
  const out = hook.suggestCompact('raw-passthrough');
  assert.equal(out, 'raw-passthrough');
  try {
    const { getTempDir } = require(path.join(HOOKS, '..', 'lib', 'utils.js'));
    fs.rmSync(path.join(getTempDir(), 'claude-tool-count-inproc-test-session-2'), { force: true });
  } catch {
    /* best-effort */
  }
});

// ---------------------------------------------------------------------------
// cost-tracker.js — appends a metrics row; pass-through; never blocks.
// ---------------------------------------------------------------------------

test('cost-tracker: run() records a metrics row and passes input through', () => {
  const hook = require(path.join(HOOKS, 'cost-tracker.js'));
  const payload = JSON.stringify({
    model: 'claude-sonnet',
    usage: { input_tokens: 1000, output_tokens: 500 },
  });
  const out = hook.run(payload);
  assert.equal(out, payload, 'passes input through');

  // getClaudeDir() resolves under the redirected HOME → CLAUDE_CONFIG_DIR.
  const costsFile = path.join(process.env.CLAUDE_CONFIG_DIR, 'metrics', 'costs.jsonl');
  assert.ok(fs.existsSync(costsFile), 'wrote costs.jsonl into the isolated home');
  const last = fs
    .readFileSync(costsFile, 'utf8')
    .trim()
    .split('\n')
    .filter(Boolean)
    .pop();
  const row = JSON.parse(last);
  assert.equal(row.input_tokens, 1000);
  assert.equal(row.output_tokens, 500);
  assert.equal(typeof row.estimated_cost_usd, 'number');
});

test('cost-tracker: run() fails open on non-JSON (returns raw)', () => {
  const hook = require(path.join(HOOKS, 'cost-tracker.js'));
  assert.equal(hook.run('nope {'), 'nope {');
});

test('cost-tracker: estimateCost() scales by model tier', () => {
  const hook = require(path.join(HOOKS, 'cost-tracker.js'));
  const haiku = hook.estimateCost('claude-haiku', 1_000_000, 0);
  const opus = hook.estimateCost('claude-opus', 1_000_000, 0);
  assert.ok(opus > haiku, 'opus input rate exceeds haiku');
  assert.equal(hook.toNumber('not-a-number'), 0);
});

// ---------------------------------------------------------------------------
// mcp-health-check.js — async core stays spawn-only; here we exercise its
// SYNCHRONOUS, pure helpers in-process (the part that is safe to count).
// ---------------------------------------------------------------------------

test('mcp-health-check: extractMcpTarget parses an mcp__ tool name', () => {
  const hook = require(path.join(HOOKS, 'mcp-health-check.js'));
  const target = hook.extractMcpTarget({ tool_name: 'mcp__exa__web_search' });
  assert.deepEqual(target, { server: 'exa', tool: 'web_search' });
});

test('mcp-health-check: extractMcpTarget returns null for non-MCP tools', () => {
  const hook = require(path.join(HOOKS, 'mcp-health-check.js'));
  assert.equal(hook.extractMcpTarget({ tool_name: 'Bash' }), null);
});

test('mcp-health-check: safeParse returns {} on garbage and parses valid JSON', () => {
  const hook = require(path.join(HOOKS, 'mcp-health-check.js'));
  assert.deepEqual(hook.safeParse('not json'), {});
  assert.deepEqual(hook.safeParse('{"a":1}'), { a: 1 });
});

test('mcp-health-check: detectFailureCode classifies known failure text', () => {
  const hook = require(path.join(HOOKS, 'mcp-health-check.js'));
  assert.equal(hook.detectFailureCode('Error: 401 Unauthorized'), 401);
  assert.equal(hook.detectFailureCode('ECONNREFUSED 127.0.0.1'), 'transport');
  assert.equal(hook.detectFailureCode('all good'), null);
});

test('mcp-health-check: markHealthy / markUnhealthy mutate state as expected', () => {
  const hook = require(path.join(HOOKS, 'mcp-health-check.js'));
  const state = { version: 1, servers: {} };
  const now = Date.now();
  hook.markHealthy(state, 'exa', now);
  assert.equal(state.servers.exa.status, 'healthy');
  assert.ok(state.servers.exa.expiresAt >= now);

  hook.markUnhealthy(state, 'exa', now, 503, 'service unavailable');
  assert.equal(state.servers.exa.status, 'unhealthy');
  assert.equal(state.servers.exa.failureCount, 1);
  assert.ok(state.servers.exa.nextRetryAt > now, 'sets a backoff retry time');
});

test('mcp-health-check: loadState/saveState round-trip via a temp state file', () => {
  const hook = require(path.join(HOOKS, 'mcp-health-check.js'));
  const statePath = path.join(TMP_HOME, 'mcp-state.json');
  const state = { version: 1, servers: { exa: { status: 'healthy' } } };
  hook.saveState(statePath, state);
  const loaded = hook.loadState(statePath);
  assert.equal(loaded.servers.exa.status, 'healthy');

  // Missing file → default shape, never throws.
  const fresh = hook.loadState(path.join(TMP_HOME, 'no-such-state.json'));
  assert.deepEqual(fresh, { version: 1, servers: {} });
});
