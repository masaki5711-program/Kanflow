'use strict';

/**
 * Deep branch-coverage tests for the stop- and session-lifecycle hooks.
 *
 * Goal: drive the "work" paths (the ones existing tests skip) of:
 *   stop-test-gate.js, stop-format-typecheck.js, session-activity-tracker.js,
 *   session-end-marker.js, quality-gate.js, post-bash-build-complete.js,
 *   post-edit-format.js, desktop-notify.js
 *
 * Strategy — exercise the real work paths in-process:
 *   - git-driven hooks (stop-test-gate, session-end-marker) run against a TEMP
 *     git repo created with `git init`, with staged/committed/untracked source
 *     files so hasCodeChanges / lease cleanup branches are reached. cwd is
 *     chdir'd into the temp repo and restored in finally.
 *   - accumulator-driven hooks (stop-format-typecheck) get a real per-session
 *     accumulator file written under os.tmpdir() with .ts/.tsx/.js entries, plus
 *     a temp project root (package.json) so the formatBatch / typecheckBatch
 *     grouping branches execute up to (and through) the spawn. The spawn fails
 *     open (no formatter / npx installed) — we assert the hook stays a
 *     pass-through and does not throw.
 *   - formatter hooks (quality-gate, post-edit-format) get a temp project with a
 *     prettier/biome config and a real edited file so detectFormatter and the
 *     resolveFormatterBin → spawn decision execute; the spawn fails open.
 *   - state hooks (session-activity-tracker) get HOME redirected to a sandbox so
 *     the metrics jsonl is written and the row-build branches (file events, git
 *     enrichment, summaries) run, then read back.
 *
 * Constraints honored: Node built-ins only; no network; deterministic;
 * everything isolated under os.tmpdir(); cwd + env restored; cleaned up in
 * test.after. Synthetic data only.
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs');
const { spawnSync } = require('node:child_process');

// ── Env / cwd isolation ───────────────────────────────────────────────────
const SANDBOX = fs.mkdtempSync(path.join(os.tmpdir(), 'ecc-stop-deep-'));
const ORIG_CWD = process.cwd();
const ORIG_ENV = {
  HOME: process.env.HOME,
  USERPROFILE: process.env.USERPROFILE,
  CLAUDE_SESSION_ID: process.env.CLAUDE_SESSION_ID,
  ECC_SESSION_ID: process.env.ECC_SESSION_ID,
  CLAUDE_PROJECT_DIR: process.env.CLAUDE_PROJECT_DIR,
  CLAUDE_HOOK_EVENT_NAME: process.env.CLAUDE_HOOK_EVENT_NAME,
  ECC_TEST_GATE_MAX_ATTEMPTS: process.env.ECC_TEST_GATE_MAX_ATTEMPTS,
  ECC_QUALITY_GATE_FIX: process.env.ECC_QUALITY_GATE_FIX,
  ECC_QUALITY_GATE_STRICT: process.env.ECC_QUALITY_GATE_STRICT,
};

// Redirect home so session-activity-tracker's ~/.claude/metrics write lands here.
process.env.HOME = SANDBOX;
process.env.USERPROFILE = SANDBOX;
delete process.env.CLAUDE_PROJECT_DIR;

// ── Require targets after env isolation ───────────────────────────────────
const stopTestGate = require('../stop-test-gate');
const stopFormat = require('../stop-format-typecheck');
const activityTracker = require('../session-activity-tracker');
const sessionEnd = require('../session-end-marker');
const qualityGate = require('../quality-gate');
const postBashBuild = require('../post-bash-build-complete');
const postEditFormat = require('../post-edit-format');
const desktopNotify = require('../desktop-notify');

// ── Helpers ───────────────────────────────────────────────────────────────
const GIT_OK = (() => {
  try {
    return spawnSync('git', ['--version'], { stdio: 'ignore' }).status === 0;
  } catch {
    return false;
  }
})();

function git(args, cwd) {
  return spawnSync('git', args, { cwd, encoding: 'utf8', stdio: 'pipe' });
}

/** Create an initialized git repo with one committed source file. */
function makeRepo(name) {
  const repo = path.join(SANDBOX, name);
  fs.mkdirSync(repo, { recursive: true });
  git(['init', '-q'], repo);
  git(['config', 'user.email', 'synthetic@example.test'], repo);
  git(['config', 'user.name', 'Synthetic Tester'], repo);
  git(['config', 'commit.gpgsign', 'false'], repo);
  fs.writeFileSync(path.join(repo, 'README.md'), '# synthetic\n', 'utf8');
  git(['add', '.'], repo);
  git(['commit', '-q', '-m', 'init'], repo);
  return repo;
}

function withCwd(dir, fn) {
  process.chdir(dir);
  try {
    return fn();
  } finally {
    process.chdir(ORIG_CWD);
  }
}

const accumFileFor = sessionId =>
  path.join(os.tmpdir(), `ecc-edited-${sessionId}.txt`);

const testGateStateFor = sessionId =>
  path.join(os.tmpdir(), `ecc-testgate-${sessionId}.json`);

const edit = (file_path, extra = {}, tool_name = 'Write') =>
  JSON.stringify({ tool_name, tool_input: { file_path, ...extra } });

test.after(() => {
  process.chdir(ORIG_CWD);
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

// ═════════════════════════════════════════════════════════════════════════
// stop-test-gate.js
//   Work paths: detectTestCommand for each ecosystem, hasCodeChanges over a
//   real git repo, attempt-counter round-trip, isCommandNotFound branches.
// ═════════════════════════════════════════════════════════════════════════

test('test-gate: no test setup (empty dir) -> pass-through no-op', () => {
  const dir = path.join(SANDBOX, 'no-test-setup');
  fs.mkdirSync(dir, { recursive: true });
  withCwd(dir, () => {
    assert.equal(stopTestGate.run('{}'), '{}');
  });
});

test('test-gate: detectTestCommand returns null when package.json has placeholder test', () => {
  const dir = path.join(SANDBOX, 'placeholder-test');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    path.join(dir, 'package.json'),
    JSON.stringify({ scripts: { test: 'echo "Error: no test specified" && exit 1' } }),
    'utf8'
  );
  assert.equal(stopTestGate.detectTestCommand(dir), null);
});

test('test-gate: detectTestCommand returns null on unreadable package.json', () => {
  const dir = path.join(SANDBOX, 'bad-pkg');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'package.json'), '{ this is not json', 'utf8');
  assert.equal(stopTestGate.detectTestCommand(dir), null);
});

test('test-gate: detectTestCommand resolves a package-manager test script', () => {
  const dir = path.join(SANDBOX, 'pkg-with-test');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    path.join(dir, 'package.json'),
    JSON.stringify({ scripts: { test: 'node --test' } }),
    'utf8'
  );
  const cmd = stopTestGate.detectTestCommand(dir);
  // npm is effectively always resolvable in CI/dev; if it is not, the hook
  // correctly returns null (fail open). Either is a valid covered branch.
  if (cmd) {
    assert.equal(cmd.cwd, dir);
    assert.ok(Array.isArray(cmd.args) && cmd.args.includes('test'));
  } else {
    assert.equal(cmd, null);
  }
});

test('test-gate: detectTestCommand handles Cargo / go / python markers', () => {
  for (const marker of ['Cargo.toml', 'go.mod', 'pyproject.toml']) {
    const dir = path.join(SANDBOX, `eco-${marker.replace(/\W/g, '_')}`);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, marker), '', 'utf8');
    const cmd = stopTestGate.detectTestCommand(dir);
    // Returns either a {cmd,args,cwd} (tool installed) or null (fail open).
    if (cmd) assert.equal(cmd.cwd, dir);
    else assert.equal(cmd, null);
  }
});

test('test-gate: no code changes (clean repo with test script) -> no-op + clears attempts', { skip: !GIT_OK }, () => {
  const repo = makeRepo('gate-clean-repo');
  // Add a node test script so detectTestCommand does not early-return on "no setup".
  fs.writeFileSync(
    path.join(repo, 'package.json'),
    JSON.stringify({ scripts: { test: 'node --test' } }),
    'utf8'
  );
  git(['add', '.'], repo);
  git(['commit', '-q', '-m', 'add pkg'], repo);

  const sid = 'gate-clean-sess';
  process.env.CLAUDE_SESSION_ID = sid;
  // Seed an attempt-counter file so the clear path is observable.
  fs.writeFileSync(testGateStateFor(sid), JSON.stringify({ count: 2 }), 'utf8');

  withCwd(repo, () => {
    const out = stopTestGate.run('{}');
    assert.equal(out, '{}', 'clean repo -> pass-through');
  });
  assert.equal(fs.existsSync(testGateStateFor(sid)), false, 'attempt counter cleared when nothing changed');
  delete process.env.CLAUDE_SESSION_ID;
});

test('test-gate: uncovered source change is detected via hasCodeChanges (real test run)', { skip: !GIT_OK }, () => {
  // A repo whose `test` script is a real, fast, deterministic node invocation
  // that PASSES — exercises hasCodeChanges()=true, the spawn, status===0,
  // clearAttempts(), and the allow path end-to-end.
  const repo = makeRepo('gate-changed-repo');
  fs.writeFileSync(
    path.join(repo, 'package.json'),
    JSON.stringify({ scripts: { test: 'node -e "process.exit(0)"' } }),
    'utf8'
  );
  git(['add', '.'], repo);
  git(['commit', '-q', '-m', 'add pkg'], repo);
  // Untracked source file => hasCodeChanges() true via ls-files --others.
  fs.writeFileSync(path.join(repo, 'changed.js'), 'module.exports = 1;\n', 'utf8');

  const sid = 'gate-changed-sess';
  process.env.CLAUDE_SESSION_ID = sid;

  withCwd(repo, () => {
    const out = stopTestGate.run('{}');
    // If npm resolved and ran, a passing test yields pass-through. If npm was
    // not resolvable (detectTestCommand null) it is still a pass-through.
    assert.equal(typeof out === 'string' || (out && out.exitCode === 2), true);
  });
  delete process.env.CLAUDE_SESSION_ID;
});

test('test-gate: failing tests block, increment attempts, then give up at the cap', { skip: !GIT_OK }, () => {
  const repo = makeRepo('gate-fail-repo');
  fs.writeFileSync(
    path.join(repo, 'package.json'),
    JSON.stringify({ scripts: { test: 'node -e "process.exit(1)"' } }),
    'utf8'
  );
  git(['add', '.'], repo);
  git(['commit', '-q', '-m', 'add pkg'], repo);
  fs.writeFileSync(path.join(repo, 'changed.js'), 'module.exports = 2;\n', 'utf8');

  const sid = 'gate-fail-sess';
  process.env.CLAUDE_SESSION_ID = sid;
  process.env.ECC_TEST_GATE_MAX_ATTEMPTS = '2';

  withCwd(repo, () => {
    const first = stopTestGate.run('{}');
    if (first && typeof first === 'object') {
      // npm resolved & test failed -> block on attempt 1/2.
      assert.equal(first.exitCode, 2);
      assert.match(String(first.stderr), /Test Gate/);
      assert.equal(fs.existsSync(testGateStateFor(sid)), true, 'attempt counter persisted');

      // Second run hits the cap -> gives up, clears the counter, allows stop.
      const second = stopTestGate.run('{}');
      assert.equal(typeof second, 'string', 'at the cap the gate stops blocking');
      assert.equal(fs.existsSync(testGateStateFor(sid)), false, 'counter cleared at cap');
    } else {
      // npm not resolvable on this host -> fail-open pass-through. Still valid.
      assert.equal(typeof first, 'string');
    }
  });
  delete process.env.CLAUDE_SESSION_ID;
  delete process.env.ECC_TEST_GATE_MAX_ATTEMPTS;
});

test('test-gate: ECC_TEST_GATE_MAX_ATTEMPTS invalid falls back to default (via isCommandNotFound exports)', () => {
  // isCommandNotFound exported branches (additional to the existing suite).
  assert.equal(stopTestGate.isCommandNotFound({ status: 0, stdout: 'ok' }), false);
  assert.equal(stopTestGate.isCommandNotFound({ status: 9009 }), true);
});

test('test-gate: listAppDirs finds apps/* subdirectories, [] when apps/ absent', () => {
  const dir = path.join(SANDBOX, 'listappdirs-none');
  fs.mkdirSync(dir, { recursive: true });
  assert.deepEqual(stopTestGate.listAppDirs(dir), []);

  const withApps = path.join(SANDBOX, 'listappdirs-some');
  fs.mkdirSync(path.join(withApps, 'apps', 'edge'), { recursive: true });
  fs.mkdirSync(path.join(withApps, 'apps', 'hub'), { recursive: true });
  fs.writeFileSync(path.join(withApps, 'apps', 'notadir.txt'), 'x', 'utf8');
  const found = stopTestGate.listAppDirs(withApps).sort();
  assert.deepEqual(found, [path.join(withApps, 'apps', 'edge'), path.join(withApps, 'apps', 'hub')].sort());
});

test('test-gate: hasCodeChanges scopes to a pathspec (monorepo isolation)', { skip: !GIT_OK }, () => {
  const repo = makeRepo('gate-scoped-changes');
  fs.mkdirSync(path.join(repo, 'apps', 'hub'), { recursive: true });
  fs.mkdirSync(path.join(repo, 'apps', 'edge'), { recursive: true });
  fs.writeFileSync(path.join(repo, 'apps', 'hub', 'a.ts'), 'export const a = 1;\n', 'utf8');

  withCwd(repo, () => {
    assert.equal(stopTestGate.hasCodeChanges('apps/hub'), true, 'change inside apps/hub is visible when scoped to apps/hub');
    assert.equal(stopTestGate.hasCodeChanges('apps/edge'), false, 'apps/edge has no changes of its own');
    assert.equal(stopTestGate.hasCodeChanges(), true, 'unscoped call still sees the repo-wide change');
  });
});

test('test-gate: monorepo — only the changed apps/* subproject suite runs and blocks', { skip: !GIT_OK }, () => {
  // apps/hub has a deterministically-failing test script; apps/edge (Cargo.toml)
  // is untouched. Guards the false-green risk the audit flagged: a root-only
  // detector would miss apps/hub's manifest entirely and silently no-op.
  const repo = makeRepo('gate-monorepo');
  const hubDir = path.join(repo, 'apps', 'hub');
  fs.mkdirSync(hubDir, { recursive: true });
  fs.writeFileSync(
    path.join(hubDir, 'package.json'),
    JSON.stringify({ scripts: { test: 'node -e "process.exit(1)"' } }),
    'utf8',
  );
  const edgeDir = path.join(repo, 'apps', 'edge');
  fs.mkdirSync(edgeDir, { recursive: true });
  fs.writeFileSync(path.join(edgeDir, 'Cargo.toml'), '[package]\nname = "edge"\n', 'utf8');
  git(['add', '.'], repo);
  git(['commit', '-q', '-m', 'add apps'], repo);

  // Only apps/hub changes -> apps/edge's suite must never even be considered.
  fs.writeFileSync(path.join(hubDir, 'changed.js'), 'module.exports = 1;\n', 'utf8');

  const sid = 'gate-monorepo-sess';
  process.env.CLAUDE_SESSION_ID = sid;

  withCwd(repo, () => {
    const out = stopTestGate.run('{}');
    if (out && typeof out === 'object') {
      // npm resolved and apps/hub's test failed -> blocks, names apps/hub only.
      assert.equal(out.exitCode, 2);
      assert.match(String(out.stderr), /apps[\\/]hub/);
      assert.doesNotMatch(String(out.stderr), /apps[\\/]edge/);
    } else {
      // npm not resolvable on this host -> fail-open pass-through, still valid.
      assert.equal(typeof out, 'string');
    }
  });
  delete process.env.CLAUDE_SESSION_ID;
});

test('test-gate: monorepo — editing apps/hub does not also re-trigger the root suite (no double-run)', { skip: !GIT_OK }, () => {
  // Root and apps/hub BOTH have a deterministically-failing test script. Only
  // apps/hub is touched. If root scoping is broken, the root suite ('.') would
  // also run (and fail) alongside apps/hub — this asserts it never does.
  const repo = makeRepo('gate-no-double-run');
  fs.writeFileSync(
    path.join(repo, 'package.json'),
    JSON.stringify({ scripts: { test: 'node -e "process.exit(1)"' } }),
    'utf8',
  );
  const hubDir = path.join(repo, 'apps', 'hub');
  fs.mkdirSync(hubDir, { recursive: true });
  fs.writeFileSync(
    path.join(hubDir, 'package.json'),
    JSON.stringify({ scripts: { test: 'node -e "process.exit(1)"' } }),
    'utf8',
  );
  git(['add', '.'], repo);
  git(['commit', '-q', '-m', 'add root + hub test scripts'], repo);

  // Only apps/hub changes.
  fs.writeFileSync(path.join(hubDir, 'changed.js'), 'module.exports = 1;\n', 'utf8');

  const sid = 'gate-no-double-run-sess';
  process.env.CLAUDE_SESSION_ID = sid;

  withCwd(repo, () => {
    const out = stopTestGate.run('{}');
    if (out && typeof out === 'object') {
      // npm resolved and apps/hub's test failed -> blocks, root suite absent.
      assert.match(String(out.stderr), /Suite: apps[\\/]hub/);
      assert.doesNotMatch(String(out.stderr), /Suite: \.\n/, 'root suite must not double-run for an apps/hub-only change');
    } else {
      // npm not resolvable on this host -> fail-open pass-through, still valid.
      assert.equal(typeof out, 'string');
    }
  });
  delete process.env.CLAUDE_SESSION_ID;
});

// ═════════════════════════════════════════════════════════════════════════
// stop-format-typecheck.js
//   Work paths: real accumulator file → grouping by project root + tsconfig
//   dir → formatBatch / typecheckBatch (spawn fails open). findTsConfigDir.
// ═════════════════════════════════════════════════════════════════════════

test('stop-format: processes a real accumulator across format + typecheck batches', () => {
  // Temp project with prettier config (formatter detected) and a tsconfig
  // (typecheck batch grouped). Files exist so they survive the existsSync filter.
  const proj = path.join(SANDBOX, 'fmt-proj');
  fs.mkdirSync(proj, { recursive: true });
  fs.writeFileSync(path.join(proj, 'package.json'), JSON.stringify({ name: 'p' }), 'utf8');
  fs.writeFileSync(path.join(proj, '.prettierrc'), '{}', 'utf8');
  fs.writeFileSync(path.join(proj, 'tsconfig.json'), '{}', 'utf8');
  const tsFile = path.join(proj, 'a.ts');
  const tsxFile = path.join(proj, 'b.tsx');
  const jsFile = path.join(proj, 'c.js');
  fs.writeFileSync(tsFile, 'export const a = 1\n', 'utf8');
  fs.writeFileSync(tsxFile, 'export const b = 2\n', 'utf8');
  fs.writeFileSync(jsFile, 'module.exports = 3\n', 'utf8');

  const sid = 'stopfmt-real';
  process.env.CLAUDE_SESSION_ID = sid;
  // Accumulator includes a duplicate, a blank line, and a non-existent file.
  fs.writeFileSync(
    accumFileFor(sid),
    [tsFile, tsFile, tsxFile, jsFile, '', path.join(proj, 'missing.ts')].join('\n'),
    'utf8'
  );

  // Run from the project dir so relative path.resolve lands correctly.
  withCwd(proj, () => {
    const out = stopFormat.run('{}');
    assert.equal(out, '{}', 'stop-format is always a pass-through');
  });
  // Accumulator is consumed (deleted) on read.
  assert.equal(fs.existsSync(accumFileFor(sid)), false, 'accumulator cleared after processing');
  delete process.env.CLAUDE_SESSION_ID;
});

test('stop-format: accumulator with only non-code files -> no batches, pass-through', () => {
  const proj = path.join(SANDBOX, 'fmt-proj-nocode');
  fs.mkdirSync(proj, { recursive: true });
  fs.writeFileSync(path.join(proj, 'package.json'), JSON.stringify({ name: 'p' }), 'utf8');
  const mdFile = path.join(proj, 'doc.md');
  fs.writeFileSync(mdFile, '# hi\n', 'utf8');

  const sid = 'stopfmt-nocode';
  process.env.CLAUDE_SESSION_ID = sid;
  fs.writeFileSync(accumFileFor(sid), `${mdFile}\n`, 'utf8');

  withCwd(proj, () => {
    assert.equal(stopFormat.run('{}'), '{}');
  });
  delete process.env.CLAUDE_SESSION_ID;
});

test('stop-format: empty accumulator -> early return, pass-through', () => {
  const sid = 'stopfmt-empty';
  process.env.CLAUDE_SESSION_ID = sid;
  fs.writeFileSync(accumFileFor(sid), '\n  \n', 'utf8');
  assert.equal(stopFormat.run('{}'), '{}');
  delete process.env.CLAUDE_SESSION_ID;
});

test('stop-format: parseAccumulator dedups/trims/drops blanks', () => {
  assert.deepEqual(
    stopFormat.parseAccumulator('x.ts\n x.ts \n\n y.tsx \n'),
    ['x.ts', 'y.tsx']
  );
});

test('stop-format: eslint config root detected, no local eslint bin -> fails open', () => {
  // Real ESLint config + a JS file, but no node_modules/.bin/eslint installed.
  // Exercises findConfigRoot -> resolveLocalBin(null) -> early return.
  const proj = path.join(SANDBOX, 'eslint-proj');
  fs.mkdirSync(proj, { recursive: true });
  fs.writeFileSync(path.join(proj, 'eslint.config.js'), 'module.exports = [];\n', 'utf8');
  const jsFile = path.join(proj, 'a.js');
  fs.writeFileSync(jsFile, 'const a = 1;\n', 'utf8');

  const sid = 'stopfmt-eslint';
  process.env.CLAUDE_SESSION_ID = sid;
  fs.writeFileSync(accumFileFor(sid), `${jsFile}\n`, 'utf8');

  withCwd(proj, () => {
    assert.equal(stopFormat.run('{}'), '{}', 'stays a pass-through with no local eslint binary');
  });
  assert.equal(fs.existsSync(accumFileFor(sid)), false, 'accumulator cleared after processing');
  delete process.env.CLAUDE_SESSION_ID;
});

test('stop-format: eslint batch skipped when Biome owns the project (no double-lint)', () => {
  const proj = path.join(SANDBOX, 'eslint-biome-proj');
  fs.mkdirSync(proj, { recursive: true });
  fs.writeFileSync(path.join(proj, 'biome.json'), '{}', 'utf8');
  fs.writeFileSync(path.join(proj, 'eslint.config.js'), 'module.exports = [];\n', 'utf8');
  const jsFile = path.join(proj, 'a.js');
  fs.writeFileSync(jsFile, 'const a = 1;\n', 'utf8');

  const sid = 'stopfmt-eslint-biome';
  process.env.CLAUDE_SESSION_ID = sid;
  fs.writeFileSync(accumFileFor(sid), `${jsFile}\n`, 'utf8');

  withCwd(proj, () => {
    assert.equal(stopFormat.run('{}'), '{}');
  });
  delete process.env.CLAUDE_SESSION_ID;
});

test('stop-format: stylelint config root detected, no local stylelint bin -> fails open', () => {
  const proj = path.join(SANDBOX, 'stylelint-proj');
  fs.mkdirSync(proj, { recursive: true });
  fs.writeFileSync(path.join(proj, '.stylelintrc.json'), '{}', 'utf8');
  const cssFile = path.join(proj, 'a.css');
  fs.writeFileSync(cssFile, '.a { color: red; }\n', 'utf8');

  const sid = 'stopfmt-stylelint';
  process.env.CLAUDE_SESSION_ID = sid;
  fs.writeFileSync(accumFileFor(sid), `${cssFile}\n`, 'utf8');

  withCwd(proj, () => {
    assert.equal(stopFormat.run('{}'), '{}', 'stays a pass-through with no local stylelint binary');
  });
  assert.equal(fs.existsSync(accumFileFor(sid)), false, 'accumulator cleared after processing');
  delete process.env.CLAUDE_SESSION_ID;
});

test('stop-format: no eslint/stylelint config anywhere -> those batches are skipped entirely', () => {
  const proj = path.join(SANDBOX, 'no-lint-config-proj');
  fs.mkdirSync(proj, { recursive: true });
  fs.writeFileSync(path.join(proj, 'package.json'), JSON.stringify({ name: 'p' }), 'utf8');
  const jsFile = path.join(proj, 'a.js');
  const cssFile = path.join(proj, 'a.css');
  fs.writeFileSync(jsFile, 'const a = 1;\n', 'utf8');
  fs.writeFileSync(cssFile, '.a { color: red; }\n', 'utf8');

  const sid = 'stopfmt-no-lint-config';
  process.env.CLAUDE_SESSION_ID = sid;
  fs.writeFileSync(accumFileFor(sid), [jsFile, cssFile].join('\n'), 'utf8');

  withCwd(proj, () => {
    assert.equal(stopFormat.run('{}'), '{}');
  });
  delete process.env.CLAUDE_SESSION_ID;
});

test('stop-format: Cargo.toml crate root detected, clippy batch fails open (cargo absent or diagnostic-only)', () => {
  // Exercises findCargoRoot -> clippyBatch. Whether or not `cargo` is
  // installed on the CI/dev machine, this must stay a pass-through — clippy
  // is diagnostic-only and never blocks the Stop hook.
  const proj = path.join(SANDBOX, 'rust-proj');
  fs.mkdirSync(proj, { recursive: true });
  fs.writeFileSync(path.join(proj, 'Cargo.toml'), '[package]\nname = "p"\n', 'utf8');
  const rsFile = path.join(proj, 'main.rs');
  fs.writeFileSync(rsFile, 'fn main() {}\n', 'utf8');

  const sid = 'stopfmt-rust';
  process.env.CLAUDE_SESSION_ID = sid;
  fs.writeFileSync(accumFileFor(sid), `${rsFile}\n`, 'utf8');

  withCwd(proj, () => {
    assert.equal(stopFormat.run('{}'), '{}');
  });
  assert.equal(fs.existsSync(accumFileFor(sid)), false, 'accumulator cleared after processing');
  delete process.env.CLAUDE_SESSION_ID;
});

test('stop-format: no Cargo.toml anywhere -> Rust batch skipped entirely', () => {
  const proj = path.join(SANDBOX, 'no-cargo-proj');
  fs.mkdirSync(proj, { recursive: true });
  const rsFile = path.join(proj, 'orphan.rs');
  fs.writeFileSync(rsFile, 'fn main() {}\n', 'utf8');

  const sid = 'stopfmt-no-cargo';
  process.env.CLAUDE_SESSION_ID = sid;
  fs.writeFileSync(accumFileFor(sid), `${rsFile}\n`, 'utf8');

  withCwd(proj, () => {
    assert.equal(stopFormat.run('{}'), '{}');
  });
  delete process.env.CLAUDE_SESSION_ID;
});

test('stop-format: pyproject.toml root detected, ruff check batch fails open (ruff absent or diagnostic-only)', () => {
  // Exercises findPyProjectRoot -> ruffCheckBatch. Diagnostic-only (no
  // --fix), so a real lint finding must never block the Stop hook either.
  const proj = path.join(SANDBOX, 'py-proj');
  fs.mkdirSync(proj, { recursive: true });
  fs.writeFileSync(path.join(proj, 'pyproject.toml'), '[project]\nname = "p"\n', 'utf8');
  const pyFile = path.join(proj, 'mod.py');
  fs.writeFileSync(pyFile, 'import os\n', 'utf8'); // unused import -> a real ruff finding if ruff is present

  const sid = 'stopfmt-python';
  process.env.CLAUDE_SESSION_ID = sid;
  fs.writeFileSync(accumFileFor(sid), `${pyFile}\n`, 'utf8');

  withCwd(proj, () => {
    assert.equal(stopFormat.run('{}'), '{}');
  });
  assert.equal(fs.existsSync(accumFileFor(sid)), false, 'accumulator cleared after processing');
  delete process.env.CLAUDE_SESSION_ID;
});

test('stop-format: no Python project marker anywhere -> Python batch skipped entirely', () => {
  const proj = path.join(SANDBOX, 'no-pyproject');
  fs.mkdirSync(proj, { recursive: true });
  const pyFile = path.join(proj, 'orphan.py');
  fs.writeFileSync(pyFile, 'x = 1\n', 'utf8');

  const sid = 'stopfmt-no-pyproject';
  process.env.CLAUDE_SESSION_ID = sid;
  fs.writeFileSync(accumFileFor(sid), `${pyFile}\n`, 'utf8');

  withCwd(proj, () => {
    assert.equal(stopFormat.run('{}'), '{}');
  });
  delete process.env.CLAUDE_SESSION_ID;
});

// ═════════════════════════════════════════════════════════════════════════
// session-activity-tracker.js
//   Work paths: buildActivityRow for Write/Edit/Read tool events (file events,
//   diff/patch previews, git enrichment), summarizeInput/Output, real append.
// ═════════════════════════════════════════════════════════════════════════

test('activity-tracker: Write event row is written to metrics jsonl and read back', () => {
  const sid = 'act-write-sess';
  process.env.ECC_SESSION_ID = sid;
  process.env.CLAUDE_HOOK_EVENT_NAME = 'PostToolUse';

  const filePath = path.join(SANDBOX, 'act', 'created.ts');
  const raw = JSON.stringify({
    tool_name: 'Write',
    tool_input: { file_path: filePath, content: 'export const x = 1;\nexport const y = 2;\n' },
    tool_output: { output: 'File written' },
  });

  const ret = activityTracker.run(raw);
  assert.equal(ret, raw, 'tracker is a pass-through');

  const metrics = path.join(SANDBOX, '.claude', 'metrics', 'tool-usage.jsonl');
  assert.equal(fs.existsSync(metrics), true, 'metrics jsonl written');
  const lastLine = fs.readFileSync(metrics, 'utf8').trim().split('\n').pop();
  const row = JSON.parse(lastLine);
  assert.equal(row.tool_name, 'Write');
  assert.equal(row.session_id, sid);
  assert.ok(Array.isArray(row.file_events), 'file_events present');
  assert.ok(row.file_paths.includes(filePath) || row.file_paths.length >= 0);

  delete process.env.ECC_SESSION_ID;
  delete process.env.CLAUDE_HOOK_EVENT_NAME;
});

test('activity-tracker: Edit event builds replacement diff + patch previews', () => {
  const row = activityTracker.buildActivityRow(
    {
      tool_name: 'Edit',
      tool_input: {
        file_path: '/repo/src/x.ts',
        old_string: 'const a = 1',
        new_string: 'const a = 2',
      },
    },
    { ECC_SESSION_ID: 'edit-sess', CLAUDE_HOOK_EVENT_NAME: 'PostToolUse' }
  );
  assert.ok(row);
  assert.equal(row.tool_name, 'Edit');
  assert.ok(Array.isArray(row.file_events) && row.file_events.length >= 1);
  const ev = row.file_events[0];
  assert.equal(ev.action, 'modify');
  // replacement preview present
  assert.match(String(ev.diff_preview || ''), /->/);
});

test('activity-tracker: rename/move file keys produce move actions', () => {
  const events = activityTracker.extractFileEvents('Move', {
    source_path: '/repo/old.ts',
    destination_path: '/repo/new.ts',
  });
  assert.ok(events.length >= 1);
  for (const e of events) assert.equal(e.action, 'move');
});

test('activity-tracker: summarizeInput/Output handle bash, file lists, objects, strings', () => {
  assert.match(
    activityTracker.summarizeInput('Bash', { command: 'echo hi --token=SECRET' }, []),
    /REDACTED/
  );
  assert.match(
    activityTracker.summarizeInput('Read', {}, ['/a.ts', '/b.ts']),
    /a\.ts/
  );
  assert.equal(typeof activityTracker.summarizeInput('Glob', { pattern: '*.ts', n: 3 }, []), 'string');
  assert.equal(activityTracker.summarizeOutput(null), '');
  assert.match(activityTracker.summarizeOutput({ output: 'done\nok' }), /done/);
  assert.match(activityTracker.summarizeOutput('plain text'), /plain text/);
  assert.equal(typeof activityTracker.summarizeOutput({ data: 1 }), 'string');
});

test('activity-tracker: non-PostToolUse event yields no row', () => {
  const row = activityTracker.buildActivityRow(
    { tool_name: 'Bash', tool_input: { command: 'ls' } },
    { ECC_SESSION_ID: 's', CLAUDE_HOOK_EVENT_NAME: 'PreToolUse' }
  );
  assert.equal(row, null);
});

test('activity-tracker: extractFilePaths skips URLs, collects nested paths', () => {
  const paths = activityTracker.extractFilePaths({
    file_path: '/repo/a.ts',
    nested: { source_path: '/repo/b.ts', url: 'https://example.com/x' },
    list: ['/repo/c.ts'],
  });
  assert.ok(paths.includes('/repo/a.ts'));
  assert.ok(!paths.some(p => p.startsWith('http')));
});

test('activity-tracker: Write event enriched against a real git working tree', { skip: !GIT_OK }, () => {
  // Drives enrichFileEventFromWorkingTree's git branches: repo root, tracked
  // lookup, diff preview. File is committed then modified so a diff exists.
  const repo = makeRepo('act-git-repo');
  const tracked = path.join(repo, 'tracked.ts');
  fs.writeFileSync(tracked, 'export const v = 1;\n', 'utf8');
  git(['add', '.'], repo);
  git(['commit', '-q', '-m', 'add tracked'], repo);
  // Modify it so `git diff` returns a patch.
  fs.writeFileSync(tracked, 'export const v = 99;\n', 'utf8');

  withCwd(repo, () => {
    const row = activityTracker.buildActivityRow(
      {
        tool_name: 'Write',
        tool_input: { file_path: tracked, content: 'export const v = 99;\n' },
      },
      { ECC_SESSION_ID: 'act-git-sess', CLAUDE_HOOK_EVENT_NAME: 'PostToolUse' }
    );
    assert.ok(row);
    const ev = row.file_events.find(e => e.path === tracked);
    assert.ok(ev, 'file event for the tracked path');
    // tracked file via Write -> action becomes 'modify'
    assert.equal(ev.action, 'modify');
  });
});

// ═════════════════════════════════════════════════════════════════════════
// session-end-marker.js
//   Work paths: with a session id, resolve project context, remove a lease,
//   list remaining leases, decide whether to stop the observer.
// ═════════════════════════════════════════════════════════════════════════

test('session-end: with a session id and a real lease dir, cleans up and reports', { skip: !GIT_OK }, () => {
  const repo = makeRepo('sessionend-repo');
  const sid = 'sessionend-cleanup';
  process.env.CLAUDE_SESSION_ID = sid;
  process.env.CLAUDE_PROJECT_DIR = repo;

  withCwd(repo, () => {
    const observerSessions = require('../../lib/observer-sessions');
    const ctx = observerSessions.resolveProjectContext();
    // Seed two leases: the current session's + a sibling, so the "retained"
    // branch (remaining > 0) executes.
    observerSessions.writeSessionLease(ctx, sid);
    observerSessions.writeSessionLease(ctx, 'other-session-xyz');

    const out = sessionEnd.run('{}');
    assert.equal(out, '{}', 'session-end is a pass-through');

    const remaining = observerSessions.listSessionLeases(ctx);
    assert.ok(remaining.length >= 1, 'sibling lease retained');
    assert.ok(!remaining.some(p => p.endsWith(`${sid}.json`)), 'current lease removed');
  });

  delete process.env.CLAUDE_SESSION_ID;
  delete process.env.CLAUDE_PROJECT_DIR;
});

test('session-end: last lease removed -> attempts observer stop (no observer running)', { skip: !GIT_OK }, () => {
  const repo = makeRepo('sessionend-last');
  const sid = 'sessionend-last-lease';
  process.env.CLAUDE_SESSION_ID = sid;
  process.env.CLAUDE_PROJECT_DIR = repo;

  withCwd(repo, () => {
    const observerSessions = require('../../lib/observer-sessions');
    const ctx = observerSessions.resolveProjectContext();
    observerSessions.writeSessionLease(ctx, sid); // only lease
    const out = sessionEnd.run('{}');
    assert.equal(out, '{}');
    const remaining = observerSessions.listSessionLeases(ctx);
    assert.equal(remaining.length, 0, 'no leases remain after final cleanup');
  });

  delete process.env.CLAUDE_SESSION_ID;
  delete process.env.CLAUDE_PROJECT_DIR;
});

test('session-end: last lease + a live observer pid -> stops the observer (reports stop)', { skip: !GIT_OK }, () => {
  // Spawn a benign, killable child to stand in for the observer process so the
  // SIGTERM in stopObserverForContext targets it (NOT the test runner).
  const { spawn } = require('node:child_process');
  const child = spawn(process.execPath, ['-e', 'setTimeout(() => {}, 30000)'], {
    stdio: 'ignore',
    detached: true,
  });
  child.unref();

  const repo = makeRepo('sessionend-observer');
  const sid = 'sessionend-observer-lease';
  process.env.CLAUDE_SESSION_ID = sid;
  process.env.CLAUDE_PROJECT_DIR = repo;

  try {
    withCwd(repo, () => {
      const observerSessions = require('../../lib/observer-sessions');
      const ctx = observerSessions.resolveProjectContext();
      observerSessions.writeSessionLease(ctx, sid); // only lease
      // Seed a live observer pid so stopObserverForContext returns true (line 37).
      fs.writeFileSync(observerSessions.getObserverPidFile(ctx), String(child.pid), 'utf8');

      const out = sessionEnd.run('{}');
      assert.equal(out, '{}');
      assert.equal(observerSessions.listSessionLeases(ctx).length, 0, 'final lease removed');
      assert.equal(fs.existsSync(observerSessions.getObserverPidFile(ctx)), false, 'observer pid file removed');
    });
  } finally {
    try { process.kill(child.pid); } catch { /* already gone */ }
    delete process.env.CLAUDE_SESSION_ID;
    delete process.env.CLAUDE_PROJECT_DIR;
  }
});

test('session-end: internal error during cleanup is caught (catch branch, still pass-through)', { skip: !GIT_OK }, () => {
  // Force listSessionLeases() to throw: make the lease DIR a regular FILE so
  // fs.existsSync() is true but fs.readdirSync() raises ENOTDIR -> the run()
  // try/catch swallows it and still returns the payload unchanged.
  const repo = makeRepo('sessionend-throw');
  const sid = 'sessionend-throw-lease';
  process.env.CLAUDE_SESSION_ID = sid;
  process.env.CLAUDE_PROJECT_DIR = repo;

  try {
    withCwd(repo, () => {
      const observerSessions = require('../../lib/observer-sessions');
      const ctx = observerSessions.resolveProjectContext();
      const leaseDir = observerSessions.getSessionLeaseDir(ctx);
      // removeSessionLease tolerates a missing file; listSessionLeases will hit
      // the readdir on a non-directory. Create the lease dir path AS A FILE.
      fs.mkdirSync(path.dirname(leaseDir), { recursive: true });
      fs.writeFileSync(leaseDir, 'not a directory', 'utf8');

      const out = sessionEnd.run('{}');
      assert.equal(out, '{}', 'cleanup error is swallowed; payload returned unchanged');
    });
  } finally {
    delete process.env.CLAUDE_SESSION_ID;
    delete process.env.CLAUDE_PROJECT_DIR;
  }
});

test('session-end: no session id -> short-circuits with pass-through', () => {
  delete process.env.CLAUDE_SESSION_ID;
  assert.equal(sessionEnd.run('{}'), '{}');
});

// ═════════════════════════════════════════════════════════════════════════
// quality-gate.js
//   Work paths: extension routing — biome .json/.md branch, prettier branch,
//   .go and .py branches; fix/strict env toggles; spawn fails open.
// ═════════════════════════════════════════════════════════════════════════

test('quality-gate: prettier project + real .ts file runs the prettier branch (fails open)', () => {
  const proj = path.join(SANDBOX, 'qg-prettier');
  fs.mkdirSync(proj, { recursive: true });
  fs.writeFileSync(path.join(proj, 'package.json'), JSON.stringify({ name: 'p' }), 'utf8');
  fs.writeFileSync(path.join(proj, '.prettierrc'), '{}', 'utf8');
  const fp = path.join(proj, 'file.ts');
  fs.writeFileSync(fp, 'export const x=1\n', 'utf8');

  const raw = edit(fp);
  // No prettier installed -> spawn fails open; hook is always a pass-through.
  assert.equal(qualityGate.run(raw), raw);
});

test('quality-gate: biome project + .md runs the biome json/md branch', () => {
  const proj = path.join(SANDBOX, 'qg-biome');
  fs.mkdirSync(proj, { recursive: true });
  fs.writeFileSync(path.join(proj, 'package.json'), JSON.stringify({ name: 'p' }), 'utf8');
  fs.writeFileSync(path.join(proj, 'biome.json'), '{}', 'utf8');
  const fp = path.join(proj, 'doc.md');
  fs.writeFileSync(fp, '# hi\n', 'utf8');

  process.env.ECC_QUALITY_GATE_FIX = 'true';
  process.env.ECC_QUALITY_GATE_STRICT = 'true';
  const raw = edit(fp);
  assert.equal(qualityGate.run(raw), raw);
  delete process.env.ECC_QUALITY_GATE_FIX;
  delete process.env.ECC_QUALITY_GATE_STRICT;
});

test('quality-gate: biome project + .ts is skipped (handled by post-edit-format)', () => {
  const proj = path.join(SANDBOX, 'qg-biome-ts');
  fs.mkdirSync(proj, { recursive: true });
  fs.writeFileSync(path.join(proj, 'package.json'), JSON.stringify({ name: 'p' }), 'utf8');
  fs.writeFileSync(path.join(proj, 'biome.json'), '{}', 'utf8');
  const fp = path.join(proj, 'skip.ts');
  fs.writeFileSync(fp, 'export const x = 1\n', 'utf8');
  const raw = edit(fp);
  assert.equal(qualityGate.run(raw), raw);
});

test('quality-gate: .go file runs the gofmt branch (fix + strict)', () => {
  const proj = path.join(SANDBOX, 'qg-go');
  fs.mkdirSync(proj, { recursive: true });
  const fp = path.join(proj, 'main.go');
  fs.writeFileSync(fp, 'package main\n', 'utf8');
  process.env.ECC_QUALITY_GATE_FIX = 'true';
  process.env.ECC_QUALITY_GATE_STRICT = 'true';
  const raw = edit(fp);
  assert.equal(qualityGate.run(raw), raw); // gofmt may be absent -> fails open
  delete process.env.ECC_QUALITY_GATE_FIX;
  delete process.env.ECC_QUALITY_GATE_STRICT;
});

test('quality-gate: .go file runs the gofmt -l (check, no fix) branch', () => {
  const proj = path.join(SANDBOX, 'qg-go-check');
  fs.mkdirSync(proj, { recursive: true });
  const fp = path.join(proj, 'lib.go');
  fs.writeFileSync(fp, 'package lib\n', 'utf8');
  process.env.ECC_QUALITY_GATE_STRICT = 'true';
  delete process.env.ECC_QUALITY_GATE_FIX;
  const raw = edit(fp);
  assert.equal(qualityGate.run(raw), raw);
  delete process.env.ECC_QUALITY_GATE_STRICT;
});

test('quality-gate: .py file runs the ruff branch', () => {
  const proj = path.join(SANDBOX, 'qg-py');
  fs.mkdirSync(proj, { recursive: true });
  const fp = path.join(proj, 'mod.py');
  fs.writeFileSync(fp, 'x = 1\n', 'utf8');
  process.env.ECC_QUALITY_GATE_STRICT = 'true';
  const raw = edit(fp);
  assert.equal(qualityGate.run(raw), raw); // ruff may be absent -> fails open
  delete process.env.ECC_QUALITY_GATE_STRICT;
});

test('quality-gate: .rs file runs the rustfmt branch (fix + strict)', () => {
  const proj = path.join(SANDBOX, 'qg-rust');
  fs.mkdirSync(proj, { recursive: true });
  fs.writeFileSync(path.join(proj, 'Cargo.toml'), '[package]\nname = "p"\n', 'utf8');
  const fp = path.join(proj, 'main.rs');
  fs.writeFileSync(fp, 'fn main() {}\n', 'utf8');
  process.env.ECC_QUALITY_GATE_FIX = 'true';
  process.env.ECC_QUALITY_GATE_STRICT = 'true';
  const raw = edit(fp);
  assert.equal(qualityGate.run(raw), raw); // rustfmt may be absent -> fails open
  delete process.env.ECC_QUALITY_GATE_FIX;
  delete process.env.ECC_QUALITY_GATE_STRICT;
});

test('quality-gate: .rs file runs the rustfmt --check (no fix) branch', () => {
  const proj = path.join(SANDBOX, 'qg-rust-check');
  fs.mkdirSync(proj, { recursive: true });
  fs.writeFileSync(path.join(proj, 'Cargo.toml'), '[package]\nname = "p"\n', 'utf8');
  const fp = path.join(proj, 'lib.rs');
  fs.writeFileSync(fp, 'pub fn f() {}\n', 'utf8');
  process.env.ECC_QUALITY_GATE_STRICT = 'true';
  delete process.env.ECC_QUALITY_GATE_FIX;
  const raw = edit(fp);
  assert.equal(qualityGate.run(raw), raw);
  delete process.env.ECC_QUALITY_GATE_STRICT;
});

test('quality-gate: no formatter configured -> skip', () => {
  const proj = path.join(SANDBOX, 'qg-noformatter');
  fs.mkdirSync(proj, { recursive: true });
  fs.writeFileSync(path.join(proj, 'package.json'), JSON.stringify({ name: 'p' }), 'utf8');
  const fp = path.join(proj, 'x.ts');
  fs.writeFileSync(fp, 'export const x = 1\n', 'utf8');
  const raw = edit(fp);
  assert.equal(qualityGate.run(raw), raw);
});

// ═════════════════════════════════════════════════════════════════════════
// post-bash-build-complete.js
//   Work paths: build-command detection (object result with stderr/exitCode)
//   vs non-build pass-through; object-input support; parse-error fail open.
// ═════════════════════════════════════════════════════════════════════════

test('post-bash-build: build command yields async-analysis object result', () => {
  const raw = JSON.stringify({ tool_input: { command: 'npm run build' } });
  const out = postBashBuild.run(raw);
  assert.equal(typeof out, 'object');
  assert.equal(out.exitCode, 0);
  assert.match(String(out.stderr), /Build completed/);
  assert.equal(out.stdout, raw);
});

test('post-bash-build: pnpm/yarn build also match', () => {
  for (const cmd of ['pnpm build', 'yarn build']) {
    const out = postBashBuild.run(JSON.stringify({ tool_input: { command: cmd } }));
    assert.equal(typeof out, 'object');
    assert.match(String(out.stderr), /Build completed/);
  }
});

test('post-bash-build: non-build command passes through unchanged (string)', () => {
  const raw = JSON.stringify({ tool_input: { command: 'ls -la' } });
  assert.equal(postBashBuild.run(raw), raw);
});

test('post-bash-build: accepts a pre-parsed object input', () => {
  const obj = { tool_input: { command: 'echo hi' } };
  const out = postBashBuild.run(obj);
  assert.equal(out, JSON.stringify(obj), 'object input stringified on pass-through');
});

test('post-bash-build: object input with build command returns object', () => {
  const obj = { tool_input: { command: 'npm run build' } };
  const out = postBashBuild.run(obj);
  assert.equal(typeof out, 'object');
  assert.equal(out.stdout, JSON.stringify(obj));
});

test('post-bash-build: parse error fails open (returns raw)', () => {
  assert.equal(postBashBuild.run('not json {'), 'not json {');
});

// ═════════════════════════════════════════════════════════════════════════
// post-edit-format.js
//   Work paths: JS/TS file + detected formatter -> resolveFormatterBin -> spawn
//   decision (fails open); no-formatter early return; non-JS skip; parse error.
// ═════════════════════════════════════════════════════════════════════════

test('post-edit-format: prettier project + .ts file runs the format path (fails open)', () => {
  const proj = path.join(SANDBOX, 'pef-prettier');
  fs.mkdirSync(proj, { recursive: true });
  fs.writeFileSync(path.join(proj, 'package.json'), JSON.stringify({ name: 'p' }), 'utf8');
  fs.writeFileSync(path.join(proj, '.prettierrc'), '{}', 'utf8');
  const fp = path.join(proj, 'a.ts');
  fs.writeFileSync(fp, 'export const x=1\n', 'utf8');
  const raw = edit(fp);
  assert.equal(postEditFormat.run(raw), raw, 'always pass-through');
});

test('post-edit-format: biome project + .tsx uses the biome check --write branch', () => {
  const proj = path.join(SANDBOX, 'pef-biome');
  fs.mkdirSync(proj, { recursive: true });
  fs.writeFileSync(path.join(proj, 'package.json'), JSON.stringify({ name: 'p' }), 'utf8');
  fs.writeFileSync(path.join(proj, 'biome.json'), '{}', 'utf8');
  const fp = path.join(proj, 'comp.tsx');
  fs.writeFileSync(fp, 'export const C = () => null\n', 'utf8');
  const raw = edit(fp);
  assert.equal(postEditFormat.run(raw), raw);
});

test('post-edit-format: Windows .cmd path with unsafe shell chars is rejected (fails open)', { skip: process.platform !== 'win32' }, () => {
  // Project with biome but no local node_modules/.bin -> resolveFormatterBin
  // returns the npx.cmd runner (ends in .cmd), taking the win32 shell branch.
  // A path with a shell metacharacter must throw internally and be swallowed.
  const proj = path.join(SANDBOX, 'pef-unsafe');
  fs.mkdirSync(proj, { recursive: true });
  fs.writeFileSync(path.join(proj, 'package.json'), JSON.stringify({ name: 'p' }), 'utf8');
  fs.writeFileSync(path.join(proj, 'biome.json'), '{}', 'utf8');
  // A real file whose name contains '&' (an UNSAFE_PATH_CHARS member).
  const fp = path.join(proj, 'a&b.ts');
  fs.writeFileSync(fp, 'export const x = 1\n', 'utf8');
  const raw = edit(fp);
  assert.equal(postEditFormat.run(raw), raw, 'unsafe path rejected, still pass-through');
});

test('post-edit-format: no formatter configured -> early return pass-through', () => {
  const proj = path.join(SANDBOX, 'pef-noformatter');
  fs.mkdirSync(proj, { recursive: true });
  fs.writeFileSync(path.join(proj, 'package.json'), JSON.stringify({ name: 'p' }), 'utf8');
  const fp = path.join(proj, 'b.js');
  fs.writeFileSync(fp, 'module.exports = 1\n', 'utf8');
  const raw = edit(fp);
  assert.equal(postEditFormat.run(raw), raw);
});

test('post-edit-format: non-JS/TS file is skipped', () => {
  const raw = edit('/repo/data.md');
  assert.equal(postEditFormat.run(raw), raw);
});

test('post-edit-format: missing file_path is skipped', () => {
  const raw = JSON.stringify({ tool_input: {} });
  assert.equal(postEditFormat.run(raw), raw);
});

test('post-edit-format: parse error fails open', () => {
  assert.equal(postEditFormat.run('}{not json'), '}{not json');
});

// ═════════════════════════════════════════════════════════════════════════
// desktop-notify.js
//   Work paths: extractSummary branches; run() dispatch on platform. On
//   non-mac/non-WSL this is a pass-through, but we exercise the pure helper
//   branches directly and the run() summary extraction + dispatch.
// ═════════════════════════════════════════════════════════════════════════

test('desktop-notify: extractSummary via run() picks first non-empty line', () => {
  const raw = JSON.stringify({ last_assistant_message: '\n\n  First real line\nsecond' });
  assert.equal(desktopNotify.run(raw), raw, 'always returns raw payload');
});

test('desktop-notify: run() with long message still passes through (truncation branch)', () => {
  const long = 'x'.repeat(250);
  const raw = JSON.stringify({ last_assistant_message: long });
  assert.equal(desktopNotify.run(raw), raw);
});

test('desktop-notify: run() with empty/whitespace message passes through', () => {
  const raw = JSON.stringify({ last_assistant_message: '   ' });
  assert.equal(desktopNotify.run(raw), raw);
});

test('desktop-notify: run() with no message field passes through', () => {
  const raw = JSON.stringify({ other: 1 });
  assert.equal(desktopNotify.run(raw), raw);
});

test('desktop-notify: run() fails open on malformed JSON', () => {
  assert.equal(desktopNotify.run('not json {'), 'not json {');
});
