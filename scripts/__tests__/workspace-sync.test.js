'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  discoverProductRepos,
  parseArgs,
  repoStatus,
  actOnRepo,
  describeStatus,
  run,
  formatHuman,
  PROTECTED_RE,
} = require('../workspace-sync');

// ── a scriptable git runner ────────────────────────────────────────────────
// Maps a git subcommand (first arg) to a canned {ok,status,stdout,stderr},
// and records every call so tests can assert what ran.

function makeRunner(responses) {
  const calls = [];
  const runner = (cwd, args) => {
    calls.push({ cwd, args });
    const key = args.join(' ');
    // exact match first, then by leading subcommand
    const resp = responses[key] || responses[args[0]] || { ok: true, status: 0, stdout: '', stderr: '' };
    return typeof resp === 'function' ? resp(cwd, args) : resp;
  };
  runner.calls = calls;
  return runner;
}

const cleanStatus = {
  'rev-parse --abbrev-ref HEAD': { ok: true, stdout: 'feat/x\n' },
  'rev-parse --abbrev-ref --symbolic-full-name @{u}': { ok: true, stdout: 'origin/feat/x\n' },
  'rev-list --left-right --count @{u}...HEAD': { ok: true, stdout: '0\t0\n' },
  'status --porcelain': { ok: true, stdout: '' },
};

// ── discoverProductRepos ────────────────────────────────────────────────────

test('discoverProductRepos finds subdirs containing .git, skips README and non-git dirs', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ws-disc-'));
  fs.writeFileSync(path.join(tmp, 'README.md'), '# workspace');
  fs.mkdirSync(path.join(tmp, 'alpha', '.git'), { recursive: true });
  fs.mkdirSync(path.join(tmp, 'beta', '.git'), { recursive: true });
  fs.mkdirSync(path.join(tmp, 'not-a-repo'), { recursive: true }); // no .git

  const repos = discoverProductRepos(tmp);
  assert.deepEqual(repos.map(r => r.name), ['alpha', 'beta']);
});

test('discoverProductRepos treats a .git FILE (worktree) as a repo', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ws-disc-file-'));
  fs.mkdirSync(path.join(tmp, 'gamma'), { recursive: true });
  fs.writeFileSync(path.join(tmp, 'gamma', '.git'), 'gitdir: /elsewhere');
  assert.deepEqual(discoverProductRepos(tmp).map(r => r.name), ['gamma']);
});

test('discoverProductRepos returns [] for a missing directory', () => {
  assert.deepEqual(discoverProductRepos(path.join(os.tmpdir(), 'does-not-exist-xyz')), []);
});

// ── parseArgs ───────────────────────────────────────────────────────────────

test('parseArgs defaults action to status and requires a valid scope', () => {
  assert.equal(parseArgs(['model']).action, 'status');
  assert.equal(parseArgs(['model']).scope, 'model');
  assert.match(parseArgs([]).error, /scope must be/);
  assert.match(parseArgs(['bogus']).error, /scope must be/);
});

test('parseArgs reads action, project filter, and flags', () => {
  const p = parseArgs(['app', 'push', 'edge-pfe', '--dry-run', '--json']);
  assert.equal(p.scope, 'app');
  assert.equal(p.action, 'push');
  assert.equal(p.project, 'edge-pfe');
  assert.equal(p.dryRun, true);
  assert.equal(p.json, true);
});

test('parseArgs rejects a project filter on the model scope', () => {
  assert.match(parseArgs(['model', 'pull', 'somename']).error, /only valid for the "app" scope/);
});

test('parseArgs rejects an unknown action and unknown flag', () => {
  assert.match(parseArgs(['model', 'frobnicate']).error, /action must be/);
  assert.match(parseArgs(['model', '--bogus']).error, /unknown flag/);
});

// ── repoStatus ──────────────────────────────────────────────────────────────

test('repoStatus reports ahead/behind/dirty from git output', () => {
  const runner = makeRunner({
    'rev-parse --abbrev-ref HEAD': { ok: true, stdout: 'main\n' },
    'rev-parse --abbrev-ref --symbolic-full-name @{u}': { ok: true, stdout: 'origin/main\n' },
    'rev-list --left-right --count @{u}...HEAD': { ok: true, stdout: '2\t3\n' },
    'status --porcelain': { ok: true, stdout: ' M a.js\n?? b.js\n' },
  });
  const st = repoStatus('/repo', runner);
  assert.equal(st.branch, 'main');
  assert.equal(st.behind, 2);
  assert.equal(st.ahead, 3);
  assert.equal(st.dirty, 2);
  assert.equal(st.upstream, 'origin/main');
});

test('repoStatus handles no upstream and detached HEAD', () => {
  const runner = makeRunner({
    'rev-parse --abbrev-ref HEAD': { ok: true, stdout: 'HEAD\n' },
    'rev-parse --abbrev-ref --symbolic-full-name @{u}': { ok: false, stderr: 'no upstream' },
    'status --porcelain': { ok: true, stdout: '' },
  });
  const st = repoStatus('/repo', runner);
  assert.equal(st.detached, true);
  assert.equal(st.upstream, null);
  assert.equal(st.ahead, 0);
  assert.equal(st.behind, 0);
});

// ── actOnRepo ───────────────────────────────────────────────────────────────

test('actOnRepo status never mutates — only read commands run', () => {
  const runner = makeRunner(cleanStatus);
  const r = actOnRepo({ name: 'x', path: '/x' }, 'status', runner);
  assert.equal(r.ok, true);
  const mutating = runner.calls.filter(c => ['pull', 'push'].includes(c.args[0]));
  assert.equal(mutating.length, 0);
});

test('actOnRepo pull uses --ff-only', () => {
  const runner = makeRunner({ ...cleanStatus, pull: { ok: true, stdout: 'Already up to date.\n' } });
  const r = actOnRepo({ name: 'x', path: '/x' }, 'pull', runner);
  assert.equal(r.ok, true);
  const pull = runner.calls.find(c => c.args[0] === 'pull');
  assert.deepEqual(pull.args, ['pull', '--ff-only']);
});

test('actOnRepo refuses pull/push on a detached HEAD', () => {
  const runner = makeRunner({
    'rev-parse --abbrev-ref HEAD': { ok: true, stdout: 'HEAD\n' },
    'rev-parse --abbrev-ref --symbolic-full-name @{u}': { ok: false, stderr: 'no upstream' },
    'status --porcelain': { ok: true, stdout: '' },
  });
  const r = actOnRepo({ name: 'x', path: '/x' }, 'push', runner);
  assert.equal(r.ok, false);
  assert.match(r.message, /detached HEAD/);
  assert.equal(runner.calls.some(c => c.args[0] === 'push'), false);
});

test('actOnRepo push sets upstream when missing and never forces', () => {
  const runner = makeRunner({
    'rev-parse --abbrev-ref HEAD': { ok: true, stdout: 'feat/y\n' },
    'rev-parse --abbrev-ref --symbolic-full-name @{u}': { ok: false, stderr: 'no upstream' },
    'status --porcelain': { ok: true, stdout: '' },
    push: { ok: true, stdout: 'branch set up\n' },
  });
  const r = actOnRepo({ name: 'y', path: '/y' }, 'push', runner);
  assert.equal(r.ok, true);
  const push = runner.calls.find(c => c.args[0] === 'push');
  assert.deepEqual(push.args, ['push', '-u', 'origin', 'feat/y']);
  assert.equal(push.args.includes('--force'), false);
  assert.equal(push.args.includes('-f'), false);
});

test('actOnRepo push warns on a protected branch', () => {
  const runner = makeRunner({
    'rev-parse --abbrev-ref HEAD': { ok: true, stdout: 'main\n' },
    'rev-parse --abbrev-ref --symbolic-full-name @{u}': { ok: true, stdout: 'origin/main\n' },
    'rev-list --left-right --count @{u}...HEAD': { ok: true, stdout: '0\t1\n' },
    'status --porcelain': { ok: true, stdout: '' },
    push: { ok: true, stdout: '' },
  });
  const r = actOnRepo({ name: 'm', path: '/m' }, 'push', runner);
  assert.match(r.message, /protected/);
});

test('actOnRepo dry-run reports intent without running the mutation', () => {
  const runner = makeRunner(cleanStatus);
  const r = actOnRepo({ name: 'x', path: '/x' }, 'pull', runner, { dryRun: true });
  assert.match(r.message, /would run: git pull --ff-only/);
  assert.equal(runner.calls.some(c => c.args[0] === 'pull'), false);
});

// ── run (orchestration + scope isolation) ───────────────────────────────────

test('run model scope targets ONLY the root repo, never apps/', () => {
  const runner = makeRunner(cleanStatus);
  const res = run(['model', 'status'], { runner, root: '/theroot', appsDir: '/theroot/apps' });
  assert.equal(res.ok, true);
  assert.equal(res.repos.length, 1);
  assert.equal(res.repos[0].path, '/theroot');
  // every git call ran in the root, never in apps/
  assert.equal(runner.calls.every(c => c.cwd === '/theroot'), true);
});

test('run app scope reports a clean, non-error message when the workspace is empty', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ws-empty-'));
  fs.writeFileSync(path.join(tmp, 'README.md'), '# only readme');
  const res = run(['app', 'pull'], { runner: makeRunner({}), root: path.dirname(tmp), appsDir: tmp });
  assert.equal(res.ok, true);
  assert.equal(res.repos.length, 0);
  assert.match(res.notes.join(' '), /workspace is empty/);
});

test('run app scope iterates every product repo and stays inside apps/', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ws-multi-'));
  fs.mkdirSync(path.join(tmp, 'alpha', '.git'), { recursive: true });
  fs.mkdirSync(path.join(tmp, 'beta', '.git'), { recursive: true });
  const runner = makeRunner(cleanStatus);
  const res = run(['app', 'status'], { runner, root: '/root', appsDir: tmp });
  assert.deepEqual(res.repos.map(r => r.name), ['alpha', 'beta']);
  // no git call touched the agent-model root
  assert.equal(runner.calls.some(c => c.cwd === '/root'), false);
});

test('run app scope with a project filter selects just that repo', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ws-filter-'));
  fs.mkdirSync(path.join(tmp, 'alpha', '.git'), { recursive: true });
  fs.mkdirSync(path.join(tmp, 'beta', '.git'), { recursive: true });
  const res = run(['app', 'status', 'beta'], { runner: makeRunner(cleanStatus), root: '/root', appsDir: tmp });
  assert.equal(res.repos.length, 1);
  assert.equal(res.repos[0].name, 'beta');
});

test('run app scope errors when the named project is absent', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ws-absent-'));
  fs.mkdirSync(path.join(tmp, 'alpha', '.git'), { recursive: true });
  const res = run(['app', 'pull', 'ghost'], { runner: makeRunner({}), root: '/root', appsDir: tmp });
  assert.equal(res.ok, false);
  assert.match(res.error, /no product repo named "ghost"/);
});

test('run surfaces a parse error as ok:false', () => {
  const res = run(['nonsense'], { runner: makeRunner({}) });
  assert.equal(res.ok, false);
  assert.match(res.error, /scope must be/);
});

test('run aggregates ok:false when any repo fails', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ws-fail-'));
  fs.mkdirSync(path.join(tmp, 'alpha', '.git'), { recursive: true });
  fs.mkdirSync(path.join(tmp, 'beta', '.git'), { recursive: true });
  const runner = (cwd, args) => {
    if (args[0] === 'rev-parse' && args.includes('HEAD') && !args.includes('@{u}')) return { ok: true, stdout: 'feat/x\n' };
    if (args[0] === 'rev-parse') return { ok: true, stdout: 'origin/feat/x\n' };
    if (args[0] === 'rev-list') return { ok: true, stdout: '0\t0\n' };
    if (args[0] === 'status') return { ok: true, stdout: '' };
    if (args[0] === 'pull') return cwd.endsWith('beta') ? { ok: false, stderr: 'network down' } : { ok: true, stdout: 'ok' };
    return { ok: true, stdout: '' };
  };
  const res = run(['app', 'pull'], { runner, root: '/root', appsDir: tmp });
  assert.equal(res.ok, false);
  assert.equal(res.repos.find(r => r.name === 'alpha').ok, true);
  assert.equal(res.repos.find(r => r.name === 'beta').ok, false);
});

// ── formatting + constants ──────────────────────────────────────────────────

test('describeStatus renders sync state compactly', () => {
  assert.match(describeStatus({ branch: 'main', upstream: 'origin/main', ahead: 0, behind: 0, dirty: 0 }), /in sync/);
  assert.match(describeStatus({ branch: 'main', upstream: 'origin/main', ahead: 1, behind: 2, dirty: 3 }), /1 ahead, 2 behind, 3 uncommitted/);
  assert.match(describeStatus({ branch: 'wip', upstream: null, dirty: 1 }), /no upstream/);
});

test('formatHuman prints an error line for a failed parse', () => {
  assert.match(formatHuman({ error: 'scope must be model or app', repos: [], notes: [] }), /✗ scope must be/);
});

test('PROTECTED_RE matches main/master/release, not feature branches', () => {
  assert.equal(PROTECTED_RE.test('main'), true);
  assert.equal(PROTECTED_RE.test('master'), true);
  assert.equal(PROTECTED_RE.test('release/2026.07'), true);
  assert.equal(PROTECTED_RE.test('feat/x'), false);
});
