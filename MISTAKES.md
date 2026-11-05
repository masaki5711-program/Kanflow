<!-- GENERATED FILE — do not edit by hand.
     Source: .claude/mistakes/records.jsonl
     Regenerate: node scripts/mistakes.js render-md
     Add a record: node scripts/mistakes.js add --json '{"title":...}' -->

# MISTAKES — 過去の失敗と実証済みの修正

記録 7 件。検索: `node scripts/mistakes.js search "<エラー文>"`

## 📌 Pinned（再発性・致命度の高いミス — 常時注意）

_なし_

## 最近の記録

### git worktree remove --force deletes the target of a node_modules junction
- 署名: `after git worktree remove --force <wt>, the linked worktree's app/node_modules is empty (next/package.json missing)`
- 原因: git worktree remove --force deletes untracked content recursively and follows the junction into its target instead of unlinking it
- 修正: Before removing, delete the junction itself (cmd /c rmdir <wt>\app\node_modules, or Remove-Item on the link only), then git worktree remove. Prefer a real npm ci per worktree. Recover with npm ci + npx prisma generate in the emptied app/.
- weight 4 / 再発 0 / 2026-11-05 / mk-20261105-68c731

### DB test reading by a shared project type collides with other DB test files running in parallel
- 署名: `estimate-run.db.test passes alone but fails in the full suite: PLAN_ESTIMATE_STALE reason source_changed`
- 原因: vitest runs DB test files in parallel on one database; other files create and delete software snapshots, so a source the run used really vanished
- 修正: Give the test's projects and snapshots a project type (and lineage) of their own, e.g. t-<tag>, so no other file touches the rows the code reads by type
- weight 3 / 再発 0 / 2026-11-03 / mk-20261103-b66e30

### jsonb reorders object keys: comparing a stored JSON with JSON.stringify fails
- 署名: `approval refused plan_changed although owners and end date are equal; stored jsonb object key order differs`
- 原因: PostgreSQL jsonb stores object keys sorted by length then bytes, so JSON.stringify of the read value has a different key order than the in-memory object
- 修正: Compare canonical forms (canonicalJson from src/lib/plan-schedule/schedule-source.ts) of stored and recomputed JSON, never JSON.stringify
- weight 3 / 再発 0 / 2026-11-03 / mk-20261103-1f6c6b

### A timestamp taken before waiting for a lock collides with the previous holder (unique key on time)
- 署名: `Unique constraint failed on the fields: ("projectId", "supersededAt") in concurrent finalizeActuals`
- 原因: now = new Date() was computed at function entry, before waiting for the advisory lock, so the waiting call could reuse the same millisecond as an earlier supersede
- 修正: Take the time AFTER acquiring the lock and make it strictly later than the latest stored time: now = max(Date.now(), max(supersededAt, finalizedAt) + 1 ms) (src/services/plan-actuals/actuals.service.ts)
- weight 3 / 再発 0 / 2026-11-03 / mk-20261103-ee2035

### Kanflow worktree: the first Edit of a file that differs from main is refused once (worktree-boundary…
- 署名: `tsc error TS2561 / TS2305 / TS2353 right after parallel Edit calls in a worktree: a key, export or property added in one file is missing in another`
- 原因: pre:edit:worktree-boundary blocks the first edit of each overlapping file once per session; the parallel edits to the other files succeed, so the code no longer matches (e.g. an i18n key used but not …
- 修正: After any batch of Edit calls, scan the results for [worktree-boundary] OVERLAP errors and re-run exactly those edits (the overlap is intended for the v2 line) before typechecking
- weight 2 / 再発 0 / 2026-11-03 / mk-20261103-0df0dc

### Kanflow logger takes (message, context), not pino-style (context, message)
- 署名: `log.warn({ ... }, "message") / log.error({ ... }, "message"): pino-style argument order on the Kanflow logger`
- 原因: src/lib/logger has the signature log.warn(message: string, context?: object); writing the pino order log.warn({ ... }, "msg") passes an object as the message
- 修正: Call log.warn("what happened", { ruleId, error: err instanceof Error ? err.message : String(err) }) - message first, context object second (see src/services/git/git-scope-check.ts)
- weight 2 / 再発 0 / 2026-11-03 / mk-20261103-7bc753

### JS ブロックコメント内の `*/` によるコメント早期終端 (SyntaxError)
- 署名: ``SyntaxError: Unexpected identifier / Unexpected token` — エラー行はコメントの途中を指す`
- 原因: `/* ... */` ブロックコメント内に `t2_*/m2_*` や `t1_*/catalog` のような
- 修正: ブロックコメント内では `t2_* / m2_*`(スペースを挟む)か `t2_ / m2_ prefixes` のような言い換えにする。`//` 行コメントなら安全 / 予防: このリポジトリの規約表記「`t2_*`/`m2_*`」をコメントへコピペする時が危険箇所
- weight 3 / 再発 0 / 2026-07-21 / mk-20260721-4c10cf
