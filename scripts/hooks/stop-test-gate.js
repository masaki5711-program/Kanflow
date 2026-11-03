#!/usr/bin/env node
/**
 * Stop Hook: TDD Test Gate (self-healing harness)
 *
 * When Claude finishes a response that changed source code, this hook runs the
 * project's test suite. If tests fail, it BLOCKS the stop (exit 2) and feeds
 * the failure output back to Claude — Claude then fixes the code and finishes
 * again, the hook re-runs the tests, and the loop repeats until tests pass.
 *
 * Monorepo-aware: besides the repo root, each direct subdirectory of `apps/`
 * (e.g. `apps/edge/Cargo.toml`, `apps/ai/pyproject.toml`, `apps/hub/package.json`)
 * is checked independently, and its suite only runs when THAT subdirectory has
 * uncommitted changes — so editing apps/hub never triggers apps/edge's cargo
 * test run, and vice versa.
 *
 * Multi-suite per project: a project can carry more than one test setup at
 * once — a Tauri app has a frontend package.json AND a nested
 * src-tauri/Cargo.toml, and BOTH suites run (npm test + cargo test). A root
 * Cargo.toml (workspace) supersedes the src-tauri check.
 *
 * Loop control:
 *   - runs only when there are uncommitted changes to source files
 *   - a per-session attempt counter caps the loop (default 3) so it can never
 *     run forever; past the cap it reports and lets the session end
 *
 * Fails OPEN: no test setup detected, test runner missing, or any internal
 * error -> passes through (exit 0). Only a real test FAILURE blocks.
 *
 * Disable with ECC_DISABLED_HOOKS=stop:test-gate.
 * Tune the cap with ECC_TEST_GATE_MAX_ATTEMPTS.
 *
 * Compatible with run-with-flags.js via module.exports.run().
 * Cross-platform (Windows, macOS, Linux).
 */

'use strict';

const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { whichCli } = require('../lib/which');

const MAX_STDIN = 1024 * 1024;
const TEST_TIMEOUT_MS = 240000;
const MAX_OUTPUT_CHARS = 4000;
const DEFAULT_MAX_ATTEMPTS = 3;
const CODE_EXT = /\.(ts|tsx|js|jsx|mjs|cjs|rs|go|py|java|kt|rb|php|c|cc|cpp|cxx|h|hpp|swift|cs|fs|gd|shader|hlsl|glsl|wgsl|cginc)$/i;

function maxAttempts() {
  const n = parseInt(process.env.ECC_TEST_GATE_MAX_ATTEMPTS || '', 10);
  return Number.isInteger(n) && n > 0 ? n : DEFAULT_MAX_ATTEMPTS;
}

function git(args, cwd) {
  const r = spawnSync('git', args, {
    encoding: 'utf8',
    timeout: 10000,
    windowsHide: true,
    ...(cwd ? { cwd } : {}),
  });
  if (r.error || r.status !== 0) return null;
  return r.stdout;
}

/**
 * True when `dir` is its own git checkout (the apps/ workspace model: each
 * product repo is cloned under apps/<name> and is IGNORED by the parent repo,
 * so parent-side `git diff` can never see its changes — check inside it).
 */
function isNestedRepo(dir) {
  return fs.existsSync(path.join(dir, '.git'));
}

/**
 * True when uncommitted changes touch at least one source file.
 *
 * @param {string|string[]} [pathspec] - When given, scopes the check to
 *   that repo-relative path (e.g. "apps/edge") so a monorepo subproject's
 *   test suite only runs for changes inside its own directory. An array is
 *   passed as multiple pathspecs — e.g. `['.', ':!apps/edge']` includes
 *   everything except apps/edge, so the root suite does not re-run for
 *   changes a subproject's own suite already covers.
 */
function hasCodeChanges(pathspec, cwd) {
  const diffArgs = ['diff', '--name-only', 'HEAD'];
  const lsArgs = ['ls-files', '--others', '--exclude-standard'];
  if (pathspec) {
    const specs = Array.isArray(pathspec) ? pathspec : [pathspec];
    diffArgs.push('--', ...specs);
    lsArgs.push('--', ...specs);
  }
  const tracked = git(diffArgs, cwd);
  const untracked = git(lsArgs, cwd);
  if (tracked === null && untracked === null) return false; // not a git repo -> skip
  const files = `${tracked || ''}\n${untracked || ''}`
    .split('\n')
    .map(s => s.trim())
    .filter(Boolean);
  return files.some(f => CODE_EXT.test(f));
}

/** Direct subdirectories of `root/apps` (each a potential subproject root). */
function listAppDirs(root) {
  const appsDir = path.join(root, 'apps');
  try {
    return fs
      .readdirSync(appsDir, { withFileTypes: true })
      .filter(d => d.isDirectory())
      .map(d => path.join(appsDir, d.name));
  } catch {
    return []; // no apps/ dir yet -> single-project repo
  }
}

/**
 * Detect the project's test command. Returns {cmd, args, cwd} or null.
 *
 * The runner is resolved to an ABSOLUTE PATH via whichCli. This fixes a false
 * Stop block on a PC where the runner (e.g. pnpm) is installed off-PATH or not
 * at all: with shell:true on Windows, a missing runner does NOT surface as
 * ENOENT — cmd.exe starts fine and exits non-zero ("'pnpm' is not recognized"),
 * which the old code mistook for a test failure. Resolving up-front means a
 * missing runner returns null here -> the hook no-ops (fail open), and an
 * off-PATH runner is still found and run by its absolute path.
 */
function listTestTargets(root) {
  const has = f => fs.existsSync(path.join(root, f));
  const targets = [];

  // Every match is collected — earlier versions returned on the FIRST match,
  // so a root package.json shadowed everything else and a Tauri project's
  // src-tauri/Cargo.toml never got a `cargo test` suite (silent fail-open).
  if (has('package.json')) {
    try {
      const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
      const testScript = pkg.scripts && pkg.scripts.test;
      if (testScript && !/no test specified/i.test(testScript)) {
        targets.push({ kind: 'package-json', cwd: root });
      }
    } catch {
      /* unreadable package.json — skip this target */
    }
  }
  if (has('Cargo.toml')) {
    targets.push({ kind: 'cargo', cwd: root });
  } else if (has(path.join('src-tauri', 'Cargo.toml'))) {
    // Tauri layout: frontend at the root, Rust crate nested. A root Cargo.toml
    // (workspace) supersedes this — cargo at the root already covers members.
    targets.push({ kind: 'cargo', cwd: path.join(root, 'src-tauri') });
  }
  if (has('go.mod')) targets.push({ kind: 'go', cwd: root });
  if (has('pyproject.toml') || has('pytest.ini') || has('setup.cfg') || has('tox.ini')) {
    targets.push({ kind: 'pytest', cwd: root });
  }
  // .NET: a solution file at the root -> `dotnet test`.
  // (Unity projects have .csproj but no .sln at root and no `dotnet test`
  // story — their Test Runner is editor-driven, so they contribute nothing.)
  try {
    if (fs.readdirSync(root).some(f => /\.sln$/i.test(f))) {
      targets.push({ kind: 'dotnet', cwd: root });
    }
  } catch {
    /* unreadable dir — skip */
  }
  return targets;
}

/** Resolve one detected target to a runnable command, or null (fail open). */
function resolveTestCommand(target, root) {
  const has = f => fs.existsSync(path.join(root, f));
  switch (target.kind) {
    case 'package-json': {
      let pm = 'npm';
      if (has('pnpm-lock.yaml')) pm = 'pnpm';
      else if (has('yarn.lock')) pm = 'yarn';
      else if (has('bun.lockb')) pm = 'bun';
      const bin = whichCli(pm);
      return bin ? { cmd: bin, args: pm === 'yarn' ? ['test'] : ['run', 'test'], cwd: target.cwd } : null;
    }
    case 'cargo': {
      const bin = whichCli('cargo');
      return bin ? { cmd: bin, args: ['test'], cwd: target.cwd } : null;
    }
    case 'go': {
      const bin = whichCli('go');
      return bin ? { cmd: bin, args: ['test', './...'], cwd: target.cwd } : null;
    }
    case 'pytest': {
      const bin = whichCli('pytest');
      return bin ? { cmd: bin, args: ['-q'], cwd: target.cwd } : null;
    }
    case 'dotnet': {
      const bin = whichCli('dotnet');
      return bin ? { cmd: bin, args: ['test', '--nologo'], cwd: target.cwd } : null;
    }
    default:
      return null;
  }
}

/** All runnable test commands for a project root (may span package managers). */
function detectTestCommands(root) {
  return listTestTargets(root)
    .map(t => resolveTestCommand(t, root))
    .filter(Boolean);
}

/** Back-compat single-command view (first detected suite or null). */
function detectTestCommand(root) {
  return detectTestCommands(root)[0] || null;
}

/**
 * A command-not-found through a shell does not surface as ENOENT. Detect the
 * unambiguous Windows cmd.exe signal so it is treated as "runner missing"
 * (fail open), never as a test failure. The phrase is specific enough not to
 * match ordinary test output.
 */
function isCommandNotFound(result) {
  if (result.status === 9009) return true; // cmd.exe: command not found
  const out = `${result.stderr || ''}${result.stdout || ''}`;
  return /is not recognized as an internal or external command/i.test(out);
}

// --- per-session attempt counter ---

function stateFile() {
  const raw =
    process.env.CLAUDE_SESSION_ID ||
    crypto.createHash('sha1').update(process.cwd()).digest('hex').slice(0, 12);
  const id = raw.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 64);
  return path.join(os.tmpdir(), `ecc-testgate-${id}.json`);
}

function readAttempts() {
  try {
    return JSON.parse(fs.readFileSync(stateFile(), 'utf8')).count || 0;
  } catch {
    return 0;
  }
}

function writeAttempts(count) {
  try {
    fs.writeFileSync(stateFile(), JSON.stringify({ count, ts: Date.now() }), 'utf8');
  } catch {
    /* best-effort */
  }
}

function clearAttempts() {
  try {
    fs.unlinkSync(stateFile());
  } catch {
    /* best-effort */
  }
}

function truncateTail(text) {
  const t = String(text || '');
  return t.length > MAX_OUTPUT_CHARS ? `…\n${t.slice(-MAX_OUTPUT_CHARS)}` : t;
}

/**
 * Run one suite's test command. Never throws — a missing/unresolvable runner
 * or shell-hidden ENOENT is reported as 'skip' (fail open), matching the
 * single-project behavior this replaces.
 */
function runSuite(test) {
  const isWin = process.platform === 'win32';
  // shell:true is required to run a .cmd shim on Windows; quote the absolute
  // path so a runner under "C:\Program Files\..." is not split on the space.
  const spawnCmd = isWin && /\s/.test(test.cmd) ? `"${test.cmd}"` : test.cmd;
  const result = spawnSync(spawnCmd, test.args, {
    cwd: test.cwd,
    encoding: 'utf8',
    timeout: TEST_TIMEOUT_MS,
    windowsHide: true,
    shell: isWin, // .cmd shims need a shell on Windows
  });

  // Runner missing or could not execute -> fail open
  if (result.error && result.error.code === 'ENOENT') return { status: 'skip' };
  if (result.status === null && result.error) return { status: 'skip' };
  if (isCommandNotFound(result)) return { status: 'skip' }; // shell hid the missing runner
  if (result.status === 0) return { status: 'pass' };
  return { status: 'fail', output: truncateTail(`${result.stdout || ''}${result.stderr || ''}`) };
}

function run(rawInput) {
  try {
    const root = process.cwd();

    // Detect apps/* subproject suites first, so the root suite below can be
    // scoped to exclude any subtree that already has its own suite — editing
    // apps/edge should trigger cargo test there, not ALSO re-run this
    // meta-repo's own root test suite for the same change.
    let anyTestSetup = false;
    const suites = [];
    const ownedAppPathspecs = [];
    for (const dir of listAppDirs(root)) {
      const tests = detectTestCommands(dir);
      if (tests.length === 0) continue;
      anyTestSetup = true;
      const rel = path.relative(root, dir).split(path.sep).join('/');
      ownedAppPathspecs.push(`:!${rel}`);
      // A nested product checkout (apps/ workspace model) is invisible to the
      // parent repo's git — ask ITS git for uncommitted changes instead.
      const changed = isNestedRepo(dir) ? hasCodeChanges(undefined, dir) : hasCodeChanges(rel);
      if (!changed) continue;
      for (const test of tests) {
        const sub = path.relative(dir, test.cwd).split(path.sep).join('/');
        suites.push({ ...test, label: sub ? `${rel}/${sub}` : rel });
      }
    }

    const rootTests = detectTestCommands(root);
    if (rootTests.length > 0) {
      anyTestSetup = true;
      const rootPathspec = ownedAppPathspecs.length ? ['.', ...ownedAppPathspecs] : undefined;
      if (hasCodeChanges(rootPathspec)) {
        for (const test of rootTests) {
          const sub = path.relative(root, test.cwd).split(path.sep).join('/');
          suites.push({ ...test, label: sub || '.' });
        }
      }
    }

    if (!anyTestSetup) return rawInput; // no test setup anywhere -> no-op

    if (suites.length === 0) {
      clearAttempts();
      return rawInput; // test setup exists but nothing changed -> no-op
    }

    const failures = [];
    for (const suite of suites) {
      const outcome = runSuite(suite);
      if (outcome.status === 'fail') failures.push({ ...suite, output: outcome.output });
    }

    if (failures.length === 0) {
      clearAttempts();
      return rawInput; // all applicable suites pass (or their runners were unresolvable) -> allow stop
    }

    const attempts = readAttempts() + 1;
    const cap = maxAttempts();

    if (attempts >= cap) {
      clearAttempts();
      process.stderr.write(
        `[Test Gate] Tests still failing after ${cap} attempt(s). Not blocking further — ` +
          'please fix the remaining failures manually.\n',
      );
      return rawInput; // give up blocking -> allow stop
    }

    writeAttempts(attempts);
    const sections = failures.map(f =>
      [
        `Suite: ${f.label}`,
        `Command: ${f.cmd} ${f.args.join(' ')}`,
        '--- test output (tail) ---',
        f.output,
        '--- end of test output ---',
      ].join('\n'),
    );
    const msg = [
      `[Test Gate] Tests are failing in ${failures.length} suite(s) (attempt ${attempts}/${cap}). Fix them before finishing.`,
      '',
      ...sections,
      '',
      'Fix the failing tests, then finish again — they will be re-run automatically.',
    ].join('\n\n');
    return { exitCode: 2, stderr: msg };
  } catch {
    // fail open — never block because of a hook error
  }
  return rawInput;
}

module.exports = {
  run,
  detectTestCommand,
  detectTestCommands,
  listTestTargets,
  isCommandNotFound,
  hasCodeChanges,
  listAppDirs,
  isNestedRepo,
};

// stdin entry point for direct / spawned execution
if (require.main === module) {
  let raw = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', chunk => {
    if (raw.length < MAX_STDIN) raw += chunk.substring(0, MAX_STDIN - raw.length);
  });
  process.stdin.on('end', () => {
    const result = run(raw);
    if (result && typeof result === 'object') {
      if (result.stderr) process.stderr.write(`${result.stderr}\n`);
      process.stdout.write(String(result.stdout || ''));
      process.exit(Number.isInteger(result.exitCode) ? result.exitCode : 0);
    } else {
      process.stdout.write(String(result));
      process.exit(0);
    }
  });
}
