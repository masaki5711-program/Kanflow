# Kanflow を IoT プラットフォーム（PFS）へ載せるための検討

作成: 2026-10-01 / 対象: Kanflow `feat/roadmap-2026-10`（本番 BUILD `6eliVJuX…`）
参照仕様: `D:\APP\IoT_platform_spec`（IoTPF v2 統合仕様、2026-09-29 時点）

## 0. 結論（要約）

| 論点 | 結論 |
|---|---|
| 配置 | Kanflow は **L4 アプリ + PFS（pfsdb）の非凍結テーブル**として載せる（仕様 70-applications の配置ルール「業務ワークフロー = L4 + PFS」に該当）。PFE には何も置かない |
| DB | **MySQL から PostgreSQL（+TimescaleDB）へ移行が必須**（H4「No MySQL」）。BankMasalah との同居は不要（2026-10-01 決定）。PFS の PostgreSQL に Kanflow 専用の DB/スキーマを持ち、BankMasalah とは **API で連携**する |
| 進め方 | **段階 T** = PFS の PostgreSQL に Kanflow 専用 DB（スキーマ `kanflow`）を作って移行 → **段階 1** = pfsdb へ移設（テーブル名・監査列を PFS 規約に合わせる） |
| 認証 | 仕様提案 Volume 48（#14, [Open]）どおり **Keycloak（OIDC）+ `me_user` 連携**。Kanflow 側は Auth.js の Keycloak プロバイダ、`employeeNumber ↔ staff_id` |
| 実行基盤 | Windows サービスから **Docker コンテナ（PFS の Docker Compose）**へ。TLS リバースプロキシ配下の `kanflow.<pp-21 ドメイン>` |
| 問題点管理との連携 | **問題点 → 課題に昇格 → Kanflow でプロジェクト化** の順に進める（§5）。各段階の正はそれぞれのアプリ、相互は参照と API |

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
                  │ 段階T: Kanflow 専用 DB（schema kanflow）※BankMasalah とは別 DB  │
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

## 5. 問題点 → 課題 → プロジェクト の流れ（BankMasalah 連携）

### 5.1 役割分担

| 段階 | 置き場所 | 何を表すか | 主な情報 |
|---|---|---|---|
| ① 問題点（issue） | BankMasalah | 起きたこと | 発生日・場所・分類・写真・損失、対策（暫定〜恒久） |
| ② 課題（section_topic） | BankMasalah | 課・部がやり続けること | 目標・KPI（単位・目標値）・担当・期日、会議ごとの打点（健全度 / 進捗 % / 次の一手） |
| ③ プロジェクト | Kanflow | 課題を達成するための計画と実行 | プロダクトゴール、全体計画（期間・マイルストーン）、PBI、スプリント、担当・工数 |

- ①→② は BankMasalah に既にある「昇格」（`record_link.relation = promoted_to`）を使う。
- ②→③ を今回追加する。**課題 1 件 ↔ Kanflow プロジェクト 1 件**を基本とし、既存プロジェクトへの紐付けも可能にする。
- 正（マスター）はそれぞれ: 問題点・課題は BankMasalah、計画と実行は Kanflow。互いに**コピーせず、参照と要約 API** で結ぶ。

### 5.2 プロジェクト化（② → ③）

BankMasalah の課題画面に「Kanflow でプロジェクト化」ボタン。ログイン中の本人として Kanflow API を呼ぶ（SSO 後はトークン交換、SSO 前は連携用サービスアカウント + 本人の社員番号）。

| 課題の項目 | Kanflow での作られ方 |
|---|---|
| title / description | プロジェクト名 / プロジェクトの説明 |
| goal / KPI（単位・目標値） | プロダクトゴール（KPI と目標値を本文に明記） |
| owner | プロジェクトの PO（Kanflow 利用者であることが条件。社員番号で照合） |
| target_date | 全体計画のルート項目（期間: 本日〜期日）とマイルストーン「課題期日」 |
| 課・部（section / department） | Kanflow のセクション（段階 1 以降は PFS の組織マスタ `mm_m_org_unit` に統一） |
| 昇格元の問題点（promoted_to）と派生した問題点（spawned） | Icebox の項目（取り組み候補）として作成し、元の問題点へのリンクを保持 |
| 課題の URL | プロジェクトの「外部参照」として表示（ワンクリックで BankMasalah へ戻れる） |

Kanflow 側の追加: 外部参照テーブル（`system = bankmasalah`, `kind = topic / issue`, `external_id`, `url`）と受け口 API。BankMasalah 側の追加: `record_link` の種類に `kanflow_project` を加える（または外部リンク欄）。

### 5.3 進捗の戻し（③ → ②）

- Kanflow が要約 API を提供: 計画進捗 %、スケジュール状態、次のマイルストーン、遅延している項目、直近スプリントの完了率。
- **健全度の言葉が両者で同じ**（BankMasalah の `topic_progress.health` と Kanflow 全体計画の `scheduleState` がどちらも `on_track / at_risk / delayed`）。会議で課題の打点を記録するとき、Kanflow の値を**下書きとして自動入力**し、人が確認して確定する（AI 下書きと同じ「人が確定」の原則）。
- 課題の KPI 実績値は、段階 1 以降 PFS の実績（OEE / OLE / 不良率など）から自動取得できる（§9）。

### 5.4 締め

- Kanflow のプロジェクトがアーカイブ（完了）されたら、課題側に「完了にしますか」を提案。課題を `done` にすると Kanflow 側にアーカイブを提案（どちらも自動では閉じない）。
- 課題の締めで「標準化」の証跡が必要な場合（Volume 45 の P5）、Kanflow の成果物（PBI・添付）の安定 URL を参照として渡す。

### 5.5 ポータル

ポータルの「自分宛ての項目」に、BankMasalah（担当の問題点・課題）と Kanflow（担当タスク・期限超過・メンション）をまとめて表示。Kanflow は `GET /api/portal/summary` を提供する。

## 6. 段階的な移行計画

| 段階 | 内容 | 前提 | 目安 |
|---|---|---|---|
| **0 準備** | ① 工場の時間帯を設定化（Tokyo 固定の解消） ② Prisma の物理名を `@@map` で規約名に変更する準備 ③ コンテナイメージ化（Dockerfile、`next start`、ワーカー別コンテナ） | — | 3〜4 日 |
| **T 移行** | PFS の PostgreSQL に Kanflow 専用 DB を作成し MySQL から移行。PFS の Docker Compose に `kanflow-web` / `kanflow-worker` を追加、TLS プロキシ配下へ。バックアップ・監視は PFS 共通の仕組み（pgBackRest / Prometheus / Loki）を使う | §3 の移行作業 | 2〜3 週間 |
| **SSO** | Keycloak 導入後（Volume 48 の A〜D）、Kanflow を OIDC 化、並行ログイン → 旧ログイン停止 | #14 の決定（ID-1〜ID-12） | 1〜2 日（Kanflow 側） |
| **連携** | 課題 → PBI / 計画項目（トークン交換）、ポータル summary API | SSO 完了 | 3〜5 日 |
| **1 pfsdb** | pfsdb（スキーマ `pfs`）へ移設。テーブル名 `te_kf_*` / `me_kf_*`、監査 8 列 + `plant_code`、命名規則検査（`verify_fullstack_db.py`）合格、マイグレーション番号 0015 以降を MR で採番。ユーザーは `me_user` と連携 | pfsdb 本番稼働、仕様側レビュー | 2〜3 週間 |

## 7. 決めていただきたいこと

| # | 内容 | 私の推奨 |
|---|---|---|
| K-1 | ~~BankMasalah の DB に同居するか~~ | **決定（2026-10-01）: 同居しない。** Kanflow 専用 DB を持ち、API で連携 |
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

## 9. Kanflow が PFS 上にあることで生まれる利便性

| # | 利便性 | 具体的に何ができるか | 前提 |
|---|---|---|---|
| 1 | **改善の一気通貫** | 異常検知（ZEVA）→ 問題点 → 課題 → プロジェクト → 対策の実行 → 効果検証 → 標準化 が一本の線でたどれる。「この改善はどの異常から始まり、今どこまで進み、効いたのか」を 1 画面で追える | §5 の連携、Volume 45 の `te_issue` |
| 2 | **成果の自動測定** | プロジェクトのゴール KPI（例: ライン 12D の OEE、不良率、チョコ停回数）を PFS の実績から自動で取得し、ダッシュボードに「理論値との差」で表示。手入力の進捗ではなく結果で進捗が分かる | L3 API（OEE / OLE / ZEVA 指標） |
| 3 | **マスタを選ぶだけ** | 対象のライン・設備・品目・工程を PFS のマスタから選択（手入力しない）。同じ設備に関わるプロジェクト・問題点を横断して検索できる | PFS マスタ、L3 API |
| 4 | **人と組織の自動同期** | 利用者・所属・役職・組織階層は HR → PFS から自動反映。異動しても Kanflow 側の手作業は不要。セクション管理者のポートフォリオも組織マスタから自動で決まる | Volume 48（SSO）、`mm_m_person_assignment` / `mm_m_org_unit` |
| 5 | **1 回のログインとポータル** | BankMasalah・Kanflow・今後のアプリを 1 回のログインで使える。ポータルに自分宛ての項目がまとまる | Keycloak、ポータル |
| 6 | **工数・予算との接続** | タスクの見積・実績工数を、PFS の要員計画（Volume 42）・予算（Volume 47）と突き合わせ、改善プロジェクトにかかった人件費や効果金額を出せる | Volume 42 / 47 |
| 7 | **工場・部門をまたぐ横展開** | 他工場・他ラインの同種プロジェクトや再発を検索し、良い対策を横展開できる（plant_code 共通化のため） | 段階 1（pfsdb） |
| 8 | **AI の質の向上** | AI チャットが「このラインの今週の OEE は」「同じ設備の過去の対策は」など現場データを根拠に答えられる。完了した課題・プロジェクトの知見は AI の改善要求（`te_ai_improve_request`）経由で知識として蓄積 | L3 API、AI サーバー |
| 9 | **運用の一本化** | バックアップ（pgBackRest）、監視（Prometheus / Grafana / Loki）、TLS、認証が PFS 共通。Kanflow 専用の Windows サービス・MySQL 運用が不要になり、障害対応・更新手順も他アプリと同じになる | PFS 運用基盤 |
| 10 | **横断の集計** | 「問題点の発生 → 課題化 → プロジェクト化 → 完了」までのリードタイム、部門別の改善件数・効果を 1 つのダッシュボード（Grafana 等）で見られる | 段階 1 |

逆に注意すべき点: PFS のルール（命名・監査列・API 経由のみ・変更は MR とレビュー）に従うため、**変更の手続きは今より重くなる**。小さな UI 改善は Kanflow 単体のリリースで素早く出し、DB 変更を伴うものは PFS の手順に乗せる、という二段構えにする。
