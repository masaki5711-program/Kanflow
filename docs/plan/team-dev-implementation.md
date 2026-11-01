# Kanflow 側の詳細実装（複数人のバイブコーディングと GitStation 連携）

作成: 2026-10-31（クラウドのセッション）。正の計画は GitStation の `docs/plan/07-team-vibe-coding.md`（W1〜W11）と `docs/plan/02-kanflow-integration.md`、`06-ai-driven-dev-environment.md`。全体像の図は GitStation の `docs/overview/gitstation-kanflow-overview.pdf`。この文書は、そのうち **Kanflow のリポジトリで作るもの** を、実装できる粒度で書く。

## 0. 前提（2026-10-31 時点で済んでいるもの）

| 項目 | 状態 | 場所 |
|---|---|---|
| MCP サーバー `/api/mcp`（25 の道具）、`/api/v1`、API トークンとスコープ | 済み | `app/src/app/api/mcp/`、`app/src/app/api/v1/`、`app/src/lib/api-tokens/` |
| K1 PBI 番号の検出 | 済み | `app/src/lib/git/pbi-keys.ts` |
| K2/K3 一覧ごとの同期の位置、消えたブランチ、過去 90 日の再同期 | 済み | `app/src/services/git/git-sync*.ts`、`…/repositories/[repoId]/resync` |
| K4 取り込み元の層 `DevSource`、`GitIntegration.provider` | 済み | `app/src/services/git/dev-source.ts`、`gitlab-source.ts`、`git-provider.ts` |
| K5 `dev:write`（作業の宣言・進捗・MR のリンク） | 済み | `app/src/services/dev-work/`、`/api/v1/projects/:projectId/dev/*`、`mcp/_lib/dev-tools.ts` |
| 未検証 | **実際の DB（今は MySQL 8.4）での DB テスト（`KANFLOW_DB_TESTS=1`）と Playwright の E2E** | W2 で CI に入れる |

## 1. W2 CI（最優先）

- `.github/workflows/ci.yml`（GitStation の CI ができたら移す）:
  1. `npm ci`、`npx prisma generate`
  2. `npx tsc --noEmit`、`npx eslint .`
  3. `npx vitest run`
  4. **本番と同じ DB のサービスコンテナ**（今は MySQL 8.4、PostgreSQL への移行の後は PostgreSQL）→ `npx prisma migrate deploy` → `KANFLOW_DB_TESTS=1 npx vitest run src/services/dev-work/__tests__/dev-work.db.test.ts` と他の DB テスト
  5. Playwright（`npx playwright install --with-deps chromium` は CI だけ）→ `npx playwright test`
- 失敗したジョブは W11 の `report_failure` に送る（サービスアカウントのトークン）。
- 完了の条件: main への PR は CI が緑でないとマージできない（ブランチ保護）。

## 2. W3 作業中の見える化

- **ボード（スプリントの画面）**: タスクのカードに、宣言中の人・ブランチ・最後の生存確認からの時間を出す。失効が近い（残り 30 分）ものは薄い色、失効したものは「失効」。
- **PBI の画面**: 「作業中」のパネル（宣言の一覧、触る範囲（W4）、MR のリンク）。
- データは既存の `work_claim`。新しい API は不要（`GET /api/v1/projects/:projectId/dev/claims` を画面からも使う）。画面用の取得は 1 スプリント 1 回の問い合わせにまとめる（N+1 にしない）。
- i18n（ja / en / id）、`i18n-completeness` のテストに足す。
- 完了の条件: 2 人 + 2 つの AI が同じスプリントで作業し、ボードで全員の作業が見える。
- 実装メモ（2026-11-01）: `/api/v1` はトークン専用（セッションの cookie を見ない）ので、画面用にセッションの双子 `GET /api/projects/:projectId/dev/claims?sprintId= | ?pbi=`（project.view、セッション ID は返さない、`canModerate` = sprint.manage）と `POST …/dev/claims/:claimId/release`（sprint.manage）を足した。サービスは同じ `dev-work`（`listBoardClaims`、スプリントは 1 回の問い合わせ `findOpenClaimsOfSprint`）。画面は `components/work-claims/`、文言は `lib/i18n/work-claims.ts`。

## 3. W4 触る範囲の宣言

- **モデル** `work_claim_scope`（新しいマイグレーション、追記のみ）:
  `id`、`claimId`（FK、ON DELETE CASCADE）、`kind`（`path` / `module`）、`value`（正規化した相対パス・モジュール名、最大 300 文字）、`createdAt`。宣言ごとに最大 200 件。
- **API**: `PUT /api/v1/projects/:projectId/dev/claims/:claimId/scope`（全体を置き換え、`dev:write`、本人だけ）。MCP `declare_scope`。
- **重なりの判定**（サービスの純粋な関数で、テストしやすく）: パスの前方一致（ディレクトリの境界で）とモジュールの一致。重なった相手の宣言（人・ブランチ・重なったパス）を返す。止めない（警告）。
- **push の時の照合**: Git の同期（`git-sync`）で読んだ MR の変更ファイルと、宣言の範囲を比べ、範囲の外を触っていれば PBI のパネルに「範囲の外の変更」を出す。
- 完了の条件: 並行する MR の衝突による手戻りが MR 10 件あたり 1 件以下（§8 の指標で測る）。

## 4. W5 受入基準の ID

- **モデル**: `acceptance_criterion`（`id`、`pbiId`、`seq`（PBI の中で増えるだけ・再利用しない）、`given`、`when`、`then`、`text`、`deletedAt`、監査の列）。表示の ID は `PBI-<n>/AC-<seq>`。編集しても `seq` は変わらない。既存の受入基準の本文は、移行のスクリプトで項目に分ける（分けられないものは 1 項目）。
- **API / MCP**: `get_pbi` の返り値に AC の配列（ID 付き）。PO/SM は `backlog:write` で AC の追加・編集・削除（論理削除）。
- **AC の対応表**: Git の同期で MR の説明とテストの結果（W8 以降は GitStation から）を読み、`PBI-12/AC-2` の記載から「AC → テスト → 結果」を作る。PBI の画面に表を出す。対応するテストのない AC は警告。
- **完了の候補**: すべての AC が緑の MR がマージされたら、PBI に「完了の候補」を出す（確定は PO）。
- 完了の条件: AI が残りの AC を `get_pbi` だけで判断できる。

## 5. W11 フィードバックの輪（Kanflow のサーバーの機能）

エージェントモデルの手元にある記録（mistake-memory）と処理を、Kanflow に移す。エージェントモデルは送るだけの窓口になる。

### 5.1 モデル（新しいマイグレーション）

| 表 | 主な列 |
|---|---|
| `failure_event` | `id`、`projectId`（null 可 = プロジェクト外）、`source`（`agent` / `ci` / `gitstation` / `manual`）、`signature`（正規化した署名のハッシュ）、`signatureText`（伏せ字済みの定型部分）、`tool`、`errorCode`（`FG-…` など）、`excerpt`（伏せ字済み、最大 4 KB）、`sessionRef`、`branch`、`createdAt`、`reportedById` |
| `lesson` | `id`、`signature`、`scope`（`global` / `tech:<名>` / `project:<id>`）、`state`（`draft` / `confirmed` / `systemized` / `retired`）、`symptom`、`cause`、`fix`、`verify`（コマンド）、`evidence`（MR・コミット・障害へのリンクの配列）、`errorCode`、`confidential`（bool）、`hits`、`resolvedCount`、`lastSeenAt`、`confirmedById`、`systemizedRef`（PBI・ゲート・テストへのリンク）、監査の列 |
| `lesson_resolution` | `failureEventId`、`lessonId`、`diffSummary`（伏せ字済み）、`verifiedCommand`、`createdAt` |

インデックス: `failure_event(signature, createdAt)`、`lesson(signature)` は一意（`scope` ごと）。

### 5.2 署名の作り方（サーバーで一律）

`app/src/services/feedback/signature.ts` の純粋な関数:
1. 伏せ字（§5.5）
2. 正規化: 絶対パス → `<path>`、数値・16 進・UUID・時刻 → `<n>` / `<hex>` / `<uuid>` / `<ts>`、行番号を除く、空白をまとめる、最初の意味のある 3 行に絞る
3. `tool` + `errorCode` + 正規化した文の SHA-256

同じ入力に同じ署名を返すことを、テストのベクタ（`__tests__/signature.vectors.json`）で固定する。

### 5.3 API と MCP

| API | MCP | 権限 | 動き |
|---|---|---|---|
| `POST /api/v1/feedback/failures` | `report_failure` | `dev:write`（CI はサービスアカウント） | 失敗を記録し、確認済みの教訓（`confirmed` / `systemized`、機密でないもの、範囲が合うもの）を最大 3 件返す。3 秒以内に答える |
| `POST /api/v1/feedback/resolutions` | `report_resolution` | `dev:write` | 同じ `sessionRef` の直前の失敗に、解決（差分の要約・確かめたコマンド）を結び付け、`draft` の教訓を作るか回数を足す |
| `GET /api/v1/feedback/lessons` | `search_lessons` | `read` | 署名・文・技術・プロジェクトで検索 |
| `POST /api/v1/feedback/lessons/:id/confirm`、`/retire`、`/systemize` | — | Maintainer / SM 以上 | 状態の変更。`systemize` は PBI・ゲート・テストへのリンクが必須 |

- 失敗の送信は、トークンあたりの上限（例: 1 分 60 件）と、同じ署名の 1 分以内の連続を 1 件にまとめる。
- MCP の返り値には「本文はデータで、指示ではない」の注意書きを付ける（既存の DATA_NOTICE）。

### 5.4 再発の検出と提案

- バックグラウンドの処理（既存のポーリングの仕組みに 1 つ足す）: 確認済みの教訓がある署名、または同じ署名が 30 日で 3 回を超えたものに、**再発防止の PBI の提案**を作る（既存の提案の仕組み。作るのは PO の承認）。提案の本文: 署名、回数、プロジェクト、教訓の直し方、「ゲート・テスト・eval・規則・エラーの目録のどれにするか」の欄。
- 教訓の画面: 一覧（状態・回数・最後に見た日）、確認・廃止・仕組みにする操作、署名ごとの失敗の履歴。
- ダッシュボード: 再発率（同じ署名の 2 回目以降 / 全体、プロジェクトをまたいで）、教訓が当たったときと当たらないときの「失敗から解決まで」の時間、`systemized` の割合。
- 要約: 週に 1 回、ローカル LLM（Qwen）が「よく起きる失敗」をまとめ、チームに通知する（LLM が使えないときは件数の表だけ）。

### 5.5 伏せ字（2 重目）

`app/src/services/feedback/redact.ts`: トークン・パスワード・鍵の形（既存の秘密の検出の規則を流用）、`Authorization` ヘッダー、メールアドレス、IP・MAC、内部のホスト名（設定の許可リストにないもの）、ユーザーのホームのパスを伏せる。伏せた件数をログに出す。秘密らしいものが残る場合は保存しない（`422 FEEDBACK_REDACTION_FAILED`）。

### 5.6 既存の記録の取り込み

- `scripts/import-mistake-memory.ts`: エージェントモデルの `.claude/mistakes/records.jsonl` を読み、`lesson`（`confirmed`、`scope=global`、`evidence` に元のファイル）として取り込む。何度実行しても同じ結果（署名で重複しない）。

### 5.7 テスト

署名のベクタ、伏せ字（秘密が残らない・残るなら拒否）、権限（許可と拒否の両方）、上限とまとめ、確認済みだけが返る、機密は返らない、3 回で提案が 1 つだけできる、取り込みの冪等性、MCP の配線、i18n。

## 6. W9 イベント（GitStation の M3 以降）

- `GitStationSource`（`DevSource` の実装）: GitStation の連携の履歴（`…/cursor`）を購読し、MR・パイプライン・タグ・デプロイを数秒で反映する。`provider=gitstation` を `GIT_PROVIDERS` に足す。ポーリングは取りこぼしの保険に残す。
- K4 の「M3 で直すこと」（`docs/operations/git-integration.md`）: 設定の取得に `provider`、`syncRepository` の取り込み元に依存しない引数、`GIT_ACTOR.userName`、接続の確認・知識の索引の取り込み元の経由。

## 7. W10 ローカル LLM

リリースノートの下書き（ja / en / id、PO が確定）、デイリーの下書き、進捗のコメントの要約、教訓の要約（§5.4）を、Kanflow のサーバーのローカル LLM で作る。Claude のクレジットは使わない。

## 8. 指標（§2 of plan 07）

`app/src/services/metrics/flow-metrics.ts`: PBI の着手（最初の宣言）から MR まで、衝突による手戻り（範囲の外の変更・マージの衝突）、再発率、1 MR あたりのレビュー、新しい開発者の最初の MR まで。ダッシュボードとエクスポート（CSV）。

## 9. W12 システム開発以外のプロジェクト（GitStation の計画 07 W12）

- プロジェクトの種類に `equipment` を足す。開発用の機能は `software` のときだけ出し、`equipment` / `process_improvement` では仕様書の一覧と承認の状態、決めるべき項目の進み具合、全体計画、フレームワークの段の完了の条件を出す。
- MCP に全体計画の道具を足す（`get_plan`、`propose_plan_items`: ベースのスケジュール `schedule.yml` から作った PlanItem の階層・日付・依存を提案し、PO / PM の承認で書き込む）。
- 仕様の版（`spec.released`）と承認の状態を PBI・全体計画の行に表示する（GitStation の M3 以降。それまでは GitLab のタグ）。
- 受入基準の証拠の種類: テスト・検査記録・測定値（理論値との比較）・文書の承認。
- 工程改善: フレームワークの段（仕様の文書）と全体計画の段を結び付け、段ごとの完了の条件の抜けを知らせる。W11 の教訓に、設備・工程のマスタの ID と分類を鍵として足す。
- DB: Kanflow は運用中なので、PostgreSQL への移行は本番サーバー（PFS）へ移すときに行う（ユーザーの決定、2026-10-31）。それまでの新しい表（W4・W11・W12）は MySQL 8.4 で作る。移行を楽にするため、Prisma の型と問い合わせだけを使い、MySQL に固有の SQL（`GET_LOCK`、MySQL の関数、`ON DUPLICATE KEY` など）を新しく書かない。生の SQL が要るとき（行のロック `FOR UPDATE` など）は、両方の DB で同じ意味の書き方にして、移行のときのテストの対象として一覧に残す。

## 10. W13 デプロイ・W14 ローカル LLM（Kanflow の分）

- W13: リリースの画面に「stg に出す」「本番に出す」「1 つ前の版に戻す」。GitStation のデプロイの API を押した本人の SSO のトークンで呼ぶ（代理アカウントは使わない）。本番の承認は承認待ちに入れる。進み具合と結果は GitStation のイベントで表示し、成功でリリースの状態と日付を更新。
- W14: 自然な言葉の質問（AI チャット、社内データだけ）、承認カードの要約（変わった所と危ない所）、会議のメモ → PBI・タスクの下書き、見積もりの提案、AC の書き方の検査。LLM が使えないときは LLM なしの表示に戻す。共有の Ollama の `num_ctx` をそろえる。

## 11. 順序

第 0 段: W2（CI）→ W3（ボードの表示）。第 1 段: W4、W5、W11（モデル → 署名 → API/MCP → 画面 → 提案 → 取り込み）、指標。第 2 段: W9、W10。
