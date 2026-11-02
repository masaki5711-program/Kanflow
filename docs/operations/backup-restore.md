# Kanflow バックアップ / リストア手順

> **このブランチ（Kanflow v2）のスクリプトは PostgreSQL 用です**（`pg_dump` のプレーン SQL を gzip、`psql` で復元）。
> **本番サーバーは移行（MR K2）まで MySQL 8.4** で、本番のチェックアウトにある MySQL 用のスクリプト（`mysqldump`）を
> 使い続けます。下の「本番（MySQL）」と書いた手作業の手順は本番用、それ以外は v2 のスクリプトの説明です。
> v2 のスクリプトに要るもの: PostgreSQL 16 以上のクライアント（`pg_dump.exe` / `psql.exe`。`KANFLOW_PG_BIN`、無ければ
> `C:\Program Files\PostgreSQL\<版>\bin` の最新）、`-UseRootCredential` 用のスーパーユーザー
> （`app\.env` の `DATABASE_ADMIN_USER`、既定 `postgres`、パスワードは `.db-pw`）。
>
> **基準の復元先**は、基盤の決定どおり **PostgreSQL 16 + TimescaleDB のコンテナ**（`timescale/timescaledb:2.28.1-pg16`、
> UTF-8・ICU `und`・ctype `C.UTF-8`、`ops/test-env/compose.yml` と同じ設定）です。v2 のスクリプトはここで確認しています。
>
> - **ロケール**: バックアップは元の DB のロケール（provider / collate / ctype / ICU）を `manifest.json` の `dbLocale` に記録し、
>   復元・訓練はそのロケールで DB を作り直します（訓練は復元後の DB のロケールが一致しないと**不合格**）。
>   そのロケールが無いサーバー（例: ネイティブの Windows 版 PostgreSQL には `C.UTF-8` が無く、`invalid LC_CTYPE locale name` で
>   失敗します）へ戻すときは `-UseServerLocale` を付けると、そのサーバーの template1 のロケールで作ります（訓練は警告に留める）。
>   `dbLocale` の無い古い世代も template1 のロケールを使います。並び順（照合順序）が変わる点に注意。
> - **TimescaleDB**: イメージが既定の DB に TimescaleDB 拡張を入れていても、ダンプからは `CREATE EXTENSION timescaledb` と
>   そのカタログを除きます（Kanflow は使っていない）。TimescaleDB の無い PostgreSQL 16 にも復元できます（`postgres:16` で確認済み）。
> - **取り込みは 1 トランザクション**（`psql --single-transaction -v ON_ERROR_STOP=1`）: 失敗すると復元先は空の DB のままで、途中までの状態は残りません。
> - **時間の上限**: pg_dump / psql の 1 回の実行は `KANFLOW_PG_TIMEOUT_SEC`（既定 7200 秒）で打ち切り（プロセスを止め、終了コード 124 とログ）。

対象: 本番 1 台構成（Windows, `D:\APP\Kanflow`）。スクリプトはすべて Windows PowerShell 5.1 で動作します。

| 項目 | 内容 |
|------|------|
| バックアップ スクリプト | `ops\backup\backup-kanflow.ps1` |
| リストア スクリプト | `ops\backup\restore-kanflow.ps1`（`-DryRun` あり） |
| リストア訓練 | `ops\backup\restore-drill.ps1`（使い捨て DB へ復元 → 検査 → 削除）、タスク登録 `ops\backup\register-restore-drill-task.ps1`（毎月） |
| タスク登録 | `ops\backup\register-backup-task.ps1`（管理者で実行、毎日 02:30） |
| ログ | `ops\logs\backup.log` / `ops\logs\restore.log` / `ops\logs\restore-drill.log`（5 MB でローテーション、5 世代） |
| 保存先 | `-Destination` → 環境変数 `KANFLOW_BACKUP_DIR` → 既定 `E:\KanflowBackup` |
| 二次保存先（**必須**） | `-SecondaryDestination` → `KANFLOW_BACKUP_SECONDARY_DIR`（環境変数 → `app\.env`）。NAS の UNC パス推奨（§1.1） |
| アラート | 失敗・警告は `Send-KanflowAlert`（[runbook.md §8](./runbook.md)） |

## 1. 何がバックアップされるか

1 回の実行で 1 つの「世代フォルダ」を作ります。

```
<保存先>\daily\kanflow-YYYYMMDD-HHmmss\
    db-scrum_tool.sql.gz   pg_dump --format=plain --no-owner --no-privileges（1 つのスナップショット。TimescaleDB のカタログ用スキーマは除外）
    private\               app\private 全体（uploads + templates）
    env\.env               app\.env（ACL: SYSTEM / Administrators / 実行ユーザーのみ）
    manifest.json          作成日時、ダンプの SHA-256、ファイル数、テーブル別行数、git commit
```

- 書き込み中は `<名前>.partial` で作成し、全工程成功時のみリネームします。`.partial` が残っていれば失敗した回です（1 日後に自動削除）。
- 曜日 `-WeeklyDay`（既定 日曜）の世代は `weekly\` にもコピーされます。
- 保持数: daily 14 世代、weekly 8 世代（`-DailyKeep` / `-WeeklyKeep`）。
- ダンプには `CREATE DATABASE` / `\connect` を含めていないため、**別名の DB にもリストアできます**（リストア訓練用）。
  完了の印は末尾の `-- PostgreSQL database dump complete`。復元は `DROP DATABASE ... WITH (FORCE)` → `CREATE DATABASE ...
  TEMPLATE template0 ENCODING 'UTF8' LOCALE_PROVIDER icu ICU_LOCALE 'und'` → `psql -v ON_ERROR_STOP=1`。
  `-UseRootCredential` で本番 DB を復元したときは、DB と全テーブルの所有者をアプリのユーザー（`DATABASE_USER`）へ戻します。
- 資格情報は実行時に `app\.env`（`DATABASE_*`、無ければ `DATABASE_URL`）から読み、ACL を絞った一時 PGPASSFILE 経由で pg_dump / psql に渡します（コマンド行にパスワードを出さない）。ログや画面には出しません。
- `pg_dump.exe` / `psql.exe` は `KANFLOW_PG_BIN`、無ければ `C:\Program Files\PostgreSQL\<版>\bin` から探します。

### 1.1 二次保存先（オフマシン、必須）

ローカル世代が完成した後、同じ世代を二次保存先へコピーします。

```
<二次保存先>\daily\kanflow-YYYYMMDD-HHmmss\     （weekly の世代は <二次保存先>\weekly\ にも）
```

1. `<名前>.partial` として robocopy（`/COPY:DATS` で `env\` の ACL を保持。NAS が ACL を受け付けない場合は ACL なしで再試行し WARN
   「env\.env there is protected only by the share/folder permissions」→ 共有のアクセス権を管理者に限定すること）
2. **検証**: ファイル数と合計バイト数がローカルと一致、コピー先のダンプの SHA-256 が manifest と一致
3. 検証に通ったものだけ正式名にリネーム
4. 二次保存先にも同じ保持数（daily `-DailyKeep` / weekly `-WeeklyKeep`）を適用。1 日以上前の `.partial` は削除

| 状態 | 動作 |
|------|------|
| 二次保存先が**未設定** | ローカルのバックアップは通常どおり実行（exit 0）。ただし**毎回** WARN とアラート `backup.secondary-missing` |
| コピー / 検証に失敗 | ローカル世代は有効のまま。ERROR、アラート `backup.secondary-failed`、**exit 3** |
| ローカル（非 UNC）ドライブを指定 | 動作するが「not off-machine」WARN（別ディスクでも同じ筐体なので火災・盗難・ランサムウェアに弱い） |
| 一次保存先と同じ / その配下 | 設定エラーとして失敗（exit 3） |

設定例（`app\.env`）:

```
KANFLOW_BACKUP_SECONDARY_DIR=\\NAS01\backup\kanflow
```

**SYSTEM は NAS に書けない**のが普通です（ネットワーク上はコンピューター アカウント）。二次保存先を NAS にするときは
`register-backup-task.ps1 -RunAsUser <書き込み権限のあるドメイン/サービス アカウント>` でタスクを登録してください（§2）。

### 保存先の注意（重要）

- **D: ドライブ以外**に置いてください。同じドライブの場合は `backup.log` に WARN が出ます（ディスク故障でデータとバックアップを同時に失うため）。
- `.env`（DB パスワード、認証シークレット）を含むため、保存先フォルダ自体のアクセス権も管理者限定にしてください。
- NAS（`\\nas\share\kanflow`）の場合: スケジュールタスクの既定アカウント SYSTEM はネットワーク上ではコンピューター アカウントとして認証されるため、通常 NAS に書けません。`-RunAsUser` で書き込み権限のあるドメイン/サービス アカウントを指定してタスクを登録してください。
- 空き容量チェック: `app\private` のサイズ ×1.2 + 1 GB 未満なら失敗（exit 1）します。

### 終了コード

| code | 意味 |
|------|------|
| 0 | 成功（WARN 付き成功もあり。ログ末尾が `finished WITH WARNINGS`。二次保存先未設定もここ） |
| 1 | バックアップ失敗（`BACKUP FAILED: ...` をログ参照、アラート `backup.failed`） |
| 2 | 設定エラー（.env が読めない、pg_dump が無い、保存先ドライブが無い 等、アラート `backup.config`） |
| 3 | ローカルは成功、**二次保存先へのコピー / 検証に失敗**（アラート `backup.secondary-failed`）。`deploy.ps1` はローカル世代で続行 |

タスク スケジューラの「前回の実行結果」が 0 以外なら失敗です。

## 2. 初回セットアップ（管理者）

```powershell
# 1. 手動で 1 回実行して動作確認（管理者でなくても可）
powershell -NoProfile -ExecutionPolicy Bypass -File D:\APP\Kanflow\ops\backup\backup-kanflow.ps1 -Destination E:\KanflowBackup
Get-Content D:\APP\Kanflow\ops\logs\backup.log -Tail 20

# 2. 毎日 02:30 のタスクを登録（管理者 PowerShell）
powershell -NoProfile -ExecutionPolicy Bypass -File D:\APP\Kanflow\ops\backup\register-backup-task.ps1 -Destination E:\KanflowBackup

# 二次保存先（NAS）付き（推奨。app\.env の KANFLOW_BACKUP_SECONDARY_DIR でも可）
powershell -NoProfile -ExecutionPolicy Bypass -File D:\APP\Kanflow\ops\backup\register-backup-task.ps1 -Destination E:\KanflowBackup -SecondaryDestination \\NAS01\backup\kanflow -RunAsUser YMMA\svc-kanflow

# 4. 毎月のリストア訓練タスク（§4.1）
powershell -NoProfile -ExecutionPolicy Bypass -File D:\APP\Kanflow\ops\backup\register-restore-drill-task.ps1

# 3. 確認
Get-ScheduledTaskInfo -TaskName KanflowBackup      # LastTaskResult 0 = OK
```

`-UseRootCredential` を付けると `root` + `D:\APP\Kanflow\.db-pw` で接続します（アプリユーザーに `--routines/--events` の権限が無い場合用。通常は不要）。

## 3. リストア

### 3.1 必ず DryRun から

```powershell
# 最新の daily 世代を検証（何も変更しない）
powershell -NoProfile -ExecutionPolicy Bypass -File D:\APP\Kanflow\ops\backup\restore-kanflow.ps1 -Latest -DryRun

# 世代を指定
powershell -NoProfile -ExecutionPolicy Bypass -File D:\APP\Kanflow\ops\backup\restore-kanflow.ps1 -BackupPath E:\KanflowBackup\daily\kanflow-20260923-023000 -DryRun
```

DryRun は manifest / SHA-256 / ダンプ末尾（`-- Dump completed`）を検証し、リストア計画と `app\private` との差分（robocopy `/L`）を表示するだけです。

### 3.2 本番リストア（管理者 PowerShell）

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File D:\APP\Kanflow\ops\backup\restore-kanflow.ps1 -BackupPath E:\KanflowBackup\daily\kanflow-20260923-023000
```

スクリプトの動作:

1. 対象 DB 名（例 `scrum_tool`）の**入力による確認**（`-Force` で省略可）
2. `kanflow.exe` サービスを停止し、ポート 3000 に残った node.exe も終了（`-NoServiceStop` で抑止）
3. 現在の DB を `ops\restore-safety\pre-restore-<db>-<日時>.sql.gz` に安全ダンプ（`-NoSafetyBackup` で抑止）
4. DB を DROP → CREATE（utf8mb4_unicode_ci）→ ダンプを取り込み
5. 現在の `app\private` を `app\private.pre-restore-<日時>` に退避し、バックアップからコピー
6. `-RestoreEnv` 指定時のみ `app\.env` を `.env.pre-restore-<日時>` に退避して復元
7. サービスを起動し、新しい PID の LISTEN と `/api/health` = 200 を確認
8. テーブル別行数を表示し、manifest の行数と比較

部分リストア: `-SkipDatabase`（ファイルのみ）/ `-SkipPrivate`（DB のみ）。

リストア後の確認:

- `http://127.0.0.1:3000/api/health` が `{"status":"ok","db":"ok",...}`
- ログインし、任意のプロジェクトで添付ファイルを 1 つ開く
- 問題なければ退避物（`app\private.pre-restore-*`, `ops\restore-safety\*.sql.gz`）を後日削除

### 3.3 リストアを取り消す

管理者 PowerShell で、サービスを止めてから実行します（パスワードは対話入力、画面に残りません）。

v2（PostgreSQL）の場合は 1) を次に置き換えます（`$safety` は同じ）:

```powershell
$pg = "C:\Program Files\PostgreSQL\16\bin"
Expand-GzipFile -Source $safety -Destination "$env:TEMP\kanflow-undo.sql"
& "$pg\psql.exe" -h 127.0.0.1 -U postgres -d postgres -c "DROP DATABASE scrum_tool WITH (FORCE)"
& "$pg\psql.exe" -h 127.0.0.1 -U postgres -d postgres -c "CREATE DATABASE scrum_tool OWNER scrum_app TEMPLATE template0 ENCODING 'UTF8' LOCALE_PROVIDER icu ICU_LOCALE 'und' LOCALE 'C.UTF-8'"
& "$pg\psql.exe" -h 127.0.0.1 -U scrum_app -d scrum_tool -v ON_ERROR_STOP=1 -f "$env:TEMP\kanflow-undo.sql"
Remove-Item "$env:TEMP\kanflow-undo.sql"
```

本番（MySQL、K2 まで）:

```powershell
Stop-Service kanflow.exe -Force        # 止まらない/ポートが残る場合は recover.bat の手順を参照
$mysql = "C:\Program Files\MySQL\MySQL Server 8.4\bin\mysql.exe"
$safety = "D:\APP\Kanflow\ops\restore-safety\pre-restore-scrum_tool-<日時>.sql.gz"

# 1) DB を空にして安全ダンプを取り込む
Import-Module D:\APP\Kanflow\ops\lib\KanflowOps.psm1
Expand-GzipFile -Source $safety -Destination "$env:TEMP\kanflow-undo.sql"
& $mysql -u root -p -e "DROP DATABASE scrum_tool; CREATE DATABASE scrum_tool CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
cmd /c "`"$mysql`" -u root -p --default-character-set=utf8mb4 scrum_tool < `"$env:TEMP\kanflow-undo.sql`""
Remove-Item "$env:TEMP\kanflow-undo.sql"

# 2) ファイルを戻す
Remove-Item D:\APP\Kanflow\app\private -Recurse -Force
Rename-Item D:\APP\Kanflow\app\private.pre-restore-<日時> private

Start-Service kanflow.exe
Invoke-RestMethod http://127.0.0.1:3000/api/health
```

## 4. リストア訓練

### 4.1 自動（毎月、`restore-drill.ps1`）

タスク `KanflowRestoreDrill`（既定: 毎月第 1 日曜 04:00、SYSTEM）が最新の daily 世代で次を行います。本番 DB・`app\private`・`app\.env` には触れません。

1. 世代の検証（manifest、ダンプ SHA-256、`private\` のファイル数 = manifest の `privateFiles`）
2. ダンプを展開し、`USE` / `CREATE DATABASE` を含むものは拒否（別 DB へ取り込まれる事故の防止）
3. 使い捨て DB **`<本番 DB 名>_drill`**（例 `scrum_tool_drill`）を DROP → CREATE → 取り込み（root + `.db-pw`）
4. 検査: manifest の全テーブルが存在、行数の差が `max(10 行, 1%)` 以内、manifest で行があるテーブルが空でない、
   `User` / `Project` / `_prisma_migrations` が空でない、テーブル数 = ダンプの `CREATE TABLE` 数
5. **drill DB を必ず DROP**（失敗時も。調査用に残すなら `-KeepDatabase`）
6. 結果: `ops\logs\restore-drill.log`、`ops\logs\restore-drill-last.json`（`ops\status.ps1` に表示）、
   アラート `restore-drill.failed`（Error）/ `restore-drill.ok`（Info、所要時間 = DB 部分の RTO 目安）

**本番保護**: drill DB 名は英数字と `_` のみ、`drill` を含む、`app\.env` の `DATABASE_NAME` と異なる、システムスキーマでない —
を破壊的な SQL の直前ごとに検査します（`Assert-KanflowDrillDatabaseName`）。

```powershell
# タスク登録（管理者。訓練自体は実行しない）
powershell -NoProfile -ExecutionPolicy Bypass -File D:\APP\Kanflow\ops\backup\register-restore-drill-task.ps1
# NAS の二次保存先で訓練する場合（SYSTEM は共有を読めないため -RunAsUser）
powershell -NoProfile -ExecutionPolicy Bypass -File D:\APP\Kanflow\ops\backup\register-restore-drill-task.ps1 -FromSecondary -RunAsUser YMMA\svc-kanflow

# 手動実行（管理者でなくても可、.db-pw を読める必要あり）
powershell -NoProfile -ExecutionPolicy Bypass -File D:\APP\Kanflow\ops\backup\restore-drill.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File D:\APP\Kanflow\ops\backup\restore-drill.ps1 -FromSecondary
```

終了コード: 0 = 合格、1 = 不合格（アラート済み）、2 = 設定エラー（`.db-pw` が無い、世代が無い 等）。
DB サーバーの空き容量は本番 DB と同程度を一時的に使います（本番 MySQL は datadir `D:\APP\Kanflow\mysql-data`）。

### 4.2 手動フルリストア訓練（四半期に 1 回・本番影響なし）

ファイル（`app\private`）も含めて確認する訓練です。本番 DB / ファイルには一切触れず、別 DB 名・別フォルダに復元して検証します。所要 10 分程度。

```powershell
# 管理者でなくても可。root 資格情報（.db-pw）で訓練用 DB を作成するため -UseRootCredential を付ける
$gen = (Get-ChildItem E:\KanflowBackup\daily -Directory | Sort-Object Name -Descending | Select-Object -First 1).FullName

# 1) 検証のみ
powershell -NoProfile -ExecutionPolicy Bypass -File D:\APP\Kanflow\ops\backup\restore-kanflow.ps1 -BackupPath $gen -DryRun -TargetDatabase kanflow_drill -PrivateTarget D:\KanflowDrill\private

# 2) 訓練リストア（サービス停止なし）
powershell -NoProfile -ExecutionPolicy Bypass -File D:\APP\Kanflow\ops\backup\restore-kanflow.ps1 -BackupPath $gen `
    -TargetDatabase kanflow_drill -PrivateTarget D:\KanflowDrill\private -NoServiceStop -UseRootCredential
```

チェックリスト（`ops\logs\restore.log` と画面出力で確認し、結果を記録）:

- [ ] `generation OK`（SHA-256 一致）
- [ ] `dump expanded and verified: N CREATE TABLE statements`（N が本番のテーブル数と一致）
- [ ] 行数比較が `row counts match the manifest`（バックアップ中に書き込みがあると数行の差は許容）
- [ ] `_prisma_migrations` の行数が `app\prisma\migrations` のフォルダ数と一致
- [ ] `D:\KanflowDrill\private` のファイル数が manifest の `privateFiles` と一致
- [ ] 所要時間（= 本番 RTO の目安）を記録

片付け:

```powershell
# 訓練用 DB の削除（v2 = PostgreSQL、スーパーユーザーで）
& "C:\Program Files\PostgreSQL\16\bin\psql.exe" -h 127.0.0.1 -U postgres -d postgres -c "DROP DATABASE kanflow_drill WITH (FORCE)"
# 本番（MySQL、K2 まで）
& "C:\Program Files\MySQL\MySQL Server 8.4\bin\mysql.exe" -u root -p -e "DROP DATABASE kanflow_drill;"
Remove-Item D:\KanflowDrill -Recurse -Force
```

## 5. トラブルシューティング

| 症状 | 対処 |
|------|------|
| `configuration error: pg_dump.exe / psql.exe not found` | PostgreSQL 16 以上のクライアントを入れ、`KANFLOW_PG_BIN` に bin フォルダを設定 |
| `pg_dump exited with code 1 ... permission denied` | アプリユーザーに権限不足 → `-UseRootCredential` を付けてタスク再登録（引数を手で追加） |
| `psql import exited with 3 ...` | 復元先の作成・取り込みの途中で失敗（`ON_ERROR_STOP`）。メッセージの文を確認。拡張（`citext` / `pg_trgm`）が作れない場合はスーパーユーザーで実行 |
| （本番 MySQL）`mysqldump.exe not found` / `Access denied ... EVENT/ROUTINE` | 本番のチェックアウトの MySQL 用スクリプトの事象: `KANFLOW_MYSQL_BIN` の設定 / `-UseRootCredential` |
| `not enough free space` | 保存先の容量確保、または `-DailyKeep` を減らす |
| `DESTINATION ... IS ON THE SAME DRIVE` WARN | 保存先を E: や NAS に変更 |
| NAS で `Access is denied` | `-RunAsUser` 付きでタスクを再登録 |
| 毎回 `backup.secondary-missing` アラート | `app\.env` に `KANFLOW_BACKUP_SECONDARY_DIR=\\NAS\share\kanflow` を設定（または `-SecondaryDestination` でタスク再登録） |
| exit 3 / `SECONDARY COPY FAILED` | タスク アカウントの共有への書き込み権限、NAS の空き容量、`ops\logs\backup-robocopy.log` を確認。ローカル世代は有効 |
| `restore-drill.failed` | `ops\logs\restore-drill.log` の `problem:` 行を確認。SHA-256 不一致 = 世代破損、行数差 = バックアップ中の書き込み（再実行で解消するか確認）、`.db-pw` 不在 = exit 2 |
| `drill database ... KEPT` / `scrum_tool_drill` が残っている | `-KeepDatabase` 実行後、または DROP 失敗。スーパーユーザーで `DROP DATABASE scrum_tool_drill WITH (FORCE);`（本番 MySQL は root で `DROP DATABASE scrum_tool_drill;`） |
| リストア後 `/api/health` が 503 | `KanflowMySQL` の状態、`app\.env` の DB 設定、デーモンログ（`ops\web\daemon\kanflow.err.log`、ラッパー移設前は `app\node_modules\next\dist\bin\daemon\kanflow.err.log`）を確認 |
