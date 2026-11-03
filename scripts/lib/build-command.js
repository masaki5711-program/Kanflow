'use strict';

/**
 * Reduce a Bash command line to the build / compile / test commands it really
 * runs — the identity mistake memory tracks a failure under.
 *
 * Why: retries of the same failing build rarely repeat the exact command
 * string. `cd "<worktree>" && cargo test -p x 2>&1 | tail -40` and
 * `cargo test -p x 2>&1 | grep FAILED` are the same build; keyed on the raw
 * string they were separate ledger entries that never reached 2 failures, so
 * the Stop-capture hook never fired. Matching on the raw string also picked up
 * commands that merely CONTAIN a build word (a heredoc body, a `node -e`
 * script, a grep pattern).
 *
 * So: only the leading command of each shell segment counts; heredoc bodies,
 * `cd`, env assignments, redirections and everything after a pipe are dropped.
 * Env assignments are dropped on purpose — `DATABASE_URL=postgres://…` must
 * not land in the ledger. Pure, no I/O.
 */

const { splitShellSegments } = require('./shell-split');

const HEREDOC_BODY = /<<-?\s*(['"]?)([A-Za-z_][A-Za-z0-9_]*)\1[^\n]*\n[\s\S]*?\n[ \t]*\2[ \t]*(?=\n|$)/g;
const ENV_ASSIGN = /^[A-Za-z_][A-Za-z0-9_]*=(?:"[^"]*"|'[^']*'|\S*)\s+/;
const WRAPPERS = /^(?:time|command|exec|nice|npx|uv\s+run|poetry\s+run)\s+/;
const REDIRECT = /\s+(?:\d?>>?|&>)\s*(?:&\d|\S+)/g;

// The leading command of a segment that is a build / compile / test step.
const BUILD_HEAD = new RegExp(
  '^(?:' + [
    '(?:npm|pnpm|yarn|bun)\\s+(?:run\\s+)?(?:build|test|typecheck|lint)(?::[\\w:-]+)?(?=\\s|$)',
    'tsc(?=\\s|$)',
    'cargo\\s+(?:build|check|test|clippy|nextest)(?=\\s|$)',
    'go\\s+(?:build|test|vet)(?=\\s|$)',
    'pytest(?=\\s|$)',
    'python[\\d.]*(?:\\.exe)?\\s+-m\\s+(?:pytest|mypy|pyright)(?=\\s|$)',
    '(?:mypy|pyright)(?=\\s|$)',
    'make(?=\\s|$)',
    '(?:\\./)?gradlew?(?=\\s|$)',
    'mvn(?=\\s|$)',
    'dotnet\\s+(?:build|test)(?=\\s|$)',
    'node\\s+--test(?=\\s|$)',
  ].join('|') + ')',
);

const MAX_CORE_CHARS = 200;

/** The part of a segment before its first unquoted single `|`. */
function beforePipe(segment) {
  let quote = null;
  for (let i = 0; i < segment.length; i += 1) {
    const ch = segment[i];
    if (quote) {
      if (ch === '\\' && quote === '"') i += 1;
      else if (ch === quote) quote = null;
      continue;
    }
    if (ch === '\\') { i += 1; continue; }
    if (ch === '"' || ch === "'") { quote = ch; continue; }
    if (ch === '|') return segment.slice(0, i);
  }
  return segment;
}

/** One segment reduced to its build command, or '' when it is not one. */
function segmentCore(segment) {
  let s = beforePipe(segment).replace(REDIRECT, ' ').replace(/\s+/g, ' ').trim();
  for (let prev = null; prev !== s;) {
    prev = s;
    s = s.replace(ENV_ASSIGN, '').replace(WRAPPERS, '');
  }
  return BUILD_HEAD.test(s) ? s : '';
}

/**
 * @param {string} command a Bash tool command line
 * @returns {string} its build commands joined by ' && ', or '' when it runs none
 */
function buildCore(command) {
  const body = String(command || '').replace(HEREDOC_BODY, '');
  const cores = splitShellSegments(body).map(segmentCore).filter(Boolean);
  return cores.join(' && ').slice(0, MAX_CORE_CHARS);
}

module.exports = { buildCore, segmentCore, beforePipe, BUILD_HEAD };
