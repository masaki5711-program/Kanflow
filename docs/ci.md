# CI（GitHub Actions）

Kanflow の GitHub 上の CI は `.github/workflows/ci.yml`。`main` への push と、すべての
pull request で動く。作業ディレクトリは `app/`。Node は本番サーバーと同じメジャー版
（`25`、`.gitlab-ci.yml` の `NODE_VERSION` と同じ。`package.json` に `engines`、
リポジトリに `.nvmrc` は無い）。本番へのデプロイは今まで通り GitLab
（`.gitlab-ci.yml` の `deploy-production`）で、この CI はマージの関門だけを受け持つ。

## ジョブ

| ジョブ（チェック名） | 内容 |
|---|---|
| `typecheck + lint + unit tests` | `npm ci` → `npx prisma generate` → `npx tsc --noEmit` → `npx eslint .` → `npx vitest run`（DB テストは自分でスキップする）→ ワーカーのバンドルを作って `--dry-run` で起動を確認 |
| `migrations + DB tests (MySQL 8.4)` | MySQL 8.4 のサービスコンテナに `npx prisma migrate deploy`、`schema.prisma` と `prisma/migrations` のずれの確認（`prisma migrate diff --exit-code`、シャドウ DB は root で作る）、`KANFLOW_DB_TESTS=1 npx vitest run src/services/dev-work/__tests__/dev-work.db.test.ts` |
| `e2e (Playwright, smoke + write flows)` | MySQL 8.4 に移行を当て、E2E 用のユーザーを 1 人登録し、`npm run build` → `next start -p 3001` → `npx playwright install --with-deps chromium` → `npx playwright test e2e/smoke e2e/flows`。失敗したときはレポート・トレース・サーバーのログを成果物 `playwright-report` に保存 |

- 同じ PR の新しい push は実行中の CI を取り消す。`main` の実行は取り消さない。
- DB の接続情報はジョブの中だけで使う合成の値（`kanflow_ci` / `kanflow_ci`、root は
  `root_ci`）。シークレットは使わない。
- e2e の `AUTH_SECRET` と E2E ユーザーのパスワードは実行のたびに `openssl rand` で作り、
  ログには伏せ字で出る。E2E ユーザーは `e2e-ci@example.test`（role `member`、言語 `ja`）。
  write flow はこのユーザーで捨てるためのプロジェクトを作り、終わりに消す。
- サーバーは Ollama・Collabora・GitLab に頼らない設定で動かす
  （`AI_TRANSLATION_WORKER=off`、`AI_JOB_RUNNER=off`、`GIT_SYNC=off`、
  `WEB_DAILY_JOBS=off`、`COLLABORA_MONITOR=off`）。`/api/health` は Ollama が無いので
  503 を返すことがあるが、smoke テストは 200 と 503 の両方を受け入れる。

## CI で動かしていないもの（分かっている穴）

- `e2e/eval/*`（評価用の大きなスイート、79 ファイル）。Windows の `D:/APP/Kanflow-e2e/…`
  に書き出し、評価用 DB のプロジェクト ID（`PILOT`、`ZEVA`）と `e2e-*@example.test`
  の 5 人（admin / po / sm / dev / sec）を前提にしている。CI で動かすには、それらを作る
  シードと出力先の環境変数化が要る。
- 計画の「他の DB テスト」: 今ある実 DB のテストは `dev-work.db.test.ts` だけ。増えたら
  `db` ジョブの最後の手順に足す。
- `npm audit`（GitLab では `allow_failure`）は入れていない。
- 失敗したジョブを W11 の `report_failure` に送る処理（サービスアカウントのトークン）は
  まだ無い。
- ローカルでは Playwright のブラウザーのダウンロードが社内ネットワークで止められて
  いるが、GitHub のランナーでは `npx playwright install` が使える。

## 最初の実行で確かめること

- `next build --webpack` がこのランナー（Linux、Node 25）で通るか。本番は Windows。
- e2e の `next start` が 180 秒以内に `/login` を返すか。
- MySQL 8.4 の `caching_sha2_password` で `prisma migrate deploy` と MariaDB ドライバー
  （`allowPublicKeyRetrieval: true`）の両方がつながるか。

## ブランチ保護で必須にする

GitHub のリポジトリ設定 → Branches（または Rules → Rulesets）で `main` に規則を作り、
「Require status checks to pass before merging」を有効にして、次の 3 つを必須にする
（一度 CI が動いた後でないと候補に出ない）:

- `typecheck + lint + unit tests`
- `migrations + DB tests (MySQL 8.4)`
- `e2e (Playwright, smoke + write flows)`

あわせて「Require branches to be up to date before merging」と force-push の禁止を有効にする。
