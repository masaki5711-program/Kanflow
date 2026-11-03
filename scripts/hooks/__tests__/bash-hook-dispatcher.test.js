'use strict';

/**
 * Direct tests for scripts/hooks/bash-hook-dispatcher.js — the in-process
 * chain that pre:bash:dispatcher / post:bash:dispatcher run. The individual
 * chained hooks have their own suites; this file pins the dispatcher's own
 * contract: hook-table shape, chaining, fail-open, and block propagation.
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs');

// ── Isolation before require ─────────────────────────────────────────────
const SANDBOX = fs.mkdtempSync(path.join(os.tmpdir(), 'ecc-dispatcher-tests-'));
const ORIG_ENV = {
  HOME: process.env.HOME,
  USERPROFILE: process.env.USERPROFILE,
  GATEGUARD_STATE_DIR: process.env.GATEGUARD_STATE_DIR,
  ECC_DISABLED_HOOKS: process.env.ECC_DISABLED_HOOKS,
};
process.env.HOME = SANDBOX;
process.env.USERPROFILE = SANDBOX;
process.env.GATEGUARD_STATE_DIR = path.join(SANDBOX, 'gateguard');
// Keep the dispatcher deterministic: session-stateful / environment-dependent
// hooks are exercised in their own suites, not here.
process.env.ECC_DISABLED_HOOKS = 'pre:bash:gateguard-fact-force,pre:bash:auto-tmux-dev';

const {
  PRE_BASH_HOOKS,
  POST_BASH_HOOKS,
  runPreBash,
  runPostBash,
} = require('../bash-hook-dispatcher');

const bash = (command, output) =>
  JSON.stringify({
    tool_name: 'Bash',
    tool_input: { command },
    ...(output === undefined ? {} : { tool_output: { output } }),
  });

test.after(() => {
  for (const [k, v] of Object.entries(ORIG_ENV)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  try {
    fs.rmSync(SANDBOX, { recursive: true, force: true });
  } catch {
    /* best-effort */
  }
});

test('dispatcher: hook tables are well-formed (unique ids, run functions)', () => {
  for (const table of [PRE_BASH_HOOKS, POST_BASH_HOOKS]) {
    assert.ok(Array.isArray(table) && table.length > 0);
    const ids = table.map(h => h.id);
    assert.equal(new Set(ids).size, ids.length, 'hook ids must be unique');
    for (const hook of table) {
      assert.match(hook.id, /^(pre|post):bash:/, `id namespaced: ${hook.id}`);
      assert.equal(typeof hook.run, 'function', `${hook.id} exposes run()`);
    }
  }
});

test('dispatcher: runPreBash passes a benign command through (exit 0)', () => {
  const raw = bash('git status');
  const res = runPreBash(raw);
  assert.equal(res.exitCode, 0);
  assert.equal(res.output, raw, 'benign input flows through the whole chain');
});

test('dispatcher: runPreBash propagates a block from a chained hook (--no-verify)', () => {
  const res = runPreBash(bash('git commit --no-verify -m "x"'));
  assert.equal(res.exitCode, 2, 'block-no-verify must stop the chain');
  assert.ok(res.stderr.length > 0, 'block reason surfaces on stderr');
});

test('dispatcher: confidential-scan is wired and blocks a leaking commit message', () => {
  const ids = PRE_BASH_HOOKS.map(h => h.id);
  assert.ok(ids.includes('pre:bash:confidential-scan'), 'confidential-scan must be in the chain');

  // Synthetic credential (test fixture) in the commit message itself — the
  // scan must block regardless of what is staged.
  const res = runPreBash(bash('git commit -m "use token glpat-aaaaaaaaaaaaaaaaaaaa"'));
  assert.equal(res.exitCode, 2, 'commit with credential in -m must be blocked');
  assert.match(res.stderr, /confidential-scan/);
});

test('dispatcher: dev-server-block is wired as the auto-tmux-dev backstop', () => {
  const ids = PRE_BASH_HOOKS.map(h => h.id);
  const autoTmuxIndex = ids.indexOf('pre:bash:auto-tmux-dev');
  const devBlockIndex = ids.indexOf('pre:bash:dev-server-block');
  assert.ok(devBlockIndex !== -1, 'pre:bash:dev-server-block must be in the chain');
  assert.ok(devBlockIndex > autoTmuxIndex, 'backstop runs after the tmux rewrite');

  // auto-tmux-dev is disabled in this suite, so the backstop sees the raw
  // command: blocked on POSIX, pure pass-through on Windows.
  const res = runPreBash(bash('npm run dev'));
  if (process.platform === 'win32') {
    assert.equal(res.exitCode, 0, 'Windows: pass-through');
  } else {
    assert.equal(res.exitCode, 2, 'POSIX: dev server outside tmux is blocked');
    assert.match(res.stderr, /tmux/);
  }
});

test('dispatcher: runPostBash is advisory for a benign command (exit 0)', () => {
  const raw = bash('echo done', 'done');
  const res = runPostBash(raw);
  assert.equal(res.exitCode, 0);
  assert.equal(res.output, raw);
});

test('dispatcher: runPostBash surfaces the MR-created advisory from the chain', () => {
  const url = 'https://gitlab.example.com/g/p/-/merge_requests/12';
  const res = runPostBash(bash('glab mr create --fill', `!12 opened\n${url}\n`));
  assert.equal(res.exitCode, 0, 'advisory only — never blocks');
  assert.match(res.stderr, /MR created/);
});

test('dispatcher: fails open on non-JSON input (exit 0, input preserved)', () => {
  const res = runPreBash('%%% not json %%%');
  assert.equal(res.exitCode, 0);
  assert.equal(res.output, '%%% not json %%%');
});
