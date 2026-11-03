# References — Kanflow

> このディレクトリは Kanflow の**参照ライブラリ**です（agent-model v3 規約）。
> モデルと人は、必要なときに該当するファイルだけを読みます。
> エージェントモデルの規約（`references/` の索引・`manifest.json`・`decisions.md`）に合わせた。
> Kanflow はエージェントモデルを自分のリポジトリに取り込んでいるので（`CLAUDE.md` §7）、
> `apps/` 用のゲート（`pre:edit:apps-spec-check`）はここでは働かない。作業の前にこの索引を読む。

## 索引

| 領域 | 資料 | 状態 |
|------|------|------|
| 全体の仕様（v1、本番） | `SPECIFICATION.md`、`README.md` | 決定 |
| v2 の全体計画 | `docs/plan/00-master-plan.md`、`docs/plan/09-integrated-platform-design.md` | 決定 |
| チーム開発・UX | `docs/plan/team-dev-implementation.md`、`docs/plan/ux-simplicity.md` | 決定 |
| GitStation 連携の API（K3・K4） | GitStation の計画 02（下の「外部の正本」）、`docs/operations/git-integration.md` | 決定（契約の追加は GitStation 側の合意待ち。`docs/integration/gitstation-contract-proposal.md`、K3 のブランチ） |
| PostgreSQL 化と移行（K1・K2） | GitStation の計画 11 §3.6・§5.6、`docs/operations/mysql-to-pg-rehearsal.md`・`mysql-to-pg-cutover.md`（K2 のブランチ） | 決定。本番の切り替えは人の承認 |
| 実績から作るスケジュール（E0〜E6） | GitStation の計画 12 | E0・E2・E3 前半は決定。E1 は §9 の 8、E4 は §9 の 1・2 が**未決** |
| 運用 | `docs/operations/*.md` | 決定 |
| 引き継ぎ（今のブランチの状態） | `docs/handoff/` | — |

## 外部の正本（このリポジトリには写さない）

GitStation のリポジトリ（同じ PC の `D:\APP\git_station\Git\docs\plan\`、
GitHub では `masaki5711-program/GitStation` の `docs/plan/`）:

- `02-kanflow-integration.md` — 連携の API（§5 開発状況 API・イベントの履歴、§8.2 回帰テスト、§11 ADR-0016 の改訂）
- `11-m3-plan.md` — M3 の MR の順番（Kanflow の K1〜K4 は §5.6）
- `12-schedule-from-actuals.md` — 実績からのスケジュール（ロジック、安全の決まり、テスト名、§9 未決、§10 設計レビューの決定）
- `../adr/0016-*`、`../adr/0023-*`

写さない理由: 正本が 2 つになり、ずれるため。API の形を変えるときは、GitStation 側の計画 02 を先に直し、両側の契約テストで確かめる。

## 構成

- `manifest.json` — 区分ごとの状態（エージェントモデルの書式。ワークスペースの型で置いた場合にゲートが読む）
- `decisions.md` — 決定のログ（仕様を変える変更と同じ変更の中で更新する）
