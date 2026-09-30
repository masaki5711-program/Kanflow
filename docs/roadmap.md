# Kanflow 拡張ロードマップ（2026-10〜）

2026-09-30 の UI / 仕組み監査に基づく全体計画。ブランチ `feat/roadmap-2026-10`（`feat/overhaul-2026-09` から派生）。

## 開発上の制約（全フェーズ共通）

- 開発機 = 本番機。`app/.env` は本番 DB（`scrum_tool`）を指す。
  - `prisma migrate dev` / `db push` / `migrate deploy` は**実行しない**。マイグレーションは SQL を手書き（または `prisma migrate diff --from-schema-datamodel --to-schema-datamodel --script`）で `app/prisma/migrations/<ts>_<name>/` に置き、本番反映は `docs/operations/deploy.md` の手順で行う。
  - `next build` を既定の `.next` に出力しない（本番が配信中）。検証は `npm run typecheck` / `npm test` / `npm run lint`。
- `npm install` / `npm ci` をしない（Web サービスのラッパーが `node_modules/next` 配下にある。Phase C 完了まで）。新規依存が必要な項目は「依存待ち」として保留。
- サービスの再起動・デプロイはしない。

## フェーズ

| フェーズ | テーマ | 項目 | 状態 |
|---|---|---|---|
| P0 | 安定化 | JWT 即時失効（isActive / role / tokenVersion を DB 確認）、displayId 一意制約 + リトライ、アップロードのマジックバイト検証・ストリーム書き込み・容量上限、運用アラート共通化、Collabora 監視、バックアップ二次保存先必須化 + リストア訓練自動化、カバレッジ閾値 + ローカル品質ゲート、`loading.tsx` / `not-found.tsx`、ガントのエラー表示、スプリント再取得の軽量化、AI 結果の再試行、言語切替の集約、設定の保存方式統一 | 進行中 |
| P2 | 協働基盤 | ActivityLog（監査・変更履歴）、Notification（アプリ内）、PBI コメント、楽観ロック（version / 409）、論理削除 + ゴミ箱、担当者の userId 正規化 | 未着手 |
| P1 | 日常操作性 | スプリントのカンバンボード、PBI 詳細モーダル一本化（閲覧→編集）、URL 状態 + PBI ディープリンク、バックログのドラッグ並べ替え + 一括操作、ダッシュボード再構成 + アクティビティ、マイタスクのその場更新、削除の Undo、横断検索（Ctrl+K）、通知ベル、バーンダウン履歴 + ベロシティ | 未着手 |
| P3 | AI 拡張 | 分析ツール追加（計画・リリース・ゴール・スプリント比較・ポートフォリオ）、承認付き書き込み提案、長時間レポートの worker 非同期化、チャット履歴保存、FULLTEXT 検索、Surveillance 閾値のプロジェクト設定化 + 通知連動 | 未着手 |
| P4 | 組織展開 | 部門ポートフォリオ画面、バックログ / スプリント / 計画の Excel エクスポート + バックログインポート、個人アクセストークン + 読み取り REST、メトリクス管理画面 | 未着手 |

P2 は P1 の前提（履歴・通知・担当者 ID）なので先に土台を作る。

## 依存待ち（新規パッケージ / 社内情報が必要）

| 項目 | 必要なもの |
|---|---|
| Next.js ≥ 16.3.3（GHSA-p293-qw3h-jr36） | deploy.md Phase C（ラッパー移設後に更新） |
| メール通知 | SMTP リレーのホスト情報 + `nodemailer`（Phase C 後に導入）。通知はチャネル抽象で実装し、メールアダプタを後付け |
| LDAP / AD 認証 | AD サーバー情報 + `ldapts` |
| ベクトル検索（RAG） | Ollama embedding モデルの選定と VRAM 評価 |
| Teams webhook | 社内ネットワークでの疎通確認 |
