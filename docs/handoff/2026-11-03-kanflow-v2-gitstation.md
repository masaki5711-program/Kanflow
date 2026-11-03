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
