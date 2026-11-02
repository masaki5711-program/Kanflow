# MySQL → PostgreSQL 移行のリハーサルの記録（MR K2）

> **合成データだけ**を使ったリハーサルです。本番の MySQL（127.0.0.1:3306）には一度も接続していません。
> 切り替えの手順: [mysql-to-pg-cutover.md](./mysql-to-pg-cutover.md)。道具: `app/scripts/migrate-mysql-to-pg.ts`。
> 現行の記録は **リハーサル 2（独立レビューの指摘への対応の後）**。リハーサル 1 は §6 に要約。

| 項目 | 値 |
|------|----|
| 実施日 | 2026-11-02 |
| ブランチ / 道具 | `feat/L4-db-mysql-to-pg-migrator`（K1 `feat/L4-db-postgresql` の上） |
| 移行元 | MySQL 8.4.13 コンテナ、127.0.0.1:23306、`utf8mb4` / `utf8mb4_unicode_ci`、サーバーの時計 UTC+7、`lower_case_table_names=1`（Windows の既定に合わせた）。DB 名は `scrum_tool_synthetic`（合成データの DB は `*_synthetic` だけを seed が受け付ける） |
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
  --target mysql://k2_app@127.0.0.1:23306/scrum_tool_synthetic --apply-schema --rows-per-table 6 --seed 42

export KANFLOW_MIGRATOR_SOURCE_PASSWORD=k2_reader_synthetic   # 読み取り専用ユーザー（GRANT SELECT だけ）
export KANFLOW_MIGRATOR_TARGET_PASSWORD=k2_pg_synthetic
export KANFLOW_MIGRATOR_DENY_TARGETS="127.0.0.1:25434/*,kanflow-pg.internal:5432/scrum_tool"   # 例: 試験用インスタンスと本番の名前
A="--source mysql://k2_reader@127.0.0.1:23306/scrum_tool_synthetic --target postgresql://k2_pg@127.0.0.1:25435/scrum_tool --expect-target 127.0.0.1:25435/scrum_tool"
node --import tsx scripts/migrate-mysql-to-pg.ts $A --dry-run --report dry-run.json        # exit 4: 警告の判断が要る、同一性を表示
node --import tsx scripts/migrate-mysql-to-pg.ts $A --source-identity <表示された値> --target-identity <表示された値> \
  --accept-warnings FUTURE_TIMESTAMP,LOCAL_TIME_SUSPECT,TIMESTAMP_BEFORE_CREATED,LOCAL_OFFSET_SUSPECT --dry-run-report dry-run.json --report migrate.json
node --import tsx scripts/migrate-mysql-to-pg.ts $A --verify-only --report verify.json

docker compose -p kanflow-k2-test -f ../ops/test-env/migrator-compose.yml down -v   # 後片付け
```

合成データの中身（移行で壊れやすいもの）: 日本語・インドネシア語・絵文字（4 バイト）・`'` `"` `` ` `` `\`・改行とタブ・末尾の空白・
空文字と NULL・列の上限いっぱいの文字列（最後に多バイト文字）・`0.1` `1e-300` などの double・JSON の `null` と SQL の NULL・
ネストした JSON、自己参照の木（子の主キーが親より前に並ぶ行を含む）。時刻は `createdAt` が先で出来事の列はその後（7 時間の窓を避ける）、
そのうえで**意図した現地時刻の行**: `field_translation` の古い行 3 件（`requested_at` = `translated_at` + 7 時間）と未来の未処理の行 1 件、
`User` の 1 行（`createdAt` が UTC+7、`updatedAt` が UTC）。

## 2. 自動テスト（同じコンテナで）

```bash
KANFLOW_MIGRATOR_TESTS=1 npx vitest run src/lib/db-migrator
```

結果: **121 tests passed**（単体 109 + 結合 12、結合は約 32 秒）。結合テストは専用の DB（MySQL `scrum_tool_it_synthetic` / PG `scrum_tool_it`）
を使い、ポート 3306・5432・25434 は自分で拒否します。確かめること:

| テスト | 結果 |
|---|---|
| 乾式の実行: エラー 0、意図した 4 種の警告で exit 4、時刻の解析の網羅（検査できなかった理由つき）、移行先は空 | 合格 |
| 本実行は未判断の警告で exit 2、乾式の実行と違う同一性で `IDENTITY_MISMATCH` | 合格 |
| 全表をコピーし、トランザクションの中で照合して COMMIT。警告は種類ごとに件数どおり（`LOCAL_TIME_SUSPECT` 3・`FUTURE_TIMESTAMP` 1・`TIMESTAMP_BEFORE_CREATED` 1・`LOCAL_OFFSET_SUSPECT` 1）、値はずらさない | 合格 |
| 照合だけ: 移行先の 1 行の書き換え・1 行の削除・移行先だけの 1 行を、それぞれ主キーで名指し | 合格 |
| 行のある移行先は拒否され（exit 2）、何も変わらない | 合格 |
| トランザクションの中で照合の前に 1 行を書き換える → 不一致で ROLLBACK、移行先は空（exit 1、`committed: false`） | 合格 |
| 20 表目の後で中断 → 移行先は空 → やり直しで完了 | 合格 |
| CLI のプロセスをコピーの途中で強制終了（SIGKILL）→ 移行先は空 → やり直しで完了 | 合格 |
| citext の重複（`Ⱥlice@…` / `ⱥlice@…`）→ 中止し、主キーと値のハッシュだけを出す。**seed のどのメールアドレスもログ・報告書に出ない** | 合格 |
| text の NUL → 中止し、主キーを出す | 合格 |
| jsonb に入らない JSON → 中止。`--allow-invalid-json` では NULL にし、元の値は保護されたファイル用のフックにだけ渡り、報告書には出ない | 合格 |
| 拒否リストに一致する移行先は接続する前に拒否 | 合格 |

## 3. 手で流したリハーサル 2（2026-11-02、§1 の手順）

| # | 手順 | 結果 | 所要時間 |
|---|---|---|---|
| 0 | コンテナを作り直す（`down -v` → `up -d --wait`） | 正常 | 12.0 秒 |
| 1 | 移行先のスキーマ（`prisma migrate deploy`） | 2 本適用 | 2.6 秒 |
| 2 | seed の安全装置: `*_synthetic` でない DB（`scrum_tool`） | 拒否（exit 1） | 0.2 秒 |
| 3 | 移行元のスキーマ（58 本）+ 合成データ | 78 表・**472 行** | 10.4 秒 + 1.3 秒 |
| 4 | 安全装置: URL にパスワード | `PASSWORD_ON_ARGV`、exit 2 | 0.3 秒 |
| 5 | 安全装置: 拒否リストに一致（`localhost:25435/scrum_tool`） | `TARGET_DENIED`、exit 2、接続なし | 0.2 秒 |
| 6 | 安全装置: 拒否リストが空 | `DENY_LIST_MISSING`、exit 2 | 0.4 秒 |
| 7 | 安全装置: `--expect-target` が違う | `EXPECT_TARGET_MISMATCH`、exit 2 | 0.3 秒 |
| 8 | 安全装置: ループバックでない移行先に CA が無い | `TLS_REQUIRED`、exit 2 | 0.2 秒 |
| 9 | 安全装置: 同一性なしの本実行 | 引数の誤り、exit 64 | 0.2 秒 |
| 10 | 乾式の実行 | 0 error・4 warning、**exit 4**（判断が要る）、同一性を表示、書き込みなし。時刻の解析: 171 列、155 列を検査（うち 27 列は一部だけ）、16 列は業務の日付で対象外 | 0.5 秒 |
| 11 | 本実行（`--accept-warnings` なし） | `REFUSED`、exit 2 | 0.5 秒 |
| 12 | 本実行（違う同一性） | `IDENTITY_MISMATCH` ×2、exit 2 | 0.5 秒 |
| 13 | 本実行（同一性 + 判断した 4 種） | 472 行、遅延した FK 4 本（14 行を UPDATE）、**78 表一致 → COMMITTED**、exit 0 | 0.9 秒 |
| 14 | 照合だけ（COMMIT の後の新しいスナップショット） | 78 表一致、exit 0 | 0.6 秒 |
| 15 | 行のある移行先へもう一度 | `TARGET_NOT_EMPTY`（78 表）、exit 2 | 0.5 秒 |
| 16 | 負の実行（空の別 DB `scrum_tool_neg` へ乾式、欠陥は累積） | 下表 | 各 0.7 秒 |
| 17 | ログ・報告書（13 ファイル）に seed のメールアドレス（6 件）が出るか | **0 件** | — |

警告（手順 10・13。いずれも合成データに**意図して入れた**行だけが当たった）:

| コード | 件数 | 内容 |
|---|---|---|
| `TIMESTAMP_BEFORE_CREATED` | 1（`User.updatedAt`） | `updatedAt` が `createdAt` より 7 時間前 = `createdAt` が現地時刻 |
| `LOCAL_OFFSET_SUSPECT` | 1（`User.updatedAt`） | 同じ行。差がちょうど 7 時間 |
| `LOCAL_TIME_SUSPECT` | 3（`field_translation.requested_at`） | `translated_at` より 7 時間後 = 現地時刻の古い行 |
| `FUTURE_TIMESTAMP` | 1（`field_translation.requested_at`） | 未処理の行が UTC の現在より未来 |
| `SOURCE_TABLE_NAME_CASE`（info） | 46 表 | `lower_case_table_names=1` で小文字になった表を対応づけた（判断は不要） |

負の実行（手順 16、欠陥を 1 つずつ足して乾式）:

| 注入した欠陥 | 結果（exit 2） |
|---|---|
| `Project.description` に NUL | `NUL_BYTE Project.description: 1 row(s)` と主キー |
| `git_link.outsideScopePaths` に `["ok","nul\u0000inside"]` | 上に加えて `INVALID_JSON git_link.outsideScopePaths: 1 value(s)` と主キー |
| `User.email` に `Ⱥlice.k2@…` と `ⱥlice.k2@…`（MySQL の一意キーは両方受け入れた） | 上に加えて `CITEXT_DUPLICATE User_email_key: value#be48a04bcf74 <- <主キー>, <主キー>`（値は出さない） |

## 4. 規模の目安（リハーサル 2）

別の DB（`scrum_tool_scale_synthetic` → `scrum_tool_scale`、`--rows-per-table 400 --seed 11`）。

| 手順 | 結果 | 所要時間（プロセス全体） | 内訳（報告書の `timings`） |
|---|---|---|---|
| 合成データ（1 行ずつ INSERT） | 78 表・**30,345 行**、遅延した FK 950 行 | 233.9 秒 | — |
| 乾式の実行 | 0 error・4 warning（意図した行だけ）、exit 4 | — | 事前検査 0.2 秒 |
| 本実行 | **78 表一致 → COMMITTED**、exit 0、ANALYZE ok | 3.1 秒 | 事前検査 0.24 秒・コピー 1.7 秒（約 18,000 行/秒）・照合（トランザクションの中、キーの範囲ごと）0.5 秒 |
| 照合だけ | 78 表一致、exit 0 | 1.0 秒 | — |

見積もり: 本番の行数を N とすると、コピー + 照合は概ね N / 12,000 秒（例: 100 万行で 1.5 分程度）。行の大きさ（長い text）
と機械で変わるので、本番のバックアップでのリハーサル（cutover §1.1）と乾式の実行で確かめ、停止時間は「見積もり × 2 + 30 分」で取ります。
メモリは表の大きさに比例しません（コピーも照合も 1,000 行ずつのキーの範囲）。citext の一意キーの重複検査だけは
対象の表（ユーザー・セクション・カテゴリ・チェック項目・タグ）の値を保持します。

## 5. リハーサルとレビューで見つかり、直したこと

| 事象 | 原因 | 対処 |
|---|---|---|
| 最初の乾式の実行で、NUL の無い列が大量に `NUL_BYTE` と判定された | `utf8mb4_unicode_ci` では NUL は「無視される文字」で、`INSTR(col, CHAR(0))` が常に一致する | バイナリで比べる（`INSTR(CAST(col AS BINARY), X'00')`）。結合テストで固定 |
| 照合の途中で読み取りが失敗したとき、MySQL の接続に `COMMIT` を送っていた | 読みかけのストリームの後ろで待ち続けるおそれ | 失敗の後は移行元に何も送らず接続を閉じる（閉じるのも 5 秒で打ち切る）。照合はストリームをやめキーの範囲ごとの短い SQL に |
| 独立レビュー（HIGH 4 件） | TLS の検証が無い / 値（メール等）が出力に出る / 現地時刻の検出が狭い / 警告が成功に見える | TLS の必須化、値を出さない出力、列ごとの時刻の解析と網羅の記録、`--accept-warnings` と exit 4。詳細は cutover の「移行ツールの約束」 |
| 独立レビュー（MEDIUM / LOW） | 照合が COMMIT の後 / 接続先の取り違え / 桁の検査が無い ほか | COMMIT の前に照合、`--expect-target` と同一性、桁・小数秒・整数の幅の検査、JSON の数値を正確に比較、報告書の原子的な書き込み など |
| `npm audit` が `EOVERRIDE` で動かなかった | `overrides` の `mysql2 ^3.24.4` が直接の依存 `^3.24.6` と矛盾 | `"mysql2": "$mysql2"`。mysql2 とその依存に既知の脆弱性は無い（全体の件数は K1 の基準と同じ） |

## 6. リハーサル 1（2026-11-02、レビューの前）の要約

472 行・78 表で一致（コピー 207 ms・照合 174 ms）、30,345 行でコピー 1.7 秒・照合 0.5 秒、安全装置 3 種と負の実行 3 種が期待どおり。
当時は照合が COMMIT の後で、警告は判断なしで進み、citext の重複の値を出力していた（§5 で修正）。

## 7. 本番の切り替えまでに残ること

- 本番の MySQL の `lower_case_table_names`・文字コード・行数・欠陥と警告の件数は、本番のバックアップでのリハーサル（cutover §1.1、承認が要る）と
  乾式の実行で初めて分かる。警告は承認者と判断して `--accept-warnings` に並べる。
- 移行先が本番サーバーと別のホストなら、PG の TLS（`ssl=on`、サーバー証明書、CA の PEM）を用意する（リハーサルはループバックだけで、
  TLS の接続そのものは試していない）。
- 本番の機械と本番の行数での所要時間、移行先のディスクの空き（cutover §1 の 10）。
