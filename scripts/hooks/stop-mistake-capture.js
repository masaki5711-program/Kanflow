#!/usr/bin/env node
/**
 * Stop Hook: Mistake Capture (write side of mistake memory)
 *
 * When this session saw a build/test command fail 2+ times and then succeed
 * (tracked by post-bash-error-memory.js in .claude/state/mistake-pending.jsonl),
 * and no similar record exists yet, block the stop ONCE and ask Claude — who
 * holds the full session context — to record the error→fix pair via
 * `node scripts/mistakes.js add`. Deterministic detection, in-session
 * judgment: no extra LLM call, no new egress (spec §6).
 *
 * One-shot: candidates are marked `prompted` before blocking, so the next
 * Stop passes even if nothing was recorded. Also yields when another Stop
 * hook is already looping (stop_hook_active).
 *
 * Fails OPEN. Compatible with run-with-flags.js via module.exports.run().
 */

'use strict';

const store = require('../lib/mistake-store');

const MAX_STDIN = 1024 * 1024;
const MAX_CANDIDATES = 3;

function run(rawInput) {
  try {
    const input = typeof rawInput === 'string' ? JSON.parse(rawInput) : rawInput || {};
    if (input.stop_hook_active === true) return rawInput; // another stop loop is driving

    const root = process.env.CLAUDE_PROJECT_DIR || process.cwd();
    const now = new Date().toISOString();
    const candidates = store
      .captureCandidates(root, now, store.sessionKey(input))
      .slice(0, MAX_CANDIDATES);
    if (candidates.length === 0) return rawInput;

    store.markPrompted(root, candidates, now); // one-shot — never re-block

    const list = candidates
      .map(
        (c, i) =>
          `${i + 1}. コマンド: ${c.cmd}\n   失敗 ${c.fails} 回 → 解決済み\n   署名: ${String(c.sig || '').slice(0, 160)}`,
      )
      .join('\n');
    const msg = [
      '[Mistake Capture] このセッションで 2 回以上失敗した後に解決したエラーがあり、',
      'ミス記録にまだ存在しません。再発防止のため記録してから終了してください:',
      '',
      list,
      '',
      '記録方法 (エラー側の署名と、次回そのまま実行できる修正を書く):',
      '  node scripts/mistakes.js add --json \'{"title":"<短い要約>","signature":"<エラー署名 (揮発情報なし)>","context":"<何の作業中か>","root_cause":"<原因>","fix":"<実証済みの修正手順>","tags":["..."],"severity":3}\'',
      '',
      '些末な修正だった場合は記録せずそのまま終了して構いません(この確認は再表示されません)。',
    ].join('\n');
    return { exitCode: 2, stderr: msg };
  } catch {
    /* fail open */
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
