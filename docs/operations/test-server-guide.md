# テストサーバー構築ガイド（Kanflow の部分のまとめ）

2026-11-01 時点の Kanflow（ブランチ `claude/brave-cray-w62c35`、コミット `23db573f14552f609ebae3270b1cde063fbf98a9`）を、
オンプレの**テストサーバー**へ入れる手順の要約。**詳細・全体図・GitStation 側・連携・確認チェックリストは次の 1 本にまとめてある**:

- GitStation リポジトリ `docs/deploy/test-server-guide.md`（`masaki5711-program/GitStation`、ブランチ `claude/brave-cray-w62c35`）。
  Kanflow の部分は同ガイドの §4、連携は §5、確認は §6、未実装・未検証は §7、「未確認」の一覧は §9。

本番の手順の正は今までどおり [deploy.md](./deploy.md)。**この文書とガイドはテストサーバー専用で、本番は変更しない。**

## 手順の要約

| # | 内容 | 根拠 |
|---|---|---|
| 1 | MySQL 8.4 に DB `scrum_tool`（utf8mb4 / utf8mb4_unicode_ci）とアプリ用ユーザーを作る。作成 SQL の公式な文面はリポジトリに無い（**未確認**） | [backup-restore.md](./backup-restore.md)、ルート `README.md` |
| 2 | `cd app && npm ci && npx prisma generate && cp .env.example .env`（値を埋める。**コミット禁止**） | `app/README.md`、`app/.env.example` |
| 3 | 必須の環境変数: `DATABASE_URL`、`DATABASE_HOST/PORT/USER/PASSWORD/NAME`、`AUTH_SECRET`（または `NEXTAUTH_SECRET`）、`WOPI_ACCESS_TOKEN`、`SURVEILLANCE_TOKEN`、外部ワーカーなら `INTERNAL_API_TOKEN`。`NEXTAUTH_URL` と `AUTH_TRUST_HOST=true` | `app/README.md`、`app/.env.example` |
| 4 | Ollama / Collabora / GitLab に頼らない最小構成: `AI_TRANSLATION_WORKER=off`、`AI_JOB_RUNNER=off`、`GIT_SYNC=off`、`WEB_DAILY_JOBS=off`、`COLLABORA_MONITOR=off` | `.github/workflows/ci.yml`（e2e ジョブ） |
| 5 | `npx prisma migrate deploy`（`db push` は使わない。59 本） → `npm run build` → `npm run build:worker` | `README.md`、`app/README.md` |
| 6 | 初期管理者を 1 件だけ手で INSERT（シードは無い）。合成のメール・パスワードを使う。Linux の MySQL は表名の大文字小文字を区別するので `` `User` `` | `README.md` 手順 4、`.github/workflows/ci.yml` |
| 7 | 起動: `npx next start -H 0.0.0.0 -p 3000`（Windows は `setup\install-kanflow-service.bat` でサービス化、再起動は `recover.bat`）。確認 `curl http://127.0.0.1:3000/api/health` | `app/README.md`、`README.md` |
| 8 | ワーカー（任意）: `node src/worker/service-entry.mjs --dry-run`、Windows は `node ops\worker\install-worker-service.js` | [worker.md](./worker.md) |
| 9 | Collabora（任意）: `docker-compose-collabora.yml`。**`aliasgroup2` に本番の実ホスト名が入っている**のでテストサーバーの URL に直し、`up -d --force-recreate` | `docker-compose-collabora.yml`、`start-collabora.bat` |
| 10 | MCP / REST: `/me` で `kfl_…` トークンを発行（スコープ ∩ プロジェクトの役割）。`curl -H "Authorization: Bearer kfl_…" https://<TEST_SERVER_HOST>/api/v1/me` が 200、`POST /api/mcp` の `tools/list` が 200。プロキシは `Authorization` を通し、本文 1 MiB 以上を許す | [mcp-setup-guide.md](../mcp-setup-guide.md)、[mcp.md](../mcp.md)、[api-v1.md](../api-v1.md)、[deploy.md](./deploy.md) §5e |
| 11 | テスト: `npx tsc --noEmit && npx eslint . && npx vitest run`。実 MySQL のテストは `KANFLOW_DB_TESTS=1 npx vitest run src/services/dev-work/__tests__/dev-work.db.test.ts`。E2E は**テスト用の別 DB**にだけ（`E2E_ALLOW_WRITE=1`、`E2E_USER`、`E2E_PASSWORD`） | `.github/workflows/ci.yml`、[../ci.md](../ci.md) |

## GitStation との連携の現状（重要）

- **機械的な連携はまだ無い。** Kanflow の Git 連携の取り込み元（`DevSource`）は `GitLabSource` だけで、`git_integration.provider` は `gitlab` 以外を拒否する
  （`GIT_PROVIDER_UNSUPPORTED`）。`GitStationSource` は M3 の予定 ([git-integration.md](./git-integration.md))。GitStation 側にも Webhook・イベント履歴 API は未実装。
- 明日つながるのは、**同じ利用者の Claude Code が Kanflow MCP（`kfl_` トークン）と GitStation の `gstn`（`fgp_` トークン）を両方使う**形と、
  ブランチ名・コミットの `PBI-<番号>` の規約まで。設定項目・トークンの置き場・通しの確認リストは GitStation のガイド §5。
- 機密 PBI（D-5）は `/api/v1` と MCP から見えない（[api-v1.md](../api-v1.md)「Confidential PBIs」）。

## 未検証（要注意）

実 MySQL のテストと E2E は未実行。GitHub Actions の CI も未実行（Linux/Node 25 で `next build --webpack` が通るか等が初回の確認事項: [../ci.md](../ci.md)）。
Linux での常駐化・watchdog・バックアップはリポジトリに無い（未確認）。詳しくは GitStation のガイド §7.2 と §9。
