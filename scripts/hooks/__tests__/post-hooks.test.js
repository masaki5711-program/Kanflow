'use strict';

/**
 * Characterization / regression tests for the PostToolUse / PostEdit hooks.
 *
 * Scope: behavioral coverage toward the repo 80% test-coverage rule. These are
 * characterization tests — they pin the CURRENT observed behavior of each hook
 * (CLAUDE.md §7: hooks fail open; most post hooks only ever return exitCode 0
 * advisory output).
 *
 * Node built-in test runner + assert only. Cross-platform, deterministic, no
 * network. Hooks that write state/log files are isolated to a per-run temp dir
 * via the env var / cwd they read, and cleaned up in test.after.
 *
 * Run: node --test scripts/hooks/__tests__/post-hooks.test.js
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const ev = (o) => JSON.stringify(o);

// A unique temp dir per process run for any hook that touches the filesystem.
const TMP_ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'ecc-hook-test-'));

// Isolate the error-memory hook (reads CLAUDE_PROJECT_DIR) and the accumulator
// hook (reads CLAUDE_SESSION_ID for its temp-file name) BEFORE requiring them.
const ORIG_PROJECT_DIR = process.env.CLAUDE_PROJECT_DIR;
const ORIG_SESSION_ID = process.env.CLAUDE_SESSION_ID;
const SESSION_ID = `hooktest-${process.pid}`;
process.env.CLAUDE_PROJECT_DIR = TMP_ROOT;
process.env.CLAUDE_SESSION_ID = SESSION_ID;

const buildComplete = require('../post-bash-build-complete');
const commandLog = require('../post-bash-command-log');
const errorMemory = require('../post-bash-error-memory');
const prCreated = require('../post-bash-pr-created');
const accumulator = require('../post-edit-accumulator');
const format = require('../post-edit-format');

const ACCUM_FILE = path.join(os.tmpdir(), `ecc-edited-${SESSION_ID}.txt`);

test.after(() => {
  try {
    fs.rmSync(TMP_ROOT, { recursive: true, force: true });
  } catch {
    /* ignore */
  }
  try {
    fs.rmSync(ACCUM_FILE, { force: true });
  } catch {
    /* ignore */
  }
  if (ORIG_PROJECT_DIR === undefined) delete process.env.CLAUDE_PROJECT_DIR;
  else process.env.CLAUDE_PROJECT_DIR = ORIG_PROJECT_DIR;
  if (ORIG_SESSION_ID === undefined) delete process.env.CLAUDE_SESSION_ID;
  else process.env.CLAUDE_SESSION_ID = ORIG_SESSION_ID;
});

// Shared assertion: a post hook either passes the raw string through, or
// returns an object whose exitCode allows continuation (0 = allow, 2 = block).
function isAllow(out) {
  return typeof out === 'string' || (out && typeof out === 'object' && out.exitCode === 0);
}

// ──────────────────────────────────────────────────────────────────────────
// post-bash-build-complete.js
// Trigger: command matches /npm run build|pnpm build|yarn build/.
// ──────────────────────────────────────────────────────────────────────────

test('build-complete: passes through a non-build command (allow path)', () => {
  const out = buildComplete.run(ev({ tool_input: { command: 'ls -la' } }));
  assert.equal(typeof out, 'string');
  assert.equal(out, ev({ tool_input: { command: 'ls -la' } }));
});

test('build-complete: fails open on non-JSON input (CLAUDE.md §7)', () => {
  const out = buildComplete.run('nonsense{not json');
  assert.equal(out, 'nonsense{not json');
});

test('build-complete: emits advisory stderr on a build command, exitCode 0', () => {
  const out = buildComplete.run(ev({ tool_input: { command: 'npm run build' } }));
  assert.equal(typeof out, 'object');
  assert.equal(out.exitCode, 0);
  assert.match(out.stderr, /Build completed/);
  // stdout is the unchanged pass-through payload.
  assert.equal(out.stdout, ev({ tool_input: { command: 'npm run build' } }));
});

// ──────────────────────────────────────────────────────────────────────────
// post-bash-command-log.js
// run(rawInput, mode): with no mode the config is undefined → no file write,
// pure pass-through. sanitizeCommand redacts secrets.
// ──────────────────────────────────────────────────────────────────────────

test('command-log: default (no mode) is a pass-through and writes nothing', () => {
  const payload = ev({ tool_input: { command: 'git status' } });
  const out = commandLog.run(payload);
  assert.equal(out, payload);
});

test('command-log: fails open on non-JSON input, still returns the raw string', () => {
  const out = commandLog.run('not json at all');
  assert.equal(out, 'not json at all');
});

test('command-log: sanitizeCommand redacts a github token (behavioral)', () => {
  const cleaned = commandLog.sanitizeCommand('gh auth login --with-token ghp_ABCDEFGHIJKLMNOP012345');
  assert.doesNotMatch(cleaned, /ghp_ABCDEFGHIJKLMNOP012345/);
  assert.match(cleaned, /<REDACTED>/);
});

test('command-log: sanitizeCommand redacts a password flag', () => {
  const cleaned = commandLog.sanitizeCommand('mysql --user root password=hunter2');
  assert.doesNotMatch(cleaned, /hunter2/);
  assert.match(cleaned, /password=<REDACTED>/);
});

// ──────────────────────────────────────────────────────────────────────────
// post-bash-error-memory.js (mistake-memory read side)
// Trigger: build/test command (a) + failure signal (b) + a RELEVANT record in
// .claude/mistakes/records.jsonl (c). Injects top-3 matches, not a full dump.
// Isolated via CLAUDE_PROJECT_DIR.
// ──────────────────────────────────────────────────────────────────────────

const mistakeStore = require('../../lib/mistake-store');

function seedMistake() {
  mistakeStore.saveRecords(TMP_ROOT, []);
  mistakeStore.addRecord(
    TMP_ROOT,
    {
      title: 'TS2304 型 import 漏れ',
      signature: 'error TS2304: Cannot find name',
      context: 'typecheck',
      root_cause: 'type-only import の欠落',
      fix: 'import type { X } を追加する',
      tags: ['typescript'],
      severity: 3,
    },
    { now: '2026-07-21T00:00:00.000Z' },
  );
}

test('error-memory: passes through a non-build command', () => {
  const payload = ev({ tool_input: { command: 'echo hi' }, tool_response: { is_error: true } });
  const out = errorMemory.run(payload);
  assert.equal(out, payload);
});

test('error-memory: passes through a SUCCESSFUL build command (no failure signal)', () => {
  seedMistake();
  const payload = ev({
    tool_input: { command: 'npm run build' },
    tool_response: { stdout: 'build ok', is_error: false },
  });
  // Even with records present, a non-failed command must not fire.
  assert.equal(errorMemory.run(payload), payload);
});

test('error-memory: fails open on non-JSON input', () => {
  const out = errorMemory.run('}{ broken');
  assert.equal(out, '}{ broken');
});

test('error-memory: FAILED build with a matching record injects top matches (exitCode 2)', () => {
  seedMistake();
  const payload = ev({
    tool_input: { command: 'npm run build' },
    tool_response: { stdout: '', stderr: 'error TS2304: Cannot find name "EdgeRecord"', is_error: true },
  });
  const out = errorMemory.run(payload);
  assert.equal(typeof out, 'object');
  assert.equal(out.exitCode, 2); // documented block path for this advisory hook
  assert.match(out.stderr, /Mistake Memory/);
  assert.match(out.stderr, /import type/); // the recorded fix, not a raw dump
  assert.equal(out.stdout, payload); // payload preserved
  // The failure is tracked in the pending ledger for the Stop-capture hook.
  assert.ok(mistakeStore.readPending(TMP_ROOT).some(e => e.cmd === 'npm run build'));
});

test('error-memory: FAILED build with only IRRELEVANT records stays silent', () => {
  seedMistake();
  const payload = ev({
    tool_input: { command: 'cargo build' },
    tool_response: { stderr: 'error[E0432]: unresolved import edge::mqtt', is_error: true },
  });
  assert.equal(errorMemory.run(payload), payload); // no dump of unrelated entries
});

test('error-memory: failed build but NO records → pass-through (nothing recorded yet)', () => {
  const emptyDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ecc-hook-empty-'));
  const prev = process.env.CLAUDE_PROJECT_DIR;
  process.env.CLAUDE_PROJECT_DIR = emptyDir;
  try {
    const payload = ev({
      tool_input: { command: 'cargo build' },
      tool_response: { stderr: 'error[E0432]: unresolved import', is_error: true },
    });
    const out = errorMemory.run(payload);
    assert.equal(out, payload);
  } finally {
    process.env.CLAUDE_PROJECT_DIR = prev;
    fs.rmSync(emptyDir, { recursive: true, force: true });
  }
});

test('error-memory: build SUCCESS resolves the pending failure (capture handoff)', () => {
  seedMistake();
  const fail = ev({
    tool_input: { command: 'pnpm run test' },
    tool_response: { stderr: 'FAILED 3 failed', is_error: true },
  });
  errorMemory.run(fail);
  errorMemory.run(fail);
  const success = ev({
    tool_input: { command: 'pnpm run test' },
    tool_response: { stdout: 'all green', is_error: false },
  });
  errorMemory.run(success);
  const entry = mistakeStore.readPending(TMP_ROOT).find(e => e.cmd === 'pnpm run test');
  assert.ok(entry);
  assert.equal(entry.resolved, true);
  assert.equal(entry.fails, 2);
});

// Regressions from the 2026-10-22 audit: 114 ledger entries in a product
// workspace produced zero records (see docs/agent-model-changelog.md v2.9.11).

function pendingFor(cmd, session) {
  return mistakeStore.readPending(TMP_ROOT).filter(e => e.cmd === cmd && (!session || e.session === session));
}

test('error-memory: a passing run that reports "0 failed" is a SUCCESS, not a failure', () => {
  mistakeStore.saveRecords(TMP_ROOT, []);
  const cmd = 'cargo test -p zeva-runtime';
  errorMemory.run(ev({ tool_input: { command: cmd }, tool_response: { stdout: 'test result: FAILED. 51 passed; 2 failed' } }));
  errorMemory.run(ev({
    tool_input: { command: cmd },
    tool_response: { stdout: 'test result: ok. 53 passed; 0 failed; 0 ignored; finished in 0.02s' },
  }));
  const [entry] = pendingFor(cmd);
  assert.equal(entry.fails, 1); // the green run did not count as a second failure
  assert.equal(entry.resolved, true);
});

test('error-memory: node:test "ℹ fail 1" counts as a failure, "ℹ fail 0" does not', () => {
  mistakeStore.saveRecords(TMP_ROOT, []);
  const cmd = 'node --test scripts/x.test.js';
  errorMemory.run(ev({ tool_input: { command: cmd }, tool_response: { stdout: 'ℹ pass 3\nℹ fail 0' } }));
  assert.equal(pendingFor(cmd).length, 0);
  errorMemory.run(ev({ tool_input: { command: cmd }, tool_response: { stdout: 'ℹ pass 2\nℹ fail 1' } }));
  assert.equal(pendingFor(cmd)[0].fails, 1);
});

test('error-memory: PostToolUseFailure (non-zero exit) is tracked as a failure', () => {
  mistakeStore.saveRecords(TMP_ROOT, []);
  errorMemory.run(ev({
    hook_event_name: 'PostToolUseFailure',
    tool_input: { command: 'npm run typecheck' },
    error: 'Exit code 2\nsrc/a.ts(3,1): error TS2304: Cannot find name "X"',
  }));
  const [entry] = pendingFor('npm run typecheck');
  assert.equal(entry.fails, 1);
  assert.match(entry.sig, /TS2304/);
});

test('error-memory: a user interrupt is not a build failure', () => {
  errorMemory.run(ev({
    hook_event_name: 'PostToolUseFailure',
    tool_input: { command: 'cargo build --release' },
    error: 'interrupted',
    is_interrupt: true,
  }));
  assert.equal(pendingFor('cargo build --release').length, 0);
});

test('error-memory: retries with a different cd / pipe count as the SAME failure', () => {
  mistakeStore.saveRecords(TMP_ROOT, []);
  const failed = command => ev({
    hook_event_name: 'PostToolUseFailure', tool_input: { command }, error: 'error[E0308]: mismatched types',
  });
  errorMemory.run(failed('cd "/tmp/wt-a" && cargo test -p zeva-replay 2>&1 | tail -40'));
  errorMemory.run(failed('cargo test -p zeva-replay 2>&1 | grep -E "FAILED|panicked"'));
  const [entry] = pendingFor('cargo test -p zeva-replay');
  assert.equal(entry.fails, 2); // reaches the Stop-capture threshold
});

test('error-memory: a command that only MENTIONS a build word is ignored', () => {
  const before = mistakeStore.readPending(TMP_ROOT).length;
  errorMemory.run(ev({ tool_input: { command: 'grep -rn "cargo test" docs' }, tool_response: { stdout: '1 failed' } }));
  errorMemory.run(ev({ tool_input: { command: 'node -e "/node --test/.test(x)"' }, tool_response: { stdout: '2 failed' } }));
  assert.equal(mistakeStore.readPending(TMP_ROOT).length, before);
});

test('error-memory: env assignments never reach the ledger', () => {
  errorMemory.run(ev({
    hook_event_name: 'PostToolUseFailure',
    tool_input: { command: 'DATABASE_URL=postgres://u:secret@db/x cargo test -p zeva-replay-db' },
    error: 'panicked at src/lib.rs',
  }));
  const ledger = JSON.stringify(mistakeStore.readPending(TMP_ROOT));
  assert.doesNotMatch(ledger, /secret|DATABASE_URL/);
  assert.equal(pendingFor('cargo test -p zeva-replay-db').length, 1);
});

test('error-memory: credentials printed by a failing build are masked in the ledger', () => {
  errorMemory.run(ev({
    hook_event_name: 'PostToolUseFailure',
    tool_input: { command: 'cargo test -p redact-probe' },
    error: 'panicked at connect postgres://app:hunter2@db.example.invalid/x API_TOKEN=abc123xyz',
  }));
  const [entry] = pendingFor('cargo test -p redact-probe');
  assert.doesNotMatch(entry.sig, /hunter2|abc123xyz/);
  assert.match(entry.sig, /postgres:\/\/<REDACTED>@db\.example\.invalid/);
  assert.match(entry.sig, /API_TOKEN=<REDACTED>/);
});

test('error-memory: the session comes from the event session_id', () => {
  const failed = session_id => ev({
    session_id, hook_event_name: 'PostToolUseFailure', tool_input: { command: 'go test ./...' }, error: 'FAIL x 1 failed',
  });
  errorMemory.run(failed('sess-A'));
  errorMemory.run(failed('sess-B'));
  assert.equal(pendingFor('go test ./...', 'sess-A').length, 1);
  assert.equal(pendingFor('go test ./...', 'sess-B').length, 1);
});

// ──────────────────────────────────────────────────────────────────────────
// post-bash-pr-created.js
// Trigger: `gh pr create` command AND a github PR url in tool_output.output.
// ──────────────────────────────────────────────────────────────────────────

test('pr-created: passes through a non-PR command', () => {
  const payload = ev({ tool_input: { command: 'git push' } });
  assert.equal(prCreated.run(payload), payload);
});

test('pr-created: fails open on non-JSON input', () => {
  const out = prCreated.run('::: not json :::');
  assert.equal(out, '::: not json :::');
});

test('pr-created: gh pr create WITHOUT a url in output is a pass-through', () => {
  const payload = ev({
    tool_input: { command: 'gh pr create --fill' },
    tool_output: { output: 'creating pull request...' },
  });
  assert.equal(prCreated.run(payload), payload);
});

test('pr-created: reacts to a SUCCESSFUL gh pr create with a PR url (exitCode 0, advisory)', () => {
  const url = 'https://github.com/acme/widgets/pull/42';
  const payload = ev({
    tool_input: { command: 'gh pr create --fill' },
    tool_output: { output: `Warning: ...\n${url}\n` },
  });
  const out = prCreated.run(payload);
  assert.equal(typeof out, 'object');
  assert.equal(out.exitCode, 0);
  assert.match(out.stderr, /PR created/);
  assert.match(out.stderr, /pull\/42/);
  assert.match(out.stderr, /gh pr review 42 --repo acme\/widgets/);
  assert.equal(out.stdout, payload);
  assert.ok(isAllow(out));
});

test('pr-created: glab mr create WITHOUT a url in output is a pass-through', () => {
  const payload = ev({
    tool_input: { command: 'glab mr create --fill' },
    tool_output: { output: 'creating merge request...' },
  });
  assert.equal(prCreated.run(payload), payload);
});

test('pr-created: reacts to a SUCCESSFUL glab mr create with an MR url (exitCode 0, advisory)', () => {
  const url = 'https://gitlab.example.com/group/project/-/merge_requests/7';
  const payload = ev({
    tool_input: { command: 'glab mr create --fill' },
    tool_output: { output: `!7 opened\n${url}\n` },
  });
  const out = prCreated.run(payload);
  assert.equal(typeof out, 'object');
  assert.equal(out.exitCode, 0);
  assert.match(out.stderr, /MR created/);
  assert.match(out.stderr, /merge_requests\/7/);
  assert.match(out.stderr, /glab mr view 7/);
  assert.equal(out.stdout, payload);
  assert.ok(isAllow(out));
});

// ──────────────────────────────────────────────────────────────────────────
// post-edit-accumulator.js
// Trigger: Edit/Write/MultiEdit with a JS/TS file_path → append to the
// session temp file. Isolated via CLAUDE_SESSION_ID (set before require).
// ──────────────────────────────────────────────────────────────────────────

test('accumulator: fails open on non-JSON input', () => {
  const out = accumulator.run('not-json');
  assert.equal(out, 'not-json');
});

test('accumulator: ignores a non JS/TS edit (no file written)', () => {
  const before = fs.existsSync(ACCUM_FILE) ? fs.readFileSync(ACCUM_FILE, 'utf8') : '';
  const payload = ev({ tool_input: { file_path: '/repo/README.md' } });
  const out = accumulator.run(payload);
  assert.equal(out, payload); // pass-through
  const after = fs.existsSync(ACCUM_FILE) ? fs.readFileSync(ACCUM_FILE, 'utf8') : '';
  assert.equal(after, before); // unchanged — .md is not accumulated
});

test('accumulator: records an edited JS/TS path (behavioral)', () => {
  const tsPath = '/repo/src/widget.ts';
  const payload = ev({ tool_input: { file_path: tsPath } });
  const out = accumulator.run(payload);
  assert.equal(out, payload); // pass-through
  const contents = fs.readFileSync(ACCUM_FILE, 'utf8');
  assert.match(contents, /\/repo\/src\/widget\.ts/);
});

test('accumulator: records an edited CSS path (behavioral)', () => {
  const cssPath = '/repo/src/widget.module.scss';
  const payload = ev({ tool_input: { file_path: cssPath } });
  const out = accumulator.run(payload);
  assert.equal(out, payload); // pass-through
  const contents = fs.readFileSync(ACCUM_FILE, 'utf8');
  assert.match(contents, /\/repo\/src\/widget\.module\.scss/);
});

test('accumulator: records an edited Rust path (behavioral)', () => {
  const rsPath = '/repo/apps/edge/src/main.rs';
  const payload = ev({ tool_input: { file_path: rsPath } });
  const out = accumulator.run(payload);
  assert.equal(out, payload); // pass-through
  const contents = fs.readFileSync(ACCUM_FILE, 'utf8');
  assert.match(contents, /\/repo\/apps\/edge\/src\/main\.rs/);
});

test('accumulator: records an edited Python path (behavioral)', () => {
  const pyPath = '/repo/apps/ai/src/service.py';
  const payload = ev({ tool_input: { file_path: pyPath } });
  const out = accumulator.run(payload);
  assert.equal(out, payload); // pass-through
  const contents = fs.readFileSync(ACCUM_FILE, 'utf8');
  assert.match(contents, /\/repo\/apps\/ai\/src\/service\.py/);
});

test('accumulator: records each file_path from a MultiEdit edits array', () => {
  const payload = ev({
    tool_input: {
      edits: [{ file_path: '/repo/a.jsx' }, { file_path: '/repo/b.txt' }, { file_path: '/repo/c.tsx' }],
    },
  });
  accumulator.run(payload);
  const contents = fs.readFileSync(ACCUM_FILE, 'utf8');
  assert.match(contents, /\/repo\/a\.jsx/);
  assert.match(contents, /\/repo\/c\.tsx/);
  assert.doesNotMatch(contents, /b\.txt/); // non JS/TS ignored
});

// ──────────────────────────────────────────────────────────────────────────
// post-edit-format.js
// Trigger: JS/TS file_path → detect+run formatter. With no formatter config
// (or a missing file) it is a silent, non-blocking pass-through.
// ──────────────────────────────────────────────────────────────────────────

test('format: fails open on non-JSON input', () => {
  const out = format.run('definitely not json');
  assert.equal(out, 'definitely not json');
});

test('format: passes through a non JS/TS file edit unchanged', () => {
  const payload = ev({ tool_input: { file_path: '/repo/notes.md' } });
  assert.equal(format.run(payload), payload);
});

test('format: JS/TS edit on a path with no formatter/config is a non-blocking pass-through', () => {
  // Point at a file inside our isolated temp dir that has no formatter config,
  // so detectFormatter returns nothing and the hook just returns the input.
  const filePath = path.join(TMP_ROOT, 'isolated-source.ts');
  const payload = ev({ tool_input: { file_path: filePath } });
  const out = format.run(payload);
  assert.equal(out, payload);
  assert.ok(isAllow(out));
});
