---
description: apps/<project> 配下の製作物リポジトリ（各々独立した GitLab プロジェクト）を push/pull/status する。エージェントモデル本体には一切触れない。
argument-hint: "[status|pull|push] [<project>] [--dry-run]"
allowed-tools: Bash
disable-model-invocation: true
---

# /app-sync

**`apps/<project>/` 配下の製作物リポジトリ** に対する push/pull/status。各製作物は
このエージェントモデルとは**別の GitLab プロジェクト**で、独立して push/pull され
ます（workspace model —
[`.claude/rules/iotpf-git-workflow.md`](../rules/iotpf-git-workflow.md) §1.1）。
このコマンドは `apps/*` の中の git チェックアウトだけを操作し、
**エージェントモデル本体（ルートリポ）には触れません**。

エージェントモデル側を操作したいときは [`/model-sync`](./model-sync.md) を。

## Run

```bash
node scripts/workspace-sync.js app $ARGUMENTS
```

引数なし = 全製作物リポの `status`（読み取り専用）。製作物が1つも clone されて
いない場合（現在の状態）は、エラーではなく「ワークスペースは空」と案内します。

## サブコマンド

- **`status`**（既定）— `apps/*` にある全製作物リポのブランチ・ahead/behind・
  未コミット数を一覧。`<project>` を付けるとその1つだけ。
- **`pull`** — 各製作物リポで `git pull --ff-only`。1つ失敗しても他は続行し、
  最後にまとめて結果を報告。
- **`push`** — 各製作物リポの現在ブランチを push（**強制 push なし**、upstream
  未設定なら自動設定）。

## 引数・オプション

- `<project>` — `apps/<project>` の1リポだけに絞る（`status`/`pull`/`push` 共通）。
- `--dry-run` — 実行せず、走るコマンドだけ表示。
- `--json` — 機械可読な結果オブジェクトを出力。

## 例

```bash
node scripts/workspace-sync.js app                  # 全製作物リポの状態
node scripts/workspace-sync.js app pull             # 全製作物を ff-only で更新
node scripts/workspace-sync.js app push edge-pfe    # edge-pfe だけ push
node scripts/workspace-sync.js app status --json
```

## 新しい製作物を迎え入れる

```bash
# 既存プロジェクトに参加
git clone <プロジェクトURL> apps/<project>
# 新規システムを始める: GitLab に空プロジェクトを作成 → 空 clone → その中で構築
```

clone 後は `/app-sync status` に自動で現れます（`apps/*` の `.git` を検出）。詳細は
[`apps/README.md`](../../apps/README.md)。
