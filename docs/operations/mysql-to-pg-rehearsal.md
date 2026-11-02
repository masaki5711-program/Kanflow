# MySQL → PostgreSQL 移行のリハーサルの記録（MR K2）

> **合成データだけ**を使ったリハーサルです。本番の MySQL（127.0.0.1:3306）には一度も接続していません。
> 切り替えの手順: [mysql-to-pg-cutover.md](./mysql-to-pg-cutover.md)。道具: `app/scripts/migrate-mysql-to-pg.ts`。

| 項目 | 値 |
|------|----|
| 実施日 | 2026-11-02 |
| ブランチ / 道具 | `feat/L4-db-mysql-to-pg-migrator`（K1 `feat/L4-db-postgresql` の上） |
| 移行元 | MySQL 8.4.13 コンテナ、127.0.0.1:23306、`utf8mb4` / `utf8mb4_unicode_ci`、サーバーの時計 UTC+7、`lower_case_table_names=1`（Windows の既定に合わせた） |
| 移行先 | `timescale/timescaledb:2.28.1-pg16`（PostgreSQL 16.14）、127.0.0.1:25435、UTF8・ICU `und` |
| 移行元のスキーマ | 凍結した MySQL のマイグレーション 58 本（`app/prisma/migrations-mysql/`、本番が使っているもの）をそのまま適用 → 78 表 |
| 移行先のスキーマ | `npx prisma migrate deploy`（`0_init` + `20261102120000_pg_review_fixes`） |
| データ | `app/scripts/seed-mysql-synthetic.ts`（MySQL のカタログから 78 表すべてに FK の順で生成。決定的な乱数、seed 42） |
| 機械 | 開発機（Windows 11、Docker Desktop）。数値は目安で、本番の機械では変わる |

## 1. 環境の作り方（再現手順）

```bash
# app/ で。資格情報はすべてコンテナ専用の合成のもの（ops/test-env/migrator-compose.yml の冒頭）
docker compose -p kanflow-k2-test -f ../ops/test-env/migrator-compose.yml up -d --wait
DATABASE_URL="postgresql://k2_pg:k2_pg_synthetic@127.0.0.1:25435/scrum_tool" npx prisma migrate deploy
KANFLOW_SEED_MYSQL_PASSWORD=k2_app_synthetic node --import tsx scripts/seed-mysql-synthetic.ts \
  --target mysql://k2_app@127.0.0.1:23306/scrum_tool --apply-schema --rows-per-table 6 --seed 42

export KANFLOW_MIGRATOR_SOURCE_PASSWORD=k2_reader_synthetic   # 読み取り専用ユーザー（GRANT SELECT だけ）
export KANFLOW_MIGRATOR_TARGET_PASSWORD=k2_pg_synthetic
export KANFLOW_MIGRATOR_DENY_TARGETS="127.0.0.1:25434/*,kanflow-pg.internal:5432/scrum_tool"   # 例: 試験用インスタンスと本番の名前
SRC=mysql://k2_reader@127.0.0.1:23306/scrum_tool
TGT=postgresql://k2_pg@127.0.0.1:25435/scrum_tool
node --import tsx scripts/migrate-mysql-to-pg.ts --source $SRC --target $TGT --dry-run --report dry-run.json
node --import tsx scripts/migrate-mysql-to-pg.ts --source $SRC --target $TGT --report migrate.json
node --import tsx scripts/migrate-mysql-to-pg.ts --source $SRC --target $TGT --verify-only --report verify.json

docker compose -p kanflow-k2-test -f ../ops/test-env/migrator-compose.yml down -v   # 後片付け
```

合成データの中身（移行で壊れやすいもの）: 日本語・インドネシア語・絵文字（4 バイト）・`'` `"` `` ` `` `\`・改行とタブ・末尾の空白・
空文字と NULL・列の上限いっぱいの文字列（最後に多バイト文字）・`0.1` `1e-300` などの double・JSON の `null` と SQL の NULL・
ネストした JSON、自己参照の木（子の主キーが親より前に並ぶ行を含む）、`field_translation` の現地時刻（UTC+7）で書かれた古い行 3 件と
UTC の現在より未来の未処理の行 1 件。

## 2. 自動テスト（同じコンテナで）

```bash
KANFLOW_MIGRATOR_TESTS=1 npx vitest run src/lib/db-migrator
```

結果: **82 tests passed**（単体 72 + 結合 10、結合は約 30 秒）。結合テストは専用の DB（MySQL / PG とも `scrum_tool_it`）を使い、次を確かめます。

| テスト | 結果 |
|---|---|
| 乾式の実行は事前検査に合格し、移行先は空のまま | 合格 |
| 全表をコピーし、78 表すべてで件数とハッシュが一致。現地時刻の 3 行はずらさずにそのまま | 合格 |
| 移行先の 1 行を書き換え・1 行を消すと照合が落ち（exit 1）、その主キーを名指しする | 合格 |
| 行のある移行先は拒否され（exit 2）、何も変わらない | 合格 |
| 20 表目の後で中断 → 移行先は空（ロールバック）→ やり直しで完了・照合一致 | 合格 |
| CLI のプロセスをコピーの途中で強制終了（SIGKILL）→ 移行先は空 → やり直しで完了・照合一致 | 合格 |
| citext の重複（`Ⱥlice@…` / `ⱥlice@…`: MySQL の unicode_ci では別の値、PG の citext では同じ）→ 中止し、両方の主キーを出す | 合格 |
| text の NUL → 中止し、主キーを出す | 合格 |
| jsonb に入らない JSON（`\u0000`）→ 中止。`--allow-invalid-json` では NULL にして続行し、照合も一致 | 合格 |
| 拒否リストに一致する移行先は接続する前に拒否 | 合格 |

## 3. 手で流したリハーサル（2026-11-02、§1 の手順そのまま）

| # | 手順 | 結果 | 所要時間 |
|---|---|---|---|
| 0 | コンテナを作り直す（`down -v` → `up -d --wait`） | 正常 | 18.7 秒 |
| 1 | 移行先のスキーマ（`prisma migrate deploy`） | 2 本適用 | 6.2 秒 |
| 2 | 移行元のスキーマ（58 本）+ 合成データ | 78 表・**472 行** | 41.7 秒 + 6.2 秒 |
| 3 | 安全装置: URL にパスワード | `PASSWORD_ON_ARGV`、exit 2 | 0.2 秒 |
| 4 | 安全装置: 拒否リストに一致（`localhost:25435/scrum_tool`。127.0.0.1 と同じ扱い） | `TARGET_DENIED`、exit 2、接続なし | 0.2 秒 |
| 5 | 安全装置: 拒否リストが空 | `DENY_LIST_MISSING`、exit 2 | 0.2 秒 |
| 6 | 乾式の実行 | 0 error・3 warning、exit 0、書き込みなし | 0.5 秒 |
| 7 | 本実行（コピー + 照合） | 472 行、遅延した FK 4 本（8 行を UPDATE）、**78 表すべて一致**、exit 0 | 0.9 秒（コピー 207 ms・照合 174 ms） |
| 8 | 照合だけ（`--verify-only`） | 78 表一致、exit 0 | 0.7 秒 |
| 9 | 行のある移行先へもう一度 | `TARGET_NOT_EMPTY`（78 表）、exit 2 | 0.7 秒 |
| 10 | 移行先の `public` のシーケンス | 0 個（Kanflow の主キーは cuid の文字列。リセットの処理は汎用で、対象が無い） | — |
| 11 | 負の実行（空の別 DB `scrum_tool_neg` へ乾式、欠陥は累積） | 下表 | 各 0.7–0.8 秒 |
| 12 | `--allow-invalid-json` を付けても NUL・citext の重複は止まる | JSON だけ警告に変わり、exit 2 | 0.5 秒 |

警告（手順 6・7）:

| コード | 件数 | 内容 |
|---|---|---|
| `SOURCE_TABLE_NAME_CASE` | 46 表 | `lower_case_table_names=1` で小文字になった表を大文字小文字を区別せずに対応づけた（想定どおり） |
| `LOCAL_TIME_SUSPECT` | 3 行 | `field_translation.requested_at` が `translated_at` より 7 時間後 = 現地時刻の古い行。**ずらさずにコピー**（移行先でも 7 時間後のまま、結合テストで確認） |
| `FUTURE_TIMESTAMP` | 1 行 | 未処理の行の `requested_at` が UTC の現在より未来。同上 |

負の実行（手順 11、欠陥を 1 つずつ足して乾式）:

| 注入した欠陥 | 結果（exit 2） |
|---|---|
| `Project.description` に NUL | `NUL_BYTE Project.description: 1 row(s)` と主キー |
| `git_link.outsideScopePaths` に `["ok","nul\u0000inside"]` | 上に加えて `INVALID_JSON git_link.outsideScopePaths: 1 value(s)` と主キー |
| `User.email` に `Ⱥlice.k2@example.test` と `ⱥlice.k2@example.test`（MySQL の一意キーは両方受け入れた） | 上に加えて `CITEXT_DUPLICATE User_email_key: ⱥlice.k2@example.test <- <主キー>, <主キー>` |

報告書（JSON）にはパスワードが含まれないことを確認しました（文字列の検索）。

## 4. 規模の目安

同じコンテナに別の DB（`scrum_tool_scale`、`--rows-per-table 400 --seed 11`）を作って流しました。

| 手順 | 結果 | 所要時間（プロセス全体） | 内訳（報告書の `timings`） |
|---|---|---|---|
| 合成データ（1 行ずつ INSERT） | 78 表・**30,345 行**、自己参照など遅延した FK 961 行 | 317.8 秒 | — |
| 乾式の実行 | 0 error・3 warning、exit 0 | 0.6 秒 | 事前検査 0.2 秒 |
| 本実行 | **78 表すべて一致**、exit 0 | 2.7 秒 | 事前検査 0.2 秒・コピー 1.7 秒（約 18,000 行/秒、遅延した FK の UPDATE を含む）・照合 0.5 秒 |
| 照合だけ | 78 表一致、exit 0 | 0.9 秒 | 照合 0.7 秒 |

見積もり: 本番の行数を N とすると、コピー + 照合は概ね N / 12,000 秒（例: 100 万行で 1.5 分程度）。行の大きさ（長い text）
と機械で変わるので、§3 の乾式の実行で本番の件数を得てから、停止時間を「見積もり × 2 + 30 分」で取ります（cutover §1）。
メモリは表の大きさに比例しません（コピーは 1,000 行ずつ、照合はストリームとカーソル）。citext の一意キーの重複検査だけは
対象の表（ユーザー・セクション・カテゴリ・チェック項目・タグ）の値を保持します。

## 5. リハーサルで見つかり、直したこと

| 事象 | 原因 | 対処 |
|---|---|---|
| 最初の乾式の実行で、NUL の無い列が大量に `NUL_BYTE` と判定された | `utf8mb4_unicode_ci` では NUL は「無視される文字」で、`INSTR(col, CHAR(0))` が常に一致する | バイナリで比べる（`INSTR(CAST(col AS BINARY), X'00')`）。結合テストの NUL の検査で固定 |
| 照合の途中で読み取りが失敗したとき、MySQL の接続に `COMMIT` を送っていた | 読みかけの mysql2 のストリームの後ろに並ぶと待ち続けるおそれ | 失敗の後は移行元に何も送らず、接続を閉じて終える（閉じるのも 5 秒で打ち切る）。単体テストで固定 |
| 未来の時刻の警告（`FUTURE_TIMESTAMP`）がすべての DATETIME を見ていた | 本番では予定日（`plannedEnd` など）が正しく未来なので、本当の信号が埋もれる | 書き込みの時刻の列（`createdAt` / `updatedAt` / `requested_at`）だけを見る。0 日付の検査は全列のまま。単体テストで固定 |

## 6. 本番の切り替えまでに残ること

- 本番の MySQL の `lower_case_table_names`・文字コード・行数は、§3 の乾式の実行の報告書（`sourceServer` / `sourceCounts`）で初めて分かる。
  リハーサルは Windows の既定（1）を仮定した。0 でも動く（表名が完全に一致する）。
- 本番の機械と本番の行数での所要時間（§4 から見積もり、乾式の実行の `timings` で確かめる）。
- 本番のデータの事前検査の結果（NUL・JSON・citext の重複・孤児の FK・現地時刻の行の件数）。エラーが出たら MySQL 側を直す（承認が要る）。
