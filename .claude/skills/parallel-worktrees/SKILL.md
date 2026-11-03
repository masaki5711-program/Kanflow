---
name: parallel-worktrees
origin: project
description: Run several Claude Code sessions on the same repository without conflicts — one git worktree per session via scripts/worktree.js, task splitting by file ownership, sync cadence, landing order for multiple MRs, paired product-repo worktrees under apps/<project>, and per-worktree dependency/build-cache setup. Use when starting a second session on a repo, splitting work across sessions, seeing a worktree-boundary or overlap block, or landing several open branches. Do not use for a single session on one branch, or for MR mechanics themselves (gitlab-mr-workflow).
---

# Parallel Worktrees

One session, one worktree, one branch. The rule is
`.claude/rules/iotpf-git-workflow.md` §4.2; this is the procedure.

Worktrees remove collisions **while working**. They do not remove collisions
**at merge** — that part is task splitting, syncing, and landing order.

## 1. Split the work before opening sessions

Split by **files touched**, not by topic. Good splits: API vs. UI, one hook vs.
another skill, implementation vs. an unrelated doc. Bad split: two tasks that
both add a hook — both edit the same registration points.

Registration points (every asset addition touches them; only one open branch
at a time should): `.claude/settings.json`,
`scripts/hooks/bash-hook-dispatcher.js`, `.claude/rules/iotpf-agents-skills.md`,
`scripts/self-heal.js`, `docs/agent-model-changelog.md`,
`docs/agent-model-master-spec.md`, `CLAUDE.md`, `.gitlab-ci.yml`,
`.gitattributes`, `.gitignore`.

Start with **2–3 sessions**. The limit is how much a person can review, and
`worktree.js` warns above `ECC_MAX_PARALLEL_WORKTREES` (default 3).

## 2. Create a worktree per session

From the main checkout (which stays on `main`):

```bash
node scripts/worktree.js new feat/L3-PBI-34-spc-window              # agent model only
node scripts/worktree.js new feat/L3-PBI-34-spc-window --app iotpf  # + product repo apps/iotpf
cd .claude/worktrees/feat-L3-spc-window && claude
```

- The branch is cut from `origin/main` with the §2 name, so it passes CI.
- `--app <project>[:<branch>]` adds a worktree **of the product repository**
  at `apps/<project>` inside the new worktree (default: same branch name).
  Hooks and gates resolve by path, so `references/` lookup and the test gate
  work as in the main checkout. Without `--app`, the worktree has no product
  code — product work then belongs in the main checkout.
- `claude --worktree <name>` also works, but creates `worktree-<name>`:
  `git branch -m <type>/L<layer>-PBI-<number>-<topic>` before the first push.

### Per-worktree setup

A worktree is a separate folder: untracked files and build output are not
shared. `new` copies `.claude/settings.local.json`, `.env`, `.env.local` when
they exist; everything else is per worktree:

| Stack | Do | Avoid |
|-------|----|-------|
| Rust | Keep `target/` per worktree; share compiled objects with `sccache` (`RUSTC_WRAPPER=sccache`). Budget disk: one `target/` per worktree. | A shared `CARGO_TARGET_DIR` — cargo's build lock serializes the sessions, and a test gate that waits past its timeout is skipped, not failed. |
| Node | `pnpm install` per worktree (the global store makes it cheap). | Copying or junction-linking `node_modules`. |
| Python | A fresh `.venv` per worktree. | Copying a venv (absolute paths inside). |
| Services | A distinct dev-server port and `COMPOSE_PROJECT_NAME` per worktree. | Two sessions on the same port or compose project. |

Windows: deep paths under `.claude/worktrees/<name>/apps/<project>/` can exceed
260 characters — `git config --global core.longpaths true`.

## 3. While working

- Edit only this worktree. `pre:edit:worktree-boundary` blocks a path that
  belongs to another worktree and prints the path of this worktree's copy.
  Bash writes are not covered — do not `cd` into another worktree to edit.
- The first edit of a file that another worktree has already changed is
  blocked **once**. Decide: move the change to the other branch, wait and
  sync, or retry to proceed knowingly. A checkout sitting on `main` is the
  landing area and is not counted — keep feature work out of it.
- `node scripts/worktree.js status` — every worktree's branch, distance from
  the trunk, changed files, and files changed on more than one branch.
- Sync daily and whenever another branch lands:
  `node scripts/worktree.js sync` (fetch → merge `origin/main` → self-heal).
  Conflicts confined to generated views (`docs/asset-inventory.md`,
  `MISTAKES.md`) are resolved by regeneration. Commit what it regenerates.
  For the product repo, run it from inside `apps/<project>`:
  `node ../../scripts/worktree.js sync`.

## 4. Landing several branches

1. `node scripts/worktree.js status --json` — read `overlaps` and each
   `registrationPoints`.
2. Land first the branches with **no overlap and no registration point**; any
   order.
3. Then the rest **one at a time**. After each merge, every remaining branch:
   `worktree.js sync` → commit regenerated views → `self-heal --check` → push.
4. Write the `docs/agent-model-changelog.md` entry **after the final sync**,
   as the last commit — it is inserted at the same line on every branch.
5. After the squash merge: `node scripts/worktree.js done <name>` from the
   main checkout. It verifies the work is on the trunk (squash-aware), then
   removes the worktree, any paired product worktree, and the local branches.
   It refuses — until `--force` — on uncommitted changes, work not on the
   trunk (a detached HEAD included), a repository with no `main` to verify
   against, or a standalone clone sitting under the worktree's `apps/`.

MR mechanics (create, CI, merge) are the `gitlab-mr-workflow` skill /
`glab-mr-orchestrator` agent. A change spanning the agent model and a product
repo is two MRs — agent model first (§1.1).

## Why these files are special

| File | Behavior | Handling |
|------|----------|----------|
| `docs/asset-inventory.md` | Generated. Two branches each adding one asset both write the same count; git merges it **without conflict** and the count is wrong on `main`. | Never hand-merge. `sync` regenerates it after every merge. |
| `MISTAKES.md` | Generated from `records.jsonl`. | Same. |
| `.claude/mistakes/records.jsonl` | Not append-only: a recurring failure rewrites its line. Merged with `merge=union`, which can leave one id twice. | `sync` → self-heal runs `mistakes.js dedupe`. |
| Binary docs (`*.pptx`, `*.pdf`, `*.xlsx`, `*.db`) | Cannot be merged. | One owner, one isolated commit (§4.1). |

## Limits

- GitLab's server-side merge ignores `merge=union` and cannot regenerate
  views: a branch must be synced locally right before it lands.
- The boundary hook sees Edit/Write tools only, not shell redirection.
- The branch-name guard judges only what it can resolve to a branch (the
  checked-out branch, a local branch name, `refs/heads/…`); tags and names it
  cannot resolve pass, and CI remains the final check.
- Nothing is registered or leased. Overlap is computed from git, so it shows
  work that exists (committed or on disk), not work a session merely intends.
