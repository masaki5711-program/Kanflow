#!/usr/bin/env node
/**
 * PreToolUse Hook: Worktree Boundary  (hook id: pre:edit:worktree-boundary)
 *
 * Keeps parallel sessions inside their own git worktree
 * (iotpf-git-workflow §4.2):
 *
 *   1. BOUNDARY (hard block) — the edited file belongs to a DIFFERENT worktree
 *      of this repository than the one the session runs in (a worktree session
 *      writing into the main checkout by absolute path, or the main session
 *      writing into .claude/worktrees/<name>/). That silently breaks the
 *      isolation and escapes this session's own gates.
 *   2. OVERLAP (block once per session per file) — the file is already changed
 *      in another live worktree, i.e. a merge-time conflict is being created
 *      right now. Retrying the edit proceeds; the point is that it is a
 *      decision, not an accident.
 *
 * Nothing is declared or registered: both checks are derived from git state.
 * Inert with a single checkout (no linked worktree) — a solo session pays one
 * directory read.
 *
 * Fails OPEN (CLAUDE.md §7): paths outside the repository, parse errors, git
 * timeouts and internal errors all pass through.
 * Disable with ECC_DISABLED_HOOKS=pre:edit:worktree-boundary.
 *
 * Exit codes: 0 allow · 2 block. Compatible with run-with-flags.js.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const wt = require('../lib/worktree-info');
const { firstTime } = require('../lib/once-per-session');

const MAX_STDIN = 1024 * 1024;

function editedPaths(input) {
  const ti = (input && input.tool_input) || {};
  const out = [];
  if (typeof ti.file_path === 'string') out.push(ti.file_path);
  if (Array.isArray(ti.edits)) {
    for (const e of ti.edits) if (e && typeof e.file_path === 'string') out.push(e.file_path);
  }
  return out;
}

function label(w) {
  return `${w.branch || 'detached'} (${w.root})`;
}

function boundaryMessage(file, own, owner) {
  const rel = path.relative(owner.root, path.resolve(file));
  const product = rel.replace(/\\/g, '/').match(/^apps\/([^/]+)\//);
  // A product repo is only present in a worktree that was paired with --app.
  const unpaired = product && !fs.existsSync(path.join(own.root, 'apps', product[1]));
  const fix = unpaired
    ? [
        `This worktree has no apps/${product[1]} checkout. For parallel product work, pair one:`,
        `  node scripts/worktree.js new <type>/L<layer>-PBI-<number>-<topic> --app ${product[1]}`,
        'or do the product edit from a session in the main checkout.',
      ]
    : ['Edit the copy in this worktree instead:', '  ' + path.join(own.root, rel)];
  return [
    '[worktree-boundary] BLOCKED — this file belongs to another worktree.',
    '',
    'File:          ' + file,
    'Owned by:      ' + label(owner),
    'This session:  ' + label(own),
    '',
    'Each session edits only its own worktree (iotpf-git-workflow §4.2).',
    ...fix,
    '',
    'To disable temporarily:  ECC_DISABLED_HOOKS=pre:edit:worktree-boundary',
  ].join('\n') + '\n';
}

function overlapMessage(rel, others) {
  return [
    '[worktree-boundary] OVERLAP — this file is already changed in another worktree:',
    '',
    '  ' + rel,
    ...others.map(o => '    also changed in: ' + label(o)),
    '',
    'Both branches editing it means a merge-time conflict. Prefer to land the change',
    'on ONE branch and sync the other (`node scripts/worktree.js sync`), or split the',
    'task so the files do not overlap. `node scripts/worktree.js status` shows every',
    'overlap. If the overlap is intended, retry the edit — this fires once per',
    'session per file.',
  ].join('\n') + '\n';
}

/**
 * @param {string} rawInput
 * @param {{env?: object, cwd?: string}} [ctx] - injectable for tests
 */
function evaluate(rawInput, ctx = {}) {
  let input;
  try {
    input = JSON.parse(rawInput);
  } catch {
    return { stdout: rawInput, exitCode: 0 };
  }
  const cwd = ctx.cwd || process.cwd();
  const files = editedPaths(input).map(f => path.resolve(cwd, f));
  if (files.length === 0) return { stdout: rawInput, exitCode: 0 };

  // Every checkout the session may call its own (CLAUDE_PROJECT_DIR and cwd
  // can differ); a file is foreign only when it belongs to none of them.
  const checkouts = wt.sessionCheckouts(ctx.env || process.env, cwd);
  if (checkouts.length === 0) return { stdout: rawInput, exitCode: 0 };
  const worktrees = wt.listWorktrees(checkouts[0]);
  const own = worktrees.filter(w => checkouts.some(c => sameRoot(c.root, w.root)));

  if (own.length > 0 && worktrees.length > 1) {
    for (const file of files) {
      const owner = wt.ownerOf(file, worktrees);
      if (!owner) continue; // outside this repository — not ours to judge
      if (!own.includes(owner)) {
        const reported = own.find(w => !w.isMain) || own[0];
        return { stderr: boundaryMessage(file, reported, owner), exitCode: 2 };
      }
    }
  }

  for (const file of files) {
    const hit = overlapFor(file, input);
    if (hit) return { stderr: overlapMessage(hit.rel, hit.others), exitCode: 2 };
  }
  return { stdout: rawInput, exitCode: 0 };
}

function sameRoot(a, b) {
  return wt.normalize(a) === wt.normalize(b);
}

// A checkout sitting on the trunk is the landing area, not parallel work: its
// local edits are not a branch another session will have to merge with.
const onTrunk = w => /^(?:main|master)$/.test(w.branch || '');

/**
 * First-touch overlap check, in the repository that actually tracks the file —
 * the agent model, or a product repo checked out under apps/<project>, whose
 * worktrees are its own.
 */
function overlapFor(file, input) {
  const repo = wt.describe(path.dirname(path.resolve(file)));
  if (!repo) return null;
  const siblings = wt.listWorktrees(repo).filter(w => !sameRoot(w.root, repo.root) && !onTrunk(w));
  if (siblings.length === 0) return null; // solo checkout

  const rel = path.relative(repo.root, path.resolve(file)).replace(/\\/g, '/');
  if (wt.GENERATED_FILES.includes(rel)) return null;
  if (!firstTime('worktree-overlap', input, `${wt.normalize(repo.root)}::${rel}`)) return null;

  const others = siblings.filter(w => wt.changedFiles(w.root).includes(rel));
  return others.length > 0 ? { rel, others } : null;
}

function run(rawInput) {
  try {
    return evaluate(rawInput);
  } catch (err) {
    process.stderr.write('[worktree-boundary] internal error (fail-open): ' + err.message + '\n');
    return { stdout: rawInput, exitCode: 0 };
  }
}

if (require.main === module) {
  let data = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', chunk => {
    if (data.length < MAX_STDIN) data += chunk.substring(0, MAX_STDIN - data.length);
  });
  process.stdin.on('end', () => {
    const r = run(data);
    if (r.stderr) process.stderr.write(r.stderr);
    if (r.stdout) process.stdout.write(r.stdout);
    process.exit(r.exitCode || 0);
  });
  process.stdin.on('error', () => process.exit(0)); // fail-open
}

module.exports = { run, evaluate, editedPaths };
