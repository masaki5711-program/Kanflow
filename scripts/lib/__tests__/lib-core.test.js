'use strict';

/**
 * Unit tests for core ECC library utilities under scripts/lib/.
 *
 * Node built-ins only (node:test, node:assert/strict, node:os/path/fs).
 * Filesystem-driven modules are tested against per-test TEMP directories with
 * synthetic fixtures; HOME/USERPROFILE is redirected so modules that persist
 * config under ~/.claude (package-manager, session-aliases) write into a temp
 * sandbox instead of the real home directory.
 */

const { test, after, before } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const utils = require('../utils');
const { splitShellSegments } = require('../shell-split');
const { resolveEccRoot } = require('../resolve-ecc-root');
const formatter = require('../resolve-formatter');
const { detectProjectType, getPackageJsonDeps, getRustDeps } = require('../project-detect');
const pm = require('../package-manager');
const hookFlags = require('../hook-flags');
const agentCompress = require('../agent-compress');
const inspection = require('../inspection');
const aliases = require('../session-aliases');

// ── Temp directory helpers ──────────────────────────────────────────
const tempDirs = [];

function makeTempDir(label) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `ecc-lib-${label}-`));
  tempDirs.push(dir);
  return dir;
}

after(() => {
  for (const dir of tempDirs) {
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch {
      // best-effort cleanup
    }
  }
});

// ── Env save/restore (shared sandbox for HOME-dependent modules) ─────
const SAVED_ENV = {};
const ENV_KEYS = [
  'HOME', 'USERPROFILE', 'CLAUDE_SESSION_ID',
  'ECC_HOOK_PROFILE', 'ECC_DISABLED_HOOKS',
  'CLAUDE_PACKAGE_MANAGER', 'CLAUDE_PLUGIN_ROOT', 'CLAUDE_PROJECT_DIR'
];

let homeSandbox;

before(() => {
  for (const key of ENV_KEYS) SAVED_ENV[key] = process.env[key];
  // Redirect ~/.claude to a temp sandbox for package-manager / session-aliases.
  homeSandbox = makeTempDir('home');
  process.env.HOME = homeSandbox;
  process.env.USERPROFILE = homeSandbox;
  // Ensure a clean default for env-driven modules.
  delete process.env.ECC_HOOK_PROFILE;
  delete process.env.ECC_DISABLED_HOOKS;
  delete process.env.CLAUDE_PACKAGE_MANAGER;
  delete process.env.CLAUDE_PLUGIN_ROOT;
  delete process.env.CLAUDE_PROJECT_DIR;
  delete process.env.CLAUDE_SESSION_ID;
});

after(() => {
  for (const key of ENV_KEYS) {
    if (SAVED_ENV[key] === undefined) delete process.env[key];
    else process.env[key] = SAVED_ENV[key];
  }
});

// ════════════════════════════════════════════════════════════════════
// utils.js
// ════════════════════════════════════════════════════════════════════

test('utils: platform flags are mutually exclusive booleans', () => {
  const flags = [utils.isWindows, utils.isMacOS, utils.isLinux];
  for (const f of flags) assert.equal(typeof f, 'boolean');
  // At most one of the three known platforms is true.
  assert.ok(flags.filter(Boolean).length <= 1);
});

test('utils: getDateString returns YYYY-MM-DD', () => {
  assert.match(utils.getDateString(), /^\d{4}-\d{2}-\d{2}$/);
});

test('utils: getTimeString returns HH:MM', () => {
  assert.match(utils.getTimeString(), /^\d{2}:\d{2}$/);
});

test('utils: getDateTimeString returns full timestamp', () => {
  assert.match(utils.getDateTimeString(), /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
});

test('utils: sanitizeSessionId handles empty and non-string input', () => {
  assert.equal(utils.sanitizeSessionId(''), null);
  assert.equal(utils.sanitizeSessionId(null), null);
  assert.equal(utils.sanitizeSessionId(42), null);
});

test('utils: sanitizeSessionId strips leading dots and replaces invalid chars', () => {
  // ".claude" -> leading dot stripped -> "claude"
  assert.equal(utils.sanitizeSessionId('.claude'), 'claude');
  // invalid chars collapse to a single hyphen, trimmed at ends
  assert.equal(utils.sanitizeSessionId('foo//bar'), 'foo-bar');
  assert.equal(utils.sanitizeSessionId('--foo--'), 'foo');
});

test('utils: sanitizeSessionId appends hash suffix for reserved Windows ids', () => {
  const out = utils.sanitizeSessionId('CON');
  assert.match(out, /^CON-[0-9a-f]{6}$/);
});

test('utils: sanitizeSessionId hashes pure non-ASCII input deterministically', () => {
  const a = utils.sanitizeSessionId('日本語');
  const b = utils.sanitizeSessionId('日本語');
  const c = utils.sanitizeSessionId('한국어');
  assert.match(a, /^[0-9a-f]{8}$/);
  assert.equal(a, b, 'same input must hash the same');
  assert.notEqual(a, c, 'distinct inputs must not collide');
});

test('utils: getSessionIdShort uses CLAUDE_SESSION_ID last 8 chars', () => {
  process.env.CLAUDE_SESSION_ID = 'abcdefghijklmnop';
  try {
    assert.equal(utils.getSessionIdShort(), 'ijklmnop');
  } finally {
    delete process.env.CLAUDE_SESSION_ID;
  }
});

test('utils: getSessionIdShort falls back to project/fallback when no session id', () => {
  delete process.env.CLAUDE_SESSION_ID;
  const out = utils.getSessionIdShort('fallbackname');
  assert.ok(out && out.length > 0);
});

test('utils: ensureDir creates nested directories and returns the path', () => {
  const base = makeTempDir('ensuredir');
  const nested = path.join(base, 'a', 'b', 'c');
  const ret = utils.ensureDir(nested);
  assert.equal(ret, nested);
  assert.ok(fs.existsSync(nested));
});

test('utils: readFile returns null for missing file, content for existing', () => {
  const base = makeTempDir('readfile');
  assert.equal(utils.readFile(path.join(base, 'nope.txt')), null);
  const f = path.join(base, 'a.txt');
  fs.writeFileSync(f, 'hello');
  assert.equal(utils.readFile(f), 'hello');
});

test('utils: writeFile creates parent dirs and writes content', () => {
  const base = makeTempDir('writefile');
  const f = path.join(base, 'deep', 'nested', 'out.txt');
  utils.writeFile(f, 'data');
  assert.equal(fs.readFileSync(f, 'utf8'), 'data');
});

test('utils: appendFile appends to an existing file', () => {
  const base = makeTempDir('appendfile');
  const f = path.join(base, 'log.txt');
  utils.appendFile(f, 'a');
  utils.appendFile(f, 'b');
  assert.equal(fs.readFileSync(f, 'utf8'), 'ab');
});

test('utils: findFiles matches glob pattern and ignores missing dir', () => {
  const base = makeTempDir('findfiles');
  fs.writeFileSync(path.join(base, 'one.md'), 'x');
  fs.writeFileSync(path.join(base, 'two.md'), 'x');
  fs.writeFileSync(path.join(base, 'skip.txt'), 'x');
  const md = utils.findFiles(base, '*.md');
  assert.equal(md.length, 2);
  // Missing dir returns empty array, not a throw.
  assert.deepEqual(utils.findFiles(path.join(base, 'nope'), '*.md'), []);
  // Invalid arguments return empty array.
  assert.deepEqual(utils.findFiles('', '*.md'), []);
  assert.deepEqual(utils.findFiles(base, ''), []);
});

test('utils: findFiles recursive option descends into subdirs', () => {
  const base = makeTempDir('findfiles-rec');
  fs.mkdirSync(path.join(base, 'sub'));
  fs.writeFileSync(path.join(base, 'top.md'), 'x');
  fs.writeFileSync(path.join(base, 'sub', 'deep.md'), 'x');
  assert.equal(utils.findFiles(base, '*.md').length, 1);
  assert.equal(utils.findFiles(base, '*.md', { recursive: true }).length, 2);
});

test('utils: replaceInFile replaces first occurrence and all with option', () => {
  const base = makeTempDir('replace');
  const f = path.join(base, 'r.txt');
  fs.writeFileSync(f, 'a a a');
  assert.equal(utils.replaceInFile(f, 'a', 'b'), true);
  assert.equal(fs.readFileSync(f, 'utf8'), 'b a a');
  fs.writeFileSync(f, 'a a a');
  utils.replaceInFile(f, 'a', 'b', { all: true });
  assert.equal(fs.readFileSync(f, 'utf8'), 'b b b');
  // Missing file returns false.
  assert.equal(utils.replaceInFile(path.join(base, 'no.txt'), 'a', 'b'), false);
});

test('utils: countInFile counts matches and handles bad pattern/missing file', () => {
  const base = makeTempDir('count');
  const f = path.join(base, 'c.txt');
  fs.writeFileSync(f, 'foo foo bar foo');
  assert.equal(utils.countInFile(f, 'foo'), 3);
  assert.equal(utils.countInFile(f, /bar/), 1);
  assert.equal(utils.countInFile(f, 42), 0); // non-string/regex
  assert.equal(utils.countInFile(path.join(base, 'no.txt'), 'foo'), 0);
});

test('utils: grepFile returns matching lines with 1-based line numbers', () => {
  const base = makeTempDir('grep');
  const f = path.join(base, 'g.txt');
  fs.writeFileSync(f, 'alpha\nbeta\nalpha again');
  const hits = utils.grepFile(f, /alpha/);
  assert.equal(hits.length, 2);
  assert.equal(hits[0].lineNumber, 1);
  assert.equal(hits[1].lineNumber, 3);
  assert.deepEqual(utils.grepFile(path.join(base, 'no.txt'), /x/), []);
});

test('utils: stripAnsi removes color codes and tolerates non-strings', () => {
  assert.equal(utils.stripAnsi('\x1b[31mred\x1b[0m'), 'red');
  assert.equal(utils.stripAnsi(undefined), '');
  assert.equal(utils.stripAnsi('plain'), 'plain');
});

test('utils: commandExists rejects names with shell metacharacters', () => {
  assert.equal(utils.commandExists('bad;name'), false);
  assert.equal(utils.commandExists('rm -rf'), false);
  // node is guaranteed present (we run under it).
  assert.equal(utils.commandExists('node'), true);
});

test('utils: runCommand blocks disallowed prefixes and metacharacters', () => {
  const blockedPrefix = utils.runCommand('rm -rf /');
  assert.equal(blockedPrefix.success, false);
  assert.match(blockedPrefix.output, /unrecognized command prefix/);

  const blockedMeta = utils.runCommand('git status; rm -rf');
  assert.equal(blockedMeta.success, false);
  assert.match(blockedMeta.output, /shell metacharacters/);
});

test('utils: getGitModifiedFiles returns [] outside a git repo', () => {
  const base = makeTempDir('nogit');
  const savedCwd = process.cwd();
  try {
    process.chdir(base);
    // Not a git repo (no .git) — should return an empty array, never throw.
    assert.deepEqual(utils.getGitModifiedFiles(), []);
  } finally {
    process.chdir(savedCwd);
  }
});

// ════════════════════════════════════════════════════════════════════
// shell-split.js
// ════════════════════════════════════════════════════════════════════

test('shell-split: splits on &&, ||, ;', () => {
  assert.deepEqual(splitShellSegments('a && b || c ; d'), ['a', 'b', 'c', 'd']);
});

test('shell-split: respects quotes so operators inside are literal', () => {
  assert.deepEqual(splitShellSegments('echo "a && b"'), ['echo "a && b"']);
  assert.deepEqual(splitShellSegments("echo 'x ; y'"), ["echo 'x ; y'"]);
});

test('shell-split: does not treat redirection as a separator', () => {
  assert.deepEqual(splitShellSegments('cmd 2>&1'), ['cmd 2>&1']);
  assert.deepEqual(splitShellSegments('cmd &> out'), ['cmd &> out']);
});

test('shell-split: single & is a separator (background)', () => {
  assert.deepEqual(splitShellSegments('a & b'), ['a', 'b']);
});

test('shell-split: handles backslash escapes and empty input', () => {
  assert.deepEqual(splitShellSegments(''), []);
  // Escaped ampersands are kept literally inside the segment.
  assert.deepEqual(splitShellSegments('echo a\\&\\&b'), ['echo a\\&\\&b']);
});

// ════════════════════════════════════════════════════════════════════
// resolve-ecc-root.js
// ════════════════════════════════════════════════════════════════════

test('resolveEccRoot: explicit envRoot wins and is trimmed', () => {
  assert.equal(resolveEccRoot({ envRoot: '  /some/root  ' }), '/some/root');
});

test('resolveEccRoot: detects project-local install via probe file', () => {
  const proj = makeTempDir('ecc-proj');
  const probe = path.join('scripts', 'lib', 'utils.js');
  fs.mkdirSync(path.join(proj, 'scripts', 'lib'), { recursive: true });
  fs.writeFileSync(path.join(proj, probe), '// fake');
  const root = resolveEccRoot({ envRoot: '', projectDir: proj, homeDir: makeTempDir('ecc-home') });
  assert.equal(root, proj);
});

test('resolveEccRoot: falls back to ~/.claude when nothing matches', () => {
  const home = makeTempDir('ecc-home-empty');
  const root = resolveEccRoot({
    envRoot: '',
    projectDir: path.join(home, 'no-project'),
    cwd: path.join(home, 'no-cwd'),
    homeDir: home
  });
  assert.equal(root, path.join(home, '.claude'));
});

test('resolveEccRoot: detects standard ~/.claude install', () => {
  const home = makeTempDir('ecc-home-std');
  const probe = path.join('scripts', 'lib', 'utils.js');
  fs.mkdirSync(path.join(home, '.claude', 'scripts', 'lib'), { recursive: true });
  fs.writeFileSync(path.join(home, '.claude', probe), '// fake');
  const root = resolveEccRoot({
    envRoot: '',
    projectDir: path.join(home, 'no-project'),
    cwd: path.join(home, 'no-cwd'),
    homeDir: home
  });
  assert.equal(root, path.join(home, '.claude'));
});

// ════════════════════════════════════════════════════════════════════
// resolve-formatter.js
// ════════════════════════════════════════════════════════════════════

test('resolve-formatter: findProjectRoot walks up to package.json', () => {
  formatter.clearCaches();
  const root = makeTempDir('fmt-root');
  fs.writeFileSync(path.join(root, 'package.json'), '{}');
  const deep = path.join(root, 'src', 'nested');
  fs.mkdirSync(deep, { recursive: true });
  assert.equal(formatter.findProjectRoot(deep), root);
});

test('resolve-formatter: findProjectRoot returns startDir when no marker', () => {
  formatter.clearCaches();
  const start = makeTempDir('fmt-nomarker');
  // No marker anywhere up the temp tree's leaf — returns the start dir itself.
  assert.equal(formatter.findProjectRoot(start), start);
});

test('resolve-formatter: detectFormatter prefers biome over prettier', () => {
  formatter.clearCaches();
  const root = makeTempDir('fmt-biome');
  fs.writeFileSync(path.join(root, 'biome.json'), '{}');
  fs.writeFileSync(path.join(root, '.prettierrc'), '{}');
  assert.equal(formatter.detectFormatter(root), 'biome');
});

test('resolve-formatter: detectFormatter reads prettier key in package.json', () => {
  formatter.clearCaches();
  const root = makeTempDir('fmt-pkgkey');
  fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ prettier: {} }));
  assert.equal(formatter.detectFormatter(root), 'prettier');
});

test('resolve-formatter: detectFormatter finds prettier config file', () => {
  formatter.clearCaches();
  const root = makeTempDir('fmt-prettierfile');
  fs.writeFileSync(path.join(root, '.prettierrc.json'), '{}');
  assert.equal(formatter.detectFormatter(root), 'prettier');
});

test('resolve-formatter: detectFormatter returns null when none present', () => {
  formatter.clearCaches();
  const root = makeTempDir('fmt-none');
  assert.equal(formatter.detectFormatter(root), null);
});

test('resolve-formatter: detectFormatter tolerates malformed package.json', () => {
  formatter.clearCaches();
  const root = makeTempDir('fmt-bad');
  fs.writeFileSync(path.join(root, 'package.json'), '{ not valid json');
  // Malformed package.json must not throw; falls through to null.
  assert.equal(formatter.detectFormatter(root), null);
});

test('resolve-formatter: resolveFormatterBin returns null for unknown formatter', () => {
  formatter.clearCaches();
  const root = makeTempDir('fmt-unknown');
  assert.equal(formatter.resolveFormatterBin(root, 'eslint'), null);
});

test('resolve-formatter: resolveFormatterBin prefers local node_modules/.bin', () => {
  formatter.clearCaches();
  const root = makeTempDir('fmt-localbin');
  const binDir = path.join(root, 'node_modules', '.bin');
  fs.mkdirSync(binDir, { recursive: true });
  const binName = process.platform === 'win32' ? 'prettier.cmd' : 'prettier';
  fs.writeFileSync(path.join(binDir, binName), '');
  const res = formatter.resolveFormatterBin(root, 'prettier');
  assert.ok(res);
  assert.equal(res.bin, path.join(binDir, binName));
  assert.deepEqual(res.prefix, []);
});

test('resolve-formatter: resolveFormatterBin falls back to runner + pkg name', () => {
  formatter.clearCaches();
  const root = makeTempDir('fmt-runner');
  // No local bin — resolves to a package-manager runner with the pkg name in prefix.
  const res = formatter.resolveFormatterBin(root, 'biome');
  assert.ok(res);
  assert.ok(typeof res.bin === 'string' && res.bin.length > 0);
  assert.ok(res.prefix.includes('@biomejs/biome'));
});

// ════════════════════════════════════════════════════════════════════
// project-detect.js
// ════════════════════════════════════════════════════════════════════

test('project-detect: detects typescript + nextjs from markers/deps', () => {
  const root = makeTempDir('detect-next');
  fs.writeFileSync(path.join(root, 'tsconfig.json'), '{}');
  fs.writeFileSync(path.join(root, 'next.config.js'), '');
  fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({
    dependencies: { next: '14', react: '18' }
  }));
  const result = detectProjectType(root);
  assert.ok(result.languages.includes('typescript'));
  assert.ok(result.frameworks.includes('nextjs'));
  assert.equal(result.projectDir, root);
});

test('project-detect: detects rust from Cargo.toml', () => {
  const root = makeTempDir('detect-rust');
  fs.writeFileSync(path.join(root, 'Cargo.toml'), '[dependencies]\naxum = "0.7"\n');
  const result = detectProjectType(root);
  assert.ok(result.languages.includes('rust'));
  assert.ok(result.frameworks.includes('axum'));
});

test('project-detect: empty project resolves to unknown primary', () => {
  const root = makeTempDir('detect-empty');
  const result = detectProjectType(root);
  assert.deepEqual(result.languages, []);
  assert.deepEqual(result.frameworks, []);
  assert.equal(result.primary, 'unknown');
});

test('project-detect: dedupes javascript when typescript present', () => {
  const root = makeTempDir('detect-dedupe');
  fs.writeFileSync(path.join(root, 'tsconfig.json'), '{}');
  fs.writeFileSync(path.join(root, 'package.json'), '{}'); // js marker
  const result = detectProjectType(root);
  assert.ok(result.languages.includes('typescript'));
  assert.ok(!result.languages.includes('javascript'));
});

test('project-detect: fullstack when frontend + backend frameworks coexist', () => {
  const root = makeTempDir('detect-fullstack');
  fs.writeFileSync(path.join(root, 'tsconfig.json'), '{}');
  fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({
    dependencies: { next: '14', react: '18', express: '4' }
  }));
  const result = detectProjectType(root);
  assert.equal(result.primary, 'fullstack');
});

test('project-detect: getPackageJsonDeps handles missing/malformed', () => {
  const root = makeTempDir('detect-deps');
  assert.deepEqual(getPackageJsonDeps(root), []); // no package.json
  fs.writeFileSync(path.join(root, 'package.json'), '{ bad');
  assert.deepEqual(getPackageJsonDeps(root), []); // malformed
  fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({
    dependencies: { a: '1' }, devDependencies: { b: '2' }
  }));
  assert.deepEqual(getPackageJsonDeps(root).sort(), ['a', 'b']);
});

test('project-detect: getRustDeps extracts crate names', () => {
  const root = makeTempDir('detect-rustdeps');
  fs.writeFileSync(path.join(root, 'Cargo.toml'),
    '[dependencies]\nserde = "1"\ntokio = { version = "1" }\n');
  const deps = getRustDeps(root);
  assert.ok(deps.includes('serde'));
  assert.ok(deps.includes('tokio'));
});

// ════════════════════════════════════════════════════════════════════
// package-manager.js
// ════════════════════════════════════════════════════════════════════

test('package-manager: detectFromLockFile recognizes lock files by priority', () => {
  const root = makeTempDir('pm-lock');
  fs.writeFileSync(path.join(root, 'package-lock.json'), '{}');
  assert.equal(pm.detectFromLockFile(root), 'npm');

  const root2 = makeTempDir('pm-lock2');
  fs.writeFileSync(path.join(root2, 'pnpm-lock.yaml'), '');
  fs.writeFileSync(path.join(root2, 'package-lock.json'), '{}');
  // pnpm precedes npm in DETECTION_PRIORITY.
  assert.equal(pm.detectFromLockFile(root2), 'pnpm');
});

test('package-manager: detectFromLockFile returns null when no lock file', () => {
  assert.equal(pm.detectFromLockFile(makeTempDir('pm-nolock')), null);
});

test('package-manager: detectFromPackageJson reads packageManager field', () => {
  const root = makeTempDir('pm-pkgfield');
  fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ packageManager: 'yarn@3.0.0' }));
  assert.equal(pm.detectFromPackageJson(root), 'yarn');
});

test('package-manager: getPackageManager honors environment variable', () => {
  process.env.CLAUDE_PACKAGE_MANAGER = 'bun';
  try {
    const result = pm.getPackageManager({ projectDir: makeTempDir('pm-env') });
    assert.equal(result.name, 'bun');
    assert.equal(result.source, 'environment');
  } finally {
    delete process.env.CLAUDE_PACKAGE_MANAGER;
  }
});

test('package-manager: getPackageManager defaults to npm when nothing detected', () => {
  delete process.env.CLAUDE_PACKAGE_MANAGER;
  const result = pm.getPackageManager({ projectDir: makeTempDir('pm-default') });
  assert.equal(result.name, 'npm');
  assert.equal(result.source, 'default');
});

test('package-manager: getPackageManager prefers lock file over default', () => {
  delete process.env.CLAUDE_PACKAGE_MANAGER;
  const root = makeTempDir('pm-lockdetect');
  fs.writeFileSync(path.join(root, 'yarn.lock'), '');
  const result = pm.getPackageManager({ projectDir: root });
  assert.equal(result.name, 'yarn');
  assert.equal(result.source, 'lock-file');
});

test('package-manager: getRunCommand maps known scripts and rejects unsafe names', () => {
  delete process.env.CLAUDE_PACKAGE_MANAGER;
  const projectDir = makeTempDir('pm-run');
  assert.equal(pm.getRunCommand('install', { projectDir }), 'npm install');
  assert.equal(pm.getRunCommand('test', { projectDir }), 'npm test');
  assert.equal(pm.getRunCommand('lint', { projectDir }), 'npm run lint');
  assert.throws(() => pm.getRunCommand('bad;rm', { projectDir }), /unsafe characters/);
  assert.throws(() => pm.getRunCommand(''), /non-empty string/);
});

test('package-manager: getExecCommand builds command and rejects unsafe input', () => {
  delete process.env.CLAUDE_PACKAGE_MANAGER;
  const projectDir = makeTempDir('pm-exec');
  assert.equal(pm.getExecCommand('prettier', '--write .', { projectDir }), 'npx prettier --write .');
  assert.throws(() => pm.getExecCommand('bad;name', '', { projectDir }), /unsafe characters/);
  assert.throws(() => pm.getExecCommand('prettier', 'arg`evil`', { projectDir }), /unsafe characters/);
});

test('package-manager: getCommandPattern produces matching regex strings', () => {
  const devPattern = new RegExp(`^${pm.getCommandPattern('dev')}$`);
  assert.ok(devPattern.test('npm run dev'));
  assert.ok(devPattern.test('pnpm dev'));
  assert.ok(devPattern.test('bun run dev'));
  assert.ok(!devPattern.test('npm run build'));
});

test('package-manager: setPreferredPackageManager rejects unknown PM', () => {
  assert.throws(() => pm.setPreferredPackageManager('cargo'), /Unknown package manager/);
});

test('package-manager: set/persist global preference round-trips via sandbox', () => {
  // HOME is redirected to homeSandbox, so this writes into the temp sandbox.
  const cfg = pm.setPreferredPackageManager('pnpm');
  assert.equal(cfg.packageManager, 'pnpm');
  const configPath = path.join(homeSandbox, '.claude', 'package-manager.json');
  assert.ok(fs.existsSync(configPath));
});

// ════════════════════════════════════════════════════════════════════
// hook-flags.js
// ════════════════════════════════════════════════════════════════════

test('hook-flags: getHookProfile defaults to standard for unset/invalid', () => {
  delete process.env.ECC_HOOK_PROFILE;
  assert.equal(hookFlags.getHookProfile(), 'standard');
  process.env.ECC_HOOK_PROFILE = 'bogus';
  assert.equal(hookFlags.getHookProfile(), 'standard');
  process.env.ECC_HOOK_PROFILE = 'STRICT';
  assert.equal(hookFlags.getHookProfile(), 'strict');
  delete process.env.ECC_HOOK_PROFILE;
});

test('hook-flags: getDisabledHookIds parses comma list, normalized', () => {
  process.env.ECC_DISABLED_HOOKS = ' Foo , BAR ,, baz ';
  try {
    const set = hookFlags.getDisabledHookIds();
    assert.ok(set.has('foo'));
    assert.ok(set.has('bar'));
    assert.ok(set.has('baz'));
    assert.equal(set.size, 3);
  } finally {
    delete process.env.ECC_DISABLED_HOOKS;
  }
  delete process.env.ECC_DISABLED_HOOKS;
  assert.equal(hookFlags.getDisabledHookIds().size, 0);
});

test('hook-flags: parseProfiles handles arrays, strings, and fallback', () => {
  assert.deepEqual(hookFlags.parseProfiles('minimal,strict'), ['minimal', 'strict']);
  assert.deepEqual(hookFlags.parseProfiles(['STANDARD', 'bogus']), ['standard']);
  assert.deepEqual(hookFlags.parseProfiles(null), ['standard', 'strict']);
  assert.deepEqual(hookFlags.parseProfiles('garbage'), ['standard', 'strict']);
});

test('hook-flags: isHookEnabled respects disabled set and profile gating', () => {
  delete process.env.ECC_HOOK_PROFILE;
  delete process.env.ECC_DISABLED_HOOKS;
  // Empty id => always enabled.
  assert.equal(hookFlags.isHookEnabled(''), true);

  // Disabled wins outright.
  process.env.ECC_DISABLED_HOOKS = 'myhook';
  assert.equal(hookFlags.isHookEnabled('myhook'), false);
  delete process.env.ECC_DISABLED_HOOKS;

  // Default profile = standard; only enabled when allowed profiles include it.
  assert.equal(hookFlags.isHookEnabled('h', { profiles: ['standard', 'strict'] }), true);
  assert.equal(hookFlags.isHookEnabled('h', { profiles: ['minimal'] }), false);
});

// ════════════════════════════════════════════════════════════════════
// agent-compress.js
// ════════════════════════════════════════════════════════════════════

const AGENT_FIXTURE = `---
name: test-agent
description: A test agent for unit tests
tools: ["Read", "Grep"]
model: haiku
---

This is the first paragraph. It has two sentences.

- a list item that should be skipped
`;

test('agent-compress: parseFrontmatter extracts keys, arrays, and body', () => {
  const { frontmatter, body } = agentCompress.parseFrontmatter(AGENT_FIXTURE);
  assert.equal(frontmatter.name, 'test-agent');
  assert.deepEqual(frontmatter.tools, ['Read', 'Grep']);
  assert.equal(frontmatter.model, 'haiku');
  assert.match(body, /first paragraph/);
});

test('agent-compress: parseFrontmatter returns body unchanged when no frontmatter', () => {
  const { frontmatter, body } = agentCompress.parseFrontmatter('no frontmatter here');
  assert.deepEqual(frontmatter, {});
  assert.equal(body, 'no frontmatter here');
});

test('agent-compress: extractSummary skips headings/lists, returns N sentences', () => {
  const body = '# Heading\n\n- bullet\n\nReal sentence one. Real sentence two.';
  assert.equal(agentCompress.extractSummary(body, 1), 'Real sentence one.');
  assert.equal(agentCompress.extractSummary(body, 2), 'Real sentence one. Real sentence two.');
  assert.equal(agentCompress.extractSummary('# only heading\n\n- only list'), '');
});

test('agent-compress: loadAgent / loadAgents / buildAgentCatalog over temp dir', () => {
  const dir = makeTempDir('agents');
  fs.writeFileSync(path.join(dir, 'test-agent.md'), AGENT_FIXTURE);
  fs.writeFileSync(path.join(dir, 'notes.txt'), 'ignored');

  const agent = agentCompress.loadAgent(path.join(dir, 'test-agent.md'));
  assert.equal(agent.name, 'test-agent');
  assert.equal(agent.model, 'haiku');
  assert.ok(agent.byteSize > 0);

  const all = agentCompress.loadAgents(dir);
  assert.equal(all.length, 1); // only the .md file

  const cat = agentCompress.buildAgentCatalog(dir, { mode: 'catalog' });
  assert.equal(cat.stats.totalAgents, 1);
  assert.equal(cat.stats.mode, 'catalog');
  assert.equal(cat.agents[0].name, 'test-agent');
  assert.equal(cat.agents[0].body, undefined); // catalog excludes body

  const summary = agentCompress.buildAgentCatalog(dir, { mode: 'summary' });
  assert.ok('summary' in summary.agents[0]);

  const full = agentCompress.buildAgentCatalog(dir, { mode: 'full' });
  assert.ok(full.agents[0].body.length > 0);
});

test('agent-compress: buildAgentCatalog rejects invalid mode and missing dir', () => {
  const dir = makeTempDir('agents-bad');
  assert.throws(() => agentCompress.buildAgentCatalog(dir, { mode: 'nope' }), /Invalid mode/);
  // Missing directory => empty agent list, no throw.
  const missing = agentCompress.buildAgentCatalog(path.join(dir, 'nope'));
  assert.equal(missing.stats.totalAgents, 0);
});

test('agent-compress: lazyLoadAgent guards against traversal and missing', () => {
  const dir = makeTempDir('agents-lazy');
  fs.writeFileSync(path.join(dir, 'real.md'), AGENT_FIXTURE);
  assert.equal(agentCompress.lazyLoadAgent(dir, '../etc/passwd'), null); // invalid name
  assert.equal(agentCompress.lazyLoadAgent(dir, 'ghost'), null); // not found
  const loaded = agentCompress.lazyLoadAgent(dir, 'real');
  assert.ok(loaded);
  assert.equal(loaded.fileName, 'real');
});

// ════════════════════════════════════════════════════════════════════
// inspection.js
// ════════════════════════════════════════════════════════════════════

test('inspection: normalizeFailureReason strips timestamps/uuids/paths', () => {
  assert.equal(inspection.normalizeFailureReason(null), 'unknown');
  assert.equal(inspection.normalizeFailureReason(123), 'unknown');
  const out = inspection.normalizeFailureReason(
    'Error at 2024-01-02T03:04:05.000Z in /usr/local/file.js'
  );
  assert.match(out, /<timestamp>/);
  assert.match(out, /<path>/);
  assert.ok(!/2024-01-02/.test(out));
});

test('inspection: groupFailures keeps only failure outcomes, grouped by reason', () => {
  const runs = [
    { skillId: 's1', outcome: 'failure', failureReason: 'timeout after 5s' },
    { skillId: 's1', outcome: 'error', failureReason: 'timeout after 9s' },
    { skillId: 's1', outcome: 'success', failureReason: 'ignored' },
  ];
  const groups = inspection.groupFailures(runs);
  // Both timeout-* normalize the same way; success is excluded.
  let total = 0;
  for (const [, g] of groups) total += g.runs.length;
  assert.equal(total, 2);
});

test('inspection: detectPatterns honors threshold and sorts by count', () => {
  const mk = (reason) => ({ skillId: 'sx', outcome: 'failure', failureReason: reason, createdAt: '2024-01-01T00:00:00Z' });
  const runs = [mk('timeout'), mk('timeout'), mk('timeout'), mk('parse error')];
  const patterns = inspection.detectPatterns(runs, { threshold: 3 });
  assert.equal(patterns.length, 1);
  assert.equal(patterns[0].count, 3);
  assert.equal(patterns[0].normalizedReason, 'timeout');
});

test('inspection: detectPatterns returns [] when below threshold', () => {
  const runs = [{ skillId: 's', outcome: 'failure', failureReason: 'x' }];
  assert.deepEqual(inspection.detectPatterns(runs, { threshold: 3 }), []);
});

test('inspection: generateReport clean vs attention_needed', () => {
  const clean = inspection.generateReport([], { generatedAt: 'T' });
  assert.equal(clean.status, 'clean');
  assert.equal(clean.patternCount, 0);

  const report = inspection.generateReport([{
    skillId: 's', normalizedReason: 'timeout', count: 4,
    firstSeen: 'a', lastSeen: 'b', sessionIds: ['x'], versions: ['1'], rawReasons: ['timeout 5s'],
  }], { generatedAt: 'T' });
  assert.equal(report.status, 'attention_needed');
  assert.equal(report.totalFailures, 4);
  assert.match(report.patterns[0].suggestedAction, /timeout/i);
});

test('inspection: suggestAction maps reasons to remediation hints', () => {
  assert.match(inspection.suggestAction({ normalizedReason: 'permission denied', versions: [] }), /permission/i);
  assert.match(inspection.suggestAction({ normalizedReason: 'file not found', versions: [] }), /exist/i);
  assert.match(inspection.suggestAction({ normalizedReason: 'json parse failed', versions: [] }), /format/i);
  assert.match(inspection.suggestAction({ normalizedReason: 'weird', versions: ['1', '2'] }), /version/i);
  assert.match(inspection.suggestAction({ normalizedReason: 'weird', versions: [] }), /root cause/i);
});

test('inspection: inspect runs the pipeline against a fake store', () => {
  const fakeStore = {
    getStatus() {
      return {
        generatedAt: 'GEN',
        skillRuns: {
          recent: [
            { skillId: 's', outcome: 'failure', failureReason: 'timeout', createdAt: '2024-01-01T00:00:00Z' },
            { skillId: 's', outcome: 'failure', failureReason: 'timeout', createdAt: '2024-01-02T00:00:00Z' },
            { skillId: 's', outcome: 'failure', failureReason: 'timeout', createdAt: '2024-01-03T00:00:00Z' },
          ]
        }
      };
    }
  };
  const report = inspection.inspect(fakeStore, { threshold: 3 });
  assert.equal(report.generatedAt, 'GEN');
  assert.equal(report.status, 'attention_needed');
  assert.equal(report.patterns[0].count, 3);
});

// ════════════════════════════════════════════════════════════════════
// session-aliases.js  (HOME redirected to homeSandbox)
// ════════════════════════════════════════════════════════════════════

test('session-aliases: loadAliases returns default structure when no file', () => {
  // Fresh sandbox subdir — no aliases file yet.
  const sub = makeTempDir('alias-home');
  const saved = process.env.HOME;
  const savedUP = process.env.USERPROFILE;
  process.env.HOME = sub;
  process.env.USERPROFILE = sub;
  try {
    const data = aliases.loadAliases();
    assert.equal(data.version, '1.0');
    assert.deepEqual(data.aliases, {});
  } finally {
    process.env.HOME = saved;
    process.env.USERPROFILE = savedUP;
  }
});

test('session-aliases: setAlias validates input', () => {
  assert.equal(aliases.setAlias('', '/p').success, false);
  assert.equal(aliases.setAlias('ok', '').success, false);
  assert.equal(aliases.setAlias('bad name', '/p').success, false);
  assert.equal(aliases.setAlias('list', '/p').success, false); // reserved
  assert.match(aliases.setAlias('x'.repeat(129), '/p').error, /128/);
});

test('session-aliases: set/resolve/list/rename/delete round-trip in sandbox', () => {
  const sub = makeTempDir('alias-rt');
  const saved = process.env.HOME;
  const savedUP = process.env.USERPROFILE;
  process.env.HOME = sub;
  process.env.USERPROFILE = sub;
  try {
    const setRes = aliases.setAlias('myalias', '/sessions/abc', 'My Title');
    assert.equal(setRes.success, true);
    assert.equal(setRes.isNew, true);

    const resolved = aliases.resolveAlias('myalias');
    assert.equal(resolved.sessionPath, '/sessions/abc');
    assert.equal(resolved.title, 'My Title');
    assert.equal(aliases.resolveAlias('missing'), null);
    assert.equal(aliases.resolveAlias('bad name'), null);

    // resolveSessionAlias: known alias -> path, unknown -> echoes input.
    assert.equal(aliases.resolveSessionAlias('myalias'), '/sessions/abc');
    assert.equal(aliases.resolveSessionAlias('/raw/path'), '/raw/path');

    const list = aliases.listAliases();
    assert.equal(list.length, 1);
    assert.equal(list[0].name, 'myalias');

    const renamed = aliases.renameAlias('myalias', 'renamed');
    assert.equal(renamed.success, true);
    assert.equal(aliases.resolveAlias('myalias'), null);
    assert.equal(aliases.resolveAlias('renamed').sessionPath, '/sessions/abc');

    const updated = aliases.updateAliasTitle('renamed', 'New Title');
    assert.equal(updated.success, true);
    assert.equal(aliases.resolveAlias('renamed').title, 'New Title');

    const forSession = aliases.getAliasesForSession('/sessions/abc');
    assert.equal(forSession.length, 1);

    const del = aliases.deleteAlias('renamed');
    assert.equal(del.success, true);
    assert.equal(aliases.deleteAlias('renamed').success, false); // already gone
  } finally {
    process.env.HOME = saved;
    process.env.USERPROFILE = savedUP;
  }
});

test('session-aliases: cleanupAliases removes entries for missing sessions', () => {
  const sub = makeTempDir('alias-cleanup');
  const saved = process.env.HOME;
  const savedUP = process.env.USERPROFILE;
  process.env.HOME = sub;
  process.env.USERPROFILE = sub;
  try {
    aliases.setAlias('keep', '/exists');
    aliases.setAlias('drop', '/gone');
    const result = aliases.cleanupAliases((p) => p === '/exists');
    assert.equal(result.success, true);
    assert.equal(result.removed, 1);
    assert.equal(aliases.resolveAlias('keep').sessionPath, '/exists');
    assert.equal(aliases.resolveAlias('drop'), null);

    // Non-function arg is rejected gracefully.
    const bad = aliases.cleanupAliases('not a function');
    assert.match(bad.error, /must be a function/);
  } finally {
    process.env.HOME = saved;
    process.env.USERPROFILE = savedUP;
  }
});
