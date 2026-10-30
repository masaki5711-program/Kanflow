# Kanflow

<div align="center">
  <img src="app/public/logo.svg" alt="Kanflow Logo" width="80" height="80">
  <h3>Agile Project Management Tool</h3>
  <p>IceBox → Product Backlog → Sprint → Release のライフサイクルを Web アプリで一元管理（社内 1 台サーバー運用）</p>
</div>

---

## 機能概要

| 領域 | 主な機能 |
|------|----------|
| コア | ダッシュボード（プロダクトゴール、ファイル管理、進捗）、IceBox、プロダクトバックログ、スプリント（タスク、キャパシティ、デイリースクラム、KPT）、リリース管理、プラン |
| 可視化 | ガントチャート、カレンダー（月/週/チーム）、バーンダウン、レポート（PDF 印刷） |
| プロジェクト | マルチプロジェクト、セクション/カテゴリ、PO / SM / Dev ロール、メンバー管理 |
| ドキュメント | Collabora Online による Office 文書のブラウザ編集（WOPI） |
| ローカル AI（Ollama） | チャット/分析ツール、PBI 下書き生成、JA/ID 自動翻訳（用語集つき）、AI 監視レポート |
| 多言語 | 日本語 / English / Bahasa Indonesia |
| セキュリティ | Auth.js v5 (JWT, Credentials)、ロールベース権限、Zod 入力検証、CSP 等のセキュリティヘッダー、アップロードの MIME + マジックバイト検証 |

詳細仕様: [SPECIFICATION.md](SPECIFICATION.md)

### Claude Code から使う（Kanflow MCP）

Kanflow 本体の `/api/mcp`（MCP サーバー）と `/api/v1`（REST API）に、マイページ（`/me`）で発行する個人アクセストークンで接続できます。
Claude Code から PBI・受入条件・担当タスクを読み、タスク更新・コメント・デイリースクラムなどを**本人の権限のまま**行えます
（変更履歴には「MCP 経由（AI）」と表示）。

- 開発者向けセットアップ: [docs/mcp-setup-guide.md](docs/mcp-setup-guide.md)
- 仕様（ツール一覧・エラー・冪等性）: [docs/mcp.md](docs/mcp.md)、REST API: [docs/api-v1.md](docs/api-v1.md)
- デプロイ時の注意（マイグレーション・リバースプロキシ・レート制限）: [docs/operations/deploy.md](docs/operations/deploy.md) §5e

## 技術スタック（本番の実態）

| レイヤー | 技術 |
|---------|------|
| アプリ | Next.js 16（`next build --webpack` / `next start`）、React 19、TypeScript、Tailwind CSS 4 |
| ORM | Prisma 7（`@prisma/adapter-mariadb`、マイグレーション: `prisma/migrations`） |
| DB | **MySQL 8.4 ネイティブ**（Windows サービス `KanflowMySQL`, 127.0.0.1:3306） |
| 常駐 | **node-windows サービス `kanflow.exe`**（表示名 "Kanflow"、LocalSystem、ポート 3000） |
| 文書編集 | Collabora Online コンテナ（Rancher Desktop / dockerd, :9980） |
| AI | Ollama（:11434, 既定モデル `qwen3.8:27b-q4_K_M`） |
| 運用 | `ops\`（バックアップ/リストア、watchdog、AI 監視実行、デプロイ入れ替え、ログローテーション） |

Docker Compose で MySQL まで動かす旧構成と PM2 / スケジュールタスク起動は廃止し、`legacy\` に移動しました。

## ディレクトリ

```
Kanflow/
├── app/                        Next.js アプリ（README: app/README.md）
│   ├── prisma/                 schema.prisma + migrations/
│   ├── src/                    app/ (画面 + API), lib/, components/
│   ├── private/                アップロード / テンプレート（git 管理外, バックアップ対象）
│   ├── setup-windows-service.js / uninstall-windows-service.js   node-windows サービス登録
│   └── .env.example            環境変数テンプレート（全変数を記載）
├── ops/
│   ├── backup/                 backup-kanflow.ps1, restore-kanflow.ps1, register-backup-task.ps1
│   ├── watchdog/               watchdog-kanflow.ps1, recover-kanflow.ps1, register-watchdog-task.ps1
│   ├── surveillance/           run-ai-surveillance.(bat|ps1), register-surveillance-task.ps1
│   ├── deploy/                 deploy.ps1（正式デプロイ: -Phase A / B）、swap-build.ps1（入れ替え / -Rollback）、node-modules-snapshot.ps1
│   ├── web/                    migrate-service-wrapper.ps1、daemon/（kanflow.exe ラッパー + ログ, git 管理外）
│   ├── worker/                 install-/uninstall-worker-service.js、daemon/（kanflowworker.exe ラッパー + ログ）
│   ├── status.ps1              サービス / ヘルス / ワーカー心拍 / 翻訳滞留 / 最終バックアップを一覧
│   ├── lib/  logs/             共通 PowerShell モジュール、ログ（*.log は git 管理外）
├── setup/                      初期セットアップ用 .bat（管理者で実行）
├── docs/operations/            deploy.md（デプロイ / ロールバックの唯一の正式手順）, runbook.md, worker.md, backup-restore.md
├── demo/                       AI モニター（デモ用コンソール）
├── legacy/                     旧構成（docker / pm2 / schtasks）— 使用しない
├── recover.bat                 手動復旧（堅牢な再起動 + 状態表示）
├── watchdog-kanflow.bat        watchdog の薄いラッパー
├── start-collabora.bat         Collabora 起動
├── docker-compose-collabora.yml / collabora-coolwsd.xml
└── mysql-data/                 MySQL datadir + my.ini（git 管理外）
```

## 本番サーバーの新規構築

前提: Windows 11、Node.js（現行サーバーは v25）、MySQL 8.4 Server、Rancher Desktop（Collabora 用）、Ollama。
社内ネットワークでは `registry.npmjs.org` が遮断されているため npm は `https://registry.yarnpkg.com/` を使用します
（`npm config set registry https://registry.yarnpkg.com/`）。

1. **MySQL**: `mysql-data\my.ini`（datadir `D:/APP/Kanflow/mysql-data/data`）で初期化し、`setup\install-services.bat`（管理者）で `KanflowMySQL` サービス登録。DB `scrum_tool` とアプリユーザーを作成。
2. **環境変数**: `copy app\.env.example app\.env` して値を設定（秘密値は各自生成。コミット禁止）。
3. **アプリ**:
   ```powershell
   cd D:\APP\Kanflow\app
   npm install
   npx prisma generate
   npx prisma migrate deploy          # スキーマは必ず migrate deploy（db push は使わない）
   npm run build
   npm run build:worker               # ワーカー サービス用バンドル（.next\worker\main.cjs）
   ```
4. **初期管理者**（シードはありません。パスワードは自分で決める）:
   ```powershell
   cd D:\APP\Kanflow\app
   $hash = node -e "process.stdout.write(require('bcryptjs').hashSync(process.argv[1], 12))" "<強いパスワード>"
   & "C:\Program Files\MySQL\MySQL Server 8.4\bin\mysql.exe" -u root -p scrum_tool -e "INSERT INTO user (id,name,email,password,role,isActive,language,createdAt,updatedAt) VALUES ('bootstrap-admin','Admin','admin@example.local','$hash','admin',1,'ja',NOW(3),NOW(3));"
   ```
   ログイン後、画面からパスワードを変更し、以降のユーザーは管理画面で作成します。
5. **サービス化**: `setup\install-kanflow-service.bat`（管理者）→ サービス `kanflow.exe` が登録・起動されます（ラッパーは `ops\web\daemon\`）。
   翻訳ワーカーを別プロセスで動かす場合は `node ops\worker\install-worker-service.js`（[docs/operations/deploy.md](docs/operations/deploy.md) Phase B）。
6. **監視・バックアップ・AI 監視**（管理者 PowerShell）:
   ```powershell
   powershell -NoProfile -ExecutionPolicy Bypass -File D:\APP\Kanflow\ops\watchdog\register-watchdog-task.ps1
   powershell -NoProfile -ExecutionPolicy Bypass -File D:\APP\Kanflow\ops\backup\register-backup-task.ps1 -Destination E:\KanflowBackup
   powershell -NoProfile -ExecutionPolicy Bypass -File D:\APP\Kanflow\ops\surveillance\register-surveillance-task.ps1
   ```
7. **Collabora**: ルートの `.env` に `COLLABORA_ADMIN_PASSWORD` を設定し `start-collabora.bat`。
8. 確認: `http://127.0.0.1:3000/api/health` → `{"status":"ok","db":"ok",...}`

## 日常運用（要点）

| やりたいこと | 方法 |
|--------------|------|
| 状態確認 | `powershell -File ops\status.ps1`（サービス / ヘルス / ワーカー心拍 / 翻訳滞留 / バックアップ）、`recover.bat /status`、`/api/health` |
| 再起動 / 障害復旧 | `recover.bat`（孤児プロセスが :3000 を掴む既知問題に対応済み。`Restart-Service` 直接は避ける） |
| デプロイ / ロールバック | [docs/operations/deploy.md](docs/operations/deploy.md) のみに従う（`ops\deploy\deploy.ps1 -Phase A` / `-Phase B`、戻す: `ops\deploy\swap-build.ps1 -Rollback`） |
| watchdog を一時停止 | `ops\watchdog\MAINTENANCE` ファイルを作成（6 時間で自動失効） |
| バックアップ / リストア | [docs/operations/backup-restore.md](docs/operations/backup-restore.md) |
| Collabora 設定反映 | `docker compose -f docker-compose-collabora.yml up -d --force-recreate`（restart では環境変数が反映されない） |

詳細: [docs/operations/runbook.md](docs/operations/runbook.md)

## 開発

```powershell
cd app
npm install
npx prisma generate
npm run dev            # http://localhost:3000 （本番と同じ DB を使う場合は -p 3001 等で別ポートに）
npm run typecheck
npm run lint
npm test
```

CI: `.gitlab-ci.yml`（lint / typecheck / test / npm audit / Prisma マイグレーションのドリフト検出）。

## 権限モデル

| 操作 | PO | SM | Dev |
|------|:--:|:--:|:---:|
| IceBox 新規追加 | ✓ | ✓ | ✓ |
| IceBox ステータス変更 | ✓ | - | - |
| バックログ 編集・並び替え | ✓ | - | - |
| スプリント 作成 | ✓ | ✓ | - |
| スプリント タスク更新 | ✓ | ✓ | ✓ |
| リリース管理・インポート | ✓ | - | - |
| プロジェクト 作成・編集 | ✓ | ✓ | - |
| メンバー 招待 | ✓ | ✓ | - |

システムロール `admin` はユーザー作成・編集・無効化・パスワードリセットが可能です。

## トラブルシューティング

| 症状 | 対策 |
|------|------|
| サービス再起動後に 1067 で停止、err ログに `EADDRINUSE` | 旧 `next start` がポート 3000 を保持 → `recover.bat` |
| `/api/health` が 503（db: error） | `Get-Service KanflowMySQL`、`app\.env` の `DATABASE_*`、`mysql-logs\error.log` |
| `ER_CANNOT_RETRIEVE_RSA_KEY` / pool timeout | `src/lib/prisma.ts` の `allowPublicKeyRetrieval: true` を確認（MySQL 8.4 の caching_sha2） |
| 「認識されていない WOPI ホストです」 | Collabora を `--force-recreate`（aliasgroup がホスト名と一致しているか） |
| AI 応答が極端に遅い | Ollama を `setup\start-ollama.bat` で起動し直す（`OLLAMA_NUM_CTX` と `OLLAMA_CONTEXT_LENGTH` を一致させる） |
| `npm install` 後にサービスが起動しない | 旧構成ではラッパーが `node_modules\next\dist\bin\daemon` にあり消える → `setup\install-kanflow-service.bat`（ラッパーを `ops\web\daemon` へ移行）。移行後は発生しません |
| 翻訳が `pending` のまま | `ops\status.ps1` の worker / translation backlog。`AI_TRANSLATION_WORKER=external` なら `sc query kanflowworker.exe`（[worker.md](docs/operations/worker.md)） |

## ライセンス

社内専用ツール — YAMAHA Group
