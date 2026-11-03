<!-- GENERATED FILE — do not edit by hand.
     Source: .claude/mistakes/records.jsonl
     Regenerate: node scripts/mistakes.js render-md
     Add a record: node scripts/mistakes.js add --json '{"title":...}' -->

# MISTAKES — 過去の失敗と実証済みの修正

記録 1 件。検索: `node scripts/mistakes.js search "<エラー文>"`

## 📌 Pinned（再発性・致命度の高いミス — 常時注意）

_なし_

## 最近の記録

### JS ブロックコメント内の `*/` によるコメント早期終端 (SyntaxError)
- 署名: ``SyntaxError: Unexpected identifier / Unexpected token` — エラー行はコメントの途中を指す`
- 原因: `/* ... */` ブロックコメント内に `t2_*/m2_*` や `t1_*/catalog` のような
- 修正: ブロックコメント内では `t2_* / m2_*`(スペースを挟む)か `t2_ / m2_ prefixes` のような言い換えにする。`//` 行コメントなら安全 / 予防: このリポジトリの規約表記「`t2_*`/`m2_*`」をコメントへコピペする時が危険箇所
- weight 3 / 再発 0 / 2026-07-21 / mk-20260721-4c10cf
