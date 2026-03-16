# Scrum Tool - 仕様書

## 1. プロジェクト概要

アジャイル・スクラム開発チームのためのバックログ管理Webアプリケーション。
既存のExcel運用（ICE_BOX.xlsx）をWebアプリに置き換え、チーム全体のリアルタイム協業を実現する。

### 対象ユーザー
- **PO（プロダクトオーナー）**: バックログの優先度管理、受入確認
- **SM（スクラムマスター）**: スプリント進捗の可視化、障害管理
- **開発チームメンバー**: タスク確認、ステータス更新

---

## 2. データモデル（Excelシート構造から導出）

### 2.0 プロジェクト・チーム・メンバー

#### Project（プロジェクト）
| フィールド | 型 | 説明 |
|---|---|---|
| id | UUID | 一意識別子 |
| name | string | プロジェクト名 |
| description | text | プロジェクト概要 |
| status | enum | `active` / `archived` |
| created_at | datetime | 作成日 |
| updated_at | datetime | 更新日 |

#### User（ユーザー）
| フィールド | 型 | 説明 |
|---|---|---|
| id | UUID | 一意識別子 |
| name | string | 氏名 |
| email | string | メールアドレス（ログインID） |
| avatar_url | string | アバター画像URL |
| created_at | datetime | 作成日 |

#### ProjectMember（プロジェクトメンバー）
| フィールド | 型 | 説明 |
|---|---|---|
| id | UUID | 一意識別子 |
| project_id | FK | プロジェクト参照 |
| user_id | FK | ユーザー参照 |
| role | enum | `po` / `sm` / `dev` |
| joined_at | datetime | 参加日 |

- 1プロジェクトに複数メンバーを紐付け
- 1ユーザーは複数プロジェクトに参加可能
- ロール（PO/SM/Dev）はプロジェクト単位で設定
- PO は1プロジェクトに1人以上（複数PO可）
- SM は1プロジェクトに1人以上
- 各バックログ（IceBox, PB, Sprint, Release）は全て Project に紐づく

### 2.1 Product Goal（プロダクトゴール）
| フィールド | 型 | 説明 |
|---|---|---|
| id | UUID | 一意識別子 |
| project_id | FK | プロジェクト参照 |
| title | string | ゴール名（例: "Best Visit Indonesia"） |
| description | text | ゴールの詳細説明 |
| created_at | datetime | 作成日 |
| updated_at | datetime | 更新日 |

### 2.2 IceBox（アイスボックス）
要望・要求の収集場所。3つのステータスセクションを持つ。

| フィールド | 型 | 説明 |
|---|---|---|
| id | serial | 連番ID |
| project_id | FK | プロジェクト参照 |
| author | string | 記入者 |
| request | text | 要望・要求 |
| background | text | 課題・背景 |
| policy_doc | text | 方針資料 / 合意日付 / 合意者 |
| planning_doc | text | 企画資料 / 承認日付 / 承認者 |
| created_at | date | 初回記入日 |
| updated_at | date | 更新日 |
| assigned_po | string | 担当PO |
| status | enum | `unreviewed` / `reviewed` / `frozen` |
| pb_epic | string | PB Epic（未確認時） |
| rejection_reason | text | PB移行不可理由（確認済み時） |
| freeze_reason | text | 凍結理由（凍結時） |
| po_hearing_memo | text | POヒアリングメモ |
| po_review_memo | text | PO検討メモ |
| po_flag | string | PO自由フラグ |
| sort_order | int | 表示順（優先度） |

### 2.3 Product Backlog（プロダクトバックログ）
| フィールド | 型 | 説明 |
|---|---|---|
| id | serial | 連番ID |
| project_id | FK | プロジェクト参照 |
| icebox_id | FK | IceBox参照 |
| initiative | string | 個別機能名 |
| epic | string | ストーリーの集まり |
| user_story | text | ユーザーストーリー |
| acceptance_criteria | text | 機能受入条件 |
| reference_doc | text | 別資料リンク |
| workload_score | int | 業務負荷点数（POが設定） |
| completed_at | date | 完成日 |
| assigned_po | string | 担当PO |
| po_note | text | POメモ |
| status | enum | `ready` / `not_ready` |
| not_ready_reason | text | 着手不可理由 |
| sort_order | int | 表示順（POが手動で並び替え = 優先順位） |

#### 業務負荷スコアとスプリント計画

PB項目ごとに**業務負荷点数**（そのアイテムを実施するのにかかる負荷）をPOが設定する。
優先順位はPOがドラッグ&ドロップで手動設定する（sort_order）。

##### スプリントへの取り込みフロー
```
PB (Ready, POが並べた優先順位順)
    |
    v  上位から順に取り込み
    |
    v  業務負荷点数の合計 <= スプリントキャパシティ か確認
    |
    v  超過する場合は警告表示、POが判断
Sprint Planning 完了
```

##### キャパシティの運用
- POがスプリント作成時にキャパシティ（点数上限）を設定
- プロジェクトごとにキャパシティは異なる
- POはスプリントを重ねるごとに「1点の重み」を把握し調整
- 過去スプリントの実績（消化点数）を参照してキャパシティを見直す

### 2.4 Sprint Backlog（スプリントバックログ）
| フィールド | 型 | 説明 |
|---|---|---|
| id | UUID | 一意識別子 |
| project_id | FK | プロジェクト参照 |
| sprint_name | string | スプリント名（例: "SB-20260301-1w"） |
| start_date | date | 開始日 |
| end_date | date | 終了日 |
| sprint_goal | text | スプリントゴール |
| capacity | int | キャパシティ（業務負荷点数の上限、POが設定） |
| actual_score | int | 実績消化点数（自動集計） |
| status | enum | `planning` / `active` / `review` / `done` |

#### Sprint Backlog Item（スプリントバックログ項目）
| フィールド | 型 | 説明 |
|---|---|---|
| id | UUID | 一意識別子 |
| sprint_id | FK | スプリント参照 |
| pb_id | FK | プロダクトバックログ参照 |
| task_name | string | タスク名 |
| assignee | string | 担当者 |
| estimated_hours | float | 見積時間 |
| actual_hours | float | 実績時間 |
| status | enum | `todo` / `in_progress` / `done` |

#### 完成の定義（Definition of Done）
- テストコード、プロダクションコード含め全てのコードがチェックインされている
- 全ての単体テストを完了している
- PBの機能受入条件に対してテストが完了している
- 機能デモの準備が出来ている

### 2.5 Release Backlog（リリースバックログ）
| フィールド | 型 | 説明 |
|---|---|---|
| id | UUID | 一意識別子 |
| project_id | FK | プロジェクト参照 |
| plan_version | string | 計画バージョン |
| pb_id | FK | PB参照 |
| icebox_id | FK | IceBox参照 |
| initiative | string | 個別機能名 |
| epic | string | Epic |
| user_story | text | ストーリー |
| assigned_po | string | 担当PO |
| release_version | string | リリースバージョン |
| release_date | date | リリース日 |
| release_note | text | リリースノート |
| manual_link | text | マニュアル/SOPリンク |
| po_note | text | POメモ |
| status | enum | `staged` / `released` |

---

## 3. 画面構成

### 3.0 プロジェクト・チーム管理画面
- プロジェクト一覧・作成・編集・アーカイブ
- プロジェクト選択でコンテキスト切り替え
- メンバー招待・削除
- ロール設定（PO / SM / Dev）
- メンバー一覧表示（ロール別）

### 3.1 ダッシュボード
- プロダクトゴール表示
- 各バックログの件数サマリー
- 現在のスプリント進捗（バーンダウンチャート）
- 直近のリリース情報
- **スプリント実績推移**（キャパシティ vs 実績消化点数の履歴グラフ）

### 3.2 IceBox管理画面
- 3セクション表示（未確認 / 確認済み / 凍結）
- 誰でも「未確認」セクションに新規追加可能
- POのみ：確認済み・凍結への移動、並び替え
- ドラッグ&ドロップで優先度変更

### 3.3 プロダクトバックログ画面
- 2セクション表示（Ready / Not Ready）
- IceBoxからの取り込み機能
- ユーザーストーリー・受入条件の編集
- **業務負荷点数の入力**（POが設定）
- POによるドラッグ&ドロップ優先度変更
- 業務負荷点数の合計表示

### 3.4 スプリントバックログ画面
- スプリント作成（期間・ゴール設定・**キャパシティ設定**）
- PBから優先順位上位のアイテムを取り込み
- **業務負荷合計 vs キャパシティのゲージ表示**（超過時に警告）
- **過去スプリント実績の参照パネル**（キャパシティ調整の参考）
- タスク分解・担当者アサイン
- カンバンボード（Todo / In Progress / Done）
- バーンダウンチャート
- 完成の定義チェックリスト

### 3.5 リリースバックログ画面
- 2セクション表示（Staged / Released）
- リリースバージョン・日付管理
- リリースノート編集

---

## 4. 権限モデル

| 操作 | PO | SM | Dev |
|---|---|---|---|
| IceBox 新規追加（未確認） | o | o | o |
| IceBox ステータス変更 | o | x | x |
| IceBox 優先度変更 | o | x | x |
| PB 編集・並び替え | o | x | x |
| PB 業務負荷点数設定 | o | x | x |
| Sprint キャパシティ設定 | o | x | x |
| プロジェクト作成・編集 | o | o | x |
| メンバー招待・ロール設定 | o | o | x |
| Sprint 作成 | o | o | x |
| Sprint タスク更新 | o | o | o |
| Release 管理 | o | x | x |
| ダッシュボード閲覧 | o | o | o |

---

## 5. 技術スタック（案）

### フロントエンド
- **Next.js 14** (App Router)
- **TypeScript**
- **Tailwind CSS** + **shadcn/ui**
- **@dnd-kit** (ドラッグ&ドロップ)
- **Recharts** (バーンダウンチャート)

### バックエンド
- **Next.js API Routes** (フルスタック)
- **Prisma ORM**
- **SQLite**（初期）→ PostgreSQL（スケール時）

### 認証
- **NextAuth.js** (メール/パスワード or SSO)

### デプロイ
- **Vercel** or **Docker** (社内サーバー)

---

## 6. アイテムのライフサイクル（フロー）

```
[要望発生]
    |
    v
IceBox (未確認)  -- 誰でも投入可
    |
    v  (POレビュー)
IceBox (確認済み)  -- or -- IceBox (凍結)
    |
    v  (PBへ移行)
Product Backlog (Not Ready)
    |
    v  (詳細化・見積り完了)
Product Backlog (Ready)
    |
    v  (スプリントプランニング)
Sprint Backlog
    |
    v  (開発・テスト・受入)
Done
    |
    v  (リリース判断)
Release Backlog (Staged)
    |
    v  (リリース実施)
Release Backlog (Released)
```

---

## 7. MVP（最小実行可能製品）スコープ

### Phase 1: プロジェクト・チーム基盤
- [ ] プロジェクト初期セットアップ（Next.js + Prisma + SQLite）
- [ ] ユーザー認証（NextAuth.js）
- [ ] プロジェクト CRUD
- [ ] メンバー管理（招待・ロール設定: PO/SM/Dev）
- [ ] プロジェクト切り替え

### Phase 2: コアバックログ管理
- [ ] プロダクトゴール CRUD
- [ ] IceBox CRUD（3セクション、ドラッグ&ドロップ）
- [ ] プロダクトバックログ CRUD（Ready/Not Ready）
- [ ] PB 業務負荷点数の設定
- [ ] PO による優先順位のドラッグ&ドロップ並び替え
- [ ] IceBox → PB への移行機能

### Phase 3: スプリント管理
- [ ] スプリント作成（キャパシティ設定）
- [ ] PBから優先順位順に取り込み（負荷合計 vs キャパシティ表示）
- [ ] スプリントバックログ（カンバンボード）
- [ ] 過去スプリント実績の参照（キャパシティ調整支援）
- [ ] バーンダウンチャート
- [ ] 完成の定義チェック

### Phase 4: リリース・ダッシュボード
- [ ] リリースバックログ CRUD
- [ ] リリースノート生成
- [ ] ダッシュボード（サマリー、スプリント実績推移グラフ）

### Phase 5: 拡張
- [ ] Excelインポート/エクスポート
- [ ] 通知機能
- [ ] ベロシティトラッキング
- [ ] レトロスペクティブ記録
