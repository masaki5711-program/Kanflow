#!/usr/bin/env node
/**
 * UserPromptSubmit Hook: Mistake Recall (standard + strict profiles)
 *
 * Searches the mistake-memory store with the user's prompt text and, when a
 * past mistake is clearly relevant (lex >= INJECT_THRESHOLD), adds the top-2
 * records (~300 tokens) as context BEFORE the work starts. Originally wired
 * strict-only; promoted to standard after the 2026-07 harness audit (the one
 * missing link for proactive recall — the threshold keeps it silent on
 * unrelated prompts, and search latency is <15ms). Disable per-session with
 * ECC_DISABLED_HOOKS=user-prompt:mistake-recall.
 *
 * UserPromptSubmit stdout IS injected into context — therefore this hook
 * always controls stdout explicitly and emits EMPTY output when silent
 * (echoing the raw event JSON back would inject garbage).
 *
 * Fails OPEN (empty stdout). Compatible with run-with-flags.js via run().
 */

'use strict';

const search = require('../lib/mistake-search');
const store = require('../lib/mistake-store');

const MAX_STDIN = 1024 * 1024;
const MIN_PROMPT_CHARS = 12; // greetings / one-word prompts: never search
const TOP_K = 2;

function run(rawInput) {
  try {
    const input = typeof rawInput === 'string' ? JSON.parse(rawInput) : rawInput || {};
    const prompt = String(input.prompt || '');
    if (prompt.trim().length < MIN_PROMPT_CHARS) return { stdout: '', exitCode: 0 };

    const root = process.env.CLAUDE_PROJECT_DIR || process.cwd();
    const records = store.loadRecords(root);
    if (records.length === 0) return { stdout: '', exitCode: 0 };

    const matches = search
      .rank(records, prompt, { now: new Date().toISOString() })
      .filter(m => m.lex >= search.INJECT_THRESHOLD)
      .slice(0, TOP_K);
    if (matches.length === 0) return { stdout: '', exitCode: 0 };

    const msg = [
      '[Mistake Recall] このタスクに関連する過去の失敗記録があります。同じミスを避けてください:',
      search.formatMatches(matches),
    ].join('\n');
    return { stdout: msg, exitCode: 0 };
  } catch {
    /* fail open — silent */
  }
  return { stdout: '', exitCode: 0 };
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
    process.stdout.write(String((result && result.stdout) || ''));
    process.exit(0);
  });
}
