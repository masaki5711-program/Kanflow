#!/usr/bin/env node
/**
 * workspace-sync.js — scoped push/pull for the two-repository workspace.
 *
 * This repository is the AGENT MODEL (root git repo, its own GitLab remote).
 * Product code lives in independent GitLab projects cloned to `apps/<project>/`
 * (workspace model — iotpf-git-workflow.md §1.1). The root repo ignores
 * `/apps/*`, so root git operations physically cannot touch product code and
 * vice-versa. This CLI makes that boundary explicit and safe:
 *
 *   node scripts/workspace-sync.js model [status|pull|push] [--dry-run] [--json]
 *   node scripts/workspace-sync.js app   [status|pull|push] [<project>] [--dry-run] [--json]
 *
 *   - scope "model" → the ROOT repo only (the agent model). Never apps/.
 *   - scope "app"   → each product checkout under apps/<project>/ only. Never
 *                     the agent model. With <project>, just that one.
 *
 * Defaults to `status` (read-only). `pull` is --ff-only (no surprise merges).
 * `push` never forces and never bypasses hooks (block-no-verify /
 * confidential-scan still fire). One failing repo does not abort the rest.
 *
 * Surfaced by the /model-sync and /app-sync commands. Node built-ins only;
 * cross-platform. Exports pure helpers + run() for tests.
 */

'use strict';

const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = process.env.CLAUDE_PROJECT_DIR || process.cwd();
const PROTECTED_RE = /^(main|master|release\/.+)$/;
const VALID_ACTIONS = new Set(['status', 'pull', 'push']);

// ── git runner (injectable for tests) ───────────────────────────────────────

/**
 * Run a git command in `cwd`. Returns {ok, status, stdout, stderr}. Never
 * throws — a spawn failure is reported as ok:false so callers can collect and
 * continue.
 */
function defaultRunner(cwd, args) {
  const res = spawnSync('git', args, { cwd, encoding: 'utf8' });
  if (res.error) {
    return { ok: false, status: null, stdout: '', stderr: String(res.error.message || res.error) };
  }
  return {
    ok: res.status === 0,
    status: res.status,
    stdout: String(res.stdout || ''),
    stderr: String(res.stderr || ''),
  };
}

// ── discovery ───────────────────────────────────────────────────────────────

/**
 * Discover product checkouts under `appsDir`: immediate subdirectories that
 * contain a `.git` entry (dir OR file — file means a worktree/submodule).
 * README.md and non-git dirs are skipped. Returns [{name, path}] sorted by name.
 * Missing/unreadable appsDir → [].
 */
function discoverProductRepos(appsDir) {
  let entries;
  try {
    entries = fs.readdirSync(appsDir, { withFileTypes: true });
  } catch {
    return [];
  }
  const repos = [];
  for (const ent of entries) {
    if (!ent.isDirectory()) continue;
    const repoPath = path.join(appsDir, ent.name);
    if (fs.existsSync(path.join(repoPath, '.git'))) {
      repos.push({ name: ent.name, path: repoPath });
    }
  }
  return repos.sort((a, b) => a.name.localeCompare(b.name));
}

// ── arg parsing ─────────────────────────────────────────────────────────────

/**
 * Parse argv (after the script path) into {scope, action, project, dryRun,
 * json, error}. scope is required and must be "model" or "app". action
 * defaults to "status". A positional after the action is the project filter
 * (app scope only).
 */
function parseArgs(argv) {
  const out = { scope: null, action: 'status', project: null, dryRun: false, json: false, error: null };
  const positional = [];
  for (const raw of argv) {
    if (raw === '--dry-run') out.dryRun = true;
    else if (raw === '--json') out.json = true;
    else if (raw.startsWith('--')) { out.error = `unknown flag: ${raw}`; return out; }
    else positional.push(raw);
  }
  out.scope = positional[0] || null;
  if (out.scope !== 'model' && out.scope !== 'app') {
    out.error = `scope must be "model" or "app" (got: ${out.scope || 'none'})`;
    return out;
  }
  if (positional[1]) {
    if (!VALID_ACTIONS.has(positional[1])) {
      out.error = `action must be status|pull|push (got: ${positional[1]})`;
      return out;
    }
    out.action = positional[1];
  }
  if (positional[2]) {
    if (out.scope !== 'app') {
      out.error = 'a project name is only valid for the "app" scope';
      return out;
    }
    out.project = positional[2];
  }
  return out;
}

// ── per-repo status ─────────────────────────────────────────────────────────

/** Collect branch / upstream / ahead / behind / dirty for one repo. */
function repoStatus(cwd, runner) {
  const branchRes = runner(cwd, ['rev-parse', '--abbrev-ref', 'HEAD']);
  const branch = branchRes.ok ? branchRes.stdout.trim() : '(unknown)';
  const detached = branch === 'HEAD';

  const upRes = runner(cwd, ['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}']);
  const upstream = upRes.ok ? upRes.stdout.trim() : null;

  let ahead = 0;
  let behind = 0;
  if (upstream) {
    const counts = runner(cwd, ['rev-list', '--left-right', '--count', '@{u}...HEAD']);
    if (counts.ok) {
      const m = counts.stdout.trim().split(/\s+/);
      behind = Number(m[0]) || 0; // commits on upstream not in HEAD
      ahead = Number(m[1]) || 0; // commits on HEAD not in upstream
    }
  }

  const dirtyRes = runner(cwd, ['status', '--porcelain']);
  const dirty = dirtyRes.ok ? dirtyRes.stdout.split('\n').filter(Boolean).length : 0;

  return { branch, detached, upstream, ahead, behind, dirty };
}

// ── actions ─────────────────────────────────────────────────────────────────

/**
 * Perform `action` on one repo. Returns {name, path, action, ok, status,
 * message, ...statusFields}. Pull is --ff-only; push never forces and sets
 * upstream when missing. dryRun reports intent without running the mutation.
 */
function actOnRepo(repo, action, runner, opts = {}) {
  const st = repoStatus(repo.path, runner);
  const base = { name: repo.name, path: repo.path, action, ...st };

  if (action === 'status') {
    return { ...base, ok: true, message: describeStatus(st) };
  }

  if (st.detached) {
    return { ...base, ok: false, message: 'detached HEAD — checkout a branch before pull/push' };
  }

  if (action === 'pull') {
    if (opts.dryRun) return { ...base, ok: true, message: `would run: git pull --ff-only` };
    const res = runner(repo.path, ['pull', '--ff-only']);
    return { ...base, ok: res.ok, message: (res.ok ? res.stdout : res.stderr).trim() || (res.ok ? 'up to date' : 'pull failed') };
  }

  // push
  const protectedBranch = PROTECTED_RE.test(st.branch);
  if (opts.dryRun) {
    const cmd = st.upstream ? 'git push' : `git push -u origin ${st.branch}`;
    const warn = protectedBranch ? ' (WARNING: protected branch — land via MR, not a direct push)' : '';
    return { ...base, ok: true, message: `would run: ${cmd}${warn}` };
  }
  const args = st.upstream ? ['push'] : ['push', '-u', 'origin', st.branch];
  const res = runner(repo.path, args);
  let message = (res.ok ? res.stdout + res.stderr : res.stderr).trim();
  if (res.ok && protectedBranch) {
    message = `pushed, but ${st.branch} is protected — normally you land changes via an MR${message ? `\n${message}` : ''}`;
  }
  return { ...base, ok: res.ok, message: message || (res.ok ? 'pushed' : 'push failed') };
}

function describeStatus(st) {
  if (!st.upstream) return `${st.branch} (no upstream)${st.dirty ? `, ${st.dirty} uncommitted` : ''}`;
  const parts = [];
  if (st.ahead) parts.push(`${st.ahead} ahead`);
  if (st.behind) parts.push(`${st.behind} behind`);
  if (st.dirty) parts.push(`${st.dirty} uncommitted`);
  const tail = parts.length ? ` — ${parts.join(', ')}` : ' — in sync';
  return `${st.branch} ⇄ ${st.upstream}${tail}`;
}

// ── run ─────────────────────────────────────────────────────────────────────

/**
 * Execute the parsed request. Returns {ok, scope, action, repos:[...],
 * notes:[...], error}. Injectable runner/root/appsDir for tests.
 */
function run(argv, deps = {}) {
  const runner = deps.runner || defaultRunner;
  const root = deps.root || ROOT;
  const parsed = parseArgs(argv);
  if (parsed.error) return { ok: false, error: parsed.error, repos: [], notes: [] };

  const notes = [];
  let targets;

  if (parsed.scope === 'model') {
    targets = [{ name: '(agent model)', path: root }];
  } else {
    const appsDir = deps.appsDir || path.join(root, 'apps');
    let repos = discoverProductRepos(appsDir);
    if (parsed.project) {
      repos = repos.filter(r => r.name === parsed.project);
      if (repos.length === 0) {
        return { ok: false, scope: parsed.scope, action: parsed.action, repos: [], notes: [],
          error: `no product repo named "${parsed.project}" under apps/ (clone it with: git clone <url> apps/${parsed.project})` };
      }
    }
    if (repos.length === 0) {
      notes.push('no product repos under apps/ — the workspace is empty. Clone one: git clone <url> apps/<project>');
      return { ok: true, scope: parsed.scope, action: parsed.action, repos: [], notes };
    }
    targets = repos;
  }

  const opts = { dryRun: parsed.dryRun };
  const results = targets.map(t => actOnRepo(t, parsed.action, runner, opts));
  const ok = results.every(r => r.ok);
  return { ok, scope: parsed.scope, action: parsed.action, dryRun: parsed.dryRun, repos: results, notes };
}

// ── formatting ──────────────────────────────────────────────────────────────

function formatHuman(result) {
  if (result.error) return `✗ ${result.error}`;
  const lines = [];
  const scopeLabel = result.scope === 'model' ? 'agent model (root repo)' : 'product repos (apps/)';
  lines.push(`[workspace-sync] scope=${scopeLabel} action=${result.action}${result.dryRun ? ' (dry-run)' : ''}`);
  for (const note of result.notes) lines.push(`  · ${note}`);
  for (const r of result.repos) {
    const mark = r.ok ? '✓' : '✗';
    const msg = String(r.message || '').split('\n').join('\n      ');
    lines.push(`  ${mark} ${r.name}: ${msg}`);
  }
  return lines.join('\n');
}

module.exports = {
  discoverProductRepos,
  parseArgs,
  repoStatus,
  actOnRepo,
  describeStatus,
  run,
  formatHuman,
  PROTECTED_RE,
};

// ── CLI entry ───────────────────────────────────────────────────────────────

if (require.main === module) {
  const argv = process.argv.slice(2);
  const result = run(argv);
  if (argv.includes('--json')) {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } else {
    process.stdout.write(`${formatHuman(result)}\n`);
  }
  process.exit(result.ok ? 0 : 1);
}
