# IoTPF / ZEVA-Link — Agent & Skill Routing

> 本プロジェクト固有のエージェント／スキル・ルーティング。作業対象レイヤーに
> 応じて言語別エージェント・スキルを使い分けることが必須（レイヤー定義は
> [../../CLAUDE.md](../../CLAUDE.md) §1.2）。

## レイヤー別エージェント

### Layer 1 & 2 — Edge & Gateway (Rust)

| 作業内容 | Agent |
|---------|-------|
| コードレビュー | `rust-reviewer` |
| ビルド／コンパイルエラー解決 | `rust-build-resolver` |
| TDD / テスト追加 | `tdd-guide` |
| パフォーマンス調査 | `performance-optimizer` |
| 24/7 運用観点の障害解析 | `silent-failure-hunter` |
| オブザーバビリティ（構造化ログ・停止検知・自動再起動） | `edge-observability-validator` |
| Store & Forward / 不安定NW耐性 | `store-and-forward-validator` |
| 高頻度ストリーム負荷・キュー飽和・バックプレッシャ検証 | `edge-load-saturation-validator` |
| PFE / Edge MCP 準拠審査 (Flow B) | `edge-mcp-toolset-reviewer` |

### Layer 3 — Platform & API (Rust data plane / TypeScript control plane)

| 作業内容 | Agent |
|---------|-------|
| Rust（ETL 1→2・ZEVA-Engine・判定ハブ） | `rust-reviewer` |
| TypeScript（L3 API・出力ハブ・fleet management） | `typescript-reviewer` |
| API 設計レビュー | `architect` → `code-reviewer` |
| DB スキーマ・SQL レビュー | `database-reviewer` |
| Tier-2 スキーマ凍結チェック | `tier2-schema-freeze-enforcer` |
| ETL 1→2 冪等性 / リネージ検証 | `etl-idempotency-checker` |
| タイムスタンプ TZ 整合 | `timezone-correctness-auditor` |
| ビルドエラー | `build-error-resolver` |
| セキュリティレビュー | `security-reviewer` |

### Layer 4 — Application & UI (Next.js)

| 作業内容 | Agent |
|---------|-------|
| コードレビュー | `typescript-reviewer` |
| ビジュアルデザイン品質レビュー（階層・トークン遵守・state 完備・脱テンプレ） | `design-reviewer` |
| アクセシビリティ監査 | `a11y-architect` |
| 多言語 (JA/EN/ID) 整合・ハードコード文字列検出 | `i18n-sync-auditor` |
| タイムスタンプ表示 TZ 整合 | `timezone-correctness-auditor` |
| E2E テスト作成・実行 | `e2e-runner` |
| 設計フェーズ | `code-architect` |

### AI & Data Science Service (Python)

| 作業内容 | Agent |
|---------|-------|
| Python レビュー | `python-reviewer` |
| アーキテクチャ設計 | `architect` |
| PyTorch ビルド／CUDA／学習エラー解決 | `pytorch-build-resolver` |
| LLM／RAG セキュリティ（プロンプトインジェクション・コンテキスト/トークン漏洩・データ主権・Flow B tool 境界） | `llm-security-reviewer` |
| LLM／RAG その他（設計・実装・評価） | `general-purpose`（専用 reviewer 無し） |

### デスクトップツール / 3D・シミュレーション（Tauri / three.js / 生産シム）

| 作業内容 | Agent |
|---------|-------|
| Tauri アプリ（IPC 入力検証・capability 最小権限・shell 注入） | `tauri-reviewer`（+ `rust-reviewer` / `typescript-reviewer`） |
| 3D / CAD（レンダーループ・dispose・単位/座標系・STEP） | `graphics-3d-reviewer` |
| シミュレーション（決定性・固定タイムステップ・ヘッドレス分離） | `simulation-reviewer` |

スキル: `tauri-patterns` / `3d-graphics-patterns` / `cad-step-processing` /
`simulation-engine-patterns`。シェーダーは `.claude/rules/shader/`（`paths:`
自動アタッチ）。capability 編集は `pre:edit:tauri-capability-check` が監視。

### 横断

| 作業内容 | Agent |
|---------|-------|
| 機能企画・実装計画 | `planner` → `code-architect` |
| 既存コードの探索 | `code-explorer` / `Explore` |
| 死コード整理 | `refactor-cleaner` |
| ドキュメント更新 | `doc-updater` |
| セキュリティ全般 | `security-reviewer` |
| **データ主権 / 秘密情報 / 製造機密 egress 検出（コミット前必須）** | `data-sovereignty-guard` |
| タイムスタンプ TZ の層跨ぎリネージ検証 (L1→L4) | `timezone-lineage-auditor` |
| GitLab MR 操作（作成・状態確認・squash merge） | `glab-mr-orchestrator` |
| コード簡素化・整合化 | `code-simplifier` |
| コメント正確性・腐敗検出 | `comment-analyzer` |
| 型設計のカプセル化・不変量レビュー | `type-design-analyzer` |
| MR テスト充足性レビュー | `pr-test-analyzer` |
| 最新ライブラリ docs 取得 (Context7 経由) | `docs-lookup` |
| 本リポ設定 (ECC harness) の最適化 | `harness-optimizer` |
| 自律ループ (`/loop`) の監視・介入 | `loop-operator` |
| 会話ログからフック候補を抽出 | `conversation-analyzer` |

## レイヤー別スキル

### Layer 1 & 2 — Edge

- `rust-patterns` / `rust-testing` — Rust 実装・テスト
- `mcp-server-patterns` — MCP SDK の API リファレンス (Node/TS)
- `pfe-edge-mcp-toolset` — **PFE の DB（Tier-1 / エッジデータレイク）を作る／
  変更する際は必須**。Flow B 標準ツール群を適合プロファイル制（full / forms /
  core / forwarder — `edge.manifest.json` 宣言、`validate-edge-mcp-conformance.js`
  ゲート検証）で定め、伝送/認証規約・生データ局所性・中央カタログ同期義務を
  課す。DB 単独で MR を切るのは設計不備として差し戻し対象
- `pfe-scaffold` — **新しい PFE/エッジのオンボーディング入口**。インタビュー→
  プロファイル判定→manifest / Tier-1 移行 / カタログ同期 / MCP スタブ / 必須
  テストを一式生成
- `iot-edge-resilience-validator` — 工場 LAN 耐性のコードレベル点検
  （`store-and-forward-validator` エージェントの補完）
- `hardware-data-stream-handler` — PLC/センサー高頻度ストリーム消費コードの
  生成・検証（メモリリーク・メインスレッド阻害・購読リーク対策）

### Layer 3 — Platform & API

- `api-design` / `supabase-postgres-best-practices` / `database-migrations` /
  `backend-patterns` / `e2e-testing`
- DB 変更の事前検証 3 点セット: `db-data-integrity-validator`（マイグレーションの
  データ破壊・ロックリスク）/ `db-query-performance-optimizer`（N+1・フルスキャン）/
  `db-security-isolation-checker`（テナント分離・パラメタライズ）

### Layer 4 — UI

- `frontend-design` — **UI を新規構築・大幅改修するとき必須**。トークンセット
  `design-tokens.json` とレシピ `recipes.md` を含む。場当たりな色・余白を
  書かず、トークンを消費する
- `frontend-patterns` / `design-system` / `accessibility` /
  `web-design-guidelines` / `e2e-testing`
- `ui-i18n-gate` — **UI 新規構築・大幅改修の前に必須**。i18n 要件（JA/EN/ID/ZH）を
  ユーザーに確認してから実装する（`pre:edit:ui-i18n-check` フックが監視）
- `factory-floor-ui-designer` — 工場現場端末（タブレット・タッチパネル PC）の
  オペレーター UI。手袋対応ターゲット・ポカヨケ確認・遠距離視認の状態色
- `dataviz` — チャート配色（プラグイン提供。未導入環境では
  `frontend-design/design-tokens.json` の `charts` セクション）

**「ダッシュボード」の語の使い分け**: Grafana/SigNoz 等の運用監視ボード →
`dashboard-builder`（メトリクス設計優先・反装飾）。アプリ内のダッシュボード
UI → `frontend-design`（+ `dataviz`）＋ `web/design-quality.md`。アプリ UI に
`dashboard-builder` の反装飾ガードレールを適用しないこと。

### AI & Data Science Service

- `python-patterns` / `python-testing`
- `claude-api` — プロンプト設計の参考（実体は Ollama だが設計原則は流用可）
- `cost-aware-llm-pipeline` / `iterative-retrieval` /
  `regex-vs-llm-structured-text`

### 横断

- `tdd-workflow` / `verification-loop` / `security-review`（コミット前）
- `documentation-lookup` / `search-first`（実装前調査）
- `gitlab-mr-workflow` — GitLab MR 操作の手順書（`glab-mr-orchestrator`
  エージェントの手続き側。エージェント委譲せず親コンテキストで MR を扱うときはこちら）
- `build-error-memory` — ビルド/テスト失敗時に mistake-memory を先に照会し、
  解決後に error→fix を記録する
- `parallel-worktrees` — 同じリポジトリを複数セッションで並行編集するとき
  （1 セッション 1 worktree、タスク分割、同期、複数 MR の着地順、`apps/<project>`
  の組 worktree。`node scripts/worktree.js` / `/worktree`）

上記以外の汎用スキル群は名前トリガーのオンデマンド資産 — 作業内容に合致した
ときに名前で呼び出す。

## コンテキスト予算（重要）

エージェント・スキルを同時に全ロードするとコンテキスト枠を使い切る。本エー
ジェントモデルは**選択的ロードが前提**:

- ルール: CLAUDE.md の `@`-import（常時）以外はすべて `paths:` オンデマンド
- エージェント: タスク該当時のみ起動（本ファイルのルーティングに従う）
- スキル: 名前トリガーのみ。「全スキルを読み込む」類の操作は行わないこと
- 監査には `context-budget` スキル / `harness-optimizer` エージェント

## 多言語対応 (i18n)

- UI 文字列・翻訳整合性チェック: `i18n-sync-auditor`（JA/EN/ID デフォルト、
  対象ロケール設定可能）
- 評価シート出力（JA/ID 併記）: AI Service 内に組み込み、`python-patterns` で実装

## 推奨ワークフロー

### 新機能（Edge → API → UI 縦断）

1. `planner` で実装計画 → `code-architect` で各レイヤー設計
2. レイヤー別に `tdd-guide` → 実装 → `<lang>-reviewer`（独立レイヤーは並列起動）
3. `security-reviewer` で横断レビュー（AI/LLM・RAG 面は `llm-security-reviewer` も併用）
4. `e2e-runner` で UI 〜 API の通し確認
5. **コミット直前**: `data-sovereignty-guard` でデータ egress / 秘密情報を必ずチェック
6. MR 操作は `glab-mr-orchestrator`（GitLab）を経由

### 作業種別の追加ステップ（`paths:` 自動アタッチ）

該当ファイルを触ると自動でロードされる — 手動ロードは不要:

- **UI / Layer 4** → `.claude/rules/iotpf-ui-workflow.md`
  （design-direction 確定 → `design-reviewer` / `a11y-architect` /
  `i18n-sync-auditor` の完了条件）
- **Edge / PFE** → `.claude/rules/iotpf-edge-operations.md`
  （審査エージェント順序と fleet-management 仕様の参照義務）
- **DB / スキーマ** → `.claude/rules/iotpf-pfs-data-model.md`
  （pfsdb 実構造と凍結スコープ、審査エージェント順序）
