#!/usr/bin/env node
/**
 * SessionStart Hook - Load previous context on new session
 *
 * Cross-platform (Windows, macOS, Linux)
 *
 * Runs when a new Claude session starts. Loads the most recent session
 * summary into Claude's context via stdout, and reports available sessions.
 */

const {
  getSessionsDir,
  getSessionSearchDirs,
  getProjectName,
  findFiles,
  ensureDir,
  readFile,
  stripAnsi,
  log
} = require('../lib/utils');
const { resolveProjectContext, writeSessionLease, resolveSessionId } = require('../lib/observer-sessions');
const { getPackageManager, getSelectionPrompt } = require('../lib/package-manager');
const { listAliases } = require('../lib/session-aliases');
const { detectProjectType } = require('../lib/project-detect');
const { sessionWorktree, listWorktrees } = require('../lib/worktree-info');
const path = require('path');
const fs = require('fs');

const DEFAULT_SESSION_RETENTION_DAYS = 30;

/**
 * Resolve a filesystem path to its canonical (real) form.
 *
 * Handles symlinks and, on case-insensitive filesystems (macOS, Windows),
 * normalizes casing so that path comparisons are reliable.
 * Falls back to the original path if resolution fails (e.g. path no longer exists).
 *
 * @param {string} p - The path to normalize.
 * @returns {string} The canonical path, or the original if resolution fails.
 */
function normalizePath(p) {
  try {
    return fs.realpathSync(p);
  } catch {
    return p;
  }
}

function dedupeRecentSessions(searchDirs) {
  const recentSessionsByName = new Map();

  for (const [dirIndex, dir] of searchDirs.entries()) {
    const matches = findFiles(dir, '*-session.tmp', { maxAge: 7 });

    for (const match of matches) {
      const basename = path.basename(match.path);
      const current = {
        ...match,
        basename,
        dirIndex,
      };
      const existing = recentSessionsByName.get(basename);

      if (
        !existing
        || current.mtime > existing.mtime
        || (current.mtime === existing.mtime && current.dirIndex < existing.dirIndex)
      ) {
        recentSessionsByName.set(basename, current);
      }
    }
  }

  return Array.from(recentSessionsByName.values())
    .sort((left, right) => right.mtime - left.mtime || left.dirIndex - right.dirIndex);
}

function getSessionRetentionDays() {
  const raw = process.env.ECC_SESSION_RETENTION_DAYS;
  if (!raw) return DEFAULT_SESSION_RETENTION_DAYS;
  const parsed = Number.parseInt(raw, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : DEFAULT_SESSION_RETENTION_DAYS;
}

function pruneExpiredSessions(searchDirs, retentionDays) {
  const uniqueDirs = Array.from(new Set(searchDirs.filter(dir => typeof dir === 'string' && dir.length > 0)));
  let removed = 0;

  for (const dir of uniqueDirs) {
    if (!fs.existsSync(dir)) continue;

    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith('-session.tmp')) continue;

      const fullPath = path.join(dir, entry.name);
      let stats;
      try {
        stats = fs.statSync(fullPath);
      } catch {
        continue;
      }

      const ageInDays = (Date.now() - stats.mtimeMs) / (1000 * 60 * 60 * 24);
      if (ageInDays <= retentionDays) continue;

      try {
        fs.rmSync(fullPath, { force: true });
        removed += 1;
      } catch (error) {
        log(`[SessionStart] Warning: failed to prune expired session ${fullPath}: ${error.message}`);
      }
    }
  }

  return removed;
}

/**
 * Select the best matching session for the current working directory.
 *
 * Session files written by session-end.js contain header fields like:
 *   **Project:** my-project
 *   **Worktree:** /path/to/project
 *
 * This function reads each session file once, caching its content, and
 * returns both the selected session object and its already-read content
 * to avoid duplicate I/O in the caller.
 *
 * Priority (highest to lowest):
 *   1. Exact worktree (cwd) match — most recent
 *   2. Same project name match — most recent
 *   3. Fallback to overall most recent (original behavior)
 *
 * Sessions are already sorted newest-first, so the first match in each
 * category wins.
 *
 * @param {Array<Object>} sessions - Deduplicated session list, sorted newest-first.
 * @param {string} cwd - Current working directory (process.cwd()).
 * @param {string} currentProject - Current project name from getProjectName().
 * @returns {{ session: Object, content: string, matchReason: string } | null}
 *   The best matching session with its cached content and match reason,
 *   or null if the sessions array is empty or all files are unreadable.
 */
function selectMatchingSession(sessions, cwd, currentProject, opts = {}) {
  if (sessions.length === 0) return null;
  // In a linked git worktree only an exact worktree match is this session's
  // own history; a project/recency match would inject a PARALLEL session's
  // "what I was doing" into this one.
  const exactOnly = Boolean(opts.exactOnly);

  // Normalize cwd once outside the loop to avoid repeated syscalls
  const normalizedCwd = normalizePath(cwd);

  let projectMatch = null;
  let projectMatchContent = null;
  let fallbackSession = null;
  let fallbackContent = null;

  for (const session of sessions) {
    const content = readFile(session.path);
    if (!content) continue;

    // Cache first readable session+content pair for fallback
    if (!fallbackSession) {
      fallbackSession = session;
      fallbackContent = content;
    }

    // Extract **Worktree:** field
    const worktreeMatch = content.match(/\*\*Worktree:\*\*\s*(.+)$/m);
    const sessionWorktree = worktreeMatch ? worktreeMatch[1].trim() : '';

    // Exact worktree match — best possible, return immediately
    // Normalize both paths to handle symlinks and case-insensitive filesystems
    if (sessionWorktree && normalizePath(sessionWorktree) === normalizedCwd) {
      return { session, content, matchReason: 'worktree' };
    }

    // Project name match — keep searching for a worktree match
    if (!projectMatch && currentProject) {
      const projectFieldMatch = content.match(/\*\*Project:\*\*\s*(.+)$/m);
      const sessionProject = projectFieldMatch ? projectFieldMatch[1].trim() : '';
      if (sessionProject && sessionProject === currentProject) {
        projectMatch = session;
        projectMatchContent = content;
      }
    }
  }

  if (exactOnly) return null;

  if (projectMatch) {
    return { session: projectMatch, content: projectMatchContent, matchReason: 'project' };
  }

  // Fallback: most recent readable session (original behavior)
  if (fallbackSession) {
    return { session: fallbackSession, content: fallbackContent, matchReason: 'recency-fallback' };
  }

  log('[SessionStart] All session files were unreadable');
  return null;
}

/**
 * Context for parallel sessions (iotpf-git-workflow §4.2): which worktree this
 * session owns and which others are live. Returns '' for a solo checkout, so a
 * single session pays nothing.
 *
 * @param {object|null} info - worktree-info describe() result for the session.
 * @param {Array<object>} worktrees - worktree-info listWorktrees() result.
 * @param {number} max - parallel-session guideline.
 * @returns {string}
 */
function buildWorktreeContext(info, worktrees, max) {
  if (!info || worktrees.length < 2) return '';
  const linked = worktrees.filter(w => !w.isMain);
  const own = worktrees.find(w => normalizePath(w.root) === normalizePath(info.root));
  const lines = [
    `Parallel worktrees: this session works in ${info.root} (branch: ${(own && own.branch) || 'detached'}).`,
    ...worktrees.filter(w => w !== own).map(w => `  other: ${w.branch || 'detached'} — ${w.root}`),
    'Edit only files inside this worktree; the pre:edit:worktree-boundary hook blocks the others.',
    'Before pushing: `node scripts/worktree.js sync` (merge the trunk, regenerate views), then',
    '`node scripts/worktree.js status` for cross-worktree overlaps. Procedure: parallel-worktrees skill.',
  ];
  if (linked.length > max) {
    lines.push(`WARNING: ${linked.length} parallel worktrees exceed the guideline of ${max} — review capacity is the bottleneck; land or drop one first.`);
  }
  return lines.join('\n');
}

/* Memory-role separation (agent-model v3, CLAUDE.md §8): the
 * continuous-learning "instinct" reader that used to live here was removed —
 * its write side was never wired in this repo, so every session paid for
 * reading a store nothing fills. Durable facts belong to Auto Memory;
 * failures to mistake-memory. */

async function main() {
  const sessionsDir = getSessionsDir();
  const sessionSearchDirs = getSessionSearchDirs();
  const additionalContextParts = [];
  const observerContext = resolveProjectContext();

  // Ensure directories exist
  ensureDir(sessionsDir);

  const retentionDays = getSessionRetentionDays();
  const prunedSessions = pruneExpiredSessions(sessionSearchDirs, retentionDays);
  if (prunedSessions > 0) {
    log(`[SessionStart] Pruned ${prunedSessions} expired session(s) older than ${retentionDays} day(s)`);
  }

  const observerSessionId = resolveSessionId();
  if (observerSessionId) {
    writeSessionLease(observerContext, observerSessionId, {
      hook: 'SessionStart',
      projectRoot: observerContext.projectRoot
    });
    log(`[SessionStart] Registered observer lease for ${observerSessionId}`);
  } else {
    log('[SessionStart] No CLAUDE_SESSION_ID available; skipping observer lease registration');
  }

  let worktreeInfo = null;
  try {
    worktreeInfo = sessionWorktree();
    const worktreeContext = buildWorktreeContext(
      worktreeInfo,
      listWorktrees(worktreeInfo),
      Number.parseInt(process.env.ECC_MAX_PARALLEL_WORKTREES || '', 10) || 3,
    );
    if (worktreeContext) additionalContextParts.push(worktreeContext);
  } catch (error) {
    log(`[SessionStart] Warning: worktree detection failed: ${error.message}`);
  }

  // Check for recent session files (last 7 days)
  const recentSessions = dedupeRecentSessions(sessionSearchDirs);

  if (recentSessions.length > 0) {
    log(`[SessionStart] Found ${recentSessions.length} recent session(s)`);

    // Prefer a session that matches the current working directory or project.
    // Session files contain **Project:** and **Worktree:** header fields written
    // by session-end.js, so we can match against them.
    const cwd = process.cwd();
    const currentProject = getProjectName() || '';

    const result = selectMatchingSession(recentSessions, cwd, currentProject, {
      exactOnly: Boolean(worktreeInfo && worktreeInfo.isLinked),
    });

    if (result) {
      log(`[SessionStart] Selected: ${result.session.path} (match: ${result.matchReason})`);

      // Use the already-read content from selectMatchingSession (no duplicate I/O)
      const content = stripAnsi(result.content);
      if (content && !content.includes('[Session context goes here]')) {
        additionalContextParts.push(`Previous session summary:\n${content}`);
      }
    } else {
      log('[SessionStart] No matching session found');
    }
  }

  // Check for available session aliases
  const aliases = listAliases({ limit: 5 });

  if (aliases.length > 0) {
    const aliasNames = aliases.map(a => a.name).join(', ');
    log(`[SessionStart] ${aliases.length} session alias(es) available: ${aliasNames}`);
    log(`[SessionStart] Use /sessions load <alias> to continue a previous session`);
  }

  // Detect and report package manager
  const pm = getPackageManager();
  log(`[SessionStart] Package manager: ${pm.name} (${pm.source})`);

  // If no explicit package manager config was found, show selection prompt
  if (pm.source === 'default') {
    log('[SessionStart] No package manager preference found.');
    log(getSelectionPrompt());
  }

  // Detect project type and frameworks (#293)
  const projectInfo = detectProjectType();
  if (projectInfo.languages.length > 0 || projectInfo.frameworks.length > 0) {
    const parts = [];
    if (projectInfo.languages.length > 0) {
      parts.push(`languages: ${projectInfo.languages.join(', ')}`);
    }
    if (projectInfo.frameworks.length > 0) {
      parts.push(`frameworks: ${projectInfo.frameworks.join(', ')}`);
    }
    log(`[SessionStart] Project detected — ${parts.join('; ')}`);
    additionalContextParts.push(`Project type: ${JSON.stringify(projectInfo)}`);
  } else {
    log('[SessionStart] No specific project type detected');
  }

  await writeSessionStartPayload(additionalContextParts.join('\n\n'));
}

function writeSessionStartPayload(additionalContext) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const payload = JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'SessionStart',
        additionalContext
      }
    });

    const handleError = (err) => {
      if (settled) return;
      settled = true;
      if (err) {
        log(`[SessionStart] stdout write error: ${err.message}`);
      }
      reject(err || new Error('stdout stream error'));
    };

    process.stdout.once('error', handleError);
    process.stdout.write(payload, (err) => {
      process.stdout.removeListener('error', handleError);
      if (settled) return;
      settled = true;
      if (err) {
        log(`[SessionStart] stdout write error: ${err.message}`);
        reject(err);
        return;
      }
      resolve();
    });
  });
}

module.exports = {
  main,
  selectMatchingSession,
  buildWorktreeContext,
  dedupeRecentSessions,
  pruneExpiredSessions,
  getSessionRetentionDays,
  normalizePath,
};

if (require.main === module) {
  main().catch(err => {
    console.error('[SessionStart] Error:', err.message);
    process.exitCode = 0; // Don't block on errors
  });
}
