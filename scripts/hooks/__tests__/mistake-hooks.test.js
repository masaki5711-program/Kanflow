'use strict';

/*
 * Tests for the mistake-memory hooks:
 *   - session-start-mistakes.js  (pinned records → SessionStart context)
 *   - user-prompt-mistake-recall.js (opt-in UserPromptSubmit recall)
 *   - stop-mistake-capture.js    (one-shot Stop gate prompting a record)
 *
 * Contract highlights: SessionStart/UserPromptSubmit stdout IS context, so
 * silence must be an EMPTY stdout (never an echo of the raw event JSON);
 * every hook fails open on garbage input (CLAUDE.md §7).
 */

const { test, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const TMP_ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'mistake-hooks-'));
const ORIG_PROJECT_DIR = process.env.CLAUDE_PROJECT_DIR;
const ORIG_SESSION_ID = process.env.CLAUDE_SESSION_ID;
process.env.CLAUDE_PROJECT_DIR = TMP_ROOT;
process.env.CLAUDE_SESSION_ID = `mh-test-${process.pid}`;

const sessionStartMistakes = require('../session-start-mistakes');
const promptRecall = require('../user-prompt-mistake-recall');
const stopCapture = require('../stop-mistake-capture');
const store = require('../../lib/mistake-store');

const NOW = '2026-07-21T10:00:00.000Z';
const FIELDS = {
  title: 'tsc paths エイリアス未解決',
  signature: 'error TS2307: Cannot find module',
  context: 'vitest',
  root_cause: 'vitest.config に paths 未反映',
  fix: 'vitest.config.ts に resolve.alias を追加',
  tags: ['typescript'],
  severity: 3,
};

beforeEach(() => {
  fs.rmSync(path.join(TMP_ROOT, '.claude'), { recursive: true, force: true });
  fs.rmSync(path.join(TMP_ROOT, 'MISTAKES.md'), { force: true });
});

after(() => {
  fs.rmSync(TMP_ROOT, { recursive: true, force: true });
  if (ORIG_PROJECT_DIR === undefined) delete process.env.CLAUDE_PROJECT_DIR;
  else process.env.CLAUDE_PROJECT_DIR = ORIG_PROJECT_DIR;
  if (ORIG_SESSION_ID === undefined) delete process.env.CLAUDE_SESSION_ID;
  else process.env.CLAUDE_SESSION_ID = ORIG_SESSION_ID;
});

// ── session-start-mistakes ─────────────────────────────────────────────────

test('session-start-mistakes: silent (empty stdout) when nothing is pinned', () => {
  store.addRecord(TMP_ROOT, FIELDS, { now: NOW }); // weight 3 → not pinned
  const out = sessionStartMistakes.run('{}');
  assert.equal(out.stdout, '');
  assert.equal(out.exitCode, 0);
});

test('session-start-mistakes: injects pinned records only', () => {
  const { record } = store.addRecord(TMP_ROOT, FIELDS, { now: NOW });
  for (let i = 0; i < 3; i += 1) store.registerHit(TMP_ROOT, record.id, NOW); // → pinned
  store.addRecord(TMP_ROOT, { ...FIELDS, title: '別の軽微ミス', signature: 'warn W100 minor' }, { now: NOW });
  const out = sessionStartMistakes.run('{}');
  assert.match(out.stdout, /Pinned Mistakes/);
  assert.match(out.stdout, /tsc paths/);
  assert.doesNotMatch(out.stdout, /別の軽微ミス/); // non-pinned stays out
});

test('session-start-mistakes: fails open to empty stdout on garbage input', () => {
  const out = sessionStartMistakes.run('}{ not json');
  assert.equal(out.stdout, '');
});

// ── user-prompt-mistake-recall ─────────────────────────────────────────────

test('user-prompt-mistake-recall: injects a relevant record for a matching prompt', () => {
  store.addRecord(TMP_ROOT, FIELDS, { now: NOW });
  const out = promptRecall.run(JSON.stringify({ prompt: 'vitest で error TS2307 Cannot find module が出ます。paths の設定を直したい' }));
  assert.match(out.stdout, /Mistake Recall/);
  assert.match(out.stdout, /resolve\.alias/);
});

test('user-prompt-mistake-recall: EMPTY stdout for an unrelated prompt (never echo raw JSON)', () => {
  store.addRecord(TMP_ROOT, FIELDS, { now: NOW });
  const out = promptRecall.run(JSON.stringify({ prompt: 'ダッシュボードの新しいレイアウト案を検討してください' }));
  assert.equal(out.stdout, '');
});

test('user-prompt-mistake-recall: short prompts and garbage input stay silent', () => {
  assert.equal(promptRecall.run(JSON.stringify({ prompt: 'こんにちは' })).stdout, '');
  assert.equal(promptRecall.run('not json {{{').stdout, '');
});

// ── stop-mistake-capture ───────────────────────────────────────────────────

test('stop-mistake-capture: blocks ONCE for a resolved 2+ failure, then passes', () => {
  store.recordFailure(TMP_ROOT, 'npm run build', 'error TS9999: synthetic new failure', NOW);
  store.recordFailure(TMP_ROOT, 'npm run build', 'error TS9999: synthetic new failure', NOW);
  store.recordSuccess(TMP_ROOT, 'npm run build', NOW);

  const first = stopCapture.run('{}');
  assert.equal(first.exitCode, 2);
  assert.match(first.stderr, /Mistake Capture/);
  assert.match(first.stderr, /mistakes\.js add/);

  const second = stopCapture.run('{}'); // one-shot: prompted flag set
  assert.equal(second, '{}');
});

test('stop-mistake-capture: passes through when nothing was resolved after retries', () => {
  store.recordFailure(TMP_ROOT, 'cargo test', 'error[E0999]: synthetic', NOW);
  assert.equal(stopCapture.run('{}'), '{}');
});

test('stop-mistake-capture: yields to an active stop-hook loop and fails open', () => {
  store.recordFailure(TMP_ROOT, 'npm test', 'error X1: synthetic', NOW);
  store.recordFailure(TMP_ROOT, 'npm test', 'error X1: synthetic', NOW);
  store.recordSuccess(TMP_ROOT, 'npm test', NOW);
  const payload = JSON.stringify({ stop_hook_active: true });
  assert.equal(stopCapture.run(payload), payload); // yields — no double block
  assert.equal(stopCapture.run('garbage }{'), 'garbage }{'); // fail open
});
