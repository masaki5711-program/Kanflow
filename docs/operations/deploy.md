# Kanflow デプロイ / ロールバック手順（正式版）

**本番へのデプロイとロールバックはこの文書だけに従ってください。** runbook.md §4、worker.md、
app/README.md のデプロイ記述はすべてここを参照します。

- 本番: Windows 11 1 台、`D:\APP\Kanflow`、管理者 PowerShell で実行
- Web: サービス `kanflow.exe`（node-windows）→ `next start`（`app\.next`）
- ワーカー: サービス `kanflowworker.exe` → `app\src\worker\service-entry.mjs` → **ビルド済みバンドル** `app\.next\worker\main.cjs`
- DB: `KanflowMySQL`（MySQL 8.4）。スキーマ変更は `prisma migrate deploy` のみ（`db push` 禁止）

## 0. 仕組みと道具

| 道具 | 役割 |
|------|------|
| `ops\deploy\deploy.ps1 -Phase A\|B` | 事前チェック（**品質ゲート**含む）→ バックアップ → **読み取り専用**ドリフト確認 → `.next-new` へ Web + ワーカーをビルド → (マイグレーション) → 入れ替え → ヘルス検証 → 失敗時は自動ロールバック |
| `ops\quality\quality-gate.ps1` | `app\` で lint（`eslint src --quiet`）→ typecheck（`tsc --noEmit`）→ テスト + カバレッジ（`npm run test:coverage`、閾値 80%）。1 つでも失敗で exit 1 |
| `ops\deploy\swap-build.ps1` | `.next-new` → `.next` 入れ替え（ワーカー停止/再起動込み、自動ロールバック）。`-Rollback` で直前のビルド（`.next-prev`）へ戻す |
| `ops\deploy\node-modules-snapshot.ps1` | `node_modules` の退避 / 復元（Next.js アップグレード時） |
| `ops\web\migrate-service-wrapper.ps1` | Web サービスのラッパーを `node_modules` の外（`ops\web\daemon`）へ移設（検証 + 自動ロールバック） |
| `ops\status.ps1` | サービス / :3000 / `/api/health` / BUILD_ID / ワーカー心拍 / 翻訳滞留 / タスク / 最終バックアップ |

ビルドの単位: `next build` と `npm run build:worker` は**同じ** `NEXT_DIST_DIR` に出力し、ワーカーの
`BUILD_INFO.json` に Web の BUILD_ID が記録されます。`swap-build.ps1` は両者が一致しないと入れ替えません。
つまり Web とワーカーは常に同じビルドで動き、ロールバックも一緒に戻ります。
本番のワーカーは TypeScript ソースも tsx も読みません（編集途中の `src\` や `npm install` の影響を受けない）。

`deploy.ps1` の事前チェック: git 作業ツリーがクリーン、HEAD にタグ、`app\.env` がフェーズと整合、
`node_modules` が揃っている、MAINTENANCE フラグが無い、**品質ゲートが通る**。`-PreflightOnly` なら何も変更せずに終了します
（管理者権限不要。品質ゲートは `app\coverage\` とログを書くだけ）。

### 品質ゲート（`ops\quality\quality-gate.ps1`）

| 手順 | コマンド（`app\` で実行） | 失敗条件 |
|------|--------------------------|----------|
| lint | `npx eslint src --quiet` | エラー（警告は対象外） |
| typecheck | `npm run typecheck`（`tsc --noEmit`） | 型エラー |
| テスト + カバレッジ | `npm run test:coverage`（`vitest run --coverage`） | テスト失敗、またはカバレッジが `app\vitest.config.ts` の閾値（lines / functions / branches / statements 各 80%）未満 |

- 2026-09-30 時点: statements/lines 99.0%、branches 93.9%、functions 96.1%。所要 1 分弱。
- ログ: `ops\logs\quality-gate.log`（手順ごとの結果とカバレッジ）、`ops\logs\quality-gate-output.log`（直近の全出力）。
- 単独実行: `powershell -NoProfile -ExecutionPolicy Bypass -File D:\APP\Kanflow\ops\quality\quality-gate.ps1`
- **緊急時のみ** `deploy.ps1 ... -SkipQualityGate` で省略できます。省略は実行者・リビジョン付きで `deploy.log` に WARN として残ります。
- 同じ閾値は開発時の `npm run test:coverage` にも適用されます（`npm test` はカバレッジを取らないので影響なし）。

### アラート

`deploy.ps1` は事前チェック後の失敗（バックアップ、ビルド、マイグレーション、入れ替え）で `deploy.failed`、
入れ替え後の検証失敗による自動ロールバックで `deploy.rollback`、ワーカーが戻らない場合に `deploy.worker` を
`Send-KanflowAlert` で通知します（[runbook.md §8](./runbook.md)）。事前チェックでの中止は操作者が画面で見ているため通知しません。
バックアップが exit 3（ローカル成功・二次保存先コピー失敗、別途 `backup.secondary-failed` を通知）の場合は、
ローカル世代をロールバック基点として続行します。

## 1. 現状（2026-09-23 読み取り専用で確認）

| 項目 | 状態 |
|------|------|
| 配信中ビルド | `.next` BUILD_ID `fCz9JpgypA7hwt0EMblGl`（2026-09-11）。`/api/health` が無い古いビルド（404。watchdog は `/api/auth/csrf` で代替判定） |
| `.next-new` | 2026-09-14 の古い残骸（`deploy.ps1` が削除して作り直す） |
| Web ラッパー | 旧位置 `app\node_modules\next\dist\bin\daemon`（`npm ci` / next 更新で消える） |
| `AI_TRANSLATION_WORKER` | 未設定 = `external`。ワーカーサービス未導入、`INTERNAL_API_TOKEN` 未設定 → **このまま新ビルドを入れると翻訳が止まる**（Phase A の設定が必須） |
| Prisma | `prisma migrate status`: `20260923000000_baseline_drift` のみ未適用。`migrate diff`（DB → schema.prisma）: **差分なし** |

## 2. フェーズの順序

**Phase A**（新ビルド、翻訳は Web 内）→ **Phase C**（ラッパー移設 + Next.js セキュリティ更新）→ **Phase B**（別プロセスのワーカー）。
各フェーズの後に数日運用して問題が無いことを確かめてから次へ進みます。

### 共通の準備（各フェーズの前）

```powershell
cd D:\APP\Kanflow
git status                                   # クリーンであること
git tag deploy-20260924-a                    # デプロイするコミットにタグ
powershell -NoProfile -ExecutionPolicy Bypass -File ops\status.ps1
```

`app\.env` を変更する前に必ずコピーを取る: `Copy-Item app\.env app\.env.pre-deploy-<日付>`（git 管理外）。

---

## Phase A — 新ビルドを配信（翻訳は Web サービス内）

1. `app\.env` に追加（既存行があれば置換）:
   ```
   AI_TRANSLATION_WORKER=inprocess
   ```
2. 事前チェック（変更なし）:
   ```powershell
   powershell -NoProfile -ExecutionPolicy Bypass -File D:\APP\Kanflow\ops\deploy\deploy.ps1 -Phase A -PreflightOnly
   ```
   `baseline ... re-run with -ResolveBaseline` と出るのは想定どおり（§5）。
3. 本番（管理者、数分。停止時間は入れ替えの 30〜60 秒のみ）:
   ```powershell
   powershell -NoProfile -ExecutionPolicy Bypass -File D:\APP\Kanflow\ops\deploy\deploy.ps1 -Phase A -ResolveBaseline
   ```
   バックアップ先を変える場合は `-BackupDestination F:\KanflowBackup`。
4. 確認:
   - `ops\status.ps1` → `/api/health` 200、`build=` が新 BUILD_ID、`worker.expected=false`
   - 翻訳付きの項目を 1 件保存 → 数十秒で反対言語が入る（`translation backlog` が減る）
5. 一度だけ: watchdog / バックアップのタスクが未登録なら登録（README「本番サーバーの新規構築」6）。

失敗時: `deploy.ps1` が自動で `swap-build.ps1 -Rollback` を実行します。手動で戻す場合は §6。

---

## Phase C — Web ラッパー移設 + Next.js 16.1.6 → 16.3.3 以上

`next@16.1.6` には Windows 上の重大な RCE（**GHSA-p293-qw3h-jr36**）があります。16.3.3 以上へ上げます。
`npm ci` / next 更新は旧位置のラッパーを消すため、**先にラッパーを移設**します。

### C1. ラッパー移設（停止 約 1 分）

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File D:\APP\Kanflow\ops\web\migrate-service-wrapper.ps1 -DryRun
powershell -NoProfile -ExecutionPolicy Bypass -File D:\APP\Kanflow\ops\web\migrate-service-wrapper.ps1
```

旧ラッパーを `ops\backup\daemon-snapshot-<ts>\` に退避 → 停止 → 旧登録を削除 → `ops\web\daemon` に登録・起動 →
新 PID と `/api/health` を確認。失敗すると旧ラッパーを復元して再登録します（ログ `ops\logs\deploy.log`）。
確認: `ops\status.ps1` の `web service wrapper : ops\web\daemon`。ログは以後 `ops\web\daemon\kanflow.*.log`。

### C2. 開発機でアップグレード

```powershell
cd D:\APP\Kanflow\app
npm install next@^16.3.3 eslint-config-next@^16.3.3
npx tsc --noEmit; npx eslint src --quiet; npx vitest run
$env:NEXT_DIST_DIR=".next-verify"; npm run build; npm run build:worker; Remove-Item Env:NEXT_DIST_DIR
```

`package.json` と `package-lock.json` をコミットし、タグを付けます。

### C3. 本番（メンテナンス時間 10〜15 分。`node_modules` を入れ替えるためサービスを止めたまま行う）

```powershell
cd D:\APP\Kanflow
git pull; git checkout <タグ>
New-Item ops\watchdog\MAINTENANCE -ItemType File -Force
sc.exe stop kanflowworker.exe            # 未導入なら「サービスが存在しない」で問題なし
sc.exe stop kanflow.exe                  # 止まらなければ recover.bat の手順で孤児 node を終了
powershell -NoProfile -ExecutionPolicy Bypass -File ops\deploy\node-modules-snapshot.ps1 -Save
cd app; npm ci --no-audit --no-fund; cd ..
Remove-Item ops\watchdog\MAINTENANCE
powershell -NoProfile -ExecutionPolicy Bypass -File ops\deploy\deploy.ps1 -Phase A
```

`deploy.ps1` は停止中のサービスも正しく扱います（「適用前に健全でない」警告は想定どおり）。
確認: `ops\status.ps1`、`app\node_modules\next\package.json` の version ≥ 16.3.3。

**C3 のロールバック**（ビルドと `node_modules` を必ず一緒に戻す。旧ビルドは旧 next でしか動かない）:

```powershell
sc.exe stop kanflowworker.exe; sc.exe stop kanflow.exe
powershell -NoProfile -ExecutionPolicy Bypass -File D:\APP\Kanflow\ops\deploy\node-modules-snapshot.ps1 -Restore
powershell -NoProfile -ExecutionPolicy Bypass -File D:\APP\Kanflow\ops\deploy\swap-build.ps1 -Rollback
```

（`deploy.ps1` が既に自動ロールバックしていた場合は `-Rollback` は不要。`ops\status.ps1` の build を確認し、
`.next` が C3 以前の BUILD_ID なら `node-modules-snapshot.ps1 -Restore` の後 `recover.bat`。）

---

## Phase B — 翻訳を別プロセスのワーカーへ

1. `app\.env`（コピーを取ってから）:
   ```
   # AI_TRANSLATION_WORKER=inprocess   ← 削除またはコメントアウト（未設定 = external）
   INTERNAL_API_TOKEN=<node -e "console.log(require('crypto').randomBytes(32).toString('hex'))" の出力>
   # 任意（既定値）: WORKER_BUSINESS_HOURS=08:00-17:30 / WORKER_BUSINESS_DAYS=1-5 / WORKER_BUSINESS_HOURS_RATE=6
   ```
2. 事前チェック → 本番:
   ```powershell
   powershell -NoProfile -ExecutionPolicy Bypass -File D:\APP\Kanflow\ops\deploy\deploy.ps1 -Phase B -InstallWorker -PreflightOnly
   powershell -NoProfile -ExecutionPolicy Bypass -File D:\APP\Kanflow\ops\deploy\deploy.ps1 -Phase B -InstallWorker
   ```
   新ビルドの入れ替え（Web が新しい `.env` を読む）→ ワーカーサービス導入 → `/api/health` の
   `worker.status = ok`（心拍ファイル `app\logs\worker-heartbeat.json`）を確認します。
3. 旧 AI 監視タスクを削除（ワーカーが `SURVEILLANCE_SCHEDULE` 既定 06:30 で実行するため）:
   ```powershell
   Unregister-ScheduledTask -TaskName KanflowAiSurveillance -Confirm:$false
   ```
4. watchdog を再登録する必要はありません（同じスクリプトが `AI_TRANSLATION_WORKER=external` のとき
   `kanflowworker.exe` を監視し、停止中 / 心拍 stale なら 15 分に 1 回まで再起動します）。
5. 確認: `ops\status.ps1` → `worker heartbeat : ok`、`translation backlog` が減っていく。業務時間中は
   毎分 `WORKER_BUSINESS_HOURS_RATE` 件まで（`app\logs\worker-*.log` の `heartbeat` 行 `businessHoursUsed`）。

**Phase B のロールバック（Phase A 構成へ）**:

```powershell
cd D:\APP\Kanflow
node ops\worker\uninstall-worker-service.js
# app\.env: AI_TRANSLATION_WORKER=inprocess を戻す
recover.bat
```

### 業務時間スロットリングと Ollama の num_ctx（N7）

- 業務時間（既定 平日 08:00-17:30）はバックグラウンド翻訳を毎分 `WORKER_BUSINESS_HOURS_RATE`（既定 6）件までに制限します。
  `0` で業務時間中は停止、`WORKER_BUSINESS_HOURS=off` で無効。ユーザー操作の AI は制限しません。
- Ollama は BankMasalah と共有です。**リクエストごとの `num_ctx` が変わるとモデルが再ロード（8〜10 秒）**されます。
  `app\.env` の `OLLAMA_NUM_CTX`、`setup\start-ollama.bat` の `OLLAMA_CONTEXT_LENGTH`、BankMasalah 側の
  num_ctx を同じ値（現在 12288）に揃えてください。Web とワーカーは同じ `.env` を読むので Kanflow 内では常に一致します。

---

## 5. Prisma ベースライン（`20260923000000_baseline_drift`）

以前 `db push` で本番に直接入った変更（`Project.projectType`、`Sprint.retrospectiveMemo/reviewComment`、
`ProductBacklogItem.productGoalId` + FK/INDEX、`User.isActive/role`、`IceboxAttachment`、
`UserProjectCategory(Assignment)`、`SprintBacklogItem_pbItemId_fkey` の ON DELETE CASCADE）を
マイグレーション履歴に取り込むものです。本番 DB にはこれらが既にあるため、**SQL は流さず「適用済み」に記録**します。

2026-09-23 の読み取り専用確認結果:

- `npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script` → `-- This is an empty migration.`
  （schema.prisma に本番にある 2 つのインデックス `DailyScrumNote_archivedAt_idx`、
  `ProjectAttachment_folderId_sortOrder_idx` を `@@index` として追加した後）
- 使い捨て MySQL（コンテナ）をシャドウ DB にした `migrate diff --from-migrations prisma/migrations --to-schema prisma/schema.prisma`
  → ベースライン追加後は `-- This is an empty migration.`（CI の `prisma-migrate-check` も同じ確認）

本番での手順（`deploy.ps1 -ResolveBaseline` が自動で行う内容）:

```powershell
cd D:\APP\Kanflow\app
npx prisma migrate status                                                        # baseline だけが未適用であること
npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --exit-code   # 0 = 差分なし
npx prisma migrate resolve --applied 20260923000000_baseline_drift              # 差分なしのときだけ
```

- diff が差分ありを返す（exit 2）なら resolve しない: DB に一部しか無い状態です。`--script` の出力を確認し、
  バックアップ取得後に不足分だけを適用するか、`migrate deploy` で適用できるか判断します。
- 新規 / CI の空 DB では通常どおり `npx prisma migrate deploy` がこの SQL を実行します。
- resolve は `_prisma_migrations` への記録だけなので、ビルドのロールバックで戻す必要はありません。

## 5a. P2 マイグレーション後: 担当者の TaskAssignee バックフィル（`20261002000000_p2_collab_foundation`）

P2 のビルドはタスク担当者を `TaskAssignee`（userId）と旧 `SprintBacklogItem.assignee`（名前のカンマ区切り）の
**両方に書き込み**ます（旧列は当面残す）。マイグレーション適用前に作られたタスクには `TaskAssignee` が無いため、
`migrate deploy` でこのマイグレーションを適用した**後**に、一度だけバックフィルを流します。
未実行でもホームの「マイタスク」は旧文字列の完全一致名でフォールバックしますが、名前変更や表記揺れのあるタスクは拾えません。

```powershell
cd D:\APP\Kanflow\app
node --import tsx scripts/migrate-assignees.ts            # dry-run（既定）: 書き込みなし。計画件数と CSV を出力
# → logs\migrate-assignees-<ts>.csv を確認（reason = unmatched / ambiguous / non_member の行）
node --import tsx scripts/migrate-assignees.ts --apply    # 確認後に投入（冪等: 既存行はスキップ）
```

- CSV の行は**自動では割り当てられません**（あいまいな名前・未知の名前・プロジェクト外のユーザー）。
  必要ならスプリント画面で担当者を選び直してください（保存時に `TaskAssignee` へ書き込まれます）。
- 特定プロジェクトだけ試す: `--project <projectId>`。CSV の出力先を変える: `--report <file.csv>`。
- `--apply` の前にバックアップがあること（`deploy.ps1` はビルド前に取得済み）。旧 `assignee` 列は変更しません。
- ロールバック: ビルドを戻しても `TaskAssignee` 行は旧ビルドから参照されないだけで害はありません（削除不要）。

## 5b. P3 FULLTEXT 検索（`20261003010000_fulltext_search`）

横断検索（Ctrl+K / `GET /api/search`）とチャットツール `search_work_items` 用に、
`WITH PARSER ngram` の FULLTEXT インデックスを 7 本追加します（PBI / タスク / Icebox / プロジェクト名 /
プロダクトゴール / `field_translation`（JA↔ID の訳文）/ `Comment.body`）。データは変更しません。

- **順序**: `20261002000000_p2_collab_foundation`（`Comment` テーブル・`deletedAt` 列）の後。通常の
  `npx prisma migrate deploy` でまとめて適用されます。
- **ロック・時間**: 各テーブルの最初の FULLTEXT 追加は隠し列 `FTS_DOC_ID` を足すためテーブル再構築
  （`ALGORITHM=INPLACE, LOCK=SHARED`: 読み取り可、そのテーブルへの書き込みは完了まで待機）。
  2026-09-30 時点の件数（`field_translation` 約 1.6k 行 / 1.5 MB、他は 400 行未満）なら各文 1 秒未満です。
  メンテナンス時間内（サービス停止中）に流せば影響はありません。
- **ストップワード**: SQL の先頭で `SET SESSION innodb_ft_enable_stopword = OFF` にしてから作成します
  （ngram パーサーは既定リストの `a` / `i` を**含む** bigram をすべて捨てるため、インドネシア語・英語が
  ほぼ検索できなくなる）。**手で `mysql` から流す場合もファイル全体を 1 セッションで実行**してください。
  将来これらのテーブルを再構築する ALTER / `OPTIMIZE TABLE` も同じ SET SESSION を先に実行するのが安全です。
- **サーバー設定**: `ngram_token_size = 2`（既定、読み取り専用）。変更すると MySQL 再起動 + 全 FULLTEXT 再作成が必要で、
  アプリ側の `NGRAM_TOKEN_SIZE`（`app/src/lib/fulltext/boolean-query.ts`）も合わせる必要があります。
- **ドリフトチェック**: `schema.prisma` に同じ列・同じ名前の `@@fulltext([...], map: "ft_...")` を宣言済み
  （MySQL では GA、preview flag 不要）。Prisma はパーサーを扱わないので、適用後の
  `npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --exit-code` は 0（差分なし）のはずです。
  `DROP INDEX ft_...` を含む差分が出た場合はこのマイグレーションが未適用です。
- **アプリの切り替え**: `SEARCH_FULLTEXT`（既定 `on`）。インデックスが無い状態で FULLTEXT を使うと MySQL 1191 になり、
  アプリは自動で LIKE 検索に戻ります（ログ `search-fulltext` に 1 回だけ warn、10 分ごとに再試行）。
  マイグレーション前に新ビルドを出す場合や、結果に問題がある場合は `app\.env` に `SEARCH_FULLTEXT=off` を書いて再起動。
- **検索の挙動**: 語をスペース・記号で分割し全語 AND（`+語*`、BOOLEAN MODE、関連度順）。1 文字の語を含む検索、
  または FULLTEXT で 1 件も見つからない検索は従来の LIKE 部分一致で再検索します。権限（アクセス可能なプロジェクト）と
  ゴミ箱除外は従来どおり Prisma 側でも再適用します。
- **確認**（適用後、読み取りのみ）:

```powershell
# インデックスが 7 本（ft_*）、パーサーが ngram
mysql -u scrum_app -p scrum_tool -e "SELECT TABLE_NAME, INDEX_NAME FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND INDEX_TYPE='FULLTEXT' GROUP BY TABLE_NAME, INDEX_NAME"
mysql -u scrum_app -p scrum_tool -e "SHOW CREATE TABLE ProductBacklogItem\G" | findstr ngram
```

- **ロールバック**: ビルドを戻すだけなら不要（旧ビルドはインデックスを使わないだけ）。インデックスを消す場合は
  `migration.sql` 冒頭コメントの `DROP INDEX` 7 文。消したら schema.prisma の `@@fulltext` も外さないとドリフトチェックが差分を出します。

## 5c. P3 AI 拡張（`20261003000000_p3_ai`）

チャット履歴の保存、長時間 AI レポートのジョブ化、AI 監視しきい値のプロジェクト設定のためのマイグレーションです。
**純粋な追加**のみで、既存行は書き換えません。

| 追加 | 内容 |
|---|---|
| `Project.surveillanceSettings` | TEXT NULL（JSON）。NULL = 既定値（従来の固定しきい値と同じ）。MySQL 8.0.29+ では `ALGORITHM=INSTANT` |
| `ChatThread` / `ChatMessage` | チャット履歴。スレッドは作成者本人のみ閲覧可（管理者も不可）。論理削除 → 30 日後にワーカーが物理削除 |
| `AiJob` | バックグラウンド AI レポートのキュー。`activeKey` の UNIQUE で「プロジェクト×種類ごとに実行中 1 件」を保証 |

- **順序**: `20261002000000_p2_collab_foundation` の後、`20261003010000_fulltext_search` の前（互いに独立）。
  通常の `npx prisma migrate deploy` でまとめて適用されます。新テーブルは空なので数秒で終わります。
- **コードとの順序**: 新ビルドは `AiJob` をポーリングし、チャットでスレッドを保存します。**マイグレーションを先に適用**してください。
  未適用で新ビルドを出すと、ジョブランナーのポーリングが毎回失敗して `ai job tick failed` がログに出続け、
  チャットは動くが履歴は保存されず（`chat message not stored` の warn）、ダッシュボードの AI 進捗レポートは開始に失敗します。
- **ジョブの実行場所**: `AI_JOB_RUNNER`（既定 `auto` = `AI_TRANSLATION_WORKER` に従う）。Phase A（`inprocess`）では
  Web サービス内で、Phase B（`external`）ではワーカーで実行されます。どちらも無い（`off`）場合、進捗レポートは従来の
  ストリーミング表示にフォールバックします。詳細は [worker.md](./worker.md#ai-report-jobs-aijob)。
- **新しい env（すべて任意・既定値あり）**: `AI_JOB_RUNNER`, `AI_JOB_POLL_MS`, `AI_JOB_STALE_MS`, `AI_JOB_YIELD_MAX_MS`,
  `AI_JOB_RETENTION_DAYS`, `CHAT_RETENTION_DAYS`（180）, `CHAT_DELETED_RETENTION_DAYS`（30）, `SURVEILLANCE_MAX_INVESTIGATIONS`（3）。
- **ドリフトチェック**（適用後、読み取りのみ）:
  `npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --exit-code` → 0。
- **確認**（読み取りのみ）:

```powershell
mysql -u scrum_app -p scrum_tool -e "SHOW TABLES LIKE 'Chat%'; SHOW TABLES LIKE 'AiJob'; SHOW COLUMNS FROM Project LIKE 'surveillanceSettings'"
```

- **ロールバック**: ビルドを戻すだけなら不要（旧ビルドは新テーブル・新列を参照しないだけ）。消す場合は
  `migration.sql` 冒頭コメントの順（`ChatMessage` → `ChatThread` → `AiJob` → 列）で。消すと保存済みの履歴・ジョブは失われます。

## 5d. 全体計画の刷新（`20261004000000_plan_linkage`）

全体計画（PlanItem）の PBI 連動・依存関係・ベースライン・担当者・楽観ロック・ゴミ箱のためのマイグレーションです。
スキーマは追加のみですが、**既存データを 2 点書き換えます**（下記）。適用前に必ずバックアップを取ってください。

| 追加 | 内容 |
|---|---|
| `PlanItem.progressMode` | VARCHAR(16) DEFAULT `'manual'`（`manual` / `linked`） |
| `PlanItem.version` | INT DEFAULT 0（楽観ロック。PATCH / DELETE の `version` 不一致は 409 `VERSION_CONFLICT`） |
| `PlanItem.baselineStart` / `baselineEnd` | ベースライン日（NULL 可） |
| `PlanItem.ownerId` | 担当者（FK `User`、ユーザー削除時 NULL） |
| `PlanItem.deletedAt` / `deletedById` | ゴミ箱（配下ごと同じ `deletedAt`）。30 日後に purge-trash ジョブが物理削除 |
| `ProductBacklogItem.planItemId` | 紐付く計画項目（FK、項目の物理削除時 NULL）。1 PBI は最大 1 項目 |
| `PlanItemDependency` | 終了→開始の依存関係（両端 FK は CASCADE、`UNIQUE(predecessorId, successorId)`） |

**データの書き換え（元に戻せません）**

1. `PlanItem.status = 'delayed'` → `'in_progress'`。遅延は表示時に自動判定（`scheduleState`）するため、手動ステータス「遅延」は廃止しました。
   事前に件数を確認: `SELECT COUNT(*) FROM PlanItem WHERE status = 'delayed'`
2. 計画・実績日（`plannedStart` / `plannedEnd` / `actualStart` / `actualEnd`）のうち時刻部分を持つ行を**最も近い UTC 0 時**に丸めます
   （JST 0 時 = 前日 15:00 UTC で保存された行 → 翌日の 0:00）。0:00 の行は触りません（再実行しても同じ結果）。
   事前に件数を確認: `SELECT COUNT(*) FROM PlanItem WHERE TIME(plannedStart) <> '00:00:00' OR TIME(plannedEnd) <> '00:00:00'`

- **順序**: `20261003010000_fulltext_search` の後。通常の `npx prisma migrate deploy` でまとめて適用されます（PlanItem は小さい表なので数秒）。
- **コードとの順序**: 新ビルドは新列を読みます。**マイグレーションを先に適用**してください（未適用だと全体計画の画面・API・期限通知が失敗します）。
- **親項目の集計値**: 親の期間・進捗・ステータスは新しい規則（子の計画日数による加重平均など）で再計算されます。
  既存行は、全体計画を開いたとき（`GET /plan`、同一プロジェクトの書き込みは 60 秒に 1 回まで）と、
  毎日の期限通知ジョブの実行前（稼働中プロジェクトのみ）に自動で補正・保存されます。
  ダッシュボード・AI ツール・アーカイブ済みプロジェクトも含めて**すぐに**揃えるため、マイグレーション適用後に一度だけ下記のバックフィルを流してください。
- **マイグレーション後の手順: 集計値のバックフィル**（`scripts/heal-plan.ts`、`migrate deploy` の**後**・新ビルド起動の前後どちらでも可）:

```powershell
cd D:\APP\Kanflow\app
node --import tsx scripts/heal-plan.ts                    # dry-run（既定）: 書き込みなし。プロジェクトごとに変わる行と「旧 → 新」を表示
node --import tsx scripts/heal-plan.ts --apply            # 確認後に書き込み（冪等: 再実行しても差分 0 件）
node --import tsx scripts/heal-plan.ts --project <id>     # 特定プロジェクトだけ（dry-run / --apply と併用可）
```

  - 対象はゴミ箱以外の全プロジェクト（アーカイブ含む）で、ゴミ箱以外の計画項目を持つもの。書き込むのは `progressPct` / `status` /
    親の `plannedStart` / `plannedEnd` だけで、`version` は上げません（派生値のため。編集中の画面が 409 になることはありません）。
  - `[skipped]` = 計画項目が上限（2,000 行）に達したプロジェクト。`[failed]` = 書き込み失敗（他は継続、終了コード 1）。再実行で拾えます。
  - `--apply` の前にバックアップがあること（`deploy.ps1` はビルド前に取得済み）。
- **API 変更**: `GET /api/projects/:id/plan` の応答が配列から `{ items, dependencies, today }` に変わります（画面は同じビルドで対応済み）。
  `DELETE /plan/:itemId` はゴミ箱への移動になり `{ success, deletedCount }` を返します。
- **ドリフトチェック**（適用後、読み取りのみ）:
  `npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --exit-code` → 0。
- **確認**（読み取りのみ）:

```powershell
mysql -u scrum_app -p scrum_tool -e "SHOW COLUMNS FROM PlanItem; SHOW TABLES LIKE 'PlanItemDependency'; SHOW COLUMNS FROM ProductBacklogItem LIKE 'planItemId'; SELECT status, COUNT(*) FROM PlanItem GROUP BY status"
```

- **ロールバック**: ビルドを戻すだけなら列・表は残してかまいません（旧ビルドは新列を参照しない）。ただし旧ビルドはゴミ箱の計画項目
  （`deletedAt` あり）も表示してしまうため、戻す前にゴミ箱の計画項目を復元するか完全削除してください。`'delayed'` と時刻部分は復元できません。

## 5e. API トークンのスコープと Kanflow MCP（`20261030000000_api_token_scopes`）

書き込み API（`/api/v1` の POST / PATCH）と MCP サーバー（`/api/mcp`、Claude Code 用）を有効にするリリースです。
仕様: [../mcp.md](../mcp.md)、[../api-v1.md](../api-v1.md)。開発者向け手順: [../mcp-setup-guide.md](../mcp-setup-guide.md)。

- **マイグレーション**: `ApiToken.projectIds`（TEXT NULL）を 1 列追加するだけです。既存トークンは `NULL`（= 全プロジェクト）と
  既存のスコープ `["read"]` のままなので、挙動は変わりません。通常の `npx prisma migrate deploy` で適用されます（数秒）。
  - **コードとの順序**: 新ビルドは新列を読み書きします。**マイグレーションを先に適用**してください（未適用だとトークンの認証・発行・一覧が失敗し、`/api/v1` と `/api/mcp` がすべて 500 になります）。
  - 確認（読み取りのみ）: `mysql -u scrum_app -p scrum_tool -e "SHOW COLUMNS FROM ApiToken LIKE 'projectIds'"`
  - ロールバック: ビルドを戻すだけなら列は残してかまいません（旧ビルドは参照しない）。列を消す場合のみ `ALTER TABLE ApiToken DROP COLUMN projectIds`。
    旧ビルドに戻すと、プロジェクト限定のトークンで**全プロジェクトを読み取れる**状態になる点に注意してください（限定は新ビルドだけが強制します。旧ビルドに書き込み API はありません）。
    戻すときは限定付きトークン（`projectIds IS NOT NULL`）を失効させるか、`API_TOKENS_ENABLED=off` にしてください。
- **リバースプロキシ**（Kanflow の前段に置く場合。UI と同じ HTTPS の入口に載せ、UI より広く公開しない）:
  - `Authorization` ヘッダーをそのまま Kanflow へ渡す（削除・書き換えをしない）。認証は Bearer トークンのみで、Cookie は使いません。
  - `POST /api/mcp` を許可し、**本文 1 MiB まで**通す（Kanflow 側の上限が 1 MiB で、超えると Kanflow が JSON の 413 を返します。
    プロキシの上限はそれ以上にする。例: nginx `client_max_body_size 2m;`、IIS `requestFiltering` の `maxAllowedContentLength` ≥ 1048576）。
  - `application/json` / `text/event-stream` の応答を変換・バッファ加工しない。`GET` / `DELETE /api/mcp` は Kanflow が 405 を返すので、プロキシで塞ぐ必要はありません。
  - 開発者のセットアップスクリプトは **https の URL を要求**します（http はループバックのみ。`--allow-http` は暗号化なしの一時措置）。
    社内向けの HTTPS（証明書）を用意し、その URL を開発者に案内してください。
- **設定**（`app\.env`。すべて任意、既定値で動きます。変更はサービス再起動で反映）:

  | 変数 | 既定 | 内容 |
  |---|---|---|
  | `API_TOKENS_ENABLED` | `on` | `off` で `/api/v1`・`/api/mcp` が 403、トークン発行不可（緊急停止用） |
  | `API_V1_RATE_LIMIT_PER_MIN` | `120` | トークンごとのリクエスト数/分（MCP は HTTP リクエスト 1 回 = 1） |
  | `API_V1_WRITE_RATE_LIMIT_PER_MIN` | `30` | トークンごとの書き込み数/分（REST の POST / PATCH と MCP の書き込みツール。上の上限に加えて数える） |
  | `GIT_ALLOWED_HOSTS` | — | MCP の `resolve_project`（git remote URL → プロジェクト）が受け付ける GitLab ホスト |

- **再起動で消えるもの**: 冪等性の記録（`Idempotency-Key` と MCP 作成系の重複排除、最大 24 時間）とレート制限のカウンターは
  **Web プロセスのメモリ**にあり、再起動・デプロイで消えます。再起動をまたいだクライアントの再試行は、同じタスクやコメントを
  もう 1 件作ることがあります（データ破損ではありません。重複は画面から削除できます）。メンテナンスは利用の少ない時間帯に。
- **確認**（デプロイ後）:
  1. `/me` でトークン発行画面にスコープ・プリセット・プロジェクト選択が出ること。
  2. 発行したトークンで `curl -H "Authorization: Bearer kfl_…" https://<kanflow-host>/api/v1/me` → 200。
  3. MCP: `curl -X POST https://<kanflow-host>/api/mcp -H "Authorization: Bearer kfl_…" -H "Content-Type: application/json" -H "Accept: application/json, text/event-stream" -d "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"tools/list\",\"params\":{}}"`
     → 200 で 20 ツールの一覧。トークン無しで 401（プロキシ経由でも 401 の JSON が返ること = ヘッダーが渡っている）。
  4. 確認用トークンは `/me` で失効しておく。
- **ログ**: MCP の失敗は `module: "api-v1"`, `surface: "mcp"`, `tool`（DB エラーはクラス名と Prisma コードのみ）。
  トークンの発行・失効は `module: "api-tokens"`。管理者は `/admin/api-tokens` で全ユーザーのトークンを確認・失効できます。
- **E2E**（テスト DB のみ）: `E2E_ALLOW_WRITE=1` + `E2E_USER` / `E2E_PASSWORD` で `npx playwright test e2e/flows/mcp-flow.spec.ts`。

## 6. ロールバック

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File D:\APP\Kanflow\ops\deploy\swap-build.ps1 -Rollback -DryRun
powershell -NoProfile -ExecutionPolicy Bypass -File D:\APP\Kanflow\ops\deploy\swap-build.ps1 -Rollback
```

`.next` → `.next-rolledback-<ts>`（保存）、`.next-prev` → `.next`、Web とワーカーを再起動して検証します。
`-NewDir .next-prev` は拒否されます（以前はロールバック先を削除していた）。一度戻すと `.next-prev` は
無くなるので、さらに前へは戻れません（バックアップから）。

**データ・設定の注意（ビルドだけ戻しても戻らないもの）:**

1. **DB スキーマ**: `migrate deploy` 済みで旧ビルドと互換が無い場合は、デプロイ前のバックアップから DB を復元
   （[backup-restore.md](./backup-restore.md)）。`deploy.ps1` は必ずビルド前にバックアップを取ります。
2. **AI レポートの削除**: 2026-09 より前のビルドは起動時の `maintainAiReports()` で **3 日より古い AiReport を削除**します。
   その時代のビルドへ戻すと履歴が消えます。戻す前にバックアップがあることを確認し、可能なら戻さずに修正版を出してください。
3. **`app\.env`**: 戻すビルドに合った `.env` に戻す（`app\.env.pre-deploy-*` またはバックアップ世代内の `.env`）。
   特にワーカー導入前のビルドへ戻すときは、そのビルドが使っていた値（多くは `AI_TRANSLATION_WORKER` 未設定か `true`）に戻す。
   旧ビルドは `external` を知らず、翻訳が止まるか想定外の動作になり得ます。
4. **ワーカー**: ワーカーを含まないビルドへ戻すと `swap-build.ps1` は `kanflowworker.exe` を停止したままにします（exit 3）。
   そのまま使わないなら `node ops\worker\uninstall-worker-service.js`。止めずに旧ビルドと新ワーカーを混在させないこと。
5. **`node_modules`**: Phase C をまたいで戻すときは §C3 のロールバック（`node-modules-snapshot.ps1 -Restore`）が必須。

## 7. 単一インスタンスロック（N8）

ワーカーは `GET_LOCK('kanflow_worker')` を **専用の mariadb 接続**（`DATABASE_*`、無ければ `DATABASE_URL`）で保持します。
以前は Prisma のプール接続上の長時間トランザクションで保持しており、アプリのプール（5 本）を 1 本占有し、
トランザクションのタイムアウト（2e9 ms ≒ **23 日**）で強制的に切断・再起動していました。現在はその 23 日ごとの
再接続はありません。心拍（60 秒ごと）の `IS_USED_LOCK(...) = CONNECTION_ID()` 確認が MySQL の `wait_timeout`（8 時間）
より十分短い間隔で接続を使うため切断されず、万一切れた場合は `verify` が false → ワーカーが exit 1 →
サービスが再起動してロックを取り直します（数十秒の中断のみ）。

## 8. 状態確認・ログ

| 何を | どこ |
|------|------|
| 総合 | `ops\status.ps1`（`-Json` あり、Web 異常なら exit 1） |
| デプロイ / 入れ替え / 移設 | `ops\logs\deploy.log`、ビルド出力 `ops\logs\deploy-build-<ts>.log` |
| Web サービス | `ops\web\daemon\kanflow.{out,err,wrapper}.log`（移設前: `app\node_modules\next\dist\bin\daemon\`） |
| ワーカー | `app\logs\worker-YYYY-MM-DD.log`、`app\logs\worker-heartbeat.json`、`ops\worker\daemon\kanflowworker.*.log` |
| watchdog | `ops\logs\watchdog.log` |

daemon ログ（Web 新旧両方 + ワーカー）は watchdog 実行ごとに 10 MB 超でローテーションされます。
