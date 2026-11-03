'use strict';

/**
 * Pure validation logic for GitLab Merge Request authoring commands.
 *
 * Extracted from the hook so it is unit-testable and reusable (a future
 * `create-mr.js` helper can call the same validator). No side effects, no I/O.
 *
 * Two failure classes this defends against (the real, recurring pain):
 *   1. GitLab default text — "Merge branch 'feat/x' into 'chore/y'" — leaking
 *      into MR title/description (mostly via `glab mr create --fill`).
 *   2. MR titles that violate Conventional Commits, which the squash-merge
 *      message inherits and which then blocks the merge.
 *
 * Project rule alignment:
 *   - Allowed types match scripts/hooks/pre-bash-commit-quality.js + iotpf-git-workflow.
 *   - Subject "must not START with an uppercase ASCII letter" rather than the
 *     stricter "must start [a-z]", so JA/EN/ID subjects (CLAUDE.md §6) are not
 *     false-flagged while the actual failure ("Merge…") is still caught.
 */

const { splitShellSegments } = require('./shell-split');

// Conventional Commits types accepted across this project.
const COMMIT_TYPES = [
  'feat', 'fix', 'docs', 'style', 'refactor',
  'test', 'chore', 'perf', 'ci', 'build', 'revert',
];

// Full Conventional Commits header: type(scope)!?: subject
const HEADER_RE = new RegExp(
  '^(' + COMMIT_TYPES.join('|') + ')(\\([a-zA-Z0-9_-]+\\))?(!)?: (.+)$'
);

// GitLab / git auto-generated default text that must never reach an MR field.
const DEFAULT_MERGE_PATTERNS = [
  /\bMerge branch\b/i,
  /\bMerge remote-tracking branch\b/i,
  /^\s*Merge\b/i,
  /into\s+'[^']+'/i,
];

const MAX_HEADER_LEN = 72;
const MIN_DESC_LEN = 15;

// MR must target the trunk or a declared release line — never a sibling branch.
// Targeting a sibling is the ROOT cause of the "into 'chore/y'" default text and
// the MR !3 conflict (iotpf-git-workflow §4.1).
const ALLOWED_TARGET = /^(main|release\/.+)$/;

// Proper nouns/products that are legitimately capitalized at the start of a
// subject (Sentence-case-SHAPED but not prose). Extend as the stack grows.
const LEADING_ALLOWLIST = new Set([
  'Rust', 'Python', 'Node', 'Deno', 'Bun', 'Docker', 'Kafka', 'Ollama',
  'Postgres', 'Redis', 'Nginx', 'Grafana', 'Linux', 'Windows', 'Yamaha',
  'Omron', 'Timescale', 'Prisma', 'Drizzle', 'Vite', 'Turbopack', 'Next',
  'React', 'Vue', 'Svelte', 'Tailwind', 'Playwright', 'Pytest', 'Cargo',
  'Tokio', 'Axum', 'Serde', 'Mosquitto', 'Zod', 'Claude', 'Ms', 'OSS',
]);
// A value we cannot statically evaluate (shell/command substitution).
const UNEVALUABLE = /^\$\(|^`|\$\{/;

const MR_SUBCOMMANDS = new Set(['mr', 'merge-request']);
const MR_ACTIONS = new Set(['create', 'new', 'update']);
const GLAB_BIN = /(^|[\\/])glab(\.exe)?$/i; // `glab`, `/usr/bin/glab`, `glab.exe`
const ENV_PREFIX = /^[A-Za-z_][A-Za-z0-9_]*=/; // `FOO=bar glab ...`

/**
 * Tokenize a single shell segment into argv, respecting single/double quotes
 * and stripping the surrounding quote characters. Best-effort; callers treat a
 * throw as "could not parse" and fail open.
 * @param {string} segment
 * @returns {string[]}
 */
function tokenizeArgs(segment) {
  const tokens = [];
  let cur = '';
  let quote = null;
  let started = false;

  for (let i = 0; i < segment.length; i += 1) {
    const ch = segment[i];
    if (quote) {
      if (ch === '\\' && quote === '"' && i + 1 < segment.length) {
        cur += segment[i + 1];
        i += 1;
        continue;
      }
      if (ch === quote) { quote = null; continue; }
      cur += ch;
      continue;
    }
    if (ch === '"' || ch === "'") { quote = ch; started = true; continue; }
    if (ch === ' ' || ch === '\t' || ch === '\n') {
      if (started) { tokens.push(cur); cur = ''; started = false; }
      continue;
    }
    cur += ch;
    started = true;
  }
  if (started) tokens.push(cur);
  return tokens;
}

function matchFlag(token, longName, shortName) {
  if (token === longName || token === shortName) return { inline: false };
  if (token.startsWith(longName + '=')) return { inline: true, value: token.slice(longName.length + 1) };
  if (token.startsWith(shortName + '=')) return { inline: true, value: token.slice(shortName.length + 1) };
  return null;
}

/**
 * Find a genuine `glab mr|merge-request create|new|update` invocation and pull
 * out the fields we care about. A segment qualifies ONLY when its leading token
 * is the glab executable — so the string "glab mr create" appearing inside a
 * quoted argument (e.g. `git commit -m "...glab mr create..."` or an `echo`)
 * does NOT trigger.
 * @param {string} command
 * @returns {null | {action:string, title?:string, description?:string, targetBranch?:string, fill:boolean}}
 */
function extractMrArgs(command) {
  for (const segment of splitShellSegments(command || '')) {
    const argv = tokenizeArgs(segment);
    let k = 0;
    while (k < argv.length && ENV_PREFIX.test(argv[k])) k += 1; // skip env prefixes
    if (!argv[k] || !GLAB_BIN.test(argv[k])) continue;
    if (!MR_SUBCOMMANDS.has(argv[k + 1])) continue;
    const action = argv[k + 2];
    if (!MR_ACTIONS.has(action)) continue;

    const out = { action, fill: false };
    for (let i = k + 3; i < argv.length; i += 1) {
      const tok = argv[i];
      const title = matchFlag(tok, '--title', '-t');
      if (title) { out.title = title.inline ? title.value : argv[++i]; continue; }
      const desc = matchFlag(tok, '--description', '-d');
      if (desc) { out.description = desc.inline ? desc.value : argv[++i]; continue; }
      const target = matchFlag(tok, '--target-branch', '-b');
      if (target) { out.targetBranch = target.inline ? target.value : argv[++i]; continue; }
      if (tok === '--fill' || tok === '-f' || tok === '--fill-commit-body') out.fill = true;
    }
    return out;
  }
  return null;
}

/**
 * True only when the subject opens with an ordinary Sentence-case English word
 * (Capital + lowercase, e.g. "Add", "Merge", "Update") — the real failure mode.
 * ALL-CAPS acronyms (README, API, SQL), CamelCase tech (TypeScript, IoTPF) and
 * known product nouns (Rust, Docker) are NOT flagged.
 */
function startsWithSentenceCaseProse(subject) {
  const first = String(subject).split(/\s+/)[0].replace(/[^A-Za-z0-9]+$/, '');
  if (!/^[A-Z]/.test(first)) return false;       // not uppercase-led
  if (LEADING_ALLOWLIST.has(first)) return false; // known product/acronym noun
  return /^[A-Z][a-z]+$/.test(first);            // Capital + all-lowercase = prose
}

function validateTargetBranch(target) {
  if (typeof target !== 'string' || !target.trim()) return [];
  if (UNEVALUABLE.test(target.trim())) return [];
  if (ALLOWED_TARGET.test(target.trim())) return [];
  return [{ severity: 'error', code: 'TARGET_BRANCH',
    message: `MR target "${target.trim()}" is not main/release/*. Target the trunk, not a sibling branch — this is the root cause of "Merge … into '…'" defaults and the MR !3 conflict (iotpf-git-workflow §4.1).` }];
}

function findDefaultMergeText(text) {
  if (typeof text !== 'string') return null;
  for (const re of DEFAULT_MERGE_PATTERNS) {
    if (re.test(text)) return re.source;
  }
  return null;
}

/** @returns {Array<{severity:'error'|'warning', code:string, message:string}>} */
function validateTitle(rawTitle) {
  const issues = [];
  const title = (rawTitle || '').trim();

  if (!title) {
    issues.push({ severity: 'error', code: 'TITLE_MISSING', message: 'MR title is empty.' });
    return issues;
  }
  if (findDefaultMergeText(title)) {
    issues.push({ severity: 'error', code: 'TITLE_DEFAULT_MERGE',
      message: `Title contains GitLab/git default merge text: "${title}".` });
    return issues;
  }
  if (UNEVALUABLE.test(title)) return issues; // command substitution — cannot judge, fail open
  const m = HEADER_RE.exec(title);
  if (!m) {
    issues.push({ severity: 'error', code: 'TITLE_FORMAT',
      message: `Title is not Conventional Commits: "${title}".` });
    return issues;
  }
  const subject = m[4];
  if (startsWithSentenceCaseProse(subject)) {
    issues.push({ severity: 'error', code: 'TITLE_UPPERCASE',
      message: `Subject looks Sentence-cased; start with a lowercase verb: "${subject}". ` +
        '(ALL-CAPS acronyms, CamelCase tech names, and known product nouns are allowed.)' });
  }
  if (/[.]\s*$/.test(subject)) {
    issues.push({ severity: 'error', code: 'TITLE_TRAILING_PERIOD',
      message: 'Subject must not end with a period.' });
  }
  if (title.length > MAX_HEADER_LEN) {
    issues.push({ severity: 'warning', code: 'TITLE_LENGTH',
      message: `Title is ${title.length} chars (recommended <= ${MAX_HEADER_LEN}).` });
  }
  return issues;
}

/** @returns {Array<{severity:'error'|'warning', code:string, message:string}>} */
function validateDescription(rawDesc, { action, fill }) {
  const issues = [];
  const provided = typeof rawDesc === 'string';

  if (!provided) {
    if (action === 'update') return issues; // update may legitimately set only the title
    if (fill) {
      issues.push({ severity: 'error', code: 'DESC_FILL_RISK',
        message: '`--fill` derives the description from commit messages — the main vector for the default merge text leaking in. Pass an explicit --description.' });
    } else {
      issues.push({ severity: 'error', code: 'DESC_MISSING',
        message: 'No --description provided; MR body must be authored explicitly (non-interactive).' });
    }
    return issues;
  }

  if (UNEVALUABLE.test(rawDesc.trim())) return issues; // e.g. "$(cat template.md)" — accept presence, skip content
  const desc = rawDesc.trim();
  if (!desc) {
    issues.push({ severity: 'error', code: 'DESC_EMPTY', message: 'MR description is empty.' });
    return issues;
  }
  if (findDefaultMergeText(desc)) {
    issues.push({ severity: 'error', code: 'DESC_DEFAULT_MERGE',
      message: 'Description contains GitLab/git default merge text.' });
  }
  if (desc.length < MIN_DESC_LEN || !/\s/.test(desc)) {
    issues.push({ severity: 'error', code: 'DESC_TRIVIAL',
      message: `Description is too thin to be meaningful (got ${desc.length} chars). Explain what changed and why.` });
  }
  return issues;
}

/**
 * Validate a full bash command. Triggered only for glab MR authoring commands.
 * @param {string} command
 * @returns {{triggered:boolean, action?:string, errors:Array, warnings:Array}}
 */
function validateMrCommand(command) {
  const args = extractMrArgs(command || '');
  if (!args) return { triggered: false, errors: [], warnings: [] };

  const all = [
    ...validateTitle(args.title),
    ...validateDescription(args.description, args),
    ...validateTargetBranch(args.targetBranch),
  ];
  return {
    triggered: true,
    action: args.action,
    errors: all.filter(i => i.severity === 'error'),
    warnings: all.filter(i => i.severity === 'warning'),
  };
}

module.exports = {
  COMMIT_TYPES,
  HEADER_RE,
  tokenizeArgs,
  extractMrArgs,
  findDefaultMergeText,
  startsWithSentenceCaseProse,
  validateTitle,
  validateDescription,
  validateTargetBranch,
  validateMrCommand,
};
