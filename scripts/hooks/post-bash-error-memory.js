#!/usr/bin/env node
/**
 * PostToolUse Hook: Mistake Memory (read side)
 *
 * After a build / compile / test command FAILS, search the mistake-memory
 * store (.claude/mistakes/records.jsonl) with the error text and inject only
 * the top-3 relevant records (~450 tokens) — replacing the old behavior of
 * dumping the first 6,000 chars of .claude_errors.md wholesale. Matches at
 * HIT_THRESHOLD also bump the record's recurrence/weight (repeat offenders
 * float up and eventually pin). Every failure is appended to the session's
 * pending ledger; a later success of the same command marks it resolved so
 * stop-mistake-capture.js can prompt for recording (write side).
 *
 * Registered on BOTH PostToolUse and PostToolUseFailure: a command that exits
 * non-zero is reported only through PostToolUseFailure, so PostToolUse alone
 * saw just the failures whose exit code a pipe had hidden (`… | tail`).
 * A failure is tracked under the command's build core (lib/build-command.js),
 * so retries with a different `cd` / pipe count as the same failure, and
 * under the session_id Claude Code passes in the event.
 *
 * Silent unless a relevant record exists (lex >= INJECT_THRESHOLD).
 * Fails OPEN: any parse/internal error passes through. Compatible with
 * run-with-flags.js via module.exports.run(). Cross-platform.
 */

'use strict';

const search = require('../lib/mistake-search');
const store = require('../lib/mistake-store');
const { buildCore } = require('../lib/build-command');

const MAX_STDIN = 1024 * 1024;
const MAX_QUERY_CHARS = 4000; // tail of the output — errors surface at the end
const MAX_SNIPPET_CHARS = 240;
const TOP_K = 3;

// High-confidence failure signals in command output. Counts must be non-zero:
// "0 failed" is how cargo / pytest / node:test report a PASSING run, and
// matching it made every green run a failure that could never resolve.
const FAILURE_SIGNAL = /(?:npm ERR!|error TS\d|error\[E\d|errors? generated|compilation (?:failed|error)|build fail(?:ed|ure)|cannot find (?:module|name|crate|symbol)|unresolved (?:import|reference)|Traceback \(most recent call last\)|panicked at|\b[1-9]\d* (?:failed|failing)\b|(?:^|\s)[ℹ#] fail [1-9]|exit code [1-9])/i;
// Upper-case FAILED (cargo "test result: FAILED", pytest "FAILED tests/…") is
// case-sensitive, so the word "failed" in "0 failed" does not count.
const FAILED_WORD = /\bFAILED\b/;

function collectResponseText(input) {
  const parts = [];
  const tr = input.tool_response;
  if (typeof tr === 'string') {
    parts.push(tr);
  } else if (tr && typeof tr === 'object') {
    for (const key of ['stdout', 'stderr', 'output', 'content', 'result']) {
      if (typeof tr[key] === 'string') parts.push(tr[key]);
    }
  }
  if (typeof input.tool_response_text === 'string') parts.push(input.tool_response_text);
  if (typeof input.error === 'string') parts.push(input.error); // PostToolUseFailure
  return parts.join('\n');
}

function looksFailed(input, text) {
  if (input.hook_event_name === 'PostToolUseFailure') return true;
  const tr = input.tool_response;
  if (tr && typeof tr === 'object' && (tr.is_error === true || tr.interrupted === true)) return true;
  if (input.is_error === true) return true;
  return FAILURE_SIGNAL.test(text) || FAILED_WORD.test(text);
}

// Credentials a failing build may print (a DB URL in a connection error, a
// token in a config dump) are masked before the snippet reaches the ledger.
function redact(text) {
  return text
    .replace(/(\b[a-z][a-z0-9+.-]*:\/\/)[^\s/:@]+:[^\s/@]+@/gi, '$1<REDACTED>@')
    .replace(/\b([A-Za-z0-9_]*(?:token|secret|passw(?:or)?d|api[_-]?key|private[_-]?key)[A-Za-z0-9_]*)\s*[=:]\s*\S+/gi, '$1=<REDACTED>')
    .replace(/\b(?:AKIA|ASIA)[A-Z0-9]{16}\b|\b(?:ghp|gho|ghs|glpat)[-_][A-Za-z0-9_-]{10,}|\bgithub_pat_[A-Za-z0-9_]+/g, '<REDACTED>');
}

/** The most signature-like slice: first failure signal with context. */
function errorSnippet(text) {
  const m = text.match(FAILURE_SIGNAL) || text.match(FAILED_WORD);
  const slice = m
    ? text.slice(Math.max(0, m.index - 40), Math.max(0, m.index - 40) + MAX_SNIPPET_CHARS)
    : text.slice(-MAX_SNIPPET_CHARS);
  return redact(slice.replace(/\s+/g, ' ').trim());
}

function run(rawInput) {
  try {
    const input = typeof rawInput === 'string' ? JSON.parse(rawInput) : rawInput;
    if (input.is_interrupt === true) return rawInput; // the user stopped it — not a build failure
    const command = buildCore(input.tool_input?.command);
    if (!command) return rawInput;

    const root = process.env.CLAUDE_PROJECT_DIR || process.cwd();
    const now = new Date().toISOString();
    const text = collectResponseText(input);
    const session = store.sessionKey(input);

    if (!looksFailed(input, text)) {
      // A build/test command SUCCEEDED — resolve any pending failure of the
      // same command so the Stop hook can prompt for recording the fix.
      store.recordSuccess(root, command, now, session);
      return rawInput;
    }

    store.recordFailure(root, command, errorSnippet(text), now, session);

    const records = store.loadRecords(root);
    if (records.length === 0) return rawInput;

    const query = `${command}\n${text.slice(-MAX_QUERY_CHARS)}`;
    const matches = search
      .rank(records, query, { now })
      .filter(m => m.lex >= search.INJECT_THRESHOLD)
      .slice(0, TOP_K);
    if (matches.length === 0) return rawInput; // nothing relevant — stay silent

    if (matches[0].lex >= search.HIT_THRESHOLD) {
      store.registerHit(root, matches[0].record.id, now); // recurrence tracking
    }

    const msg = [
      '[Mistake Memory] このビルド/テスト失敗は過去の記録に類似しています。',
      '推測で修正する前に、下記の実証済みの修正を最初に適用してください。',
      '',
      search.formatMatches(matches),
      '',
      `詳細検索: node scripts/mistakes.js search "<エラー文>"`,
    ].join('\n');

    return {
      stdout: typeof rawInput === 'string' ? rawInput : JSON.stringify(rawInput),
      stderr: msg,
      exitCode: 2,
    };
  } catch {
    // fail open — never disrupt because of a hook error
  }
  return rawInput;
}

module.exports = { run };

// stdin entry point for direct / spawned execution
if (require.main === module) {
  let raw = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', chunk => {
    if (raw.length < MAX_STDIN) raw += chunk.substring(0, MAX_STDIN - raw.length);
  });
  process.stdin.on('end', () => {
    const result = run(raw);
    if (result && typeof result === 'object') {
      if (result.stderr) process.stderr.write(`${result.stderr}\n`);
      process.stdout.write(String(result.stdout || ''));
      process.exit(Number.isInteger(result.exitCode) ? result.exitCode : 0);
    } else {
      process.stdout.write(String(result));
      process.exit(0);
    }
  });
}
