'use strict';

// Force the dependency-check hook offline so its tests never hit the live npm
// registry — deterministic and fast, independent of network reachability.
process.env.ECC_DEPCHECK_OFFLINE = '1';

/**
 * Deep branch-coverage tests for the pre-bash PreToolUse hooks.
 *
 * The sibling `pre-bash-hooks.test.js` covers the easy "pass-through" paths.
 * This file drives the UNCOVERED block/warn paths that shell out to `git`.
 * To do that deterministically and offline we build a real TEMP git repo per
 * case, `git add` files into it, then `process.chdir()` into the repo so each
 * hook's `git` calls (which run with cwd: process.cwd()) see our fixtures.
 *
 * Node built-in test runner only — no external deps, deterministic, no network
 * assertions. Every temp dir lives under os.tmpdir(); cwd + env are restored.
 *
 * require.main === module stdin entry blocks are NOT reachable in-process and
 * are documented as such in the task report (they only run when the hook file
 * is the program's main module).
 */

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs');
const { spawnSync } = require('node:child_process');

const gitAddGuard = require('../pre-bash-git-add-guard');
const commitQuality = require('../pre-bash-commit-quality');
const dbMigration = require('../pre-bash-db-migration-check');
const dependencyCheck = require('../pre-bash-dependency-check');
const tmuxReminder = require('../pre-bash-tmux-reminder');
const pushReminder = require('../pre-bash-git-push-reminder');

// ── shared helpers ──────────────────────────────────────────────────────────

const bash = (command) => JSON.stringify({ tool_name: 'Bash', tool_input: { command } });

// Detect whether `git` is usable in this environment; skip git-driven cases if not.
function gitAvailable() {
  const r = spawnSync('git', ['--version'], { encoding: 'utf8' });
  return !r.error && r.status === 0;
}
const GIT_OK = gitAvailable();

function tempGitRepo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ecc-git-'));
  const g = (...a) => spawnSync('git', a, { cwd: dir, encoding: 'utf8' });
  g('init', '-q');
  g('config', 'user.email', 't@t');
  g('config', 'user.name', 't');
  g('config', 'commit.gpgsign', 'false');
  g('config', 'core.autocrlf', 'false');
  return { dir, g };
}

function writeFile(dir, rel, content) {
  const full = path.join(dir, rel);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content);
  return full;
}

const tracked = [];
function trackRepo(repo) {
  tracked.push(repo.dir);
  return repo;
}

let savedCwd;
before(() => {
  savedCwd = process.cwd();
});
after(() => {
  try { process.chdir(savedCwd); } catch { /* ignore */ }
  for (const dir of tracked) {
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ }
  }
});

/** Run `fn` with process.cwd() temporarily set to `dir`; always restore. */
function inDir(dir, fn) {
  const prev = process.cwd();
  process.chdir(dir);
  try {
    return fn();
  } finally {
    process.chdir(prev);
  }
}

// ════════════════════════════════════════════════════════════════════════════
// pre-bash-git-add-guard.js — listAffectedPaths + evaluate block/allow paths
// ════════════════════════════════════════════════════════════════════════════

test('git-add-guard: bulk add with dangerous untracked paths -> BLOCK (exit 2)', { skip: !GIT_OK }, () => {
  const repo = trackRepo(tempGitRepo());
  // Untracked dangerous paths that a `git add -A` would sweep in.
  writeFile(repo.dir, 'node_modules/react/index.js', 'module.exports = {};\n');
  writeFile(repo.dir, '.env.production', 'SECRET=1\n');
  writeFile(repo.dir, 'src/app.ts', 'export const x = 1;\n');

  const out = inDir(repo.dir, () => gitAddGuard.run(bash('git add -A')));
  assert.equal(typeof out, 'object');
  assert.equal(out.exitCode, 2);
  // formatBlockMessage content (lines 99-120)
  assert.match(out.stderr, /BLOCKED/);
  assert.match(out.stderr, /node_modules\//);
  assert.match(out.stderr, /\.env files/);
  assert.match(out.stderr, /git add <path1>/);
});

test('git-add-guard: bulk add with only clean paths -> ALLOW (exit 0)', { skip: !GIT_OK }, () => {
  const repo = trackRepo(tempGitRepo());
  writeFile(repo.dir, 'src/app.ts', 'export const x = 1;\n');
  writeFile(repo.dir, 'README.md', '# hi\n');

  const raw = bash('git add .');
  const out = inDir(repo.dir, () => gitAddGuard.run(raw));
  // detectBulkAdd true, listAffectedPaths returns only clean paths -> allow.
  assert.equal(out.stdout, raw);
  assert.equal(out.exitCode, 0);
});

test('git-add-guard: bulk add covers many dangerous label paths + >5 truncation', { skip: !GIT_OK }, () => {
  const repo = trackRepo(tempGitRepo());
  // >5 files under node_modules to exercise the "(and N more)" branch.
  for (let i = 0; i < 7; i += 1) {
    writeFile(repo.dir, `node_modules/pkg${i}/index.js`, 'x\n');
  }
  writeFile(repo.dir, 'dist/bundle.js', 'x\n');
  writeFile(repo.dir, 'build/out.o', 'x\n');
  writeFile(repo.dir, '.venv/lib/site.py', 'x\n');
  writeFile(repo.dir, '__pycache__/m.cpython-311.pyc', 'x\n');

  const out = inDir(repo.dir, () => gitAddGuard.run(bash('git add --all')));
  assert.equal(out.exitCode, 2);
  assert.match(out.stderr, /and \d+ more/);
  assert.match(out.stderr, /\*\.pyc/);
  assert.match(out.stderr, /dist\//);
});

test('git-add-guard: bulk add with renamed file in status (R entry skip) still allows clean', { skip: !GIT_OK }, () => {
  const repo = trackRepo(tempGitRepo());
  // Create + commit a file, then rename it so status shows an R entry.
  writeFile(repo.dir, 'old.ts', 'export const a = 1;\n');
  repo.g('add', 'old.ts');
  repo.g('commit', '-q', '-m', 'init');
  repo.g('mv', 'old.ts', 'new.ts');

  const raw = bash('git add -A');
  const out = inDir(repo.dir, () => gitAddGuard.run(raw));
  // Rename of a clean file -> no dangerous match -> allow (exercises R skip).
  assert.equal(out.exitCode, 0);
  assert.equal(out.stdout, raw);
});

// ════════════════════════════════════════════════════════════════════════════
// pre-bash-commit-quality.js — staged-file issue detection + verdict paths
// ════════════════════════════════════════════════════════════════════════════

test('commit-quality: staged file with debugger + secret -> BLOCK (exit 2)', { skip: !GIT_OK }, () => {
  const repo = trackRepo(tempGitRepo());
  // debugger => error severity; AWS key => error severity. errorCount>0 => block.
  const content = [
    'function f() {',
    '  debugger;',
    '  const k = "AKIAABCDEFGHIJKLMNOP";', // AWS Access Key pattern (AKIA + 16)
    '  return k;',
    '}',
    '',
  ].join('\n');
  writeFile(repo.dir, 'src/bad.js', content);
  repo.g('add', 'src/bad.js');

  const raw = bash('git commit -m "feat: add thing"');
  const out = inDir(repo.dir, () => commitQuality.run(raw));
  assert.equal(out.exitCode, 2);
  assert.equal(out.stdout, raw);
});

test('commit-quality: staged file with only warnings (console.log) + msg issues -> ALLOW', { skip: !GIT_OK }, () => {
  const repo = trackRepo(tempGitRepo());
  const content = [
    'export function g() {',
    '  console.log("hello");', // warning severity
    '  // TODO: clean this up',  // info severity (no issue ref)
    '  return 1;',
    '}',
    '',
  ].join('\n');
  writeFile(repo.dir, 'src/warn.js', content);
  repo.g('add', 'src/warn.js');

  // Non-conventional + capitalized + trailing period + long -> message issues.
  const longSubject = 'X'.repeat(80);
  const raw = bash(`git commit -m "Bad commit message ${longSubject}."`);
  const out = inDir(repo.dir, () => commitQuality.run(raw));
  // Only warnings/info (no error) -> commit allowed (exit 0).
  assert.equal(out.exitCode, 0);
  assert.equal(out.stdout, raw);
});

test('commit-quality: staged clean file -> PASS (all checks passed, exit 0)', { skip: !GIT_OK }, () => {
  const repo = trackRepo(tempGitRepo());
  writeFile(repo.dir, 'src/clean.ts', 'export const value = 42;\n');
  repo.g('add', 'src/clean.ts');

  const raw = bash('git commit -m "feat: add value"');
  const out = inDir(repo.dir, () => commitQuality.run(raw));
  assert.equal(out.exitCode, 0);
  assert.equal(out.stdout, raw);
});

test('commit-quality: commit with staged non-checkable file (.md only) -> allow', { skip: !GIT_OK }, () => {
  const repo = trackRepo(tempGitRepo());
  writeFile(repo.dir, 'docs/readme.md', '# title\nconsole.log not a code file\n');
  repo.g('add', 'docs/readme.md');

  const raw = bash('git commit -m "docs: update readme"');
  const out = inDir(repo.dir, () => commitQuality.run(raw));
  // filesToCheck empty (md not checkable) -> no issues -> PASS path.
  assert.equal(out.exitCode, 0);
});

test('commit-quality: git commit with no staged files -> allow with notice', { skip: !GIT_OK }, () => {
  const repo = trackRepo(tempGitRepo());
  // Make at least one commit so HEAD exists but nothing staged.
  writeFile(repo.dir, 'base.txt', 'x\n');
  repo.g('add', 'base.txt');
  repo.g('commit', '-q', '-m', 'init');

  const raw = bash('git commit -m "feat: nothing"');
  const out = inDir(repo.dir, () => commitQuality.run(raw));
  assert.equal(out.exitCode, 0);
  assert.equal(out.stdout, raw);
});

test('commit-quality: api-key secret pattern in staged file -> BLOCK', { skip: !GIT_OK }, () => {
  const repo = trackRepo(tempGitRepo());
  // api_key = "..." pattern => secret => error => block.
  writeFile(repo.dir, 'cfg.py', 'api_key = "supersecretvalue123"\n');
  repo.g('add', 'cfg.py');

  const raw = bash('git commit -m "chore: add config"');
  const out = inDir(repo.dir, () => commitQuality.run(raw));
  assert.equal(out.exitCode, 2);
});

// ════════════════════════════════════════════════════════════════════════════
// pre-bash-db-migration-check.js — diff scan, CRITICAL block, WARNING allow
// ════════════════════════════════════════════════════════════════════════════

test('db-migration-check: staged CRITICAL migration on commit -> BLOCK (exit 2)', { skip: !GIT_OK }, () => {
  const repo = trackRepo(tempGitRepo());
  writeFile(repo.dir, 'migrations/0001_drop.sql', 'DROP TABLE users;\n');
  repo.g('add', 'migrations/0001_drop.sql');

  const out = inDir(repo.dir, () => dbMigration.run(bash('git commit -m "feat: migration"')));
  assert.equal(typeof out, 'object');
  assert.equal(out.exitCode, 2);
  assert.match(out.stderr, /BLOCKED/);
  assert.match(out.stderr, /DROP TABLE/);
  assert.match(out.stderr, /Risk Assessment: CRITICAL/);
});

test('db-migration-check: staged WARNING-only migration on commit -> ALLOW + report', { skip: !GIT_OK }, () => {
  const repo = trackRepo(tempGitRepo());
  // CREATE INDEX without CONCURRENTLY => WARNING (no CRITICAL).
  writeFile(repo.dir, 'migrations/0002_idx.sql', 'CREATE INDEX idx_users_email ON users (email);\n');
  repo.g('add', 'migrations/0002_idx.sql');

  const raw = bash('git commit -m "perf: add index"');
  const out = inDir(repo.dir, () => dbMigration.run(raw));
  assert.equal(typeof out, 'object');
  assert.equal(out.exitCode, 0);
  assert.equal(out.stdout, raw);
  assert.match(out.stderr, /WARNING/);
  assert.match(out.stderr, /CREATE INDEX without CONCURRENTLY/);
});

test('db-migration-check: untracked migration via "git add && commit" -> scanned & blocked', { skip: !GIT_OK }, () => {
  const repo = trackRepo(tempGitRepo());
  // Untracked (not staged) migration; command stages new files -> untrackedMigrationLines.
  writeFile(repo.dir, 'migrations/0003_trunc.sql', 'TRUNCATE orders;\n');

  const out = inDir(repo.dir, () => dbMigration.run(bash('git add . && git commit -m "feat: x"')));
  assert.equal(out.exitCode, 2);
  assert.match(out.stderr, /TRUNCATE/);
});

test('db-migration-check: commit -am path scans unstaged tracked changes', { skip: !GIT_OK }, () => {
  const repo = trackRepo(tempGitRepo());
  writeFile(repo.dir, 'migrations/0004_alter.sql', '-- placeholder\n');
  repo.g('add', 'migrations/0004_alter.sql');
  repo.g('commit', '-q', '-m', 'init migration');
  // Modify the tracked migration with a CRITICAL change, do NOT stage it.
  writeFile(repo.dir, 'migrations/0004_alter.sql', '-- placeholder\nDROP COLUMN email;\n');

  const out = inDir(repo.dir, () => dbMigration.run(bash('git commit -am "fix: drop col"')));
  assert.equal(out.exitCode, 2);
  assert.match(out.stderr, /DROP COLUMN/);
});

test('db-migration-check: foundation DDL under apps/schemas/sql/ is a contract, not a migration -> pass through', { skip: !GIT_OK }, () => {
  const repo = trackRepo(tempGitRepo());
  // Landing the pfsdb foundation DDL (iotpf-pfs-data-model.md) must not trip
  // the runtime-migration gate — CREATE TABLE t2_* here is the original
  // definition, not a change to a frozen live table.
  writeFile(
    repo.dir,
    'apps/schemas/sql/pfsdb/SQL-iotdb_Rev1.15.sql',
    'CREATE TABLE pfs.t2_person_work_hist\n(\n  x INT\n)\n;\nTRUNCATE placeholder;\n',
  );
  repo.g('add', 'apps/schemas/sql/pfsdb/SQL-iotdb_Rev1.15.sql');

  const raw = bash('git commit -m "feat: land pfsdb foundation DDL"');
  const out = inDir(repo.dir, () => dbMigration.run(raw));
  assert.equal(out, raw); // pass-through, no report
});

test('db-migration-check: reference DDL document under docs/ is not a migration -> pass through', { skip: !GIT_OK }, () => {
  const repo = trackRepo(tempGitRepo());
  // Design documents (e.g. docs/Doc_IoTplatform*/SQL-iotdb_Rev1.15) carry the
  // same foundation DDL as apps/schemas/sql/ — documentation, not a migration.
  writeFile(
    repo.dir,
    'docs/Doc_IoTplatform/SQL-iotdb_Rev1.15.sql',
    'CREATE TABLE pfs.t2_person_work_hist\n(\n  x INT\n)\n;\nTRUNCATE placeholder;\n',
  );
  repo.g('add', 'docs/Doc_IoTplatform/SQL-iotdb_Rev1.15.sql');

  const raw = bash('git commit -m "docs: add DB design documents"');
  const out = inDir(repo.dir, () => dbMigration.run(raw));
  assert.equal(out, raw); // pass-through, no report
});

test('db-migration-check: migrations under docs/ still count -> BLOCK', { skip: !GIT_OK }, () => {
  const repo = trackRepo(tempGitRepo());
  writeFile(repo.dir, 'docs/migrations/0001_drop.sql', 'DROP TABLE pfs.me_user;\n');
  repo.g('add', 'docs/migrations/0001_drop.sql');

  const out = inDir(repo.dir, () => dbMigration.run(bash('git commit -m "feat: migration"')));
  assert.equal(out.exitCode, 2);
  assert.match(out.stderr, /DROP TABLE/);
});

test('db-migration-check: migrations under apps/schemas/sql/ still count -> BLOCK', { skip: !GIT_OK }, () => {
  const repo = trackRepo(tempGitRepo());
  writeFile(
    repo.dir,
    'apps/schemas/sql/pfsdb/migrations/0001_drop.sql',
    'DROP TABLE pfs.me_user;\n',
  );
  repo.g('add', 'apps/schemas/sql/pfsdb/migrations/0001_drop.sql');

  const out = inDir(repo.dir, () => dbMigration.run(bash('git commit -m "feat: migration"')));
  assert.equal(out.exitCode, 2);
  assert.match(out.stderr, /DROP TABLE/);
});

test('db-migration-check: ORM-declared Tier-2 change (Drizzle pgTable) -> BLOCK', { skip: !GIT_OK }, () => {
  const repo = trackRepo(tempGitRepo());
  writeFile(
    repo.dir,
    'src/db/schema.ts',
    "export const machineState = pgTable('t2_machine_state_hist', { extraFlag: boolean('extra_flag') });\n",
  );
  repo.g('add', 'src/db/schema.ts');

  const out = inDir(repo.dir, () => dbMigration.run(bash('git commit -m "feat: orm model"')));
  assert.equal(out.exitCode, 2);
  assert.match(out.stderr, /ORM-declared change to frozen Tier-2 table/);
});

test('db-migration-check: ORM-declared Tier-2 change (Prisma model) -> BLOCK', { skip: !GIT_OK }, () => {
  const repo = trackRepo(tempGitRepo());
  writeFile(
    repo.dir,
    'prisma/schema.prisma',
    'model t2_machine_state_hist {\n  extraFlag Boolean @map("extra_flag")\n}\n',
  );
  repo.g('add', 'prisma/schema.prisma');

  const out = inDir(repo.dir, () => dbMigration.run(bash('git commit -m "feat: prisma model"')));
  assert.equal(out.exitCode, 2);
  assert.match(out.stderr, /ORM-declared change to frozen Tier-2 table/);
});

test('db-migration-check: ORM-declared Tier-2 change (SQLAlchemy __tablename__) -> BLOCK', { skip: !GIT_OK }, () => {
  const repo = trackRepo(tempGitRepo());
  writeFile(
    repo.dir,
    'services/models.py',
    "class MachineState(Base):\n    __tablename__ = 't2_machine_state_hist'\n",
  );
  repo.g('add', 'services/models.py');

  const out = inDir(repo.dir, () => dbMigration.run(bash('git commit -m "feat: model"')));
  assert.equal(out.exitCode, 2);
  assert.match(out.stderr, /ORM-declared change to frozen Tier-2 table/);
});

test('db-migration-check: t2_ literal in a test fixture path is exempt -> pass through', { skip: !GIT_OK }, () => {
  const repo = trackRepo(tempGitRepo());
  writeFile(
    repo.dir,
    'src/db/__tests__/schema.test.ts',
    "assert(pgTable('t2_machine_state_hist', {}));\n",
  );
  repo.g('add', 'src/db/__tests__/schema.test.ts');

  const raw = bash('git commit -m "test: fixture"');
  const out = inDir(repo.dir, () => dbMigration.run(raw));
  assert.equal(out, raw);
});

test('db-migration-check: DDL on frozen m2_ master table -> BLOCK', { skip: !GIT_OK }, () => {
  const repo = trackRepo(tempGitRepo());
  writeFile(repo.dir, 'migrations/0005_m2.sql', 'ALTER TABLE pfs.m2_material_master ADD COLUMN opt_flag int;\n');
  repo.g('add', 'migrations/0005_m2.sql');

  const out = inDir(repo.dir, () => dbMigration.run(bash('git commit -m "feat: m2"')));
  assert.equal(out.exitCode, 2);
  assert.match(out.stderr, /t2_\*\/m2_\*/);
});

test('db-migration-check: Tier-1 DDL without catalog sync -> WARN (allow + report)', { skip: !GIT_OK }, () => {
  const repo = trackRepo(tempGitRepo());
  writeFile(repo.dir, 'migrations/0006_t1.sql', 'CREATE TABLE t1_press_cycle (id bigint, plant_code text);\n');
  repo.g('add', 'migrations/0006_t1.sql');

  const raw = bash('git commit -m "feat: t1 table"');
  const out = inDir(repo.dir, () => dbMigration.run(raw));
  assert.equal(out.exitCode, 0);
  assert.equal(out.stdout, raw);
  assert.match(out.stderr, /Tier-1 DDL without central-catalog sync/);
});

test('db-migration-check: Tier-1 DDL with catalog sync in same changeset -> pass through', { skip: !GIT_OK }, () => {
  const repo = trackRepo(tempGitRepo());
  writeFile(
    repo.dir,
    'migrations/0007_t1.sql',
    "CREATE TABLE t1_press_cycle (id bigint);\nINSERT INTO pfs.me_edge_primary_data_item (edge_id) VALUES ('EDGE-DEMO-01');\n",
  );
  repo.g('add', 'migrations/0007_t1.sql');

  const raw = bash('git commit -m "feat: t1 + catalog"');
  const out = inDir(repo.dir, () => dbMigration.run(raw));
  assert.equal(out, raw);
});

test('db-migration-check: clean (non-migration) staged change on commit -> pass through', { skip: !GIT_OK }, () => {
  const repo = trackRepo(tempGitRepo());
  writeFile(repo.dir, 'src/app.ts', 'export const x = 1;\n');
  repo.g('add', 'src/app.ts');

  const raw = bash('git commit -m "feat: app"');
  const out = inDir(repo.dir, () => dbMigration.run(raw));
  // No migration lines -> rawInput returned unchanged.
  assert.equal(out, raw);
});

test('db-migration-check: SQL comment line is ignored (not flagged)', { skip: !GIT_OK }, () => {
  const repo = trackRepo(tempGitRepo());
  writeFile(repo.dir, 'migrations/0005_comment.sql', '-- DROP TABLE users; (just a note)\nSELECT 1;\n');
  repo.g('add', 'migrations/0005_comment.sql');

  const raw = bash('git commit -m "chore: notes"');
  const out = inDir(repo.dir, () => dbMigration.run(raw));
  // Only a commented DROP + a safe SELECT -> no issues -> pass through raw.
  assert.equal(out, raw);
});

test('db-migration-check: push path scans committed range -> CRITICAL block', { skip: !GIT_OK }, () => {
  const repo = trackRepo(tempGitRepo());
  // First commit (baseline), then a second commit adding a CRITICAL migration.
  writeFile(repo.dir, 'README.md', '# repo\n');
  repo.g('add', 'README.md');
  repo.g('commit', '-q', '-m', 'init');
  writeFile(repo.dir, 'migrations/0006_drop.sql', 'DROP TABLE legacy;\n');
  repo.g('add', 'migrations/0006_drop.sql');
  repo.g('commit', '-q', '-m', 'feat: drop legacy');

  // No upstream configured -> range falls back to HEAD~1..HEAD.
  const out = inDir(repo.dir, () => dbMigration.run(bash('git push origin main')));
  assert.equal(out.exitCode, 2);
  assert.match(out.stderr, /DROP TABLE/);
});

test('db-migration-check: ADD COLUMN NOT NULL without DEFAULT -> CRITICAL block', { skip: !GIT_OK }, () => {
  const repo = trackRepo(tempGitRepo());
  writeFile(repo.dir, 'migrations/0007_notnull.sql', 'ALTER TABLE users ADD COLUMN age INT NOT NULL;\n');
  repo.g('add', 'migrations/0007_notnull.sql');

  const out = inDir(repo.dir, () => dbMigration.run(bash('git commit -m "feat: add age"')));
  assert.equal(out.exitCode, 2);
  assert.match(out.stderr, /ADD COLUMN NOT NULL/);
});

test('db-migration-check: ALTER on frozen Tier-2 table (pfs.t2_*) -> CRITICAL block', { skip: !GIT_OK }, () => {
  const repo = trackRepo(tempGitRepo());
  // Even a "safe" additive change is frozen on Tier-2 (CLAUDE.md §3).
  writeFile(repo.dir, 'migrations/0008_t2.sql',
    'ALTER TABLE pfs.t2_machine_state_hist ADD COLUMN extra_flag boolean DEFAULT false;\n');
  repo.g('add', 'migrations/0008_t2.sql');

  const out = inDir(repo.dir, () => dbMigration.run(bash('git commit -m "feat: t2 col"')));
  assert.equal(out.exitCode, 2);
  assert.match(out.stderr, /Tier-2/);
  assert.match(out.stderr, /t2_machine_state_hist/i);
});

test('db-migration-check: CREATE TABLE t2_* (new Tier-2 definition) -> CRITICAL block', { skip: !GIT_OK }, () => {
  const repo = trackRepo(tempGitRepo());
  writeFile(repo.dir, 'migrations/0009_new_t2.sql',
    'CREATE TABLE t2_material_movement_hist (id bigint);\n');
  repo.g('add', 'migrations/0009_new_t2.sql');

  const out = inDir(repo.dir, () => dbMigration.run(bash('git commit -m "feat: new t2"')));
  assert.equal(out.exitCode, 2);
  assert.match(out.stderr, /Tier-2/);
});

test('db-migration-check: additive ALTER on Tier-1 table is NOT a Tier-2 violation', { skip: !GIT_OK }, () => {
  const repo = trackRepo(tempGitRepo());
  // Tier-1 optional columns are the sanctioned place for new data needs.
  writeFile(repo.dir, 'migrations/0010_t1.sql',
    'ALTER TABLE t1_device_data ADD COLUMN opt_vibration_rms numeric DEFAULT 0;\n');
  repo.g('add', 'migrations/0010_t1.sql');

  const raw = bash('git commit -m "feat: t1 optional col"');
  const out = inDir(repo.dir, () => dbMigration.run(raw));
  // Not a freeze violation -> never blocked. The only report allowed is the
  // changeset-level catalog-sync WARNING (Tier-1 DDL must ship its
  // me_edge_primary_data_* sync — iotpf-pfs-data-model.md R3).
  assert.equal(out.exitCode, 0);
  assert.equal(out.stdout, raw);
  assert.doesNotMatch(out.stderr, /Tier-2/);
  assert.match(out.stderr, /Tier-1 DDL without central-catalog sync/);
});

test('db-migration-check: DROP SCHEMA pfs -> CRITICAL block', { skip: !GIT_OK }, () => {
  const repo = trackRepo(tempGitRepo());
  writeFile(repo.dir, 'migrations/0011_drop_schema.sql', 'DROP SCHEMA pfs CASCADE;\n');
  repo.g('add', 'migrations/0011_drop_schema.sql');

  const out = inDir(repo.dir, () => dbMigration.run(bash('git commit -m "chore: cleanup"')));
  assert.equal(out.exitCode, 2);
  assert.match(out.stderr, /DROP SCHEMA pfs/);
});

// ════════════════════════════════════════════════════════════════════════════
// pre-bash-dependency-check.js — package extraction + registryUrl + probe paths
// ════════════════════════════════════════════════════════════════════════════
//
// These commands force run() through collectPackages -> extractPackages ->
// cleanPackageName -> registryUrl -> probe. probe spawns an offline HTTPS lookup
// that resolves to 'unknown' with no network (never 'missing'), so the command
// passes through (fail-open) — exactly the documented offline contract. We do
// NOT assert on network outcome, only that the helper lines execute and the
// hook never throws and never wrongly blocks offline.

test('dependency-check: npm install <pkg> exercises extract/registryUrl/probe (offline allow)', () => {
  // @scope/pkg@version hits the scoped-version branch of cleanPackageName (slash
  // then a trailing @version); lodash@4.17.21 hits the unscoped @version branch.
  const raw = bash('npm install @scope/pkg-name@1.2.3 lodash@4.17.21');
  const out = dependencyCheck.run(raw);
  // Offline: probe -> unknown -> no missing -> pass-through rawInput.
  assert.equal(out, raw);
});

test('dependency-check: pip + cargo install lines exercise pip/cargo registryUrl', () => {
  const out1 = dependencyCheck.run(bash('pip install requests'));
  assert.equal(typeof out1, 'string');
  const out2 = dependencyCheck.run(bash('cargo add serde'));
  assert.equal(typeof out2, 'string');
});

test('dependency-check: value-flag (-r requirements.txt) consumes its arg, no package probed', () => {
  // -r consumes requirements.txt (VALUE_FLAGS); .txt also SKIP_EXT — yields 0 pkgs.
  const raw = bash('pip install -r requirements.txt');
  const out = dependencyCheck.run(raw);
  assert.equal(out, raw);
});

test('dependency-check: local path / url / dot tokens are skipped (no probe)', () => {
  // ./local, git+https url, and "." are all filtered before probe.
  const raw = bash('npm install ./local-pkg git+https://x/y.git .');
  const out = dependencyCheck.run(raw);
  assert.equal(out, raw);
});

test('dependency-check: yarn add scoped + plain names extracts cleanly (offline allow)', () => {
  const raw = bash('yarn add @org/ui react');
  const out = dependencyCheck.run(raw);
  assert.equal(out, raw);
});

test('dependency-check: package count cap — many packages does not throw', () => {
  // The probe queries the real npm registry, so whether arbitrary `pkgN` names
  // 404 (block) or fail open (pass-through) is environment-dependent — offline
  // dev passes through, a CI box with registry access may get a confirmed 404.
  // The invariant under test is the count cap (MAX_PACKAGES) absorbing a large
  // list without crashing: run() must return a string and never throw,
  // regardless of network reachability. (Previously asserted out === raw, which
  // baked in an offline-only assumption and broke the moment CI gained registry
  // access — a non-deterministic test, not a real regression.)
  const pkgs = Array.from({ length: 20 }, (_, i) => `pkg${i}`).join(' ');
  const raw = bash(`npm install ${pkgs}`);
  let out;
  assert.doesNotThrow(() => { out = dependencyCheck.run(raw); });
  // run() returns the original input on pass-through (offline / all names
  // resolve), or a block decision object { exitCode: 2, stderr } when a name
  // 404s on a networked box. Both are valid; assert it is one of those two
  // shapes and never crashes — the real, network-independent invariant.
  const passedThrough = out === raw;
  const blocked =
    out && typeof out === 'object' && out.exitCode === 2 && typeof out.stderr === 'string';
  assert.ok(passedThrough || blocked, `unexpected run() result: ${JSON.stringify(out)}`);
});

// ════════════════════════════════════════════════════════════════════════════
// pre-bash-tmux-reminder.js — behavioral reminder branch (lines 15-25)
// ════════════════════════════════════════════════════════════════════════════
//
// The reminder path only runs on non-win32 with no $TMUX. To exercise it on a
// Windows CI box too, we temporarily spoof process.platform to 'linux'. This
// touches only the test process, never the hook source. Restored in finally.

function withPlatform(plat, fn) {
  const desc = Object.getOwnPropertyDescriptor(process, 'platform');
  Object.defineProperty(process, 'platform', { value: plat, configurable: true });
  try {
    return fn();
  } finally {
    Object.defineProperty(process, 'platform', desc);
  }
}

test('tmux-reminder: matching build cmd, no TMUX, non-win32 -> reminder (allow)', () => {
  const prev = process.env.TMUX;
  delete process.env.TMUX;
  try {
    const raw = bash('cargo build --release');
    const out = withPlatform('linux', () => tmuxReminder.run(raw));
    assert.equal(typeof out, 'object');
    assert.equal(out.exitCode, 0);
    assert.equal(out.stdout, raw);
    assert.match(out.stderr, /tmux/);
  } finally {
    if (prev !== undefined) process.env.TMUX = prev;
  }
});

test('tmux-reminder: non-win32 but inside TMUX -> pass through (raw)', () => {
  const prev = process.env.TMUX;
  process.env.TMUX = '/tmp/tmux-1000/default,1,0';
  try {
    const raw = bash('pytest -q');
    const out = withPlatform('linux', () => tmuxReminder.run(raw));
    // TMUX set -> condition false -> raw pass-through.
    assert.equal(out, raw);
  } finally {
    if (prev === undefined) delete process.env.TMUX;
    else process.env.TMUX = prev;
  }
});

test('tmux-reminder: non-win32, no TMUX, non-matching cmd -> pass through (raw)', () => {
  const prev = process.env.TMUX;
  delete process.env.TMUX;
  try {
    const raw = bash('echo hi');
    const out = withPlatform('linux', () => tmuxReminder.run(raw));
    assert.equal(out, raw);
  } finally {
    if (prev !== undefined) process.env.TMUX = prev;
  }
});

// ════════════════════════════════════════════════════════════════════════════
// pre-bash-git-push-reminder.js — reminder branch + object-input handling
// ════════════════════════════════════════════════════════════════════════════

test('push-reminder: object input (non-string) git push -> reminder, stdout is JSON', () => {
  const obj = { tool_name: 'Bash', tool_input: { command: 'git push -u origin feat' } };
  const out = pushReminder.run(obj);
  assert.equal(typeof out, 'object');
  assert.equal(out.exitCode, 0);
  // Non-string rawInput -> stdout is JSON.stringify(rawInput).
  assert.equal(out.stdout, JSON.stringify(obj));
  assert.match(out.stderr, /Review changes before push/);
});

test('push-reminder: object input non-push -> raw object stringified pass-through', () => {
  const obj = { tool_name: 'Bash', tool_input: { command: 'git status' } };
  const out = pushReminder.run(obj);
  // Non-push, object input -> returns JSON.stringify(rawInput).
  assert.equal(out, JSON.stringify(obj));
});
