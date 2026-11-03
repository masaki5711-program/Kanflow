# 引き継ぎ — Kanflow v2（GitStation 連携・PostgreSQL・実績からのスケジュール）2026-11-03

Kanflow の作業は、このリポジトリを開いたセッションで進める（GitStation のセッションからは手を離す）。この文書だけで続きを始められるように書いた。

## 0. 絶対に守ること

- **旧 Kanflow（本番）を壊さない。** 本番は `D:\APP\Kanflow`（:3000、MySQL :3306）で、実際の業務で動いている。
  - そのフォルダのファイル・`.env`・サービス・`node_modules`・チェックアウト中のブランチ（今は `feat/L4-chat-message-to-item`）に触れない。
  - 本番の MySQL に接続しない。
- **v2 の作業は git worktree で行う**（同じリポジトリ、別ブランチ、別フォルダ）。新しい作業は `git -C D:/APP/Kanflow worktree add D:/APP/Kanflow-<名前> -b feat/L4-<名前> <基点>` で始める。
- **K1 の系統（PostgreSQL 化）は、本番の切り替え（K2 の runbook、人の承認）まで `main` に入れない。** 本番の自動デプロイが MySQL の URL のまま PG として動いて失敗するため。
- **push はまだしない。** コミットの作成者のアドレスが未決（下の §4 の 1）。
- 本番のデータを使う作業（K2 のリハーサル）は、利用者の承認を取ってから。試験はすべて合成データで行う。

## 1. いまのブランチ（すべて未 push）

| 作業 | ブランチ | 作業フォルダ | 状態 |
|---|---|---|---|
| K1 Kanflow v2 を PostgreSQL 16 へ | `feat/L4-db-postgresql` | （E0・K2 の土台） | 完了・独立レビュー済み |
| E0 計画の読み込みでテンプレートの `key`・読み込みの記録・基準を保存 | `feat/L4-plan-template-key-baseline`（K1 の上） | `D:\APP\Kanflow-v2` | 完了・レビュー済み |
| K2 MySQL → PG のデータ移行の道具・リハーサル・切り替えの runbook | `feat/L4-db-mysql-to-pg-migrator`（K1 の上） | `D:\APP\Kanflow-v2-k2` | 完了・独立レビュー済み（HIGH 4 件を解消） |
| この引き継ぎ | `docs/L4-handoff-gitstation`（E0 の上） | `D:\APP\Kanflow-handoff` | — |

- 試験用 PG（合成データ）: `ops/test-env/compose.yml`、127.0.0.1:25434、`kanflow_dev` / `scrum_tool`。合成の管理者は `admin@example.local`。
- DB の方針: IoT プラットフォームに合わせて **PostgreSQL 16 + TimescaleDB 2.28.1**（`timescale/timescaledb:2.28.1-pg16`）。MySQL は使わない。
- K2 の文書: `docs/operations/mysql-to-pg-rehearsal.md`、`docs/operations/mysql-to-pg-cutover.md`（手順はすべて `[MUTATING — needs approval]`、戻し方つき）。
- 本番への移し方: v2 はこのサーバーで作り込み、完成したら本番サーバーにビルドする。**今の Kanflow のデータを引き継ぐ**（MySQL → PG の移行を切り替えの時に行う）。

## 2. 設計の正本（GitStation のリポジトリにある）

同じ PC の `D:\APP\git_station\Git\docs\plan\`。GitHub では `masaki5711-program/GitStation` の `docs/plan/`。

| 文書 | 中身 |
|---|---|
| `02-kanflow-integration.md` | 連携の API の約束（§5 開発状況 API・イベントの履歴、§8.2 回帰テスト）、F-36（Kanflow から MR を承認） |
| `11-m3-plan.md` | M3 の MR の順番。Kanflow の K1〜K4 は §5 の表（`[KF]` の行） |
| `12-schedule-from-actuals.md` | **実績から作るスケジュール**（E0〜E6）。ロジック・データ・安全の決まり・テスト名・§9 の未決・§10 の設計レビューの決定 |
| `../adr/0016-*`、`../adr/0023-*` | 連携とイベントの設計、仕様の承認の経路 |

## 3. 次にやること（推奨の順）

### すぐ進められる（GitStation を待たない）
1. **K3 の前半 — GitStationSource**（`feat/L4-git-gitstation-source`）。
   - `DevSource` の実装（カーソル `gitstation:v1:<forge のカーソル>`、`restart()` は `/cursor` と開発状況 API）、`GIT_PROVIDERS` に `gitstation`。
   - 計画 11 の K3 の行と 02 §5・§8.2 の約束どおりに作り、**偽の GitStation に対する契約テスト（`dev-source-contract.ts`）で先に通す**。
   - 本物の GitStation との通しの試験は、GitStation の I1（イベントの履歴 API）が入ってから。
2. **E2 の計算部分** — `lib/plan-estimate/`。照合・重み・外れ値・縮め・P50 / P80・待ち・全体のバッファを純粋な関数で作り、**合成データのバックテスト**まで行う。テスト名は計画 12 §6 の E2 の行。既定値（K=3、半減期 365 日、比 0.5〜3.0、外れ値 3 MAD）は §9 の 7 の推奨で始める。実データを読む部分は E1 の後。
3. **E3 の適用部分** — 反省点の規則 6 種類の適用と検証（循環・上限・固定の順序）の純粋な関数。確定の流れと画面は後。

### 利用者の決定を待つ
- **E4 平準化**: §9 の 1（稼働量 FTE と同時に持つ数の上限、社内カレンダー）、§9 の 2（他の人の負荷を誰が見られるか）。
- **E1 実績の確定**: §9 の 8（スナップショットの保持と退職者の扱い。設計レビューで「E1 の着手前に決める」）。
- **K2 のリハーサル**（本番データの複写を使うか）。

### GitStation を待つ
- **K3 の後半**（本物との通し）と **E1 の MR の事実**: GitStation の I1 と G1 の後。
- **K4 F-36**（PBI の画面から MR を承認）: GitStation の I1 と代理実行（S1・S2）の後。
- **E5**（「計画を作る」画面と MCP の道具）は E3・E4 の後。**E6**（ローカル LLM の補助）は M5。

## 4. 利用者に答えてほしいこと

1. **コミットの作成者のアドレス**: 既存の履歴は `fujikawa@ymma.emi.yamaha.co.jp`、今回のコミットは `masaki.fujikawa@music.yamaha.com`。どちらに揃えるか。答えが出たら K1・E0・K2 を push する。
2. 計画 12 §9 の項目（特に 1・2・8）。
3. K2 のリハーサルに本番データの複写を使ってよいか。

## 5. GitStation 側の状態（2026-11-03）

- `main` に MR の土台（R1〜R5: MR・版・差分・コメント・マージの実行・承認・CODEOWNERS）が入っている。R6（マージの条件）はレビュー中。
- 次の予定: U1・U2（MR の画面）→ C1（Checks API）→ S0（サービスアカウント）・**I1（イベントの履歴 API。Kanflow K3 の前提）**→ O1〜O3。
- 連携の約束（API の形）を変えるときは、GitStation 側の計画 02 を先に直し、両側の契約テストで確かめる。

## 6. 進め方の約束（このリポジトリの CLAUDE.md に加えて）

- テストを先に書く。変更ごとに lint・typecheck・test（PG の DB のテストを含む）を通す。
- 独立レビュー（`typescript-reviewer`・`database-reviewer`・`security-reviewer` など、計画の表の評価役）で CRITICAL / HIGH が無くなってから、ブランチを完了とする。
- 利用者とは日本語で話す。

## 7. 進み具合（2026-11-03、引き継いだセッション）

決まったこと: **コミットの作成者は `masaki.fujikawa@music.yamaha.com`**（利用者の回答。§4 の 1 は解決）。push はまだしない（利用者に確かめてから）。利用者の指示は「推奨の形で進める」。全体の `git config` は変えず、コミットのたびに `-c user.name/-c user.email` を付ける（共有の設定は本番のフォルダにも効くため）。

| 作業 | ブランチ（起点） | 作業フォルダ | 状態 |
|---|---|---|---|
| E2 見積もりの計算 | `feat/L4-plan-estimate-engine`（E0） | `D:\APP\Kanflow-plan-estimate` | 完了。`02dcf55`・`39b62bb`・`2891966`。試験 58 件。`typescript-reviewer`・`pr-test-analyzer` の CRITICAL / HIGH は解消 |
| E3 反省点の規則の適用と検証 | `feat/L4-plan-lesson-rules`（E0） | `D:\APP\Kanflow-plan-lesson-rules` | 前半が完了。`5c296de`・`dfb068a`・`44af7f3`。試験 94 件。CRITICAL / HIGH は解消。表・確定の流れ・権限は後半 |
| K3 GitStationSource（前半） | `feat/L4-git-gitstation-source`（K1） | `D:\APP\Kanflow-gitstation-source` | 完了。`049412c`〜`35194bb`。全体の試験 9,169 件が通る（`worker-clock` の 2 件は `.env` をシェルに出したときだけ落ちる既存の現象）。`typescript-reviewer`・`security-reviewer`・`silent-failure-hunter` の CRITICAL / HIGH は解消 |

- **E2**: バックテスト（合成データ、seed 0〜5）で、MAPE はテンプレートより 8〜15% 小さい。P80 の当たりは 78〜83%。§5 の「既定で見せる」条件（15% 以上の改善）は、合成の 12 件では満たさない seed がある。見えない出典の「1 件の変化を保留する」状態は、**全プロジェクト共通の保存先**（見る人の可視の集合ごと）に置く前提（E5 で作る）。残っている課題: 偶数の h' から 1 件抜けたときは保留しない（`hidden.ts` の注記）。
- **E3**: 決めたこと: `split` は順に並ぶ部分（`<key>_pN`）、`add_buffer` は後続との間に入れる（`<key>_bufN`）、`scale_duration` は日数を変えず係数の積を返す（E2 の r50 に掛け、全体の上限は E5 で確かめる）、マイルストーンは 20% の数に含める、依存の追加は 30 件まで、終了日はテンプレートの期間 × 3.0 まで。名前は NFKC にして、見えない文字・マークアップ・URL・危険な形式名・先頭の `= + - @` を断る。
- **K3**: カーソルは**連携ごとに 1 つ**（表 `git_station_feed`、借用（lease）と比較して書き込み）。読んだイベントを、パス**と** `work_items` の Kanflow のプロジェクトでリポジトリに振り分ける。GitStation のリポジトリは、自分のプロジェクト 1 つだけに結ばれている場合に限り読む（`kanflow_project_ids`）。接続先は `GITSTATION_ALLOWED_HOSTS`（既定は空）。最初の読み込み・再同期・410 では、先頭のカーソル → 状態の取り直し → 続きの順にする。永続的な失敗（401 / 403 / 404・結び付けなし・3 回続けて書けない）は、そのリポジトリだけを外して後で取り直す。一時的な失敗のときだけカーソルを止める。DB の試験は `scrum_tool_k3`（同じ試験用のコンテナ）で行う。
- **GitStation への申し入れ**: `D:\APP\Kanflow-gitstation-source\docs\integration\gitstation-contract-proposal.md`（認証、連携の単位で MR の状態の一覧を取る道、イベントの `state`・`merged_at`、`commit.linked` の `data`、リポジトリの読み取りの形、`kanflow_project_ids`、コミットの一覧（問い 6））。**GitStation の計画 02 に取り込んでもらうまで、本物との通しの試験はできない。**

次: E1（§9 の 8 を決めてから）、E4（§9 の 1・2 を決めてから）、K3 の後半（GitStation の I1 と申し入れの合意の後）。

## 8. v2 を 1 本にまとめた（2026-11-03）

- **v2 の本流**: ブランチ `feat/L4-NOPBI-kanflow-v2`、フォルダ `D:\APP\Kanflow-v2`。K1 の上に、E0 → 引き継ぎ → エージェントモデル（`docs/L4-NOPBI-agent-model-adoption`）→ K2 → K3 → E2 → E3 を `--no-ff` で取り込んだ。衝突は `.github/workflows/ci.yml` の DB の試験の一覧だけ（両方を流すようにした）。
- **確かめたこと**: マイグレーションを新しい試験用 DB `scrum_tool_v2` に全部適用、`prisma migrate diff` でずれなし、typecheck・変えたファイルの lint はエラーなし、全部の試験 9,444 件が合格（73 件は DB を要するため飛ばされた）、`KANFLOW_DB_TESTS=1` で DB の試験 61 件が合格、エージェントモデルの `self-heal --check` は 11 項目すべて合格。K2 の `migrator.integration.test.ts` は合成の MySQL のコンテナ（`ops/test-env/migrator-compose.yml`）が要るため今回は流していない。
- **片付け**: 取り込み済みの worktree（`Kanflow-v2`（E0）・`Kanflow-v2-k2`・`Kanflow-plan-estimate`・`Kanflow-plan-lesson-rules`・`Kanflow-gitstation-source`・`Kanflow-agent-model`）を消した。ブランチは残してある。残っているのは本番の `D:\APP\Kanflow`、この引き継ぎの `D:\APP\Kanflow-handoff`（このセッションが終わったら消してよい）、`D:\APP\Kanflow-e2e`（MySQL のデータとログ、未コミットのファイルがあるので触れていない）、worktree ではない古い写し `D:\APP\Kanflow-stale-types-20261001-122807`（消すかは利用者が判断する）。
- **これからの作業**: `D:\APP\Kanflow-v2` で Claude Code を開く（エージェントモデルが動く）。新しい作業は `feat/L4-NOPBI-kanflow-v2` から worktree で切り、終わったらここへ取り込む。push はまだしない。push の前に、規則に合わない古いブランチの名前を変える。

## 9. E3 の後半（反省点の規則の保存・確定・共有と画面）を取り込んだ（2026-11-03）

- **ブランチ** `feat/L4-NOPBI-plan-lesson-rule-store`（v2 の本流から）。コミット `5d0fae7`（表・権限・API）、`5194632`（画面）。本流へ `--no-ff` で取り込んだ（`6c33f3c`）。worktree は消し、ブランチは残した。
- **作ったもの**: 表 `plan_lesson_rule`（追記のマイグレーション `20261103170000_plan_lesson_rule`、CHECK つき）。下書き（`plan.write`）→ **1 件ずつ・種類と数字を送り返して確定**（`plan.lessonRule.confirm`、PO / SM）→ 廃止。共有の申請は出典のプロジェクトの PO（`plan.lessonRule.requestPromotion`）で、**自分のプロジェクトが読み込んだ系統・自分の種類だけ**。共有の確定・却下・共有の規則の廃止は管理者だけ（`canConfirmLineageRule`、`/api/admin/plan-lesson-rules`）。管理者の確定も数字と申請の範囲を送り返す。すべての書き込みは版で守る（同時の確定は 1 つだけ通る）。
- **機密**: 凍結しない。使う時・一覧・申請・確定のたびに、引いた PBI と教訓を読み直す（機密・消えた・ゴミ箱・別のプロジェクトへ移った PBI、範囲が外れた教訓は「機密」と扱う）。機密の教訓・確定していない教訓は引けない。振り返りから作った規則と出典に機密がある規則は共有できない。共有のときに引用を消す。**共有しても出典のプロジェクトでは必ず効く**。
- **使う道**: `effectiveLessonRules({ projectId, lineage, projectType })` が `applyLessonRules` に渡す規則を返す。**呼ぶのは E5**（`lineage` / `projectType` はサーバー側のデータから決めること、`skipped` は管理者以外に返さないこと — セキュリティレビューの注記）。
- **画面**: 全体計画の「…」メニュー → `/projects/[id]/plan/lesson-rules`、管理メニュー → `/admin/plan-lesson-rules`。文言は ja / en / id（i18n の領域 `plan-lesson-rules`、接頭辞 `plr`）。
- **確かめたこと**: typecheck・変えたファイルの lint はエラーなし、`npm run build` が通る、全部の試験 9,624 件が合格（DB の試験 `lesson-rules.db.test.ts` 18 件を含む、`scrum_tool_v2` にもマイグレーションを適用・`migrate diff` でずれなし）、Playwright の通し（`e2e/flows/lesson-rules-flow.spec.ts`、合成データ、1440 / 375 px の画面を確認）、`self-heal --check` 合格。`worker-clock` の 2 件は `.env` をシェルに出したときだけ落ちる既存の現象（出さなければ 3 件とも合格）。
- **独立レビュー**（計画 12 §6 の E3 の評価役 + UI の完了条件）: `typescript-reviewer`・`database-reviewer`・`security-reviewer`・`design-reviewer`・`a11y-architect`・`i18n-sync-auditor`・`data-sovereignty-guard`。出た HIGH（a11y: 操作の後にフォーカスが消える・処理中のボタンにフォーカスが残る、i18n: 上限の誤ったエラーコード）と MEDIUM はすべて直し、a11y は 2 回の再確認で CRITICAL / HIGH なし。
- **残した LOW**（後で）: 一覧の再読み込みが失敗したときのフォーカスの予約が残る、カードと操作の組が同じ文で 2 回読まれる、保持（§9 の 8）と退職者の扱いの対象に `plan_lesson_rule` の利用者 ID の列を含めるかの決定。
- **気づいたこと**: `git merge` もコミットを作るので、`-c user.name/-c user.email` を付けないと全体の設定のアドレスになる（今回は取り込み直後に作成者だけ直した）。`next dev` は `app/AGENTS.md`・`app/CLAUDE.md` を作るので、コミットしない。

次: E1（§9 の 8 を決めてから）、E4（§9 の 1・2 を決めてから）、K3 の後半（GitStation の I1 と申し入れの合意の後）、E5（E3・E4 の後）。どれも利用者か GitStation を待つ。
