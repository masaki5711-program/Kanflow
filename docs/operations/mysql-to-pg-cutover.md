# 本番の MySQL → PostgreSQL 切り替え runbook（MR K2）

> **この文書は手順書です。実行は人の承認を得てから。** `[MUTATING — needs approval]` の付いた手順は
> 本番の状態（サービス・DB・ファイル・設定）を変えます。手順ごとに承認者の OK を得てから実行し、
> 実行した時刻と結果を作業記録に残してください。印の無い手順は読み取りだけです。
> 合成データでのリハーサルの記録: [mysql-to-pg-rehearsal.md](./mysql-to-pg-rehearsal.md)。
> 道具: `app/scripts/migrate-mysql-to-pg.ts`（本体と単体テストは `app/src/lib/db-migrator/`）。

## 0. 全体像

```
凍結の開始 → サービス停止 → MySQL を読み取り専用に → MySQL のバックアップ
→ 空の PG に prisma migrate deploy → 移行ツールの乾式の実行 → 本実行（コピー + 照合）
→ DATABASE_URL を PG へ → v2 のビルドで起動 → スモーク確認 → 凍結の解除
（問題があれば §8 で MySQL へ戻す。MySQL は凍結の開始から一切変えないので、戻してもデータは失われない）
```

| 項目 | 内容 |
|------|------|
| 移行元 | 本番 MySQL 8.4（Windows サービス `KanflowMySQL`、127.0.0.1:3306、`scrum_tool`、utf8mb4 / utf8mb4_unicode_ci） |
| 移行先 | PostgreSQL 16 + TimescaleDB のコンテナ（`timescale/timescaledb:2.28.1-pg16`、UTF-8・ICU `und`・ctype `C.UTF-8`） |
| コピーするもの | アプリの全テーブルの**データだけ**（78 表）。スキーマは Prisma（`prisma/migrations` の `0_init` 以降）が作る。`_prisma_migrations` はコピーしない |
| 停止時間の目安 | リハーサルの実測（[rehearsal](./mysql-to-pg-rehearsal.md) §4）と本番の行数から見積もる。本番の行数は §3 の乾式の実行が表ごとに出す |
| 戻し方 | §8。凍結の開始から PG で利用者が書き込みを始めるまでは、いつでも MySQL に戻せる |

### 移行ツールの約束（設計の要点）

- 接続先は `--source mysql://…` と `--target postgresql://…` だけで指定する。`DATABASE_URL` や `.env` は**読まない**。
- URL にパスワードを書くと拒否する。パスワードは環境変数 `KANFLOW_MIGRATOR_SOURCE_PASSWORD` / `KANFLOW_MIGRATOR_TARGET_PASSWORD`
  か、`--source-password-file` / `--target-password-file`（所有者だけが読めるファイル。Windows は icacls で ACL を絞る）。ログと報告書には出ない。
- **拒否リスト**（必須）: `KANFLOW_MIGRATOR_DENY_TARGETS="host:port/db,…"` と `--deny-file <file>`（1 行 1 件、`#` はコメント、
  port / db は `*` 可、localhost / 127.0.0.1 / ::1 は同じ扱い）。どちらにも 1 件も無いと起動しない。移行先が一致すると**接続する前に**拒否する。
  移行元と同じ host:port も拒否。拒否リストのファイルはリポジトリに入れない（その場で作り、作業後に消す）。
- 移行先のアプリの表に 1 行でもあると拒否する（**空にする検査を飛ばす方法は無い**）。
- 移行先への書き込みは**1 つのトランザクション**。途中で失敗・中断（強制終了・接続断を含む）しても移行先は空のスキーマに戻り、
  そのまま同じコマンドをやり直せばよい（状態ファイルは無い）。
- 移行元は `START TRANSACTION WITH CONSISTENT SNAPSHOT, READ ONLY` の中で読む（書き込みもロックもしない）。
- 照合: 表ごとに件数と内容のハッシュ（主キーのバイト順に並べた各行の正規化した表現の SHA-256）を両側で計算して比べ、
  違えば最初の差の主キーを出して **exit 1**。
- 終了コード: `0` 成功 / `1` 照合の不一致 / `2` 拒否（安全装置・事前検査） / `3` 失敗（ロールバック済み） / `64` 引数の誤り。

## 1. 前提条件（前日までに）

| # | 確認すること | 確認方法 |
|---|---|---|
| 1 | 合成データのリハーサルが最新のコードで合格している | `KANFLOW_MIGRATOR_TESTS=1 npx vitest run src/lib/db-migrator`（[rehearsal](./mysql-to-pg-rehearsal.md) §2） |
| 2 | v2（PG）のビルドが本番に置ける状態（品質ゲート合格、K1・K2 がマージ済み） | `ops\quality\quality-gate.ps1`、[deploy.md](./deploy.md) |
| 3 | 移行先の PG コンテナが動いていて、本番サーバーから届く。PG のクライアント（`psql`）がある | `psql -h <pg-host> -p <port> -U postgres -c "select version()"` |
| 4 | 移行に使う v2 のチェックアウト（本番の `D:\APP\Kanflow` とは**別のフォルダ**、例 `D:\APP\Kanflow-v2`）で `npm ci`（dev 依存込み: `tsx`・`mysql2`）済み | `node --import tsx scripts/migrate-mysql-to-pg.ts --help` |
| 5 | MySQL の読み取り専用ユーザーがある（下の GRANT） | `SHOW GRANTS FOR 'kanflow_migrator'@'localhost';` → `GRANT SELECT ON scrum_tool.*` だけ |
| 6 | パスワードのファイル 2 つ（MySQL の読み取り用・PG のアプリ用）を作業者だけが読める | `icacls <file>` に作業者（と SYSTEM / Administrators）だけ |
| 7 | 拒否リストのファイル（§2）を作った | 中身を承認者と確認 |
| 8 | 凍結の時間帯を利用者に告知した（停止時間 = 見積もり × 2 + 30 分の余裕） | 告知の控え |
| 9 | 本番の MySQL のバックアップ（毎日 02:30）が直近で成功している | `ops\status.ps1`、`ops\logs\backup.log` |
| 10 | 判断の基準を決めた: 戻すかどうかを決める**最終の時刻**（§7.4。目安: 起動から 60 分） | 作業記録 |

**読み取り専用ユーザー**（`[MUTATING — needs approval]`: 本番 MySQL のユーザーを作る。前日に実施）:

```sql
-- MySQL の root で。パスワードは作業者が生成し、パスワードのファイルにだけ書く（チャットやチケットに貼らない）
CREATE USER 'kanflow_migrator'@'localhost' IDENTIFIED BY '<生成したパスワード>';
GRANT SELECT ON scrum_tool.* TO 'kanflow_migrator'@'localhost';
-- 不要: LOCK TABLES / RELOAD / PROCESS（一貫した読み取りは CONSISTENT SNAPSHOT のトランザクションで取る）
```

**パスワードのファイル**（Windows。`[MUTATING — needs approval]`: ファイルを作る）:

```powershell
$f = "C:\KanflowCutover\mysql-reader.pw"      # PG 側は pg-app.pw
New-Item -ItemType Directory -Force (Split-Path $f) | Out-Null
Set-Content -Path $f -Value '<パスワード>' -Encoding ascii -NoNewline
icacls $f /inheritance:r /grant:r "$($env:USERNAME):(R)" "SYSTEM:(R)" "Administrators:(F)"
```

## 2. 拒否リスト

移行先として**絶対に選んではいけない** PG を並べます（例: すでに使われている PG、他チームの DB、試験用インスタンス）。
今回の移行先（空の新しい本番 DB）は**入れない**。切り替えの後は、新しい本番 DB も入れる（§9）。

```text
# C:\KanflowCutover\deny-targets.txt  （リポジトリに入れない）
127.0.0.1:25434/*          # v2 の試験用インスタンス
<他の業務の PG のホスト>:5432/*
```

## 3. 前日: 乾式の実行（読み取りだけ）

本番の MySQL を読むだけで、どこにも書きません（移行先の接続は `default_transaction_read_only=on`）。表ごとの件数・事前検査の結果が出ます。
本番への読み取りの負荷はあるので、利用の少ない時間帯に。移行先は §5 と同じ手順で作った空の DB が必要です
（前日に作った空の DB を当日もそのまま使ってよい。中身が空なら何度実行してもよい）。

```powershell
cd D:\APP\Kanflow-v2\app
$env:KANFLOW_MIGRATOR_DENY_TARGETS = ""   # ファイルで渡す
node --import tsx scripts/migrate-mysql-to-pg.ts `
  --source mysql://kanflow_migrator@127.0.0.1:3306/scrum_tool `
  --target postgresql://kanflow@<pg-host>:<port>/scrum_tool `
  --source-password-file C:\KanflowCutover\mysql-reader.pw `
  --target-password-file C:\KanflowCutover\pg-app.pw `
  --deny-file C:\KanflowCutover\deny-targets.txt `
  --dry-run --report C:\KanflowCutover\dry-run-<日時>.json
```

**合格の条件**: exit 0、`[precheck] … 0 error(s)`。エラーが出たら当日に進まない。エラーの種類と直し方:

| コード | 意味 | 対処（すべて MySQL 側のデータの修正 = 別途承認） |
|---|---|---|
| `NUL_BYTE` | 文字列に 0x00（PG の text に入らない） | 報告書の主キーの行から 0x00 を除く |
| `INVALID_JSON` | jsonb に入らない JSON（`\u0000` を含む等） | 値を直す。または `--allow-invalid-json`（その値を NULL にしてコピー、報告書に記録）を承認者と決める |
| `CITEXT_DUPLICATE` | 大文字小文字だけ違う値が一意キーで衝突（例: `Ⱥlice@…` と `ⱥlice@…` は MySQL では別、PG の citext では同じ） | 片方を変えるかまとめる。報告書に値と主キーの一覧 |
| `ORPHAN_FK` | 親が無い FK（MySQL の照合順序では `ABC` が `abc` に一致するが PG では一致しない） | 値を親と同じ表記に直すか、行を消す |
| `BOOLEAN_DOMAIN` / `INVALID_DATETIME` / `LENGTH_OVERFLOW` / `NULL_IN_NOT_NULL` | 型に収まらない値 | 値を直す |
| `SCHEMA_*` / `NO_PRIMARY_KEY` / `TARGET_NOT_MIGRATED` | スキーマが合わない / 移行先が未準備 | 本番の MySQL のマイグレーションの適用状況（58 本）と移行先の `prisma migrate status` を確認 |
| `TARGET_NOT_EMPTY` | 移行先に行がある | 移行先を作り直す（§5）。**他の DB を指していないか最初に確認** |

**警告**（止めないが、承認者と内容を確認して記録する）:

| コード | 意味 | 扱い |
|---|---|---|
| `LOCAL_TIME_SUSPECT` | `field_translation.requested_at` が同じ行の `translated_at` / `started_at` より 1 時間以上後 = 2026-10 より前のビルドが MySQL の `NOW(3)`（現地時刻 UTC+7）で書いた行（[worker.md](./worker.md)） | **そのままコピー（ずらさない）**。値は参考情報で、ワーカーは未処理の行の未来の時刻を「今」に引き戻す。件数を記録 |
| `FUTURE_TIMESTAMP` | 書き込みの時刻の列（`createdAt` / `updatedAt` / `requested_at` など）が UTC の現在より 10 分以上未来（予定日の列は見ない） | 同上（現地時刻で書かれた行。DB の `DEFAULT CURRENT_TIMESTAMP(3)` に頼った生の SQL の書き込みもこうなる） |
| `SOURCE_TABLE_NAME_CASE` | MySQL の `lower_case_table_names=1`（Windows の既定）で表名が小文字 | 想定どおり（大文字小文字を区別せず対応づける） |
| `TARGET_LOCALE` | 移行先が ICU `und` でない | 並び順が変わる。§5 で作り直すのが原則 |

タイムゾーンの規則: MySQL の `DATETIME(3)` にはタイムゾーンが無く、Prisma は UTC の時刻を書いて、PG の `TIMESTAMP(3)` も同じ前提で読みます。
ツールは値を**そのまま**コピーします（どちらの向きにもずらさない）。MySQL のセッションは `time_zone = '+00:00'`。

## 4. 当日: 凍結とバックアップ

1. 凍結の開始を利用者に連絡する。
2. `[MUTATING — needs approval]` サービスを止める（Web とワーカー）:

   ```powershell
   Stop-Service kanflow.exe -Force
   Stop-Service kanflowworker.exe -Force
   Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue   # 何も出ないこと（残る場合は recover.bat の手順）
   ```

3. 接続が残っていないことを確認（読み取り）: `& "C:\Program Files\MySQL\MySQL Server 8.4\bin\mysql.exe" -u root -p -e "SHOW PROCESSLIST"` — アプリのユーザーの接続が無いこと。
4. `[MUTATING — needs approval]` MySQL を読み取り専用にする（凍結の確実化。戻すときは `OFF`）:

   ```sql
   SET GLOBAL super_read_only = ON;   -- read_only も一緒に ON になる
   ```

5. `[MUTATING — needs approval]` MySQL のバックアップ（本番のチェックアウトの MySQL 用スクリプト。バックアップのファイルを書く）:

   ```powershell
   powershell -ExecutionPolicy Bypass -File D:\APP\Kanflow\ops\backup\backup-kanflow.ps1
   ```

   合格: exit 0、`ops\logs\backup.log` に完了、二次保存先へのコピーも成功。世代フォルダのパスを作業記録に書く。
   これが §8 で戻せなかった場合の最後の拠り所です。

## 5. 移行先の準備

1. `[MUTATING — needs approval]` 空の DB を作る（前日に作って空のままなら省略可。PG のスーパーユーザーで）:

   ```sql
   CREATE DATABASE scrum_tool OWNER kanflow TEMPLATE template0 ENCODING 'UTF8'
     LOCALE_PROVIDER icu ICU_LOCALE 'und' LOCALE 'C.UTF-8';
   ALTER DATABASE scrum_tool SET timezone TO 'UTC';
   ```

2. `[MUTATING — needs approval]` スキーマを作る（v2 のチェックアウトで。`DATABASE_URL` はこのコマンドの間だけ設定し、すぐ消す）:

   ```powershell
   cd D:\APP\Kanflow-v2\app
   $env:DATABASE_URL = "postgresql://kanflow:<パスワード>@<pg-host>:<port>/scrum_tool"
   npx prisma migrate deploy
   npx prisma migrate status          # "Database schema is up to date!"
   Remove-Item Env:DATABASE_URL
   ```

3. 確認（読み取り）: `psql … -c "\dx"` に `citext` と `pg_trgm`。

## 6. 移行

1. 乾式の実行（§3 のコマンドをそのまま。読み取りだけ）。合格の条件も §3 と同じ。凍結の後の件数が前日と大きく違わないこと。
2. `[MUTATING — needs approval]` 本実行（§3 のコマンドから `--dry-run` を外し、報告書の名前を変える）:

   ```powershell
   node --import tsx scripts/migrate-mysql-to-pg.ts `
     --source mysql://kanflow_migrator@127.0.0.1:3306/scrum_tool `
     --target postgresql://kanflow@<pg-host>:<port>/scrum_tool `
     --source-password-file C:\KanflowCutover\mysql-reader.pw `
     --target-password-file C:\KanflowCutover\pg-app.pw `
     --deny-file C:\KanflowCutover\deny-targets.txt `
     --report C:\KanflowCutover\migrate-<日時>.json
   ```

   - 進み具合: `[copy] <表>: <件数>/<件数> rows`。最後に `[copy] committed …` と表ごとの `[verify] … OK`。
   - **合格**: exit 0、`[verify] all 78 tables match`。
   - exit 1（不一致）: 報告書の `verification.tables[].differences` を見る。凍結が破れていないか（§4 の 3・4）を確認。
     原因が分かるまで切り替えない。やり直すには移行先を作り直して（§5）2 から。
   - exit 3（失敗）: 移行先は自動でロールバック済み（空のスキーマ）。原因（`[error]` の行）を直して、同じコマンドをやり直す。
   - exit 2: 事前検査の失敗。§3 の表に従う。
3. 照合だけをもう一度（読み取りだけ。任意）: `--verify-only` を付けて実行 → exit 0。

## 7. 切り替え

1. `[MUTATING — needs approval]` 本番に v2（PG）のビルドを置く — [deploy.md](./deploy.md) の手順で、**マイグレーションは適用しない**
   （§5 で済み。`-ApplyMigrations` を付けない）。今の MySQL 版のビルドは `.next-prev` として残す（§8 で使う）。
2. `[MUTATING — needs approval]` `D:\APP\Kanflow\app\.env` を PG に向ける（元のファイルは `.env.mysql-backup-<日時>` として残す）:

   ```dotenv
   DATABASE_URL="postgresql://kanflow:<パスワード>@<pg-host>:<port>/scrum_tool"
   DATABASE_HOST=<pg-host>
   DATABASE_PORT=<port>
   DATABASE_USER=kanflow
   DATABASE_PASSWORD=<パスワード>
   DATABASE_NAME=scrum_tool
   ```

   PG の接続設定（プール・タイムアウト）は `app/.env.example` を参照。
3. `[MUTATING — needs approval]` サービスを起動する: `Start-Service kanflow.exe; Start-Service kanflowworker.exe`
4. スモーク確認（読み取り）:

   | 確認 | 期待 |
   |---|---|
   | `Invoke-RestMethod http://127.0.0.1:3000/api/health` | `status: ok`、`db: ok`、`worker.status: ok`（心拍は 60 秒ごと） |
   | `powershell -File D:\APP\Kanflow\ops\status.ps1` | サービス・:3000・BUILD_ID・ワーカーの心拍が正常 |
   | ブラウザ: 管理者でログイン → プロジェクト一覧 → 任意のプロジェクトのボード | 移行前と同じ件数・内容（乾式の実行の件数と比べる） |
   | 検索（日本語 3 文字以上・英字の大文字小文字違い） | ヒットする（`pg_trgm` / `mode: insensitive`） |
   | 添付ファイルを 1 つ開く | 開ける（`app\private` は移行の対象外で、そのまま） |
   | デーモンのログ `ops\web\daemon\kanflow.err.log` | 新しいエラーが無い |

5. **戻すかどうかの最終判断**（§1 の 10 で決めた時刻まで）。問題があれば §8。無ければ凍結を解除し、利用者に連絡する。
   この後は PG に利用者のデータが入るので、MySQL へ戻すと**その間のデータを失う**（§8.2）。

## 8. 戻し方（MySQL へ）

### 8.1 凍結の解除の前（PG に利用者の書き込みが無い）— データは失われない

1. `[MUTATING — needs approval]` `Stop-Service kanflowworker.exe -Force; Stop-Service kanflow.exe -Force`
2. `[MUTATING — needs approval]` `.env` を元に戻す（`.env.mysql-backup-<日時>` → `.env`）。
3. `[MUTATING — needs approval]` MySQL 版のビルドに戻す: `powershell -File D:\APP\Kanflow\ops\deploy\swap-build.ps1 -Rollback`
   （[deploy.md](./deploy.md) のロールバック。MySQL 版のチェックアウトが前提）。
4. `[MUTATING — needs approval]` MySQL の書き込みを戻す: `SET GLOBAL super_read_only = OFF; SET GLOBAL read_only = OFF;`
5. `[MUTATING — needs approval]` `Start-Service kanflow.exe; Start-Service kanflowworker.exe`
6. 確認: `/api/health` が `db: ok`、`ops\status.ps1`、ログイン。凍結の開始から MySQL は変わっていないので、移行前の状態そのまま。
7. PG の移行先は調査用に残す（消すのは原因が分かってから。消すのも承認が要る）。原因と結果を作業記録に。

### 8.2 凍結の解除の後（PG に利用者の書き込みがある）

MySQL に戻すと、切り替えの後に PG へ書かれたデータは失われます（逆向きの移行の道具は無い）。戻すかは承認者が決め、
戻す場合は 8.1 の手順に加えて、失われる期間（凍結の解除の時刻〜停止の時刻）を利用者に連絡します。
PG のその時点のバックアップ（`ops\backup\backup-kanflow.ps1`、v2 版）を先に取り、後で手作業で拾えるようにします。

## 9. 切り替えの後

| いつ | すること |
|---|---|
| 当日 | `[MUTATING — needs approval]` v2 のバックアップのタスクを登録（`ops\backup\register-backup-task.ps1`、[backup-restore.md](./backup-restore.md)）し、手動で 1 回実行して成功を確認 |
| 当日 | 新しい本番の PG を拒否リストの標準の設定（運用者の手元の `deny-targets.txt` と `KANFLOW_MIGRATOR_DENY_TARGETS`）に**追加**する（誤ってもう一度移行先にしない） |
| 当日 | `[MUTATING — needs approval]` パスワードのファイル・拒否リストのファイルを消す（`C:\KanflowCutover\*.pw`）。報告書（JSON）は作業記録として保管（パスワードは含まない。`CITEXT_DUPLICATE` などの値は含みうるので扱いに注意） |
| 当日 | `[MUTATING — needs approval]` MySQL の移行用ユーザーを消す: `DROP USER 'kanflow_migrator'@'localhost';` |
| 24 時間 | `/api/health`・ワーカーの心拍・翻訳の滞留・デーモンのログを監視。遅い画面が無いか（`pg_stat_statements` があれば上位を確認） |
| 1 週間 | `[MUTATING — needs approval]` リストア訓練（`ops\backup\restore-drill.ps1`）を 1 回実行して合格を確認 |
| 30 日 | MySQL は読み取り専用のまま残す（`KanflowMySQL` は起動したまま、または停止）。問題が無ければ、承認を得て MySQL の廃止（サービスの停止・無効化、最終のバックアップの保管） |
| 随時 | README / deploy.md / runbook.md の「本番は MySQL（K2 まで）」の記述を「PG」に更新する（別の MR） |

既知の違い（利用者に伝える）: NULL を含む列の並び順（MySQL は昇順で NULL が先頭、PG は末尾）、文字列の並び順（ICU `und`）。
