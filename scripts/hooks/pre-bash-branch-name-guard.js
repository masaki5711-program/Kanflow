#!/usr/bin/env node
/**
 * PreToolUse Hook: Branch-Name Guard  (hook id: pre:bash:branch-name-guard)
 *
 * Blocks `git push` / `glab mr create` when the branch being published does
 * not follow iotpf-git-workflow §2 (`<type>/L<layer>-PBI-<number>-<topic>`,
 * or `<type>/L<layer>-NOPBI-<topic>` for work that has no PBI).
 *
 * Why: the convention is enforced only in CI (validate-git-policy.js, job
 * ecc-policy). Worktree flows create branches the convention rejects —
 * `claude --worktree <name>` makes `worktree-<name>` — so without this guard
 * the first signal is a red pipeline on an already-open MR. The pattern is
 * imported from the CI gate, so the two can never disagree.
 *
 * Only a real invocation counts: the command is split into shell segments and
 * tokenized, so `git push` inside a quoted string or heredoc never triggers.
 * `cd <dir> &&` and `git -C <dir>` select the repository that is judged. A
 * pushed name is judged only when it is known to be a branch (HEAD, a local
 * branch, or refs/heads/…) — tags and anything unresolvable pass.
 *
 * Behavior (CLAUDE.md §7): reads refs from the git dir (no git spawn);
 * detached HEAD, a non-repo directory, or any internal error passes through
 * (exit 0). Only a resolvable, non-conformant branch blocks.
 *
 * Exit codes: 0 allow · 2 block.
 * Compatible with bash-hook-dispatcher via module.exports.run().
 */

'use strict';

const path = require('path');
const { checkBranchName, BRANCH_FORM, BRANCH_FORM_NO_PBI } = require('../validate-git-policy');
const { describe, currentBranch, hasLocalBranch } = require('../lib/worktree-info');
const { splitShellSegments } = require('../lib/shell-split');
const { tokenizeArgs, extractMrArgs } = require('../lib/mr-conventional');

const MAX_STDIN = 1024 * 1024;

const ENV_PREFIX = /^[A-Za-z_][A-Za-z0-9_]*=/;
const GIT_BIN = /(^|[\\/])git(\.exe)?$/i;
const HEREDOC_BODY = /<<-?\s*(['"]?)([A-Za-z_][A-Za-z0-9_]*)\1[^\n]*\n[\s\S]*?\n[ \t]*\2[ \t]*(?=\n|$)/g;
// git global / push options whose VALUE is the next token.
const GIT_VALUE_OPTS = new Set(['-C', '-c', '--git-dir', '--work-tree', '--namespace', '--exec-path']);
const PUSH_VALUE_OPTS = new Set(['-o', '--push-option', '--repo', '--receive-pack', '--exec']);
const NO_BRANCH_FLAGS = new Set(['--tags', '--delete', '-d', '--mirror', '--prune']);

/**
 * Every real `git push` in a command line, with the directory it runs in.
 * @returns {Array<{dir: string, args: string[]}>} args = tokens after `push`
 */
function findPushes(command, cwd) {
  const pushes = [];
  let dir = cwd;
  for (const segment of splitShellSegments(String(command || '').replace(HEREDOC_BODY, ''))) {
    const argv = tokenizeArgs(segment);
    let i = 0;
    while (i < argv.length && ENV_PREFIX.test(argv[i])) i += 1;
    if (argv[i] === 'cd' && argv[i + 1]) {
      dir = path.resolve(dir, argv[i + 1]);
      continue;
    }
    if (!argv[i] || !GIT_BIN.test(argv[i])) continue;
    let runDir = dir;
    i += 1;
    while (i < argv.length && argv[i].startsWith('-')) {
      if (argv[i] === '-C' && argv[i + 1]) runDir = path.resolve(runDir, argv[i + 1]);
      i += GIT_VALUE_OPTS.has(argv[i]) ? 2 : 1;
    }
    if (argv[i] === 'push') pushes.push({ dir: runDir, args: argv.slice(i + 1) });
  }
  return pushes;
}

/**
 * Refspec destinations a push names. `['HEAD']` when it names none (the
 * checked-out branch is pushed); `[]` for tag pushes and deletions.
 */
function pushedRefs(args) {
  if (args.some(a => NO_BRANCH_FLAGS.has(a))) return [];
  const positional = [];
  for (let i = 0; i < args.length; i += 1) {
    if (PUSH_VALUE_OPTS.has(args[i])) i += 1;
    else if (!args[i].startsWith('-')) positional.push(args[i]);
  }
  const refspecs = positional.slice(1); // positional[0] is the remote
  if (refspecs.length === 0) return ['HEAD'];
  const out = [];
  for (let i = 0; i < refspecs.length; i += 1) {
    if (refspecs[i] === 'tag') {
      i += 1; // `git push origin tag v1.2.3`
      continue;
    }
    const clean = refspecs[i].replace(/^\+/, '');
    if (clean.startsWith(':')) continue; // deletion
    out.push(clean.includes(':') ? clean.split(':').pop() : clean);
  }
  return out;
}

/** The branch name a pushed ref stands for in this repo, or null when it is not known to be a branch. */
function branchFor(ref, info) {
  if (ref === 'HEAD' || ref === '@') return currentBranch(info);
  if (ref.startsWith('refs/heads/')) return ref.slice('refs/heads/'.length);
  if (ref.startsWith('refs/')) return null; // tags, notes, …
  return hasLocalBranch(info, ref) ? ref : null; // a bare name may be a tag
}

function blockMessage(branch, problem, command) {
  return [
    '[branch-name-guard] BLOCKED — this branch would fail the CI gate `ecc-policy`.',
    '',
    'Command:  ' + command,
    'Branch:   ' + branch,
    'Problem:  ' + problem,
    '',
    'Rename it before publishing (iotpf-git-workflow §2):',
    `  git branch -m ${BRANCH_FORM}     e.g. feat/Lcross-PBI-34-parallel-worktrees`,
    '',
    'The PBI number is the backlog item this work delivers. If you do not know it,',
    'ask the user — never invent a number. Only when the user confirms the work has',
    `no PBI:  git branch -m ${BRANCH_FORM_NO_PBI}`,
    '',
    `New parallel work: \`node scripts/worktree.js new ${BRANCH_FORM}\` names it`,
    'correctly from the start.',
    '',
    'To disable temporarily:  ECC_DISABLED_HOOKS=pre:bash:branch-name-guard',
  ].join('\n') + '\n';
}

function evaluate(rawInput, cwd = process.cwd()) {
  let input;
  try {
    input = JSON.parse(rawInput);
  } catch {
    return { stdout: rawInput, exitCode: 0 };
  }
  const command = String((input && input.tool_input && input.tool_input.command) || '');
  if (!/\bpush\b|\bmr\b|merge-request/.test(command)) return { stdout: rawInput, exitCode: 0 };

  const candidates = []; // { branch } to validate
  for (const push of findPushes(command, cwd)) {
    const info = describe(push.dir);
    if (!info) continue; // not a repo — nothing to judge
    for (const ref of pushedRefs(push.args)) candidates.push(branchFor(ref, info));
  }
  const mr = extractMrArgs(command);
  if (mr && mr.action !== 'update') candidates.push(currentBranch(describe(cwd)));

  for (const branch of candidates) {
    if (!branch) continue; // detached, a tag, or unresolvable
    const problem = checkBranchName(branch);
    if (problem) return { stderr: blockMessage(branch, problem, command), exitCode: 2 };
  }
  return { stdout: rawInput, exitCode: 0 };
}

function run(rawInput) {
  try {
    return evaluate(rawInput);
  } catch (err) {
    process.stderr.write('[branch-name-guard] internal error (fail-open): ' + err.message + '\n');
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

module.exports = { run, evaluate, findPushes, pushedRefs, branchFor };
