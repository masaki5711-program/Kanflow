'use strict';

/*
 * Test fixture: a throwaway git repository with real linked worktrees, shared
 * by the worktree-info, worktree CLI and worktree hook tests. Synthetic
 * content only. Not a test file itself (no *.test.js suffix).
 */

const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

function git(cwd, ...args) {
  return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

// Some CI images ship without git (the blocking test job on node:22-alpine);
// suites built on this fixture skip there and run in the job that installs it.
const HAS_GIT = (() => {
  try {
    execFileSync('git', ['--version'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
})();

function write(root, rel, content) {
  const file = path.join(root, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
  return file;
}

function commitAll(root, message) {
  git(root, 'add', '-A');
  git(root, 'commit', '-m', message);
}

/** A repo on `main` with one commit; identity and signing pinned locally. */
function makeRepo(prefix = 'wt-fixture-') {
  // realpath: os.tmpdir() may be a short (8.3) or symlinked path on CI hosts.
  const root = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), prefix)));
  git(root, 'init', '-q', '-b', 'main');
  git(root, 'config', 'user.name', 'Fixture');
  git(root, 'config', 'user.email', 'fixture@example.invalid');
  git(root, 'config', 'commit.gpgsign', 'false');
  write(root, 'README.md', '# fixture\n');
  write(root, 'shared.txt', 'base\n');
  write(root, '.gitignore', '.claude/worktrees/\n/apps/*\n');
  commitAll(root, 'chore: init');
  return root;
}

/** Add a linked worktree under .claude/worktrees/<dir> on a new branch. */
function addWorktree(root, branch, base = 'main') {
  const dest = path.join(root, '.claude', 'worktrees', branch.replace(/\//g, '-'));
  git(root, 'worktree', 'add', '-q', '-b', branch, dest, base);
  return dest;
}

function cleanup(root) {
  fs.rmSync(root, { recursive: true, force: true, maxRetries: 3 });
}

/** Run fn with process.env keys overridden (undefined deletes), then restore. */
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
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
}

module.exports = { HAS_GIT, git, write, commitAll, makeRepo, addWorktree, cleanup, withEnv };
