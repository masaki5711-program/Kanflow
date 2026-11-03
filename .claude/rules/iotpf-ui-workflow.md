---
# On-demand (CLAUDE.md §9): attach when UI surfaces are touched.
paths:
  - "**/*.tsx"
  - "**/*.jsx"
  - "**/*.vue"
  - "**/*.svelte"
  - "apps/dashboard/**"
---

# IoTPF / ZEVA-Link — UI / Layer 4 作業ワークフロー

> オンデマンドルール（`paths:` 自動アタッチ）。エージェントの選定は
> [iotpf-agents-skills.md](./iotpf-agents-skills.md) の Layer 4 表に従う。

## 着工前

1. `pre:edit:design-direction-check` ゲート（セッション初回の UI 編集で発火）
   に従い、`rules/web/design-quality.md` と `frontend-design` スキル
   （`design-tokens.json` / `recipes.md`）をロードし、ビジュアル方向性
   （スタイル方向・パレット・タイポグラフィ・ダークモード）を確定する。
   未決なら AskUserQuestion でユーザーに確認。
2. `.claude/rules/web/` の該当ルール（design-quality / performance /
   security / testing）が自動アタッチされる — 手動ロード不要。

## 実装後の完了条件

UI は以下がすべて完了して初めて「完成」:

1. `design-reviewer` によるビジュアル品質レビュー（トークン遵守・階層・
   hover/focus/loading/error state 完備・脱テンプレ判定）。
2. `a11y-architect`（WCAG 2.2 AA）と `i18n-sync-auditor`（JA/EN/ID・
   ハードコード文字列検出）を併走。
3. 起動可能なら Playwright MCP / `browser-qa` でスクリーンショットを取得し、
   `design-quality.md` の「実プロダクトのスクリーンショットとして通用するか」
   チェックに照らす（1440px / 375px の 2 幅）。
