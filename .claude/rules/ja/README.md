---
# Human-readable file — NEVER auto-attach to model context
# (CLAUDE.md §9 context budget). This file exists for human readers only.
paths:
  - "__i18n_reference_only__/**"
---

# ルール構成（日本語解説）

エージェントモデル v3（Fable 5 / Opus 5 世代）でルール層は次の構成になった。
モデル向けの正本はすべて英語版 — 本ファイルは人間の読者向けの案内のみ。

## 構成

- **常時ロード**（CLAUDE.md §9 の `@`-import、毎セッション読み込まれる）:
  - `common/baseline.md` — 言語非依存の基礎規約4点のみ
    （レビュー重大度語彙 / カバレッジ80% / model エイリアス規約 / 実装前リサーチ）
  - `iotpf-agents-skills.md` — レイヤー別エージェント・スキルルーティング
  - `iotpf-git-workflow.md` — GitLab / MR / ブランチ・コミット規約
  - `iotpf-self-improvement.md` — 自己修復・自己改善ループ
- **オンデマンド**（`paths:` frontmatter により該当ファイルを触ったときのみ
  自動アタッチ）:
  - 言語別: `typescript/` `rust/` `python/` `web/` `shader/`
  - 作業種別: `iotpf-ui-workflow.md`（UI）、`iotpf-pfs-data-model.md`
    （DB / ETL / Edge-MCP）、`iotpf-edge-operations.md`（Edge / デーモン）、
    `iotpf-architecture-contracts.md`（`apps/**` / proto / compose）

## v3 の設計原則

1. 使い方例は書かない — 契約・判断表・チェックリストの構造で伝える
2. 常時ロード最小化 — 「いつ読むか」を `paths:` とスキル名トリガーで制御
3. 同じ事実は1箇所所有 — 2箇所目はポインタのみ
4. 記憶は CLAUDE.md に書かない — Auto Memory / mistake-memory /
   changelog+ADR の役割分離（CLAUDE.md §8）

旧 `common/` 10ファイルとその ja/id 翻訳は 2026-08-13 に廃止（重複・一般論・
GitHub 前提の誤誘導のため）。経緯は `docs/agent-model-changelog.md` を参照。
