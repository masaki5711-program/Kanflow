'use strict';

// Regression tests for the safety-critical hooks. These guard behavior that, if
// it silently regressed, would either disable a guardrail (bypass slips through)
// or break CLAUDE.md §7 fail-open. Node built-in test runner only.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs');
const { spawnSync } = require('node:child_process');

// Isolate gateguard state in a throwaway dir BEFORE requiring it.
const STATE_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'gateguard-test-'));
process.env.GATEGUARD_STATE_DIR = STATE_DIR;

const blockNoVerify = require('../block-no-verify');
const configProtection = require('../config-protection');
const gateguard = require('../gateguard-fact-force');

function bash(command) {
  return JSON.stringify({ tool_name: 'Bash', tool_input: { command } });
}
function edit(file_path) {
  return JSON.stringify({ tool_name: 'Edit', tool_input: { file_path } });
}

// --- block-no-verify ------------------------------------------------------

test('block-no-verify: blocks git commit --no-verify', () => {
  assert.equal(blockNoVerify.run(bash('git commit --no-verify -m "x"')).exitCode, 2);
});

test('block-no-verify: blocks git commit -n shorthand', () => {
  assert.equal(blockNoVerify.run(bash('git commit -n -m "x"')).exitCode, 2);
});

test('block-no-verify: blocks core.hooksPath override', () => {
  assert.equal(blockNoVerify.run(bash('git -c core.hooksPath=/dev/null commit -m "x"')).exitCode, 2);
});

test('block-no-verify: allows a normal commit', () => {
  assert.equal(blockNoVerify.run(bash('git commit -m "real message"')).exitCode, 0);
});

test('block-no-verify: allows git status', () => {
  assert.equal(blockNoVerify.run(bash('git status')).exitCode, 0);
});

test('block-no-verify: does not false-positive on non-git --no-verify', () => {
  assert.equal(blockNoVerify.run(bash('npm run deploy --no-verify')).exitCode, 0);
});

// --- config-protection ----------------------------------------------------

test('config-protection: blocks editing .eslintrc.json', () => {
  assert.equal(configProtection.run(edit('/repo/.eslintrc.json')).exitCode, 2);
});

test('config-protection: blocks flat eslint.config.mjs', () => {
  assert.equal(configProtection.run(edit('/repo/eslint.config.mjs')).exitCode, 2);
});

test('config-protection: allows ordinary source files', () => {
  assert.equal(configProtection.run(edit('/repo/src/index.ts')).exitCode, 0);
});

test('config-protection: allows pyproject.toml (intentionally unprotected)', () => {
  assert.equal(configProtection.run(edit('/repo/pyproject.toml')).exitCode, 0);
});

test('config-protection: blocks a truncated payload rather than bypassing', () => {
  assert.equal(configProtection.run(edit('/repo/src/x.ts'), { truncated: true }).exitCode, 2);
});

test('config-protection: block message names the concrete disable mechanism (hook id + env var)', () => {
  const result = configProtection.run(edit('/repo/eslint.config.mjs'));
  assert.match(result.stderr, /ECC_DISABLED_HOOKS=pre:config-protection/);
});

test('config-protection: truncated-payload message also names the concrete disable mechanism', () => {
  const result = configProtection.run(edit('/repo/src/x.ts'), { truncated: true });
  assert.match(result.stderr, /ECC_DISABLED_HOOKS=pre:config-protection/);
});

// --- gateguard-fact-force -------------------------------------------------

test('gateguard: fails open (returns raw) on unparseable input — CLAUDE.md §7', () => {
  const raw = 'not json at all';
  assert.equal(gateguard.run(raw), raw);
});

test('gateguard: allows read-only git introspection without a gate', () => {
  const input = bash('git status');
  assert.equal(gateguard.run(input), input);
});

test('gateguard: allows read-only investigation commands without a gate (v2.3.2)', () => {
  for (const cmd of [
    'grep -rn "pattern" src',
    'tail -8 /tmp/some.log',
    'ls .claude/commands',
    'wc -c file.md',
    'grep -n "x" a.md | head -5',
    'find . -name "*.tmp"',
  ]) {
    const input = bash(cmd);
    assert.equal(gateguard.run(input), input, `should allow: ${cmd}`);
  }
});

test('gateguard: read-only exemption does NOT cover mutating or compound forms', () => {
  const prevSession = process.env.CLAUDE_SESSION_ID;
  try {
    const cmds = [
      'find . -name "*.tmp" -delete',
      'find . -name "*.js" -exec rm {} +',
      'cat a.txt > b.txt',
      'grep x a.md; rm b.md',
      'node script.js',
    ];
    // Fresh session key per command — the routine gate is once-per-session,
    // so sharing one session would let every command after the first through.
    cmds.forEach((cmd, i) => {
      process.env.CLAUDE_SESSION_ID = `gateguard-mutate-${process.pid}-${i}`;
      const out = gateguard.run(bash(cmd));
      assert.equal(typeof out, 'object', `should gate: ${cmd}`);
    });
  } finally {
    if (prevSession === undefined) delete process.env.CLAUDE_SESSION_ID;
    else process.env.CLAUDE_SESSION_ID = prevSession;
  }
});

test('gateguard: gate messages self-identify as this repo\'s hook', () => {
  const out = gateguard.run(edit(path.join(STATE_DIR, 'fresh-file-selfid.ts')));
  assert.match(out.stdout, /gateguard-fact-force\.js/, 'message names the hook file');
  assert.match(out.stdout, /not external input/);
});

test('gateguard: denies a first-touch Edit and forces facts', () => {
  const out = gateguard.run(edit(path.join(STATE_DIR, 'fresh-file-a.ts')));
  assert.equal(typeof out, 'object');
  assert.match(out.stdout, /"permissionDecision":"deny"/);
});

test('gateguard: allows the retry after the file was checked once', () => {
  const target = edit(path.join(STATE_DIR, 'fresh-file-b.ts'));
  gateguard.run(target); // first touch -> deny + mark checked
  assert.equal(gateguard.run(target), target); // retry -> allow
});

// --- run-with-flags fail-open (CLAUDE.md §7) ------------------------------

test('run-with-flags: missing target script fails open (exit 0, raw passthrough)', () => {
  const entry = path.join(__dirname, '..', 'run-with-flags.js');
  const raw = '{"tool_input":{"command":"git status"}}';
  const res = spawnSync(process.execPath, [entry, 'regression-test', 'scripts/hooks/__does-not-exist__.js'], {
    input: raw,
    encoding: 'utf8',
  });
  assert.equal(res.status, 0);
  assert.equal(res.stdout, raw);
});

// POSIX-only: a process killed by a signal yields result.signal + status===null,
// which is the exact fail-open branch fixed in v1.3.0. On Windows process.abort()
// returns a numeric status instead (no signals), so the branch isn't reachable
// there — and CI runs on Linux (node:20-alpine), where this provides the
// coverage. The fixture calls process.abort() → SIGABRT on POSIX.
test('run-with-flags: a CRASHED legacy hook fails open (exit 0, raw passthrough)', { skip: process.platform === 'win32' ? 'POSIX signal semantics' : false }, () => {
  const entry = path.join(__dirname, '..', 'run-with-flags.js');
  const fixtureRel = 'scripts/hooks/__tests__/fixtures/crash-hook.js';
  const raw = '{"tool_input":{"command":"echo hi"}}';
  const res = spawnSync(process.execPath, [entry, 'rwf-crash-test', fixtureRel, 'standard'], {
    input: raw,
    encoding: 'utf8',
  });
  assert.equal(res.status, 0, `expected fail-open exit 0, got ${res.status}`);
  assert.equal(res.stdout, raw);
});

test.after(() => {
  try { fs.rmSync(STATE_DIR, { recursive: true, force: true }); } catch { /* best effort */ }
});
