'use strict';

/*
 * Tests for the parallel-session hooks (iotpf-git-workflow §4.2):
 *   pre-edit-worktree-boundary.js — boundary block + first-touch overlap
 *   pre-bash-branch-name-guard.js — push / MR-create branch-name block
 * plus the session-start worktree context. Contract (CLAUDE.md §7): fail open
 * on malformed input; exit 2 is the only block. Real git worktrees in a temp
 * repo; synthetic content only.
 */

const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const boundary = require('../pre-edit-worktree-boundary');
const branchGuard = require('../pre-bash-branch-name-guard');
const sessionStart = require('../session-start');
const fx = require('../../lib/__tests__/worktree-fixture');

// ── no git needed: the fail-open contract and pure helpers ─────────────────

test('boundary: fails open on malformed JSON and on empty tool input', () => {
  assert.equal(boundary.run('not json').exitCode, 0);
  assert.equal(boundary.run('{}').exitCode, 0);
});

test('branch-guard: fails open on malformed JSON; unrelated commands pass', () => {
  assert.equal(branchGuard.run('not json').exitCode, 0);
  assert.equal(branchGuard.run(JSON.stringify({ tool_input: { command: 'git status' } })).exitCode, 0);
});

test('session-start: no worktree context for a solo checkout', () => {
  assert.equal(sessionStart.buildWorktreeContext({ root: '/r' }, [{ root: '/r', isMain: true }], 3), '');
  assert.equal(sessionStart.buildWorktreeContext(null, [], 3), '');
});

// ── everything below drives real git worktrees ─────────────────────────────

if (!fx.HAS_GIT) {
  test('worktree hooks against real git worktrees', { skip: 'git not available' }, () => {});
  return;
}

const REPO = fx.makeRepo('wt-hooks-');
const WT_A = fx.addWorktree(REPO, 'feat/Lcross-PBI-34-alpha');
const WT_B = fx.addWorktree(REPO, 'feat/Lcross-PBI-34-beta');
const SOLO = fx.makeRepo('wt-solo-');

after(() => {
  fx.cleanup(REPO);
  fx.cleanup(SOLO);
});

let seq = 0;
function edit(file_path) {
  seq += 1;
  return JSON.stringify({ session_id: `wt-test-${process.pid}-${seq}`, tool_name: 'Edit', tool_input: { file_path } });
}
function editAs(sessionId, file_path) {
  return JSON.stringify({ session_id: sessionId, tool_name: 'Edit', tool_input: { file_path } });
}
// Session context is injected, so the tests do not depend on where they run
// from (they must also pass inside a linked worktree of the real repo).
const as = root => ({ env: { CLAUDE_PROJECT_DIR: root }, cwd: root });
const bash = command => JSON.stringify({ tool_name: 'Bash', tool_input: { command } });

// ── pre-edit-worktree-boundary ─────────────────────────────────────────────

test('boundary: a worktree session may edit its own files', () => {
  const out = boundary.evaluate(edit(path.join(WT_A, 'README.md')), as(WT_A));
  assert.equal(out.exitCode, 0);
});

test('boundary: a worktree session is blocked from the main checkout', () => {
  const out = boundary.evaluate(edit(path.join(REPO, 'README.md')), as(WT_A));
  assert.equal(out.exitCode, 2);
  assert.match(out.stderr, /belongs to another worktree/);
  assert.ok(out.stderr.includes(path.join(WT_A, 'README.md')), 'points at the copy in this worktree');
});

test('boundary: a worktree session is blocked from a sibling worktree', () => {
  const out = boundary.evaluate(edit(path.join(WT_B, 'README.md')), as(WT_A));
  assert.equal(out.exitCode, 2);
});

test('boundary: the main session is blocked from .claude/worktrees/<name>/', () => {
  const out = boundary.evaluate(edit(path.join(WT_A, 'README.md')), as(REPO));
  assert.equal(out.exitCode, 2);
});

test('boundary: a worktree session is blocked from the main checkout product tree (apps/)', () => {
  const out = boundary.evaluate(edit(path.join(REPO, 'apps', 'demo', 'src', 'a.ts')), as(WT_A));
  assert.equal(out.exitCode, 2);
});

test('boundary: MultiEdit-style edits[] paths are checked too', () => {
  const raw = JSON.stringify({
    session_id: 'wt-multi',
    tool_input: { edits: [{ file_path: path.join(REPO, 'shared.txt') }] },
  });
  assert.equal(boundary.evaluate(raw, as(WT_A)).exitCode, 2);
});

test('boundary: paths outside the repository pass through', () => {
  const out = boundary.evaluate(edit(path.join(SOLO, 'README.md')), as(WT_A));
  assert.equal(out.exitCode, 0);
});

test('boundary: inert in a repository with no linked worktree', () => {
  const out = boundary.evaluate(edit(path.join(SOLO, 'README.md')), as(SOLO));
  assert.equal(out.exitCode, 0);
});

test('boundary: when CLAUDE_PROJECT_DIR and cwd name different checkouts, both are the session\'s own', () => {
  // harness keeps CLAUDE_PROJECT_DIR on main for a worktree session, or a Bash cd drifted
  const ctx = { env: { CLAUDE_PROJECT_DIR: REPO }, cwd: WT_A };
  assert.equal(boundary.evaluate(edit(path.join(WT_A, 'README.md')), ctx).exitCode, 0);
  assert.equal(boundary.evaluate(edit(path.join(REPO, 'README.md')), ctx).exitCode, 0);
  assert.equal(boundary.evaluate(edit(path.join(WT_B, 'README.md')), ctx).exitCode, 2, 'a third worktree is still foreign');
});

test('boundary: relative paths resolve against the session cwd; new files and case variants are owned correctly', () => {
  assert.equal(boundary.evaluate(edit(path.join('new-dir', 'brand-new.txt')), as(WT_A)).exitCode, 0);
  assert.equal(boundary.evaluate(edit(path.join(REPO, 'new-dir', 'brand-new.txt')), as(WT_A)).exitCode, 2);
  if (process.platform === 'win32') {
    assert.equal(boundary.evaluate(edit(path.join(WT_A.toUpperCase(), 'README.md')), as(WT_A)).exitCode, 0);
    assert.equal(boundary.evaluate(edit(path.join(WT_A, 'README.md').split(path.sep).join('/')), as(WT_A)).exitCode, 0);
  }
});

test('boundary: an unpaired product path explains --app instead of pointing at a missing copy', () => {
  const out = boundary.evaluate(edit(path.join(REPO, 'apps', 'demo', 'src', 'a.ts')), as(WT_A));
  assert.equal(out.exitCode, 2);
  assert.match(out.stderr, /--app demo/);
});

test('overlap: local edits in a checkout sitting on the trunk are not parallel work', () => {
  fx.write(REPO, 'trunk-local.txt', 'uncommitted on main\n');
  const out = boundary.evaluate(edit(path.join(WT_A, 'trunk-local.txt')), as(WT_A));
  assert.equal(out.exitCode, 0);
});

test('overlap: first touch of a file changed in another worktree blocks once, then allows', () => {
  fx.write(WT_B, 'shared.txt', 'changed on beta\n');
  const target = path.join(WT_A, 'shared.txt');
  const first = boundary.evaluate(editAs('wt-overlap-1', target), as(WT_A));
  assert.equal(first.exitCode, 2);
  assert.match(first.stderr, /OVERLAP/);
  assert.match(first.stderr, /feat\/Lcross-PBI-34-beta/);
  const retry = boundary.evaluate(editAs('wt-overlap-1', target), as(WT_A));
  assert.equal(retry.exitCode, 0, 'the retry proceeds — once per session per file');
});

test('overlap: a file no other worktree touched is allowed on first touch', () => {
  const out = boundary.evaluate(edit(path.join(WT_A, 'only-alpha.txt')), as(WT_A));
  assert.equal(out.exitCode, 0);
});

test('overlap: generated views are never reported (regenerated, not merged)', () => {
  fx.write(WT_B, 'MISTAKES.md', 'generated on beta\n');
  const out = boundary.evaluate(edit(path.join(WT_A, 'MISTAKES.md')), as(WT_A));
  assert.equal(out.exitCode, 0);
});

// ── pre-bash-branch-name-guard ─────────────────────────────────────────────

test('branch-guard: pushedRefs resolves refspecs, option values, tags and deletions', () => {
  assert.deepEqual(branchGuard.pushedRefs([]), ['HEAD']);
  assert.deepEqual(branchGuard.pushedRefs(['-u', 'origin']), ['HEAD']);
  assert.deepEqual(branchGuard.pushedRefs(['origin', 'worktree-x']), ['worktree-x']);
  assert.deepEqual(branchGuard.pushedRefs(['origin', 'HEAD:refs/heads/feat/L3-x']), ['refs/heads/feat/L3-x']);
  assert.deepEqual(branchGuard.pushedRefs(['-o', 'ci.skip', 'origin', 'HEAD']), ['HEAD']);
  assert.deepEqual(branchGuard.pushedRefs(['--push-option', 'merge_request.create', 'origin']), ['HEAD']);
  assert.deepEqual(branchGuard.pushedRefs(['origin', 'tag', 'v1.2.3']), []);
  assert.deepEqual(branchGuard.pushedRefs(['origin', ':old-branch']), []);
  assert.deepEqual(branchGuard.pushedRefs(['origin', '--delete', 'old-branch']), []);
  assert.deepEqual(branchGuard.pushedRefs(['--tags']), []);
});

const GAMMA = fx.addWorktree(REPO, 'worktree-gamma'); // what `claude --worktree gamma` creates

test('branch-guard: blocks publishing a non-conformant checked-out branch', () => {
  const out = branchGuard.evaluate(bash('git push -u origin HEAD'), GAMMA);
  assert.equal(out.exitCode, 2);
  assert.match(out.stderr, /git branch -m/);
  assert.equal(branchGuard.evaluate(bash('git push'), GAMMA).exitCode, 2);
  assert.equal(branchGuard.evaluate(bash('git push --force-with-lease origin worktree-gamma'), GAMMA).exitCode, 2);
  assert.equal(branchGuard.evaluate(bash('git push origin HEAD:refs/heads/worktree-gamma'), WT_A).exitCode, 2);
  assert.equal(branchGuard.evaluate(bash('glab mr create --title "feat: x"'), GAMMA).exitCode, 2);
  assert.equal(branchGuard.evaluate(bash('git add -A && git commit -m "feat: x" && git push'), GAMMA).exitCode, 2);
});

test('branch-guard: blocks a branch that lacks the PBI number and says to ask for it', () => {
  const noPbi = fx.addWorktree(REPO, 'feat/Lcross-delta');
  for (const cmd of ['git push -u origin HEAD', 'glab mr create --title "feat: x"']) {
    const out = branchGuard.evaluate(bash(cmd), noPbi);
    assert.equal(out.exitCode, 2, cmd);
    assert.match(out.stderr, /PBI number is missing/);
    assert.match(out.stderr, /ask the user/);
    assert.match(out.stderr, /git branch -m <type>\/L<layer>-PBI-<number>-<topic>/);
    assert.match(out.stderr, /git branch -m <type>\/L<layer>-NOPBI-<topic>/);
  }
});

test('branch-guard: allows a branch that declares NOPBI', () => {
  const declared = fx.addWorktree(REPO, 'chore/Lcross-NOPBI-epsilon');
  assert.equal(branchGuard.evaluate(bash('git push -u origin HEAD'), declared).exitCode, 0);
  assert.equal(branchGuard.evaluate(bash('glab mr create --title "chore: x"'), declared).exitCode, 0);
});

test('branch-guard: allows a conformant branch and the trunk', () => {
  assert.equal(branchGuard.evaluate(bash('git push -u origin HEAD'), WT_A).exitCode, 0);
  assert.equal(branchGuard.evaluate(bash('git push --force-with-lease origin feat/Lcross-PBI-34-alpha'), WT_A).exitCode, 0);
  assert.equal(branchGuard.evaluate(bash('git push'), REPO).exitCode, 0); // main
});

test('branch-guard: GitLab push options and tag pushes are not mistaken for branches', () => {
  for (const cmd of [
    'git push -o ci.skip origin feat/Lcross-PBI-34-alpha',
    'git push -o merge_request.create origin HEAD',
    'git push origin v1.2.3',
    'git push origin tag v1.2.3',
    'git push --tags',
    'git push origin refs/tags/v1.2.3',
  ]) {
    assert.equal(branchGuard.evaluate(bash(cmd), WT_A).exitCode, 0, cmd);
  }
});

test('branch-guard: push text inside quotes or a heredoc never triggers', () => {
  for (const cmd of [
    'git commit -m "docs: explain git push origin HEAD"',
    'echo "then run: git push && glab mr create"',
    "cat <<'EOF' > notes.txt\ncd /x && git push\nglab mr create --fill\nEOF",
  ]) {
    assert.equal(branchGuard.evaluate(bash(cmd), GAMMA).exitCode, 0, cmd);
  }
});

test('branch-guard: cd and git -C select the repository that is judged', () => {
  const q = p => `"${p.split(path.sep).join('/')}"`;
  // run from a conformant worktree, but the push happens in the non-conformant one
  assert.equal(branchGuard.evaluate(bash(`cd ${q(GAMMA)} && git push`), WT_A).exitCode, 2);
  assert.equal(branchGuard.evaluate(bash(`git -C ${q(GAMMA)} push -u origin HEAD`), WT_A).exitCode, 2);
  // and the reverse must not be blocked
  assert.equal(branchGuard.evaluate(bash(`cd ${q(WT_A)} && git push`), GAMMA).exitCode, 0);
  assert.equal(branchGuard.evaluate(bash(`git -C ${q(WT_A)} push`), GAMMA).exitCode, 0);
});

test('branch-guard: unrelated commands, MR updates and a non-repo cwd pass through', () => {
  assert.equal(branchGuard.run(bash('git status')).exitCode, 0);
  assert.equal(branchGuard.evaluate(bash('glab mr update 12 --title "feat: x"'), GAMMA).exitCode, 0);
  assert.equal(branchGuard.evaluate(bash('git push'), path.parse(REPO).root).exitCode, 0);
});

// ── session-start: worktree context ────────────────────────────────────────

test('session-start: worktree context names this worktree, the others, and the limit', () => {
  const trees = [
    { root: REPO, isMain: true, branch: 'main' },
    { root: WT_A, isMain: false, branch: 'feat/Lcross-PBI-34-alpha' },
    { root: WT_B, isMain: false, branch: 'feat/Lcross-PBI-34-beta' },
  ];
  const ctx = sessionStart.buildWorktreeContext({ root: WT_A }, trees, 3);
  assert.match(ctx, /branch: feat\/Lcross-PBI-34-alpha/);
  assert.match(ctx, /other: feat\/Lcross-PBI-34-beta/);
  assert.doesNotMatch(ctx, /WARNING/);
  assert.match(sessionStart.buildWorktreeContext({ root: WT_A }, trees, 1), /WARNING: 2 parallel worktrees/);
});

test('session-start: exactOnly refuses project/recency matches from other sessions', () => {
  const file = fx.write(SOLO, 'other-session.tmp', '# S\n**Project:** proj\n**Worktree:** /elsewhere\n');
  const sessions = [{ path: file, mtime: 1 }];
  assert.equal(sessionStart.selectMatchingSession(sessions, WT_A, 'proj', { exactOnly: true }), null);
  assert.equal(sessionStart.selectMatchingSession(sessions, WT_A, 'proj').matchReason, 'project');
});
