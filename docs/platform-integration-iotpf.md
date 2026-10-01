# Kanflow を IoT プラットフォーム（PFS）へ載せるための検討

作成: 2026-10-01 / 対象: Kanflow `feat/roadmap-2026-10`（本番 BUILD `6eliVJuX…`）
参照仕様: `D:\APP\IoT_platform_spec`（IoTPF v2 統合仕様、2026-09-29 時点）

## 0. 結論（要約）

| 論点 | 結論 |
|---|---|
| 配置 | Kanflow は **L4 アプリ + PFS（pfsdb）の非凍結テーブル**として載せる（仕様 70-applications の配置ルール「業務ワークフロー = L4 + PFS」に該当）。PFE には何も置かない |
| DB | **MySQL から PostgreSQL（+TimescaleDB イメージ）へ移行が必須**（H4「No MySQL」）。BankMasalah と同じ `timescale/timescaledb-ha:pg16` インスタンスに同居させる |
| 進め方 | 問題点管理（Volume 45）と同じ 2 段階: **段階 T** = BankMasalah の PostgreSQL に専用スキーマ `kanflow` で同居 → **段階 1** = pfsdb へ移設（テーブル名・監査列を PFS 規約に合わせる） |
| 認証 | 仕様提案 Volume 48（#14, [Open]）どおり **Keycloak（OIDC）+ `me_user` 連携**。Kanflow 側は Auth.js の Keycloak プロバイダ、`employeeNumber ↔ staff_id` |
| 実行基盤 | Windows サービスから **Docker コンテナ（PFS の Docker Compose）**へ。TLS リバースプロキシ配下の `kanflow.<pp-21 ドメイン>` |
| 問題点管理との連携 | BankMasalah の課題 → Kanflow プロジェクト/PBI 化（トークン交換）。Kanflow 側は参照のみを持ち、課題本体は `te_issue` が正 |

## 1. 仕様上の制約と Kanflow の現状の差分

| 仕様（ルール） | 内容 | Kanflow の現状 | 必要な対応 |
|---|---|---|---|
| H4 データストア | PostgreSQL + TimescaleDB のみ。MySQL 不可 | MySQL 8.4（Prisma, adapter-mariadb） | PostgreSQL 移行（§3） |
| H1 / 70-apps レイヤ独立 | L4 は L3 API のみ利用。PFE や他層の内部を直接読まない | Next.js 1 本（画面 + 自前 API + DB 直結） | Kanflow の自前 API は「Kanflow 専用バックエンド」として維持（BankMasalah の `apps/api` と同じ位置づけ）。**他ドメインのデータ（OEE、ZEVA 判定、マスタ、課題）は L3 API 経由でのみ読む** |
| H7 共通列 | 全テーブルに監査 8 列（`create_user/at/pg/device`, `update_*`）+ `plant_code`、時刻は TIMESTAMPTZ | `createdAt/updatedAt` のみ、`plant_code` なし、DATETIME(3) | 段階 1 で監査 8 列・`plant_code` を追加、TIMESTAMPTZ 化 |
| 10-pfs/01 §4.8 命名 | テーブル名 `^(mm|me|mp|m2|tm|te|t2)_…$`、`pk_` / `uq_…_NN` / `idx_…_NN` | `Project`, `ProductBacklogItem` など PascalCase 42 モデル | Prisma の `@@map` / `@map` で物理名だけ変更（アプリコードはほぼ不変）。例 `te_kf_project`, `te_kf_pbi`, `me_kf_member` |
| 60-ops/03 時刻 | DB は UTC の TIMESTAMPTZ、表示はアプリ/セッションごとに現地時刻 | 一部で「今日」を **Asia/Tokyo 固定**（全体計画・バーンダウン） | **工場の時間帯（例: WIB = UTC+7）を `plant` 単位の設定にする**（現状でもインドネシア利用者は夜 22–24 時に日付がずれる既知事項 C5-01） |
| H15 多言語 | JA / EN / ID、文言のハードコード禁止 | 対応済み | — |
| H3 データ主権 | LLM はオンプレの Ollama のみ | 対応済み（BankMasalah と共有） | 共有 Ollama の負荷調整は継続 |
| ADR-0001 L4 | Next.js、リアルタイムは L3 の SSE、ブラウザから MQTT 禁止 | Next.js 16 | — |
| ADR-0001 運用 | Docker Compose（将来 K8s）、Prometheus/Grafana/Loki | Windows サービス、独自メトリクス画面 | コンテナ化、`/metrics`（Prometheus 形式）と構造化ログを Loki へ |
| 60-ops/02 | 社内 CA の mTLS / TLS | HTTP（:3000） | プロキシで TLS 終端 |
| 10-pfs/12（提案） | Keycloak SSO、アプリごとの `access` ロール、ポータル | メール + パスワード（Auth.js） | SSO 対応（§4） |

## 2. 目標構成

```
            ┌──────────── TLS リバースプロキシ（社内 CA / *.pp-21…）────────────┐
 利用者 ──▶ │ portal.…   bank.…            kanflow.…            auth.…           │
            └────┬───────────┬──────────────────┬──────────────────┬────────────┘
                 │           │                  │                  │
            Portal(L4)  BankMasalah web/api   Kanflow (Next.js:     Keycloak (OIDC)
                        (L4 + L3 issue svc)   画面 + 自前 API)       ▲ HR/AD 連携
                             │                  │  ▲                 │
                             │      L3 API ◀────┘  │ token exchange   │
                             ▼        (OEE, ZEVA,  │ (課題→PBI)        │
                  ┌──────────────── PostgreSQL 16 + TimescaleDB（PFS）──────────────┐
                  │ pfsdb / schema pfs: マスタ, Tier-2, te_issue*, me_user …       │
                  │ 段階T: DB bankmasalah（public）+ schema kanflow                 │
                  │ 段階1: pfsdb / schema pfs に te_kf_* / me_kf_*                  │
                  └────────────────────────────────────────────────────────────────┘
                       Ollama（ローカル LLM, 共有）   MinIO（添付, BankMasalah と共用可）
```

## 3. DB 移行（MySQL → PostgreSQL）

| 項目 | 内容 | 規模 |
|---|---|---|
| Prisma | `provider = "postgresql"`、`@prisma/adapter-pg` + `pg`（Next 16.3.7 移行済みで npm install 可能） | 小 |
| 型 | `@db.VarChar/Text` は概ね互換。`MediumText` → `Text`、DATETIME(3) → `Timestamptz(3)` | 小 |
| マイグレーション履歴 | MySQL 用 SQL 34 本は流用不可 → PostgreSQL 用ベースライン 1 本を作り直し | 中 |
| 生 SQL（8 ファイル） | `ON DUPLICATE KEY UPDATE` → `ON CONFLICT`、`GET_LOCK` → `pg_try_advisory_lock`、`MATCH…AGAINST`（ngram FULLTEXT）→ `pg_trgm` + `ILIKE`（データ量が少ないので十分）、エラー番号の判定 | 中 |
| 大文字小文字 | MySQL の照合順序は大小無視、PostgreSQL の `LIKE` は区別 → `contains` 約 70 箇所に `mode: "insensitive"`（漏れると検索不具合） | 中 |
| データ移行 | 本番 DB は 1.2 MB（dump）と小さい。検証 DB で移行→件数・内容照合→本番切替（停止 30〜60 分） | 中 |
| 運用スクリプト | `ops/`（バックアップ、リストア訓練、監視、デプロイの差分確認）を `pg_dump` / pgBackRest へ。**BankMasalah の pgBackRest + MinIO の仕組みに相乗りすれば自前の MySQL 運用ツールは廃止できる** | 中〜大 |

日本語の全文検索について: PostgreSQL 標準の `pg_trgm` は 3 文字単位のため 2 文字語に弱い。Kanflow のデータ量（各表 数千行以下）なら `ILIKE` + `pg_trgm` 索引で実用上問題ない。将来は pgvector（仕様 #32, 保留）による意味検索に寄せる。

## 4. 認証・権限（Volume 48 提案に合わせる）

- Keycloak の OIDC クライアント `kanflow`。入場可否はクライアントロール `access`（例: 係長以上 + 間接部門、ID-5）。
- アプリ内の権限（PO / SM / Dev、セクション管理者、管理者）は **Kanflow 側で保持**（仕様: アプリ内権限はアプリが決める）。
- 利用者の紐付け: `User.employeeNumber` ↔ トークンの `staff_id`、`me_user.idp_subject`。初回ログイン時にプロフィールを自動作成。
- 現行のパスワードログインは移行期間（2〜4 週間）並行稼働後に停止。今回入れた「権限変更の即時反映（tokenVersion）」は Keycloak のセッション失効・バックチャネルログアウトに置き換え。
- 個人アクセストークン（`/api/v1`）は Keycloak のサービスアカウント（client credentials）へ寄せる。

## 5. 問題点管理（BankMasalah / Volume 45）との連携

| 方向 | 仕組み | Kanflow 側の変更 |
|---|---|---|
| 課題 → Kanflow | BankMasalah の課題画面から「Kanflow で対策プロジェクト化 / PBI 化」。ログイン中の本人としてトークン交換で Kanflow API を呼ぶ | 受け口 API（課題 ID・件名・対象・期限を受け、PBI または全体計画項目を作成）。外部参照列 `source_issue_id` / `source_issue_no` |
| Kanflow → 課題 | PBI / 全体計画項目の完了・対策実施を課題側の「対策（`te_issue_action`）」の進捗として参照 | `GET` の要約 API（課題側から参照）。課題本体は書き換えない（課題は `te_issue` が正） |
| 標準化での締め | 課題のクローズ条件「標準への反映」の証跡として Kanflow の成果物（添付・PBI）を `te_issue_link`（`link_kind = external`）で参照 | 安定した参照 URL（`/projects/:id/backlog?pbi=` は実装済み） |
| ポータル | 「自分宛ての項目」集約: `GET /api/portal/summary`（自分のタスク、期限超過、メンション） | 新規 API 1 本（2 秒以内） |

重要: 課題（問題点）そのものは Kanflow に複製しない。Kanflow は「対策をプロジェクトとして進める器」、課題管理は BankMasalah（将来 `te_issue`）が正、という役割分担にする。

## 6. 段階的な移行計画

| 段階 | 内容 | 前提 | 目安 |
|---|---|---|---|
| **0 準備** | ① 工場の時間帯を設定化（Tokyo 固定の解消） ② Prisma の物理名を `@@map` で規約名に変更する準備 ③ コンテナイメージ化（Dockerfile、`next start`、ワーカー別コンテナ） | — | 3〜4 日 |
| **T 同居** | BankMasalah の PostgreSQL に **DB 内スキーマ `kanflow`** を作成し MySQL から移行。Docker Compose に `kanflow-web` / `kanflow-worker` を追加、TLS プロキシ配下へ。バックアップは BankMasalah の pgBackRest に相乗り | §3 の移行作業、BankMasalah 運用者の合意 | 2〜3 週間 |
| **SSO** | Keycloak 導入後（Volume 48 の A〜D）、Kanflow を OIDC 化、並行ログイン → 旧ログイン停止 | #14 の決定（ID-1〜ID-12） | 1〜2 日（Kanflow 側） |
| **連携** | 課題 → PBI / 計画項目（トークン交換）、ポータル summary API | SSO 完了 | 3〜5 日 |
| **1 pfsdb** | pfsdb（スキーマ `pfs`）へ移設。テーブル名 `te_kf_*` / `me_kf_*`、監査 8 列 + `plant_code`、命名規則検査（`verify_fullstack_db.py`）合格、マイグレーション番号 0015 以降を MR で採番。ユーザーは `me_user` と連携 | pfsdb 本番稼働、仕様側レビュー | 2〜3 週間 |

## 7. 決めていただきたいこと

| # | 内容 | 私の推奨 |
|---|---|---|
| K-1 | 段階 T で BankMasalah の DB（`bankmasalah`）にスキーマ同居するか、同じ PostgreSQL インスタンスの別 DB にするか | **同じ DB の別スキーマ `kanflow`**（バックアップ・監視が 1 本、将来の pfsdb 移設時もスキーマ単位で移せる） |
| K-2 | pfsdb 移設時、スキーマ `pfs` に `te_kf_*` で入れるか、独立スキーマ `kanflow` を仕様に追加するか（仕様にスキーマ命名規則はなく、現状 `pfs` / `pfe` / `pfe_ops` の 3 つ） | 仕様の配置ルールに従い **`pfs` に `te_kf_*` / `me_kf_*`**。仕様変更を伴う場合は ADR を起票 |
| K-3 | 工場の時間帯の正（`plant` マスタの TZ を使うか、Kanflow のプロジェクト設定に持つか） | PFS の工場マスタを正とし、Kanflow は参照 |
| K-4 | 課題 → Kanflow の受け口は「プロジェクト作成」か「既存プロジェクトへの PBI 追加」か、両方か | 両方（既定は PBI 追加） |
| K-5 | Kanflow 利用者の範囲（Volume 48 ID-5: 係長以上 + 間接部門の案） | 提案どおり + 個別付与 |
| K-6 | 段階 T 移行の時期（本番停止 30〜60 分） | 今回の大型リリースの安定確認後（1〜2 週間後） |

## 8. 今回のリリースで既に整っている点

- 多言語（JA/ID/EN）と翻訳、ローカル LLM のみ利用（H3 / H15 に適合）
- 変更履歴（ActivityLog）、通知、論理削除、楽観ロック、読み取り専用 API（`/api/v1`）
- Next.js 16.3.7、Web サービスのラッパーを `node_modules` 外へ移設済み
- プロジェクト一覧の整理（休眠・アーカイブ・役割別表示）
