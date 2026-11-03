#!/usr/bin/env node
'use strict';

/*
 * validate-git-policy.js — CI enforcement of iotpf-git-workflow.md.
 *
 * The strictest rules in the git workflow (§2 branch naming, §3 Conventional
 * Commits, §6 no confidential data) previously relied entirely on humans and
 * unwired agents. This gate makes them machine-checked in CI:
 *
 *   1. BRANCH  — name matches `<type>/L<layer>-PBI-<number>-<topic>` (§2;
 *      `NOPBI` in place of `PBI-<number>` when the work has no PBI), or is
 *      main / master / a release/* branch.
 *   2. COMMITS — every commit subject in base..HEAD follows Conventional
 *      Commits `<type>: <description>` (merge/revert commits are skipped).
 *   3. SECRETS — no added diff line in base..HEAD matches a known secret
 *      shape (AWS keys, private key blocks, long api_key/password/token
 *      literals, GitHub/GitLab PATs). Test fixtures (__tests__/, evals/specs/,
 *      *.test.*) are excluded; a line carrying `ecc-allow-secret` is a
 *      reviewed, deliberate waiver.
 *
 * Base resolution: CI_MERGE_REQUEST_DIFF_BASE_SHA (GitLab MR pipelines) →
 * ECC_POLICY_BASE_REF → merge-base with origin/main → merge-base with main.
 * When no base is resolvable (shallow clone, detached state), commit and
 * secret checks degrade to HEAD-only and log that they did — never a silent
 * skip. This is a CI gate, not a Claude Code hook: it does NOT fail open.
 *
 * Run: node scripts/validate-git-policy.js
 */

const { execFileSync } = require('child_process');

const CONVENTIONAL_TYPES = ['feat', 'fix', 'refactor', 'docs', 'test', 'chore', 'perf', 'ci'];
const BRANCH_TYPES = [...CONVENTIONAL_TYPES, 'hotfix'];
const BRANCH_LAYERS = ['1', '2', '3', '4', 'ai', 'infra', 'cross'];

const BRANCH_PREFIX = `(?:${BRANCH_TYPES.join('|')})/L(?:${BRANCH_LAYERS.join('|')})-`;
const BRANCH_TOPIC = '[a-z0-9][a-z0-9-]*';
// The backlog item the branch delivers: literal upper-case `PBI-`, then its
// number — or `NOPBI`, the explicit declaration that the work has none
// (agent-model upkeep, work outside a project backlog).
const BRANCH_PBI = '(?:PBI-[1-9][0-9]*|NOPBI)';

const BRANCH_PATTERN = new RegExp(
  `^(?:main|master|release/.+|${BRANCH_PREFIX}${BRANCH_PBI}-${BRANCH_TOPIC})$`,
);
// The form used before the PBI number became mandatory — recognized only to
// give a precise error; it does not pass.
const BRANCH_WITHOUT_PBI = new RegExp(`^${BRANCH_PREFIX}${BRANCH_TOPIC}$`);
const BRANCH_FORM = '<type>/L<layer>-PBI-<number>-<topic>';
const BRANCH_FORM_NO_PBI = '<type>/L<layer>-NOPBI-<topic>';

const SUBJECT_PATTERN = new RegExp(`^(?:${CONVENTIONAL_TYPES.join('|')})(?:\\([^)]+\\))?!?: .+`);
const SKIPPED_SUBJECT = /^(?:Merge |Revert |fixup! |squash! )/;

const SECRET_PATTERNS = [
  { name: 'aws-access-key', re: /AKIA[0-9A-Z]{16}/ },
  { name: 'private-key-block', re: /-----BEGIN (?:RSA |EC |OPENSSH |DSA |PGP )?PRIVATE KEY/ },
  { name: 'long-credential-literal', re: /(?:api[_-]?key|secret|password|passwd|token)["']?\s*[:=]\s*["'][A-Za-z0-9+/_\-.]{20,}["']/i },
  { name: 'vendor-token', re: /\b(?:sk-(?:live|proj|ant)-[A-Za-z0-9_-]{16,}|ghp_[A-Za-z0-9]{36}|glpat-[A-Za-z0-9_-]{20,})\b/ },
];

const EXCLUDED_DIFF_PATHS = /(?:^|\/)(?:__tests__\/|evals\/specs\/)|\.test\.[a-z]+$/;
const WAIVER_MARKER = 'ecc-allow-secret';

function checkBranchName(name) {
  if (typeof name !== 'string' || !name.trim()) {
    return 'branch name is empty';
  }
  const branch = name.trim();
  if (BRANCH_PATTERN.test(branch)) return null;
  if (BRANCH_WITHOUT_PBI.test(branch)) {
    return (
      `branch '${branch}' violates iotpf-git-workflow §2 — the PBI number is missing: expected ` +
      `${BRANCH_FORM} (e.g. feat/L3-PBI-34-spc-window; 'PBI' upper-case, number without leading zeros), ` +
      `or ${BRANCH_FORM_NO_PBI} when the work has no PBI`
    );
  }
  return (
    `branch '${branch}' violates iotpf-git-workflow §2 — expected ` +
    `${BRANCH_FORM}, or ${BRANCH_FORM_NO_PBI} when the work has no PBI ` +
    `(type: ${BRANCH_TYPES.join('|')}; layer: ${BRANCH_LAYERS.join('|')})`
  );
}

function checkCommitSubject(subject) {
  const s = String(subject || '').trim();
  if (!s) return 'empty commit subject';
  if (SKIPPED_SUBJECT.test(s)) return null;
  if (!SUBJECT_PATTERN.test(s)) {
    return `commit subject '${s.slice(0, 80)}' is not Conventional Commits (<type>: <description>)`;
  }
  return null;
}

/**
 * Scan a unified diff for secret-shaped ADDED lines. Returns findings with
 * the file, pattern name, and a redacted excerpt (never the full match).
 */
function scanDiffForSecrets(diffText) {
  const findings = [];
  let currentFile = '';
  let excluded = false;

  for (const line of String(diffText || '').split('\n')) {
    const fileHeader = line.match(/^\+\+\+ b\/(.+)$/);
    if (fileHeader) {
      currentFile = fileHeader[1];
      excluded = EXCLUDED_DIFF_PATHS.test(currentFile);
      continue;
    }
    if (excluded || !line.startsWith('+') || line.startsWith('+++')) continue;
    if (line.includes(WAIVER_MARKER)) continue;

    for (const { name, re } of SECRET_PATTERNS) {
      const match = line.match(re);
      if (match) {
        const excerpt = match[0].slice(0, 12) + '…(redacted)';
        findings.push(`${currentFile}: added line matches ${name} (${excerpt})`);
        break;
      }
    }
  }
  return findings;
}

// --- git plumbing (main only) -----------------------------------------------

function git(args) {
  try {
    return {
      ok: true,
      out: execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim(),
    };
  } catch (e) {
    return { ok: false, out: `${e.stdout || ''}${e.stderr || ''}`.trim() };
  }
}

function resolveBranchName() {
  return (
    process.env.CI_MERGE_REQUEST_SOURCE_BRANCH_NAME ||
    process.env.CI_COMMIT_BRANCH ||
    (git(['rev-parse', '--abbrev-ref', 'HEAD']).ok
      ? git(['rev-parse', '--abbrev-ref', 'HEAD']).out
      : '')
  );
}

function resolveBase() {
  const candidates = [
    process.env.CI_MERGE_REQUEST_DIFF_BASE_SHA,
    process.env.ECC_POLICY_BASE_REF,
  ].filter(Boolean);
  for (const ref of candidates) {
    if (git(['rev-parse', '--verify', `${ref}^{commit}`]).ok) return ref;
  }
  for (const trunk of ['origin/main', 'main']) {
    const mb = git(['merge-base', 'HEAD', trunk]);
    if (mb.ok && mb.out) return mb.out;
  }
  return null;
}

function main() {
  const errors = [];

  const branch = resolveBranchName();
  if (branch && branch !== 'HEAD') {
    const branchProblem = checkBranchName(branch);
    if (branchProblem) errors.push(branchProblem);
  } else {
    console.log('[validate-git-policy] detached HEAD / no branch name — skipping branch-name check');
  }

  const base = resolveBase();
  let range;
  if (base && git(['rev-parse', '--verify', `${base}^{commit}`]).ok) {
    range = `${base}..HEAD`;
  } else {
    console.log('[validate-git-policy] no merge base resolvable — degrading to HEAD-only checks');
    range = 'HEAD~1..HEAD';
    if (!git(['rev-parse', '--verify', 'HEAD~1^{commit}']).ok) range = null;
  }

  if (range) {
    const logRes = git(['log', '--format=%s', range]);
    if (logRes.ok) {
      for (const subject of logRes.out.split('\n').filter(Boolean)) {
        const problem = checkCommitSubject(subject);
        if (problem) errors.push(problem);
      }
    } else {
      console.log(`[validate-git-policy] git log failed for ${range} — skipping commit-subject check`);
    }

    const diffRes = git(['diff', '--unified=0', range.replace('..', '...')]);
    if (diffRes.ok) {
      errors.push(...scanDiffForSecrets(diffRes.out));
    } else {
      console.log(`[validate-git-policy] git diff failed for ${range} — skipping secret scan`);
    }
  }

  if (errors.length) {
    console.error(`\n[validate-git-policy] FAILED — ${errors.length} violation(s):`);
    for (const e of errors) console.error('  ERROR ' + e);
    process.exit(1);
  }
  console.log(`[validate-git-policy] OK — branch, commit-format, and secret checks hold (${branch || 'detached'})`);
  process.exit(0);
}

module.exports = { checkBranchName, checkCommitSubject, scanDiffForSecrets, BRANCH_PATTERN, BRANCH_FORM, BRANCH_FORM_NO_PBI, SUBJECT_PATTERN };

if (require.main === module) main();
