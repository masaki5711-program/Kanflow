#!/usr/bin/env node
'use strict';

/*
 * worktree.js — one git worktree per parallel Claude Code session
 * (iotpf-git-workflow §4.2; procedure in the parallel-worktrees skill).
 *
 * Commands:
 *   new <type>/L<layer>-PBI-<number>-<topic> [--base <ref>] [--app <project>[:<branch>]]...
 *                         create .claude/worktrees/<type>-L<layer>-PBI-<number>-<topic> on a
 *                         convention-named branch cut from origin/main; --app
 *                         pairs a worktree of the apps/<project> product repo
 *                         into it at the same relative path
 *   status [--json]       every worktree: branch, drift from trunk, changed
 *                         files, cross-worktree overlaps, registration points
 *   sync                  in the current worktree: fetch, merge origin/main,
 *                         regenerate generated views (self-heal)
 *   done <name> [--force] remove a landed worktree and its local branch
 *
 * State is derived from git on every call — there is no session registry to
 * go stale. Node built-ins only.
 */

const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const wt = require('./lib/worktree-info');
const { checkBranchName, BRANCH_FORM } = require('./validate-git-policy');

const WORKTREES_REL = path.join('.claude', 'worktrees');
const DEFAULT_MAX_PARALLEL = 3;
// Untracked per-checkout files a fresh worktree does not inherit.
const SETUP_COPY = ['.claude/settings.local.json', '.env', '.env.local'];

function maxParallel(env = process.env) {
  const n = Number.parseInt(env.ECC_MAX_PARALLEL_WORKTREES || '', 10);
  return Number.isInteger(n) && n > 0 ? n : DEFAULT_MAX_PARALLEL;
}

/** Run git, returning { ok, out } — never throws. */
function git(root, args, opts = {}) {
  try {
    const out = execFileSync('git', args, {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: opts.timeout || 120000,
      windowsHide: true,
    });
    return { ok: true, out: out.trim() };
  } catch (e) {
    return { ok: false, out: `${e.stdout || ''}${e.stderr || ''}`.trim() || e.message };
  }
}

function dirNameFor(branch) {
  return branch.replace(/\//g, '-');
}

function validateNewBranch(branch) {
  const problem = checkBranchName(branch);
  if (problem) return problem;
  if (/^(?:main|master|release\/.+)$/.test(branch)) {
    return `'${branch}' is a protected trunk — a worktree branch must be ${BRANCH_FORM}`;
  }
  return null;
}

/** Linked worktrees only (the main checkout is the landing area, not a slot). */
function linkedWorktrees(info) {
  return wt.listWorktrees(info).filter(w => !w.isMain);
}

/** Product checkouts in the workspace: apps/<project> directories with their own .git. */
function productRepos(root) {
  const appsDir = path.join(root, 'apps');
  let names = [];
  try {
    names = fs.readdirSync(appsDir);
  } catch {
    return [];
  }
  return names
    .filter(n => fs.existsSync(path.join(appsDir, n, '.git')))
    .map(n => ({ project: n, root: path.join(appsDir, n) }));
}

/**
 * Pair a product-repo worktree into the new agent-model worktree at the same
 * relative path (apps/<project>), so path-keyed hooks and gates — references
 * lookup, test gate — keep resolving exactly as in the main checkout.
 * spec: "<project>" or "<project>:<branch>" (default: the agent branch name).
 */
function parseProductSpec(main, spec, agentBranch) {
  const [project, branch = agentBranch] = String(spec).split(':');
  return { project, branch, productMain: path.join(main, 'apps', project) };
}

/** Why a --app spec cannot be paired, or null. Checked before anything is created. */
function productSpecProblem(main, spec, agentBranch) {
  const { project, branch, productMain } = parseProductSpec(main, spec, agentBranch);
  if (!fs.existsSync(path.join(productMain, '.git'))) {
    return `apps/${project} is not a product checkout in ${main} — clone it there first (§1.1)`;
  }
  const problem = validateNewBranch(branch);
  return problem ? `apps/${project}: ${problem}` : null;
}

function pairProduct(main, dest, spec, agentBranch, log) {
  const { project, branch, productMain } = parseProductSpec(main, spec, agentBranch);
  if (!git(productMain, ['fetch', 'origin']).ok) {
    log(`[worktree] WARN  apps/${project}: git fetch failed — cutting from the local view of the trunk`);
  }
  const base = wt.baseRef(productMain);
  if (!base) return fail(log, `apps/${project}: no trunk ref (origin/main or main)`);
  const productDest = path.join(dest, 'apps', project);
  const added = git(productMain, ['worktree', 'add', '-b', branch, productDest, base]);
  if (!added.ok) return fail(log, `apps/${project}: git worktree add failed:\n${added.out}`);
  log(`[worktree] paired  ${productDest}`);
  log(`           branch ${branch} (from ${base}) of the apps/${project} repository`);
  log('           dependencies and build output are per worktree — install/build there before testing');
  return 0;
}

function cmdNew(info, args, log) {
  const branch = args.positional[0];
  const problem = validateNewBranch(branch);
  if (problem) return fail(log, problem);

  const main = info.mainRoot;
  const dest = path.join(main, WORKTREES_REL, dirNameFor(branch));
  if (fs.existsSync(dest)) return fail(log, `worktree directory already exists: ${dest}`);
  for (const spec of args.apps) {
    const specProblem = productSpecProblem(main, spec, branch);
    if (specProblem) return fail(log, specProblem);
  }

  if (!args.flags['no-fetch'] && !git(main, ['fetch', 'origin']).ok) {
    log('[worktree] WARN  git fetch failed — cutting from the local view of the trunk');
  }
  const base = args.flags.base || wt.baseRef(main);
  if (!base) return fail(log, 'no base ref (origin/main or main) — pass --base <ref>');

  const added = git(main, ['worktree', 'add', '-b', branch, dest, base]);
  if (!added.ok) return fail(log, `git worktree add failed:\n${added.out}`);

  const copied = [];
  for (const rel of SETUP_COPY) {
    const src = path.join(main, rel);
    if (!fs.existsSync(src)) continue;
    fs.mkdirSync(path.dirname(path.join(dest, rel)), { recursive: true });
    fs.copyFileSync(src, path.join(dest, rel));
    copied.push(rel);
  }

  log(`[worktree] created ${dest}`);
  log(`           branch ${branch} (from ${base})`);
  if (copied.length) log(`           copied untracked setup: ${copied.join(', ')}`);

  for (const spec of args.apps) {
    const code = pairProduct(main, dest, spec, branch, log);
    if (code !== 0) return code;
  }
  log('');
  log('Start the session INSIDE the worktree:');
  log(`  cd "${dest}" && claude`);

  const live = linkedWorktrees(info).length;
  if (live > maxParallel()) {
    log('');
    log(`[worktree] WARN  ${live} parallel worktrees (guideline: ${maxParallel()}). Review capacity is the`);
    log('           bottleneck — land or drop one before starting more (§4.2).');
  }
  return 0;
}

function collectStatus(info) {
  const base = wt.baseRef(info.mainRoot);
  const rows = wt.listWorktrees(info).map(w => {
    const files = wt.changedFiles(w.root, base);
    const counts = base ? git(w.root, ['rev-list', '--left-right', '--count', `${base}...HEAD`]) : { ok: false };
    const [behind, ahead] = counts.ok ? counts.out.split(/\s+/).map(Number) : [null, null];
    return {
      name: w.isMain ? '(main checkout)' : w.name,
      root: w.root,
      branch: w.branch,
      isMain: w.isMain,
      behind,
      ahead,
      files,
      registrationPoints: files.filter(f => wt.REGISTRATION_POINTS.includes(f)),
    };
  });
  // The main checkout stays on the trunk; only feature work can overlap.
  const working = rows.filter(r => r.files.length > 0);
  const { overlaps, generated } = wt.findOverlaps(working.map(r => ({ name: r.branch || r.name, files: r.files })));
  const sharedRegistration = overlaps.filter(o => wt.REGISTRATION_POINTS.includes(o.file));
  return { base, max: maxParallel(), worktrees: rows, overlaps, generated, sharedRegistration };
}

function cmdStatus(info, args, log) {
  const status = collectStatus(info);
  // Product repos have their own worktrees and their own overlaps.
  const apps = {};
  for (const p of productRepos(info.mainRoot)) {
    const productInfo = wt.describe(p.root);
    if (productInfo && wt.listWorktrees(productInfo).length > 1) apps[p.project] = collectStatus(productInfo);
  }
  if (args.flags.json) {
    log(JSON.stringify({ ...status, apps }, null, 2));
    return 0;
  }
  printStatus(status, log);
  for (const [project, productStatus] of Object.entries(apps)) {
    log('');
    log(`=== apps/${project} (product repository) ===`);
    printStatus(productStatus, log);
  }
  return 0;
}

function printStatus(status, log) {
  log(`Trunk: ${status.base || '(unresolved)'}   parallel guideline: ${status.max}`);
  for (const r of status.worktrees) {
    const drift = r.behind === null ? '' : `  ahead ${r.ahead} / behind ${r.behind}`;
    log('');
    log(`${r.branch || 'detached'}${drift}`);
    log(`  ${r.root}`);
    log(`  changed files: ${r.files.length}`);
    if (r.registrationPoints.length) log(`  registration points: ${r.registrationPoints.join(', ')}`);
    if (r.behind > 0 && !r.isMain) log('  -> behind the trunk: run `node scripts/worktree.js sync` here');
  }
  log('');
  if (status.overlaps.length === 0) {
    log('Overlaps: none — these branches can land in any order.');
  } else {
    log(`Overlaps: ${status.overlaps.length} file(s) changed on more than one branch (merge-time conflict):`);
    for (const o of status.overlaps) log(`  ${o.file}  <-  ${o.worktrees.join(', ')}`);
    log('Land ONE of the branches first, then `sync` the others.');
  }
  if (status.generated.length) {
    log(`Generated views touched on several branches (regenerated by sync, not merged): ${status.generated.map(g => g.file).join(', ')}`);
  }
  const live = status.worktrees.filter(r => !r.isMain).length;
  if (live > status.max) log(`WARN  ${live} parallel worktrees exceed the guideline of ${status.max}.`);
}

function cmdSync(info, args, log) {
  const root = info.root;
  const branch = wt.currentBranch(info);
  if (!branch) return fail(log, 'detached HEAD — check out a branch before syncing');
  if (/^(?:main|master)$/.test(branch)) return fail(log, 'on the trunk — use `git pull` here; sync is for feature worktrees');

  if (!git(root, ['fetch', 'origin']).ok) log('[worktree] WARN  git fetch failed — merging the local view of the trunk');
  const base = wt.baseRef(root);
  if (!base) return fail(log, 'no trunk ref (origin/main or main) to sync from');

  const merged = git(root, ['merge', '--no-edit', base]);
  if (!merged.ok) {
    const conflicted = git(root, ['diff', '--name-only', '--diff-filter=U']).out.split('\n').filter(Boolean);
    const manual = conflicted.filter(f => !wt.GENERATED_FILES.includes(f));
    if (conflicted.length === 0 || manual.length > 0) {
      log(`[worktree] merge of ${base} stopped:`);
      log(merged.out);
      if (manual.length) log(`\nResolve by hand: ${manual.join(', ')}\nthen \`git commit\` and re-run sync.`);
      return 1;
    }
    // Only generated views conflict: take the trunk's copy; self-heal below
    // regenerates them from this branch's real state. Any step failing (e.g.
    // a modify/delete conflict) aborts the merge rather than commit markers.
    const steps = [
      ['checkout', '--theirs', '--', ...conflicted],
      ['add', '--', ...conflicted],
      ['commit', '--no-edit'],
    ];
    for (const step of steps) {
      const res = git(root, step);
      if (res.ok) continue;
      git(root, ['merge', '--abort']);
      return fail(log, `could not auto-resolve generated views (git ${step[0]} failed) — merge aborted, nothing changed:\n${res.out}\nRun \`git merge ${base}\` and resolve by hand.`);
    }
    log(`[worktree] conflicts only in generated views (${conflicted.join(', ')}) — regenerating`);
  }
  log(`[worktree] ${branch} now contains ${base}`);

  if (args.flags['no-heal']) return 0;
  const healScript = path.join(root, 'scripts', 'self-heal.js');
  if (!fs.existsSync(healScript)) return 0;
  let healOk = true;
  try {
    execFileSync('node', [healScript], {
      cwd: root,
      env: { ...process.env, CLAUDE_PROJECT_DIR: root },
      stdio: ['ignore', 'pipe', 'pipe'],
      encoding: 'utf8',
    });
  } catch (e) {
    healOk = false;
    log(`[worktree] self-heal reports failing gates:\n${`${e.stdout || ''}${e.stderr || ''}`.trim()}`);
  }
  const dirty = git(root, ['status', '--porcelain']).out;
  if (dirty) {
    log('[worktree] regenerated after the sync — review and commit:');
    log(dirty);
  }
  return healOk ? 0 : 1;
}

/**
 * True when landing `branch` on the trunk would change nothing — covers both
 * a normal merge and a squash merge (where the branch is NOT an ancestor).
 */
function isLanded(root, branch, base) {
  if (git(root, ['merge-base', '--is-ancestor', branch, base]).ok) return true;
  const merged = git(root, ['merge-tree', '--write-tree', base, branch]);
  const baseTree = git(root, ['rev-parse', `${base}^{tree}`]);
  return merged.ok && baseTree.ok && merged.out.split('\n')[0].trim() === baseTree.out;
}

function cmdDone(info, args, log) {
  const wanted = args.positional[0];
  if (!wanted) return fail(log, 'usage: worktree.js done <name|branch> [--force]');
  const target = linkedWorktrees(info).find(
    w => w.name === wanted || w.branch === wanted || w.name === dirNameFor(wanted),
  );
  if (!target) return fail(log, `no linked worktree named '${wanted}' (see: worktree.js status)`);
  if (wt.normalize(target.root) === wt.normalize(info.root)) {
    return fail(log, 'cannot remove the worktree this command runs in — run it from the main checkout');
  }
  const force = Boolean(args.flags.force);

  // Paired product worktrees live INSIDE the target; they go first, each
  // against its own repository, or removing the parent would orphan them.
  const nested = productRepos(target.root).map(p => ({ label: `apps/${p.project}`, info: wt.describe(p.root) }));
  const units = nested
    .filter(u => u.info && u.info.isLinked)
    .map(u => ({ label: u.label, main: u.info.mainRoot, root: u.info.root, branch: wt.currentBranch(u.info) }));
  units.push({ label: 'agent model', main: info.mainRoot, root: target.root, branch: target.branch });

  if (!force) {
    // A full clone under apps/ is ignored by the outer repo, so git would
    // delete it — and whatever it has not pushed — without calling it dirty.
    const clone = nested.find(u => !u.info || !u.info.isLinked);
    if (clone) {
      return fail(log, `${clone.label} in this worktree is a standalone clone, not a paired worktree — its unpushed work would be lost. Move it out, or pass --force`);
    }
    for (const u of units) {
      const blocker = removalBlocker(u);
      if (blocker) return fail(log, `${u.label}: ${blocker}`);
    }
  }
  for (const u of units) {
    const removed = git(u.main, ['worktree', 'remove', ...(force ? ['--force'] : []), u.root]);
    if (!removed.ok) return fail(log, `${u.label}: git worktree remove failed:\n${removed.out}`);
    if (u.branch) git(u.main, ['branch', '-D', u.branch]); // -D: a squash-merged branch is never "merged" to git
    git(u.main, ['worktree', 'prune']);
    log(`[worktree] removed ${u.root}${u.branch ? ` and local branch ${u.branch}` : ''} (${u.label})`);
  }
  return 0;
}

/** Why a worktree must not be removed yet, or null when it is safe. */
function removalBlocker(unit) {
  if (git(unit.root, ['status', '--porcelain']).out) {
    return `${unit.root} has uncommitted changes — commit, or pass --force to discard them`;
  }
  git(unit.main, ['fetch', 'origin']);
  const base = wt.baseRef(unit.main);
  if (!base) return 'no trunk ref (origin/main or main) to verify against — pass --force if the work is safe elsewhere';
  // Detached HEAD: judge the commit itself, or its work becomes unreachable.
  const head = unit.branch || git(unit.root, ['rev-parse', 'HEAD']).out;
  if (!isLanded(unit.main, head, base)) {
    return `${unit.branch || `detached HEAD ${head.slice(0, 8)}`} has work that is not on ${base} — land its MR first, or pass --force`;
  }
  return null;
}

function fail(log, message) {
  log(`[worktree] ERROR ${message}`);
  return 1;
}

function parseArgs(argv) {
  const flags = {};
  const positional = [];
  const apps = [];
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (!a.startsWith('--')) positional.push(a);
    else if (a === '--base') flags.base = argv[(i += 1)];
    else if (a === '--app') apps.push(argv[(i += 1)]);
    else flags[a.slice(2)] = true;
  }
  return { flags, positional, apps: apps.filter(Boolean) };
}

const COMMANDS = { new: cmdNew, status: cmdStatus, sync: cmdSync, done: cmdDone };

function main(argv = process.argv.slice(2), cwd = process.cwd(), log = console.log) {
  const [cmd, ...rest] = argv;
  if (!COMMANDS[cmd]) {
    log(`usage: worktree.js <new ${BRANCH_FORM} [--app <project>] | status [--json] | sync | done <name> [--force]>`);
    return 1;
  }
  const info = wt.describe(cwd);
  if (!info) return fail(log, 'not inside a git repository');
  return COMMANDS[cmd](info, parseArgs(rest), log);
}

module.exports = { main, parseArgs, validateNewBranch, dirNameFor, collectStatus, isLanded, maxParallel };

if (require.main === module) process.exit(main());
