---
name: build-error-memory
description: Consult and record error→fix pairs in the mistake-memory store (.claude/mistakes/records.jsonl, searched via node scripts/mistakes.js) — check past recorded solutions before fixing a build failure, and record hard-won fixes so the same mistake is never re-debugged. Use whenever a build, compile, or test command fails, or after resolving an error that took 2+ attempts.
origin: project
---

# Build Error Memory (mistake-memory の運用プロトコル)

同じエラーを二度デバッグしない。過去の「エラー→実証済みの修正」ペアは
`.claude/mistakes/records.jsonl`（repo コミット・チーム共有）に蓄積され、
`node scripts/mistakes.js` で検索・追記する。`MISTAKES.md`（プロジェクト
ルート）は自動生成の一覧ビューで、**手編集禁止**（generated-guard が block）。

自動化されている部分:

- **読み取り(自動)**: `post:bash:error-memory` フックがビルド/テスト失敗時に
  エラー本文で検索し、類似 top-3 だけを注入する（全文 dump はしない）。
- **記録の促し(自動)**: 2 回以上失敗→解決したエラーが未記録のとき、
  `stop:mistake-capture` フックが終了を一度だけブロックして記録を求める。
- **Pinned(自動)**: weight ≥ 7 または再発 3 回以上の記録はセッション開始時に
  常時注入される。

このスキルは残りの**判断側**のプロトコルを定める。

## 読み — ビルドエラーを修正する前に

1. **推測で直さない。** フックが候補を注入した場合、その「修正」をまず
   そのまま適用する。
2. 注入がなくても関連が疑われるなら手動検索:
   `node scripts/mistakes.js search "<エラーログの特徴部分>"`
3. 一致がない場合のみ新規に調査する。

## 書き — エラーを解決した後に

**2 回以上の修正試行**を要したエラーを解決したら、記録する:

```bash
node scripts/mistakes.js add --json '{
  "title": "<短い要約>",
  "signature": "<エラーログの識別しやすい断片 — 絶対パス・タイムスタンプ・行番号は除く>",
  "context": "<何の作業中に起きたか (1行)>",
  "root_cause": "<なぜ起きたか>",
  "fix": "<次回そのまま実行できる具体的修正 — ファイル名・コマンドを明記>",
  "tags": ["typescript", "L3"],
  "severity": 3
}'
```

記録後にユーザーへ伝える: **「次回のために記録しました (`mistakes.js add`)」**

## ルール

- 1 エラー = 1 レコード。類似度 0.9 以上は自動で既存レコードに統合される
  （fix が更新され再発カウントが増える）— 重複を恐れず add してよい。
- `signature` はエラー側の言葉で書く（検索クエリはエラーログだから）。
- `fix` は再調査なしで実行できる粒度で書く。曖昧な助言は書かない。
- 初回で自明に直ったエラーは記録しない。
- 機密情報（credential・実プラントコード等）を含む記録は自動で拒否される。
- severity の目安: 2=軽微 / 3=標準 / 4=データ・時間損失 / 5=本番影響級。

## Notes

- 検索の一致キーは **signature**（エラー署名）。タイトルだけ一致しても注入
  されない設計（誤注入防止）。
- `node scripts/mistakes.js` のその他: `stats` / `prune`(減衰) /
  `bench`(検索品質) / `check`(整合ゲート、self-heal に組み込み済み)。
- `stop:test-gate` フック（修正ループ駆動）・`build-error-resolver` エージェント
  と対で機能する。
