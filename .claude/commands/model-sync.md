---
description: エージェントモデル（ルートリポジトリ）だけを push/pull/status する。apps/ 配下の製作物には一切触れない。
argument-hint: "[status|pull|push] [--dry-run]"
allowed-tools: Bash
disable-model-invocation: true
---

# /model-sync

**このリポジトリ（= 汎用 AI エージェントモデル）** の GitLab リモートに対する
push/pull/status。ルートの git 操作は `/apps/*` を追跡対象外にしているため、
**製作物リポジトリには物理的に触れません**（workspace model —
[`.claude/rules/iotpf-git-workflow.md`](../rules/iotpf-git-workflow.md) §1.1）。

製作物側を操作したいときは [`/app-sync`](./app-sync.md) を使ってください。

## Run

```bash
node scripts/workspace-sync.js model $ARGUMENTS
```

引数なし = `status`（読み取り専用）。

## サブコマンド

- **`status`**（既定）— ルートの現在ブランチ・upstream・ahead/behind・未コミット数を表示。
- **`pull`** — `git pull --ff-only`。想定外のマージを作らない（fast-forward のみ）。
- **`push`** — 現在ブランチを push。**強制 push はしない**。upstream 未設定なら
  `-u origin <branch>` で設定。`main` / `release/*` は保護ブランチのため警告
  （通常は MR 経由で反映）。フック（`block-no-verify` / `confidential-scan`）は
  通常どおり発火します。

## オプション

- `--dry-run` — 実行せず、走るコマンドだけ表示。
- `--json` — 機械可読な結果オブジェクトを出力。

## 例

```bash
node scripts/workspace-sync.js model            # ルートの状態を確認
node scripts/workspace-sync.js model pull       # main/自ブランチを ff-only で更新
node scripts/workspace-sync.js model push       # 現在ブランチを push（MR 前提）
node scripts/workspace-sync.js model push --dry-run
```

> push 前に `node scripts/self-heal.js --check` でゲートを通し、MR は
> `glab`（[`gitlab-mr-workflow`](../skills/gitlab-mr-workflow) スキル）で開くのが
> このリポの流儀です。
