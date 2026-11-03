---
description: Manage one git worktree per parallel Claude Code session — create, show cross-worktree overlaps, sync with the trunk, clean up after merge.
argument-hint: new <type>/L<layer>-PBI-<number>-<topic> [--app <project>] | status | sync | done <name>
allowed-tools: Bash
---

# /worktree

Parallel sessions on one repository each work in their own git worktree
(`.claude/rules/iotpf-git-workflow.md` §4.2). Procedure, task splitting and
build-cache guidance: the `parallel-worktrees` skill.

## Run

```bash
node scripts/worktree.js new feat/L3-PBI-34-topic              # new worktree + convention-named branch from origin/main
node scripts/worktree.js new feat/L3-PBI-34-topic --app iotpf  # also pair a worktree of the apps/iotpf product repo
node scripts/worktree.js status                         # branches, drift, overlaps, registration points (--json)
node scripts/worktree.js sync                           # in a feature worktree: fetch, merge trunk, self-heal
node scripts/worktree.js done feat/L3-PBI-34-topic             # from the main checkout, after the squash merge
```

With `$ARGUMENTS`, run `node scripts/worktree.js $ARGUMENTS`. Without
arguments, run `status` and report overlaps and branches behind the trunk.

`new` only creates the worktree — tell the user to start a session inside it
(`cd <path> && claude`); this session keeps working where it is.

`done` deletes a worktree and its local branch. It refuses unlanded or
uncommitted work; pass `--force` only when the user asked to discard it.
