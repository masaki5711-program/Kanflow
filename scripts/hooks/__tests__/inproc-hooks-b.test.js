'use strict';

/**
 * In-process unit tests for the refactored "load-only" hooks (batch B).
 *
 * Each of these hooks was refactored to export its core logic so it can be
 * exercised WITHOUT spawning a child process or driving stdin. The companion
 * child-process suite (load-only-hooks.test.js / edit-session-hooks.test.js)
 * still proves the spawn behavior is unchanged; this suite drives the exported
 * functions directly so line coverage counts them.
 *
 * Isolation contract:
 *   - ALL filesystem / session state is redirected into os.tmpdir().
 *   - HOME / USERPROFILE / CLAUDE_* env vars are overridden per test and the
 *     ORIGINAL environment is restored in test.after().
 *   - Node built-ins only. Deterministic, no network, synthetic data.
 *   - process.platform branching is honored where a hook guards on it.
 */

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const os = require('node:os');
const fs = require('node:fs');

// ---------------------------------------------------------------------------
// Environment isolation: snapshot the env keys we mutate, point HOME/USERPROFILE
// and the Claude config at a throwaway temp dir, and restore everything after.
// ---------------------------------------------------------------------------

const TMP_HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'ecc-inproc-b-'));
const ENV_KEYS = [
  'HOME',
  'USERPROFILE',
  'CLAUDE_CONFIG_DIR',
  'CLAUDE_PROJECT_DIR',
  'CLAUDE_PLUGIN_ROOT',
  'CLAUDE_SESSION_ID',
  'CLAUDE_TRANSCRIPT_PATH',
  'ECC_HOOK_PROFILE',
  'ECC_DISABLED_HOOKS',
  'ECC_SESSION_RETENTION_DAYS',
];
const ENV_SNAPSHOT = {};

before(() => {
  for (const key of ENV_KEYS) {
    ENV_SNAPSHOT[key] = process.env[key];
  }
  process.env.HOME = TMP_HOME;
  process.env.USERPROFILE = TMP_HOME;
  process.env.CLAUDE_CONFIG_DIR = path.join(TMP_HOME, '.claude');
  // Make sure nothing leaks a real session/transcript into the hooks.
  delete process.env.CLAUDE_SESSION_ID;
  delete process.env.CLAUDE_TRANSCRIPT_PATH;
  delete process.env.ECC_HOOK_PROFILE;
  delete process.env.ECC_DISABLED_HOOKS;
});

after(() => {
  for (const key of ENV_KEYS) {
    if (ENV_SNAPSHOT[key] === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = ENV_SNAPSHOT[key];
    }
  }
  try {
    fs.rmSync(TMP_HOME, { recursive: true, force: true });
  } catch {
    // best-effort cleanup; temp dir will be reclaimed by the OS otherwise
  }
});

// Helper: run a callback with a temporary env override, always restoring after.
function withEnv(overrides, fn) {
  const saved = {};
  for (const [k, v] of Object.entries(overrides)) {
    saved[k] = process.env[k];
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  try {
    return fn();
  } finally {
    for (const [k] of Object.entries(overrides)) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  }
}

// ---------------------------------------------------------------------------
// check-hook-enabled.js — exports checkHookEnabled(hookId, profilesCsv): 'yes'|'no'
// ---------------------------------------------------------------------------

const { checkHookEnabled } = require('../check-hook-enabled');

test('check-hook-enabled: no hookId -> "yes" (default-enabled)', () => {
  assert.equal(checkHookEnabled(undefined), 'yes');
  assert.equal(checkHookEnabled(''), 'yes');
});

test('check-hook-enabled: enabled hook in default (standard) profile -> "yes"', () => {
  withEnv({ ECC_HOOK_PROFILE: undefined, ECC_DISABLED_HOOKS: undefined }, () => {
    assert.equal(checkHookEnabled('pre:bash:mr-validate'), 'yes');
  });
});

test('check-hook-enabled: ECC_DISABLED_HOOKS disables a hook -> "no"', () => {
  withEnv({ ECC_DISABLED_HOOKS: 'pre:bash:mr-validate' }, () => {
    assert.equal(checkHookEnabled('pre:bash:mr-validate'), 'no');
  });
});

test('check-hook-enabled: ECC_HOOK_PROFILE=minimal excludes a strict-only hook -> "no"', () => {
  withEnv({ ECC_HOOK_PROFILE: 'minimal' }, () => {
    assert.equal(checkHookEnabled('pre:bash:tmux-reminder', 'strict'), 'no');
  });
});

test('check-hook-enabled: ECC_HOOK_PROFILE=strict includes a strict hook -> "yes"', () => {
  withEnv({ ECC_HOOK_PROFILE: 'strict' }, () => {
    assert.equal(checkHookEnabled('pre:bash:tmux-reminder', 'strict'), 'yes');
  });
});

// ---------------------------------------------------------------------------
// pre-bash-dev-server-block.js — exports run(rawInput) + helpers.
// run() returns the raw string (allow) or {stderr,exitCode:2,stdout:''} (block).
// The block path is POSIX-only (guarded by process.platform !== 'win32').
// ---------------------------------------------------------------------------

const devBlock = require('../pre-bash-dev-server-block');

test('pre-bash-dev-server-block: dev server command behavior is platform-correct', () => {
  const raw = JSON.stringify({ tool_input: { command: 'npm run dev' } });
  const r = devBlock.run(raw);
  if (process.platform === 'win32') {
    // Windows: block path skipped — pure pass-through (returns raw string).
    assert.equal(r, raw);
  } else {
    // POSIX: blocked with exitCode 2 + a tmux guidance message on stderr.
    assert.equal(typeof r, 'object');
    assert.equal(r.exitCode, 2);
    assert.equal(r.stdout, '');
    assert.match(r.stderr, /BLOCKED|tmux/i);
  }
});

test('pre-bash-dev-server-block: allows a non-dev command (npm test) -> pass-through', () => {
  const raw = JSON.stringify({ tool_input: { command: 'npm test' } });
  assert.equal(devBlock.run(raw), raw);
});

test('pre-bash-dev-server-block: tmux-launched dev server is allowed even on POSIX', () => {
  const raw = JSON.stringify({
    tool_input: { command: 'tmux new-session -d -s dev "npm run dev"' },
  });
  // tmuxLauncher exception means this is never blocked on any platform.
  assert.equal(devBlock.run(raw), raw);
});

test('pre-bash-dev-server-block: fails open (returns raw) on non-JSON input', () => {
  const raw = 'this is not json {[(';
  assert.equal(devBlock.run(raw), raw);
});

test('pre-bash-dev-server-block: fails open on empty input', () => {
  assert.equal(devBlock.run(''), '');
});

test('pre-bash-dev-server-block: helper normalizeCommandWord strips ext + lowercases', () => {
  assert.equal(devBlock.normalizeCommandWord('NPM.cmd'), 'npm');
  assert.equal(devBlock.normalizeCommandWord('/usr/bin/pnpm'), 'pnpm');
  assert.equal(devBlock.normalizeCommandWord(''), '');
});

test('pre-bash-dev-server-block: helper getLeadingCommandWord skips env/sudo wrappers', () => {
  assert.equal(devBlock.getLeadingCommandWord('sudo npm run dev'), 'npm');
  assert.equal(devBlock.getLeadingCommandWord('FOO=bar npm test'), 'npm');
});

// ---------------------------------------------------------------------------
// session-start.js — exports pure helpers + async main(). The helpers carry the
// bulk of the branch logic; main() is exercised once with an isolated HOME.
// ---------------------------------------------------------------------------

const sessionStart = require('../session-start');




test('session-start: selectMatchingSession returns null on empty list', () => {
  assert.equal(sessionStart.selectMatchingSession([], process.cwd(), 'proj'), null);
});

test('session-start: selectMatchingSession prefers exact worktree match', () => {
  const dir = fs.mkdtempSync(path.join(TMP_HOME, 'ss-match-'));
  const cwd = process.cwd();
  const a = path.join(dir, 'a-session.tmp');
  const b = path.join(dir, 'b-session.tmp');
  fs.writeFileSync(a, '# S\n**Project:** other\n**Worktree:** /nope/elsewhere\n');
  fs.writeFileSync(b, `# S\n**Project:** proj\n**Worktree:** ${cwd}\n`);
  const sessions = [
    { path: a, mtime: 2 },
    { path: b, mtime: 1 },
  ];
  const result = sessionStart.selectMatchingSession(sessions, cwd, 'proj');
  assert.ok(result);
  assert.equal(result.matchReason, 'worktree');
  assert.equal(result.session.path, b);
});

test('session-start: selectMatchingSession falls back to project then recency', () => {
  const dir = fs.mkdtempSync(path.join(TMP_HOME, 'ss-proj-'));
  const a = path.join(dir, 'a-session.tmp');
  fs.writeFileSync(a, '# S\n**Project:** myproj\n**Worktree:** /not/here\n');
  const sessions = [{ path: a, mtime: 1 }];
  const result = sessionStart.selectMatchingSession(sessions, '/some/cwd', 'myproj');
  assert.ok(result);
  assert.equal(result.matchReason, 'project');
});

test('session-start: getSessionRetentionDays honors override + bad values', () => {
  withEnv({ ECC_SESSION_RETENTION_DAYS: '5' }, () => {
    assert.equal(sessionStart.getSessionRetentionDays(), 5);
  });
  withEnv({ ECC_SESSION_RETENTION_DAYS: 'garbage' }, () => {
    assert.equal(sessionStart.getSessionRetentionDays(), 30);
  });
  withEnv({ ECC_SESSION_RETENTION_DAYS: undefined }, () => {
    assert.equal(sessionStart.getSessionRetentionDays(), 30);
  });
});

test('session-start: pruneExpiredSessions removes old session files only', () => {
  const dir = fs.mkdtempSync(path.join(TMP_HOME, 'ss-prune-'));
  const old = path.join(dir, 'old-session.tmp');
  const fresh = path.join(dir, 'fresh-session.tmp');
  fs.writeFileSync(old, 'old');
  fs.writeFileSync(fresh, 'fresh');
  // Backdate "old" by 40 days.
  const past = Date.now() - 40 * 24 * 60 * 60 * 1000;
  fs.utimesSync(old, past / 1000, past / 1000);
  const removed = sessionStart.pruneExpiredSessions([dir], 30);
  assert.equal(removed, 1);
  assert.equal(fs.existsSync(old), false);
  assert.equal(fs.existsSync(fresh), true);
});

test('session-start: main() runs and writes a SessionStart payload to stdout', async () => {
  // Silence the payload write so it does not pollute the test reporter.
  const origWrite = process.stdout.write;
  let captured = '';
  process.stdout.write = (chunk, ...rest) => {
    captured += String(chunk);
    const cb = rest.find(a => typeof a === 'function');
    if (cb) cb();
    return true;
  };
  try {
    await sessionStart.main();
  } finally {
    process.stdout.write = origWrite;
  }
  // main() emits a JSON envelope with hookSpecificOutput.hookEventName.
  const payload = JSON.parse(captured);
  assert.equal(payload.hookSpecificOutput.hookEventName, 'SessionStart');
});

// ---------------------------------------------------------------------------
// session-end.js — exports async main(stdinData) + summary builders.
// ---------------------------------------------------------------------------

const sessionEnd = require('../session-end');

test('session-end: extractSessionSummary returns null when transcript missing', () => {
  assert.equal(sessionEnd.extractSessionSummary(path.join(TMP_HOME, 'nope.jsonl')), null);
});

test('session-end: extractSessionSummary pulls user messages + tools + files', () => {
  const f = path.join(TMP_HOME, `transcript-${Date.now()}.jsonl`);
  const lines = [
    JSON.stringify({ type: 'user', message: { role: 'user', content: 'Refactor hooks' } }),
    JSON.stringify({
      type: 'assistant',
      message: {
        content: [
          { type: 'tool_use', name: 'Edit', input: { file_path: '/tmp/x.js' } },
        ],
      },
    }),
    'this-line-is-not-json',
  ];
  fs.writeFileSync(f, lines.join('\n'));
  const summary = sessionEnd.extractSessionSummary(f);
  assert.ok(summary);
  assert.deepEqual(summary.userMessages, ['Refactor hooks']);
  assert.ok(summary.toolsUsed.includes('Edit'));
  assert.ok(summary.filesModified.includes('/tmp/x.js'));
});

test('session-end: buildSummaryBlock wraps section in ECC markers', () => {
  const summary = {
    userMessages: ['do x'],
    toolsUsed: ['Edit'],
    filesModified: ['a.js'],
    totalMessages: 1,
  };
  const block = sessionEnd.buildSummaryBlock(summary);
  assert.match(block, /ECC:SUMMARY:START/);
  assert.match(block, /ECC:SUMMARY:END/);
  assert.match(block, /do x/);
});

test('session-end: main() creates a session file with isolated HOME', async () => {
  // Provide a transcript so a summary is generated; HOME is already isolated.
  const transcript = path.join(TMP_HOME, `t-end-${Date.now()}.jsonl`);
  fs.writeFileSync(
    transcript,
    JSON.stringify({ type: 'user', content: 'session-end main test' }) + '\n'
  );
  const sessionFile = await withEnv({ CLAUDE_SESSION_ID: 'inproc-end-1' }, () =>
    sessionEnd.main(JSON.stringify({ transcript_path: transcript }))
  );
  assert.equal(typeof sessionFile, 'string');
  assert.ok(fs.existsSync(sessionFile), `expected session file at ${sessionFile}`);
  const content = fs.readFileSync(sessionFile, 'utf8');
  assert.match(content, /\*\*Project:\*\*/);
});

test('session-end: main() fails open on non-JSON stdin (no throw)', async () => {
  const result = await sessionEnd.main('not json {[(');
  assert.equal(typeof result, 'string');
});

// ---------------------------------------------------------------------------
// pre-compact.js — exports async main(); writes a compaction log line.
// ---------------------------------------------------------------------------

const preCompact = require('../pre-compact');

test('pre-compact: main() appends to the compaction log under isolated HOME', async () => {
  const logPath = await preCompact.main();
  assert.equal(typeof logPath, 'string');
  assert.ok(fs.existsSync(logPath), `expected compaction log at ${logPath}`);
  const content = fs.readFileSync(logPath, 'utf8');
  assert.match(content, /Context compaction triggered/);
});

// ---------------------------------------------------------------------------
// session-start-bootstrap.js — exports resolvePluginRoot / hasRunnerRoot.
// ---------------------------------------------------------------------------

const bootstrap = require('../session-start-bootstrap');

test('session-start-bootstrap: hasRunnerRoot true when runner exists, false otherwise', () => {
  // The real repo root (two levels up from scripts/hooks) contains the runner.
  const repoRoot = path.resolve(__dirname, '..', '..', '..');
  assert.equal(bootstrap.hasRunnerRoot(repoRoot), true);
  assert.equal(bootstrap.hasRunnerRoot(TMP_HOME), false);
  assert.equal(bootstrap.hasRunnerRoot(''), false);
  assert.equal(bootstrap.hasRunnerRoot(undefined), false);
});

test('session-start-bootstrap: resolvePluginRoot honors CLAUDE_PLUGIN_ROOT', () => {
  const repoRoot = path.resolve(__dirname, '..', '..', '..');
  withEnv({ CLAUDE_PLUGIN_ROOT: repoRoot }, () => {
    assert.equal(bootstrap.resolvePluginRoot(), path.resolve(repoRoot));
  });
});

test('session-start-bootstrap: resolvePluginRoot falls back to ~/.claude when unresolved', () => {
  // With an isolated HOME that has no runner anywhere, it returns <home>/.claude.
  withEnv({ CLAUDE_PLUGIN_ROOT: undefined, HOME: TMP_HOME, USERPROFILE: TMP_HOME }, () => {
    const root = bootstrap.resolvePluginRoot();
    assert.equal(root, path.join(TMP_HOME, '.claude'));
  });
});
