#!/usr/bin/env node
/**
 * SessionStart Hook: Pinned Mistakes (fixed-position injection)
 *
 * Injects the pinned mistake records (weight >= 7 or recurrence >= 3 —
 * chronic, high-severity failures) once per session, capped at 3 records
 * (~600 tokens). This is the spec's "重要度の重み付け" guarantee: chronic
 * mistakes are always visible even when a later similarity search would
 * rank them low. Non-pinned records are NOT loaded here — they surface
 * on-demand via post-bash-error-memory / user-prompt-mistake-recall.
 *
 * SessionStart stdout IS injected into context — emits EMPTY output when
 * there is nothing pinned. Fails OPEN (empty stdout).
 * Compatible with run-with-flags.js via module.exports.run().
 */

'use strict';

const search = require('../lib/mistake-search');
const store = require('../lib/mistake-store');

const MAX_STDIN = 1024 * 1024;
const MAX_PINNED = 3;

function run(rawInput) {
  try {
    const root = process.env.CLAUDE_PROJECT_DIR || process.cwd();
    const pinned = store
      .loadRecords(root)
      .filter(r => r.pinned)
      .sort((a, b) => (b.weight || 0) - (a.weight || 0))
      .slice(0, MAX_PINNED);
    if (pinned.length === 0) return { stdout: '', exitCode: 0 };

    const msg = [
      '[Pinned Mistakes] このプロジェクトで繰り返し発生している致命的ミス。常に注意:',
      search.formatMatches(pinned.map(record => ({ record }))),
      '(全記録: MISTAKES.md / 検索: node scripts/mistakes.js search "<エラー文>")',
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
