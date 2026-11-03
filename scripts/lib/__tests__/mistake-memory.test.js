'use strict';

/*
 * Tests for the mistake-memory core: mistake-search.js (tokenizer, BM25
 * ranking, thresholds) and mistake-store.js (records CRUD, dedup merge,
 * recurrence/pin/decay, MISTAKES.md view sync, legacy migration, pending
 * failure tracking, confidential rejection). All fixture data is synthetic.
 */

const { test, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const TMP_ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'mistake-mem-'));
const ORIG_PROJECT_DIR = process.env.CLAUDE_PROJECT_DIR;
const ORIG_SESSION_ID = process.env.CLAUDE_SESSION_ID;
process.env.CLAUDE_PROJECT_DIR = TMP_ROOT;
process.env.CLAUDE_SESSION_ID = `mm-test-${process.pid}`;

const search = require('../mistake-search');
const store = require('../mistake-store');

const NOW = '2026-07-21T10:00:00.000Z';

function seedRecords(fieldsList) {
  const records = fieldsList.map((f, i) =>
    store.recomputeDerived({
      ...store.createRecord(f, NOW),
      id: `mk-20260721-00000${i}`,
      recurrence: f.recurrence || 0,
      severity: f.severity || 3,
    }),
  );
  store.saveRecords(TMP_ROOT, records);
  return records;
}

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

// ── tokenizer ──────────────────────────────────────────────────────────────

test('tokenize: keeps error codes verbatim and bigrams Japanese', () => {
  const tokens = search.tokenize('error TS2307: モジュール解決に失敗');
  assert.ok(tokens.includes('ts2307'));
  assert.ok(tokens.includes('失敗')); // 2-char word reachable via bigram
  assert.ok(tokens.includes('モジ'));
});

// ── ranking ────────────────────────────────────────────────────────────────

const CORPUS = [
  { title: 'tsc paths エイリアス未解決', signature: 'error TS2307: Cannot find module', context: 'vitest', tags: ['typescript'] },
  { title: 'Rust 型不一致 (TZ変換)', signature: 'error[E0308]: mismatched types', context: 'edge', tags: ['rust'] },
  { title: 'pytest ImportError', signature: 'ModuleNotFoundError: No module named', context: 'ai service', tags: ['python'] },
];

test('rank: the matching record wins and clears the inject threshold', () => {
  seedRecords(CORPUS);
  const records = store.loadRecords(TMP_ROOT);
  const ranked = search.rank(records, 'npm test failed: error TS2307: Cannot find module "@hub/x"', { now: NOW });
  assert.equal(ranked[0].record.title, 'tsc paths エイリアス未解決');
  assert.ok(ranked[0].lex >= search.INJECT_THRESHOLD, `lex=${ranked[0].lex}`);
});

test('rank: an unrelated query stays below the inject threshold (silence)', () => {
  seedRecords(CORPUS);
  const records = store.loadRecords(TMP_ROOT);
  const ranked = search.rank(records, 'git push rejected non-fast-forward', { now: NOW });
  assert.ok(ranked.every(r => r.lex < search.INJECT_THRESHOLD), JSON.stringify(ranked.map(r => r.lex)));
});

test('rank: Japanese 2-char terms match (FTS5-trigram blind spot)', () => {
  seedRecords(CORPUS);
  const records = store.loadRecords(TMP_ROOT);
  const ranked = search.rank(records, 'ビルドで tsc の解決 失敗 TS2307', { now: NOW });
  assert.equal(ranked[0].record.title, 'tsc paths エイリアス未解決');
});

test('rank: weight lifts a heavier record on equal lexical footing', () => {
  seedRecords([
    { title: 'timeout on flaky net A', signature: 'connect ETIMEDOUT peer', severity: 1 },
    { title: 'timeout on flaky net B', signature: 'connect ETIMEDOUT peer', severity: 5, recurrence: 4 },
  ]);
  const ranked = search.rank(store.loadRecords(TMP_ROOT), 'connect ETIMEDOUT peer', { now: NOW });
  assert.equal(ranked[0].record.title, 'timeout on flaky net B');
});

// ── store: add / merge / hit / decay ───────────────────────────────────────

const FIELDS = {
  title: 'tsc paths エイリアス未解決',
  signature: 'error TS2307: Cannot find module',
  context: 'vitest 実行時',
  root_cause: 'vitest.config に paths 未反映',
  fix: 'vitest.config.ts に resolve.alias を追加',
  tags: ['typescript'],
  severity: 3,
};

test('addRecord: creates, validates, and regenerates MISTAKES.md', () => {
  const res = store.addRecord(TMP_ROOT, FIELDS, { now: NOW });
  assert.equal(res.ok, true);
  assert.equal(res.action, 'created');
  assert.deepEqual(store.validateRecord(res.record), []);
  assert.ok(fs.existsSync(store.markdownPath(TMP_ROOT)));
  assert.ok(store.checkMarkdown(TMP_ROOT));
});

test('addRecord: near-duplicate merges instead of creating a second record', () => {
  store.addRecord(TMP_ROOT, FIELDS, { now: NOW });
  const res = store.addRecord(
    TMP_ROOT,
    { ...FIELDS, fix: '更新された修正手順' },
    { now: NOW },
  );
  assert.equal(res.action, 'merged');
  const records = store.loadRecords(TMP_ROOT);
  assert.equal(records.length, 1);
  assert.equal(records[0].fix, '更新された修正手順');
  assert.equal(records[0].recurrence, 1);
});

test('addRecord: rejects confidential content (critical finding)', () => {
  const res = store.addRecord(
    TMP_ROOT,
    { ...FIELDS, fix: 'set AWS_SECRET_ACCESS_KEY=AKIAIOSFODNN7EXAMPLE then retry' },
    { now: NOW },
  );
  assert.equal(res.ok, false);
  assert.equal(res.reason, 'confidential');
  assert.equal(store.loadRecords(TMP_ROOT).length, 0);
});

test('registerHit: recurrence climbs to auto-pin', () => {
  const { record } = store.addRecord(TMP_ROOT, FIELDS, { now: NOW });
  store.registerHit(TMP_ROOT, record.id, NOW);
  store.registerHit(TMP_ROOT, record.id, NOW);
  const hit = store.registerHit(TMP_ROOT, record.id, NOW);
  assert.equal(hit.recurrence, 3);
  assert.equal(hit.pinned, true);
  assert.ok(store.checkMarkdown(TMP_ROOT));
});

test('pruneDecay: stale records lose weight but never drop below severity', () => {
  const { record } = store.addRecord(TMP_ROOT, FIELDS, { now: '2025-01-01T00:00:00.000Z' });
  store.registerHit(TMP_ROOT, record.id, '2025-01-02T00:00:00.000Z'); // weight 4
  const decayed = store.pruneDecay(TMP_ROOT, NOW);
  assert.equal(decayed, 1);
  assert.equal(store.loadRecords(TMP_ROOT)[0].weight, 3);
  assert.equal(store.pruneDecay(TMP_ROOT, NOW), 0); // floor: severity
});

test('dedupeStore: collapses the duplicate ids a union merge of two branches leaves', () => {
  const { record } = store.addRecord(TMP_ROOT, FIELDS, { now: NOW });
  // Branch A bumped the record twice, branch B once, later — union keeps both lines.
  const sideA = store.recomputeDerived({ ...record, recurrence: 2, last_hit_at: '2026-07-22T00:00:00.000Z', updated_at: '2026-07-22T00:00:00.000Z' });
  const sideB = store.recomputeDerived({ ...record, recurrence: 1, last_hit_at: '2026-07-23T00:00:00.000Z', updated_at: '2026-07-23T00:00:00.000Z' });
  store.saveRecords(TMP_ROOT, [sideB, sideA]);
  assert.deepEqual(store.duplicateIds(TMP_ROOT), [record.id]);

  assert.equal(store.dedupeStore(TMP_ROOT, NOW), 1);
  const [merged, ...rest] = store.loadRecords(TMP_ROOT);
  assert.equal(rest.length, 0);
  assert.equal(merged.recurrence, 2, 'the higher recurrence wins');
  assert.equal(merged.last_hit_at, '2026-07-23T00:00:00.000Z', 'the latest hit is kept');
  assert.equal(merged.weight, 5);
  assert.deepEqual(store.duplicateIds(TMP_ROOT), []);
  assert.ok(store.checkMarkdown(TMP_ROOT));
  assert.equal(store.dedupeStore(TMP_ROOT, NOW), 0, 'idempotent');
});

test('dedupeRecords: equal recurrence falls back to the later updated_at', () => {
  const base = { id: 'mk-20260721-000000', severity: 3, recurrence: 1 };
  const { records, removed } = store.dedupeRecords([
    { ...base, fix: 'older', updated_at: '2026-07-01T00:00:00.000Z' },
    { ...base, fix: 'newer', updated_at: '2026-07-02T00:00:00.000Z' },
  ]);
  assert.equal(removed, 1);
  assert.equal(records[0].fix, 'newer');
});

test('dedupeRecords: the result does not depend on line order; tags are united; decay survives', () => {
  const base = { id: 'mk-20260721-000000', severity: 3, recurrence: 1, updated_at: '2026-07-01T00:00:00.000Z' };
  // full tie on recurrence and updated_at — only the content differs
  const a = { ...base, fix: 'fix A', tags: ['rust'], weight: 3, pinned: false };
  const b = { ...base, fix: 'fix B', tags: ['cargo'], weight: 4, pinned: false };
  const ab = store.dedupeRecords([a, b]).records[0];
  const ba = store.dedupeRecords([b, a]).records[0];
  assert.deepEqual(ab, ba, 'union merge order must not change the outcome');
  assert.deepEqual(ab.tags, ['cargo', 'rust']);
  assert.equal(ab.weight, ab.fix === 'fix A' ? 3 : 4, "the winner's own weight is kept, not recomputed");
});

test('once-per-session: first call per key is true, later calls false, expiry re-arms', () => {
  const once = require('../once-per-session');
  const input = { session_id: `once-test-${process.pid}-${Date.now()}` };
  assert.equal(once.firstTime('unit', input, 'k1'), true);
  assert.equal(once.firstTime('unit', input, 'k1'), false);
  assert.equal(once.firstTime('unit', input, 'k2'), true);
  assert.equal(once.firstTime('unit', input, 'k1', -1), true, 'an expired store counts as unseen');
  assert.match(once.stateFile('unit', {}), /ecc-unit-/);
  fs.rmSync(once.stateFile('unit', input), { force: true });
});

test('dedupeRecords: timestamps compare as instants, not strings', () => {
  const base = { id: 'mk-20260721-000000', severity: 3, recurrence: 1 };
  const { records } = store.dedupeRecords([
    { ...base, fix: 'utc', updated_at: '2026-07-01T10:00:00.000Z' },
    { ...base, fix: 'offset', updated_at: '2026-07-01T18:00:00.000+09:00' }, // 09:00Z — earlier
  ]);
  assert.equal(records[0].fix, 'utc');
});

test('loadRecords: skips broken jsonl lines silently', () => {
  const { record } = store.addRecord(TMP_ROOT, FIELDS, { now: NOW });
  fs.appendFileSync(store.recordsPath(TMP_ROOT), '{broken json\n', 'utf8');
  const records = store.loadRecords(TMP_ROOT);
  assert.equal(records.length, 1);
  assert.equal(records[0].id, record.id);
});

// ── MISTAKES.md view ───────────────────────────────────────────────────────

test('checkMarkdown: detects hand-edit drift', () => {
  store.addRecord(TMP_ROOT, FIELDS, { now: NOW });
  fs.appendFileSync(store.markdownPath(TMP_ROOT), 'hand edit\n', 'utf8');
  assert.equal(store.checkMarkdown(TMP_ROOT), false);
  store.writeMarkdown(TMP_ROOT, NOW);
  assert.equal(store.checkMarkdown(TMP_ROOT), true);
});

// ── legacy migration ───────────────────────────────────────────────────────

test('parseLegacy: parses both the JA ledger format and the EN skill format', () => {
  const md = [
    '# Build Error Memory',
    '',
    '## JS ブロックコメント内の `*/` による早期終端 (SyntaxError)',
    '',
    '- **日付**: 2026-07-13',
    '- **症状**: `SyntaxError: Unexpected identifier` — エラー行はコメントの途中',
    '- **原因**: ブロックコメント内の `*/` を含むグロブ表記で終端',
    '- **解決**: スペースを挟む表記にする',
    '- **予防**: 規約表記のコピペ時が危険',
    '',
    '## [2026-07-01 09:00] missing type import',
    '',
    '**Error log signature**: error TS2304: Cannot find name',
    '',
    '**Root cause**: type not imported',
    '',
    '**Successful solution**: add `import type { X }` to the file',
  ].join('\n');
  const parsed = store.parseLegacy(md);
  assert.equal(parsed.length, 2);
  assert.match(parsed[0].signature, /SyntaxError/);
  assert.match(parsed[0].fix, /スペースを挟む/);
  assert.match(parsed[0].fix, /予防/);
  assert.equal(parsed[0].created_at, '2026-07-13T00:00:00.000Z');
  assert.equal(parsed[1].title, 'missing type import');
  assert.match(parsed[1].signature, /TS2304/);
  assert.match(parsed[1].fix, /import type/);
  assert.equal(parsed[1].created_at, '2026-07-01T00:00:00.000Z');
});

// ── pending failure tracking ───────────────────────────────────────────────

test('pending: fail x2 then success becomes a capture candidate exactly once', () => {
  store.recordFailure(TMP_ROOT, 'npm run build', 'error TS2307: Cannot find module', NOW);
  store.recordFailure(TMP_ROOT, 'npm  run   build', 'error TS2307: Cannot find module', NOW);
  assert.equal(store.readPending(TMP_ROOT).length, 1); // whitespace-normalized key
  assert.equal(store.captureCandidates(TMP_ROOT, NOW).length, 0); // not resolved yet
  store.recordSuccess(TMP_ROOT, 'npm run build', NOW);
  const candidates = store.captureCandidates(TMP_ROOT, NOW);
  assert.equal(candidates.length, 1);
  assert.equal(candidates[0].fails, 2);
  store.markPrompted(TMP_ROOT, candidates, NOW);
  assert.equal(store.captureCandidates(TMP_ROOT, NOW).length, 0); // one-shot
});

test('pending: single failure then success is NOT a candidate (trivial fix)', () => {
  store.recordFailure(TMP_ROOT, 'cargo test', 'error[E0308]: mismatched types', NOW);
  store.recordSuccess(TMP_ROOT, 'cargo test', NOW);
  assert.equal(store.captureCandidates(TMP_ROOT, NOW).length, 0);
});

test('pending: an already-recorded mistake is not re-prompted', () => {
  store.addRecord(TMP_ROOT, FIELDS, { now: NOW });
  store.recordFailure(TMP_ROOT, 'npm run build', 'error TS2307: Cannot find module "@x/y"', NOW);
  store.recordFailure(TMP_ROOT, 'npm run build', 'error TS2307: Cannot find module "@x/y"', NOW);
  store.recordSuccess(TMP_ROOT, 'npm run build', NOW);
  assert.equal(store.captureCandidates(TMP_ROOT, NOW).length, 0);
});
