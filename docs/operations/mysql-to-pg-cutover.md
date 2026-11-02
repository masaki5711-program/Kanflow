# 本番の MySQL → PostgreSQL 切り替え runbook（MR K2）

> **この文書は手順書です。実行は人の承認を得てから。** `[MUTATING — needs approval]` の付いた手順は
> 本番の状態（サービス・DB・ファイル・設定）を変えます。手順ごとに承認者の OK を得てから実行し、
> 実行した時刻と結果を作業記録に残してください。印の無い手順は読み取りだけです。
> 合成データでのリハーサルの記録: [mysql-to-pg-rehearsal.md](./mysql-to-pg-rehearsal.md)。
> 道具: `app/scripts/migrate-mysql-to-pg.ts`（本体と単体テストは `app/src/lib/db-migrator/`）。

## 0. 全体像

```
前日まで: 準備 → 本番のバックアップを復元した使い捨ての PG でリハーサル（承認） → 乾式の実行で警告を判断
当日: 凍結 → サービス停止 → MySQL を読み取り専用に → MySQL のバックアップ → 空の PG に prisma migrate deploy
→ 乾式の実行 → 本実行（コピー → トランザクションの中で照合 → 一致したときだけ COMMIT）→ 照合だけをもう一度
→ DATABASE_URL を PG へ → Web だけ起動 → スモーク確認 → 判断 → ワーカー起動・凍結の解除
（問題があれば §8 で MySQL へ戻す。MySQL は凍結の開始から一切変えないので、凍結の解除の前ならデータは失われない）
```

| 項目 | 内容 |
|------|------|
| 移行元 | 本番 MySQL 8.4（Windows サービス `KanflowMySQL`、127.0.0.1:3306、`scrum_tool`、utf8mb4 / utf8mb4_unicode_ci） |
| 移行先 | PostgreSQL 16 + TimescaleDB のコンテナ（`timescale/timescaledb:2.28.1-pg16`、UTF-8・ICU `und`・ctype `C.UTF-8`） |
| コピーするもの | アプリの全テーブルの**データだけ**（78 表）。スキーマは Prisma（`prisma/migrations` の `0_init` 以降）が作る。`_prisma_migrations` はコピーしない |
| 停止時間の目安 | リハーサルの実測（[rehearsal](./mysql-to-pg-rehearsal.md) §4）と本番の行数（§3 の乾式の実行が表ごとに出す）から |
| 戻し方 | §8。凍結の解除（ワーカーの起動）まではいつでも MySQL に戻せる |

### 移行ツールの約束

- 接続先は `--source mysql://…` と `--target postgresql://…` だけ。`DATABASE_URL` や `.env` は**読まない**。
  加えて `--expect-target <host>:<port>/<db>` で移行先をもう一度書く（`--target` と 1 文字でも違えば拒否）。
- **TLS**: 127.0.0.1 / localhost 以外へ接続するときは `--source-ca` / `--target-ca`（CA の PEM ファイル）が必須で、
  証明書を検証して接続する（検証しない暗号化は無い）。無ければ `TLS_REQUIRED` で拒否。
  移行先の PG が別のホストなら、PG に `ssl=on` とサーバー証明書を設定し、その CA を `--target-ca` に渡す。
- **パスワード**: URL に書くと拒否。環境変数 `KANFLOW_MIGRATOR_SOURCE_PASSWORD` / `KANFLOW_MIGRATOR_TARGET_PASSWORD`、
  または `--source-password-file` / `--target-password-file`。Windows ではファイルの ACL を icacls で検査し、
  Everyone / Users / Authenticated Users などに権限があれば拒否する。ログと報告書にパスワードは出ない。
- **拒否リスト**（必須）: `KANFLOW_MIGRATOR_DENY_TARGETS="host:port/db,…"` と `--deny-file <file>`（1 行 1 件、`#` はコメント、
  port / db は `*` 可、localhost / 127.0.0.1 / ::1 は同じ扱い、DNS は引かない＝別名もすべて書く）。1 件も無いと起動しない。
  移行先が一致すると**接続する前に**拒否。移行元と同じ host:port も拒否。
- **サーバーの同一性**: 乾式の実行が `--source-identity <MySQL の @@server_uuid> --target-identity <PG の system_identifier/DB の oid>` を表示する。
  本実行はこの 2 つが必須で、接続した先と違えば拒否（前日に確かめた DB と別の DB に書かない）。移行先の DB を作り直したら乾式の実行からやり直す。
- **警告は人が判断する**: 時刻の警告などがあると、乾式の実行は exit 4、本実行は exit 2 で止まる。内容を確認して
  `--accept-warnings CODE,…` に**すべて**並べたときだけ進む（報告書の `acceptedWarnings` に残る）。
- 移行先のアプリの表に 1 行でもあると拒否する（空にする検査を飛ばす方法は無い）。
- 書き込みは**1 つのトランザクション**: コピー → 遅延した FK の更新 → シーケンスの再設定 → **同じトランザクションの中で照合** →
  全表一致のときだけ COMMIT。不一致・失敗・中断（強制終了・接続断を含む）では移行先は空のスキーマのまま。COMMIT の後に ANALYZE。
- 照合: 表ごとに件数と内容のハッシュ（各行の正規化した表現の SHA-256、移行元のキーの順）を比べ、行ごとに突き合わせて
  違う主キーを示す。読み取りはすべて区切った短い SQL（キーの範囲ごと）。
- **出力に行の値を出さない**: 事前検査・照合・エラーは主キー（と値の短いハッシュ）だけを出し、DB のエラーの中の値は伏せる。
  例外は `--invalid-json-file`（§3、元の値を保存する保護されたファイル）。主キーが複数の列のとき（例: `field_translation`）はその列の値が出る。
- 終了コード: `0` 成功 / `1` 照合の不一致（**何も COMMIT していない**）/ `2` 拒否（安全装置・事前検査・未判断の警告）/
  `3` 失敗（報告書の `committed`: `false` = 移行先は空、`"unknown"` = COMMIT の結果が不明 → **まず `--verify-only`**）/
  `4` 乾式の実行は合格だが警告の判断が要る / `64` 引数の誤り。

## 1. 前提条件（前日までに）

| # | 確認すること | 確認方法 |
|---|---|---|
| 1 | 合成データのリハーサルが最新のコードで合格している | `KANFLOW_MIGRATOR_TESTS=1 npx vitest run src/lib/db-migrator`（[rehearsal](./mysql-to-pg-rehearsal.md) §2） |
| 2 | v2（PG）のビルドが本番に置ける状態（品質ゲート合格、K1・K2 がマージ済み） | `ops\quality\quality-gate.ps1`、[deploy.md](./deploy.md) |
| 3 | 移行先の PG コンテナが動いていて、本番サーバーから届く。別ホストなら TLS（`ssl=on`）と CA の PEM がある | `psql "host=<pg-host> port=<port> user=postgres sslmode=verify-full sslrootcert=<ca.pem>" -c "select version()"` |
| 4 | `[MUTATING — needs approval]` 移行に使う v2 のチェックアウトを本番 `D:\APP\Kanflow` とは**別のフォルダ**（例 `D:\APP\Kanflow-v2`）に置き、`npm ci`（dev 依存込み: `tsx`・`mysql2`）。本番サーバーにファイルと依存を入れる操作 | `node --import tsx scripts/migrate-mysql-to-pg.ts --help` |
| 5 | `[MUTATING — needs approval]` MySQL の読み取り専用ユーザー（下の GRANT） | `SHOW GRANTS FOR 'kanflow_migrator'@'localhost';` → `GRANT SELECT ON scrum_tool.*` だけ |
| 6 | `[MUTATING — needs approval]` 作業フォルダ `C:\KanflowCutover` を作り、作業者・SYSTEM・Administrators だけに絞る（下の icacls）。パスワードのファイル・拒否リスト・報告書・`--invalid-json-file` はすべてここに置く | `icacls C:\KanflowCutover` |
| 7 | パスワードのファイル 2 つ（MySQL の読み取り用・PG のアプリ用）を作った（下）。ツール自身も ACL を検査する | `icacls C:\KanflowCutover\*.pw` |
| 8 | `[MUTATING — needs approval]` 拒否リストのファイル（§2）を作った | 中身を承認者と確認 |
| 9 | **本番のバックアップを復元した使い捨ての PG でリハーサル**した（§1.1） | 作業記録 |
| 10 | 移行先のディスクに余裕がある: 空き ≥ 本番の MySQL のデータの大きさ × 3（表 + 索引 + 1 トランザクション分の WAL）。WAL の上限（`max_wal_size`）を超えてもチェックポイントが走るだけだが、ディスクが尽きると失敗する | 下の SQL と `df` / エクスプローラー |
| 11 | 凍結の時間帯を利用者に告知した（停止時間 = 見積もり × 2 + 30 分の余裕） | 告知の控え |
| 12 | 本番の MySQL のバックアップ（毎日 02:30）が直近で成功している | `ops\status.ps1`、`ops\logs\backup.log` |
| 13 | 判断の基準を決めた: 戻すかどうかを決める**最終の時刻**（§7.5。目安: Web の起動から 60 分） | 作業記録 |

MySQL のデータの大きさ（読み取り）:

```sql
SELECT ROUND(SUM(data_length + index_length) / 1024 / 1024) AS mb FROM information_schema.TABLES WHERE table_schema = 'scrum_tool';
```

**読み取り専用ユーザー**（前日、MySQL の root で）:

```sql
-- パスワードは作業者が生成し、パスワードのファイルにだけ書く（チャットやチケットに貼らない）
CREATE USER 'kanflow_migrator'@'localhost' IDENTIFIED BY '<生成したパスワード>';
GRANT SELECT ON scrum_tool.* TO 'kanflow_migrator'@'localhost';
-- 不要: LOCK TABLES / RELOAD / PROCESS（一貫した読み取りは CONSISTENT SNAPSHOT のトランザクションで取る）
```

**作業フォルダとパスワードのファイル**（Windows PowerShell。パスワードは画面にも履歴にも残さない）:

```powershell
$dir = "C:\KanflowCutover"
New-Item -ItemType Directory -Force $dir | Out-Null
icacls $dir /inheritance:r /grant:r "$($env:USERNAME):(OI)(CI)F" "SYSTEM:(OI)(CI)F" "Administrators:(OI)(CI)F"

# Read-Host -AsSecureString は入力を表示せず、PSReadLine の履歴にも残らない
$sec = Read-Host -AsSecureString "MySQL kanflow_migrator password"
$plain = [Runtime.InteropServices.Marshal]::PtrToStringBSTR([Runtime.InteropServices.Marshal]::SecureStringToBSTR($sec))
[IO.File]::WriteAllText("$dir\mysql-reader.pw", $plain); Remove-Variable plain, sec
icacls "$dir\mysql-reader.pw" /inheritance:r /grant:r "$($env:USERNAME):(R)" "SYSTEM:(R)" "Administrators:(F)"
# PG のアプリのユーザーも同じ手順で $dir\pg-app.pw
```

### 1.1 本番のバックアップでのリハーサル（凍結の前、`[MUTATING — needs approval]`）

合成データでは分からない本番のデータの事前検査の結果・所要時間を、本番に触れずに確かめます。**個人データを含むので社内（オンプレ）から出さず、
終わったら必ず消す**。承認者の OK を得てから:

1. 直近の本番の MySQL のバックアップ（`ops\backup` の世代）を、本番ではない使い捨ての MySQL に復元する（例: 本番サーバー上の別ポートの MySQL
   コンテナ、DB 名は `scrum_tool_rehearsal`）。本番の `KanflowMySQL` には復元しない。
2. 使い捨ての PG の DB（例 `scrum_tool_rehearsal`）を §5 の手順で作る。
3. §3 の乾式の実行と §6 の本実行を、この 2 つの DB に対して行う（拒否リストには本番の新しい PG を入れておく）。
4. 結果（警告の件数・エラー・所要時間）を作業記録に残し、§3 の判断の材料にする。
5. 使い捨ての MySQL / PG を消す（`DROP DATABASE` とコンテナの削除）。報告書と `--invalid-json-file` も §9 の規則で扱う。

## 2. 拒否リスト（`[MUTATING — needs approval]`: ファイルを作る）

移行先として**絶対に選んではいけない** PG を並べます（例: すでに使われている PG、他チームの DB、試験用インスタンス）。
今回の移行先（空の新しい本番 DB）は**入れない**。切り替えの後は、新しい本番 DB も入れる（§9 の承認つきの手順）。

```text
# C:\KanflowCutover\deny-targets.txt  （リポジトリに入れない）
127.0.0.1:25434/*          # v2 の試験用インスタンス
<他の業務の PG のホスト>:5432/*
```

## 3. 前日: 乾式の実行（読み取りだけ）と警告の判断

本番の MySQL を読むだけで、どこにも書きません（移行先の接続は `default_transaction_read_only=on`）。表ごとの件数・事前検査の結果・
**サーバーの同一性**が出ます。本番への読み取りの負荷はあるので、利用の少ない時間帯に。移行先は §5 の手順で作った空の DB
（前日に作った DB を当日も使う。作り直したら乾式の実行からやり直す）。

```powershell
cd D:\APP\Kanflow-v2\app
node --import tsx scripts/migrate-mysql-to-pg.ts `
  --source mysql://kanflow_migrator@127.0.0.1:3306/scrum_tool `
  --target postgresql://kanflow@<pg-host>:<port>/scrum_tool `
  --expect-target <pg-host>:<port>/scrum_tool `
  --target-ca C:\KanflowCutover\pg-ca.pem `
  --source-password-file C:\KanflowCutover\mysql-reader.pw `
  --target-password-file C:\KanflowCutover\pg-app.pw `
  --deny-file C:\KanflowCutover\deny-targets.txt `
  --dry-run --report C:\KanflowCutover\dry-run-<日時>.json
```

（`<pg-host>` が 127.0.0.1 / localhost なら `--target-ca` の行は不要。）

**合格の条件**: `0 error(s)` で exit 0、または exit 4（警告の判断が要る）。最後の行の
`--source-identity … --target-identity …` を作業記録に写す（本実行で使う）。

エラー（exit 2）の種類と直し方:

| コード | 意味 | 対処（MySQL 側のデータの修正 = 別途承認） |
|---|---|---|
| `NUL_BYTE` | 文字列に 0x00（PG の text に入らない） | 報告書の主キーの行から 0x00 を除く |
| `INVALID_JSON` | jsonb に入らない JSON（`\u0000` を含む等） | 値を直す。または `--allow-invalid-json --invalid-json-file C:\KanflowCutover\nulled-<日時>.jsonl`（その値を NULL にしてコピーし、主キーと**元の値**をそのファイルにだけ書く。コピーの後に件数を照合）を承認者と決める |
| `CITEXT_DUPLICATE` | 大文字小文字だけ違う値が一意キーで衝突（例: `Ⱥlice@…` と `ⱥlice@…` は MySQL では別、PG の citext では同じ） | 報告書の主キー（値は `value#<ハッシュ>` で伏せてある）を MySQL で見て、片方を変えるかまとめる |
| `ORPHAN_FK` | 親が無い FK（MySQL の照合順序では `ABC` が `abc` に一致するが PG では一致しない） | 値を親と同じ表記に直すか、行を消す |
| `BOOLEAN_DOMAIN` / `INVALID_DATETIME` / `LENGTH_OVERFLOW` / `NULL_IN_NOT_NULL` | 型に収まらない値 | 値を直す |
| `SCHEMA_*`（`SCHEMA_PRECISION` を含む）/ `NO_PRIMARY_KEY` / `NO_TABLES` / `TARGET_NOT_MIGRATED` | スキーマが合わない（桁・小数秒・整数の幅を含む）/ 移行先が未準備 | 本番の MySQL のマイグレーションの適用状況（58 本）と移行先の `prisma migrate status` を確認 |
| `TARGET_NOT_EMPTY` | 移行先に行がある | 移行先を作り直す（§5）。**他の DB を指していないか最初に確認** |
| `IDENTITY_MISMATCH` | 本実行の接続先が乾式の実行と違う | 接続先を確認。DB を作り直したなら乾式の実行からやり直す |
| `TLS_REQUIRED` / `EXPECT_TARGET_MISMATCH` / `TARGET_DENIED` | 安全装置 | 引数・CA・拒否リストを確認 |

**警告（exit 4）は承認者と一緒に判断する**。報告書の主キーで MySQL の行を見て、内容を作業記録に残し、受け入れるコードを
本実行の `--accept-warnings` に並べます（並べなければ本実行は exit 2）。どの警告も値は**そのままコピー**（ずらさない）:

| コード | 意味 | 判断の観点 |
|---|---|---|
| `LOCAL_TIME_SUSPECT` | `field_translation.requested_at` が同じ行の `translated_at` / `started_at` より 1 時間以上後 = 2026-10 より前のビルドが MySQL の `NOW(3)`（UTC+7）で書いた行（[worker.md](./worker.md)） | 参考情報の時刻。ワーカーは未処理の行の未来の時刻を「今」に引き戻す |
| `FUTURE_TIMESTAMP` | 出来事の時刻の列（名前が `At` / `_at` で終わる。`expiresAt` は除く）が UTC の現在より 10 分以上未来 | 現地時刻で書かれた行。DB の `DEFAULT CURRENT_TIMESTAMP(3)` に頼った生の SQL の書き込みもこうなる |
| `TIMESTAMP_BEFORE_CREATED` | 出来事の時刻が同じ行の `createdAt` より 1 時間以上前（外部の時刻の `mergedAt`・`takenAt` などは除く） | `createdAt` か相手の列のどちらかが現地時刻 |
| `LOCAL_OFFSET_SUSPECT` | 出来事の時刻と `createdAt` の差がちょうど 7 時間（±10 分。`--local-offset-hours` で変更） | 片方だけ現地時刻で書かれた行の特徴 |
| `TARGET_LOCALE` / `SOURCE_CHARSET` | 移行先が ICU `und` でない / 移行元の既定の文字コードが utf8mb4 でない | 原則は §5 で作り直す |

時刻の解析は報告書の `timestampAnalysis` に、列ごとに「どの検査をしたか・できなかった理由」（予定日の列は対象外、`createdAt` の無い表は
前後関係を見られない、など）を残します。**検査できなかった列を「問題なし」とは扱いません**。

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

3. 接続が残っていないことを確認（読み取り）: `& "C:\Program Files\MySQL\MySQL Server 8.4\bin\mysql.exe" -u root -p -e "SHOW PROCESSLIST"`
4. `[MUTATING — needs approval]` MySQL を読み取り専用にする（戻すときは `OFF`）: `SET GLOBAL super_read_only = ON;`
5. `[MUTATING — needs approval]` MySQL のバックアップ（本番のチェックアウトの MySQL 用スクリプト）:
   `powershell -ExecutionPolicy Bypass -File D:\APP\Kanflow\ops\backup\backup-kanflow.ps1`
   合格: exit 0、`ops\logs\backup.log` に完了、二次保存先へのコピーも成功。世代フォルダのパスを作業記録に書く。

## 5. 移行先の準備

1. `[MUTATING — needs approval]` 空の DB を作る（前日に作って空のままなら省略可。省略しないなら乾式の実行もやり直す）:

   ```sql
   CREATE DATABASE scrum_tool OWNER kanflow TEMPLATE template0 ENCODING 'UTF8'
     LOCALE_PROVIDER icu ICU_LOCALE 'und' LOCALE 'C.UTF-8';
   ALTER DATABASE scrum_tool SET timezone TO 'UTC';
   ```

2. `[MUTATING — needs approval]` スキーマを作る（`DATABASE_URL` はこのコマンドの間だけ設定し、すぐ消す。パスワードは SecureString から）:

   ```powershell
   cd D:\APP\Kanflow-v2\app
   $sec = Read-Host -AsSecureString "PG kanflow password"
   $pw = [Runtime.InteropServices.Marshal]::PtrToStringBSTR([Runtime.InteropServices.Marshal]::SecureStringToBSTR($sec))
   $env:DATABASE_URL = "postgresql://kanflow:$([uri]::EscapeDataString($pw))@<pg-host>:<port>/scrum_tool"
   npx prisma migrate deploy
   npx prisma migrate status          # "Database schema is up to date!"
   Remove-Item Env:DATABASE_URL; Remove-Variable pw, sec
   ```

3. 確認（読み取り）: `psql … -c "\dx"` に `citext` と `pg_trgm`。

## 6. 移行

1. 乾式の実行（§3 のコマンドをそのまま。読み取りだけ）。凍結の後の件数が前日と大きく違わないこと、警告が前日に判断したものと同じであること、
   表示された同一性が前日と同じであること。
2. `[MUTATING — needs approval]` 本実行（§3 のコマンドから `--dry-run` を外し、同一性と判断した警告を足す）:

   ```powershell
   node --import tsx scripts/migrate-mysql-to-pg.ts `
     --source mysql://kanflow_migrator@127.0.0.1:3306/scrum_tool `
     --target postgresql://kanflow@<pg-host>:<port>/scrum_tool `
     --expect-target <pg-host>:<port>/scrum_tool `
     --source-identity <乾式の実行の値> --target-identity <乾式の実行の値> `
     --accept-warnings <承認者と判断したコード,…> `
     --target-ca C:\KanflowCutover\pg-ca.pem `
     --source-password-file C:\KanflowCutover\mysql-reader.pw `
     --target-password-file C:\KanflowCutover\pg-app.pw `
     --deny-file C:\KanflowCutover\deny-targets.txt `
     --report C:\KanflowCutover\migrate-<日時>.json
   ```

   - 進み具合: `[copy] <表>: <件数>/<件数> rows` → `rows written … (not committed yet)` → 表ごとの `[verify]` → `all 78 tables match - COMMITTED`。
   - **合格**: exit 0、報告書の `committed: true`、`analyze: "ok"`（`failed` なら手で `ANALYZE` を実行）。
   - exit 1（照合の不一致）: **何も COMMIT していない**（移行先は空）。報告書の `verification.tables[].differences` を見て原因を調べる。
     凍結が破れていないか（§4 の 3・4）を確認。原因が分かるまで切り替えない。
   - exit 3（失敗）: 報告書の `committed` を見る。`false` なら移行先は空 → 原因（`[error]` の行）を直して同じコマンドをやり直す。
     `"unknown"`（COMMIT の途中で接続が切れた等）または報告書が無いときは、**まず `--verify-only`** を実行し、
     一致すれば COMMIT 済み（7 へ）、移行先が空ならやり直す。どちらでもなければ移行先を作り直して（§5）乾式の実行から。
   - exit 2: 事前検査・未判断の警告・同一性の不一致。§3 の表に従う。
3. 照合だけをもう一度（読み取りだけ。**必須**）: §3 のコマンドの `--dry-run` を `--verify-only` に替えて実行 → exit 0。
   COMMIT の後の新しいスナップショットで、凍結中に MySQL が変わっていないことも確かめる。

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

   PG の接続設定（プール・タイムアウト・TLS）は `app/.env.example` を参照。
3. `[MUTATING — needs approval]` **Web だけ**起動する（ワーカー・定期ジョブは判断まで止めたまま。翻訳・同期などが PG に書き始めないように）:
   `Start-Service kanflow.exe`
4. スモーク確認（読み取り）:

   | 確認 | 期待 |
   |---|---|
   | `Invoke-RestMethod http://127.0.0.1:3000/api/health` | `status: ok`、`db: ok`（`worker` はこの時点では `stale` / `absent` で正しい） |
   | `powershell -File D:\APP\Kanflow\ops\status.ps1` | サービス・:3000・BUILD_ID が正常 |
   | ブラウザ: 管理者でログイン → プロジェクト一覧 → 任意のプロジェクトのボード | 移行前と同じ件数・内容（乾式の実行の件数と比べる） |
   | 検索（日本語 3 文字以上・英字の大文字小文字違い） | ヒットする（`pg_trgm` / `mode: insensitive`） |
   | 添付ファイルを 1 つ開く | 開ける（`app\private` は移行の対象外で、そのまま） |
   | デーモンのログ `ops\web\daemon\kanflow.err.log` | 新しいエラーが無い |

5. **戻すかどうかの最終判断**（§1 の 13 で決めた時刻まで）。問題があれば §8.1。
6. `[MUTATING — needs approval]` 問題が無ければワーカーを起動し（`Start-Service kanflowworker.exe`、`/api/health` の `worker.status: ok` を確認）、
   凍結を解除して利用者に連絡する。この後は PG に利用者のデータが入るので、MySQL へ戻すと**その間のデータを失う**（§8.2）。

## 8. 戻し方（MySQL へ）

### 8.1 凍結の解除の前（PG に利用者の書き込みが無い）— データは失われない

1. `[MUTATING — needs approval]` `Stop-Service kanflowworker.exe -Force; Stop-Service kanflow.exe -Force`
2. `[MUTATING — needs approval]` `.env` を元に戻す（`.env.mysql-backup-<日時>` → `.env`）。
3. `[MUTATING — needs approval]` MySQL 版のビルドに戻す: `powershell -File D:\APP\Kanflow\ops\deploy\swap-build.ps1 -Rollback`
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
| 当日 | `[MUTATING — needs approval]` **新しい本番の PG を拒否リストに追加する**（下のチェック）。この手順が終わるまで作業を閉じない |
| 当日 | `[MUTATING — needs approval]` MySQL の移行用ユーザーを消す: `DROP USER 'kanflow_migrator'@'localhost';` |
| 当日 | `[MUTATING — needs approval]` パスワードのファイルを消す: `Remove-Item C:\KanflowCutover\*.pw` |
| 当日 | 報告書（`dry-run-*.json` / `migrate-*.json`）は作業記録として `C:\KanflowCutover`（ACL つき）に保管。パスワードと行の値は含まない（主キーは含む）。**保管は 90 日**、その後 `[MUTATING — needs approval]` `Remove-Item C:\KanflowCutover\*.json` |
| 当日〜解決まで | `--invalid-json-file`（`nulled-*.jsonl`）は**元の値（個人データを含みうる）**を持つ。直すべき値を MySQL の最終のバックアップか PG に反映し終えたら `[MUTATING — needs approval]` `Remove-Item C:\KanflowCutover\nulled-*.jsonl`。社外に出さない |
| 24 時間 | `/api/health`・ワーカーの心拍・翻訳の滞留・デーモンのログを監視。遅い画面が無いか（`pg_stat_statements` があれば上位を確認） |
| 1 週間 | `[MUTATING — needs approval]` リストア訓練（`ops\backup\restore-drill.ps1`）を 1 回実行して合格を確認 |
| 30 日 | MySQL は読み取り専用のまま残す。問題が無ければ、承認を得て MySQL の廃止（サービスの停止・無効化、最終のバックアップの保管） |
| 随時 | README / deploy.md / runbook.md の「本番は MySQL（K2 まで）」の記述を「PG」に更新する（別の MR） |

**拒否リストへの追加のチェック**（承認者が確認して作業記録にサインする）:

- [ ] 運用者の手元の `deny-targets.txt`（今後の作業で使う保管場所の写し）に `<pg-host>:<port>/scrum_tool` と、その別名（ホスト名・IP）をすべて追加した
- [ ] `KANFLOW_MIGRATOR_DENY_TARGETS` を使う端末・タスクにも同じ値を設定した
- [ ] 確認: 乾式の実行を新しい本番の PG に向けると `TARGET_DENIED`（exit 2、接続なし）になる

既知の違い（利用者に伝える）: NULL を含む列の並び順（MySQL は昇順で NULL が先頭、PG は末尾）、文字列の並び順（ICU `und`）。
