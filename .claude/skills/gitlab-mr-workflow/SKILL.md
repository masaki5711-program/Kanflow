---
name: gitlab-mr-workflow
origin: project
description: Create and manage GitLab Merge Requests on the IoTPF / ZEVA-Link project using the glab CLI. Branch creation, MR opening with the project template, layer-aware reviewer assignment, CI status checks, squash-merge. Use when the user wants to open an MR, request review, check CI, or merge on GitLab — not GitHub.
---

# GitLab MR Workflow (IoTPF / ZEVA-Link)

Operate GitLab Merge Requests for this project end-to-end with the `glab` CLI.
This skill implements the procedural side of
[`.claude/rules/iotpf-git-workflow.md`](../../rules/iotpf-git-workflow.md).

## When to Activate

- User says "open an MR", "create a merge request", "push for review",
  "request review", "merge it", "check CI on the MR".
- User mentions GitLab, `glab`, or this repository's GitLab URL.
- About to land changes on `main` — this skill is the only path (direct push
  to `main` is forbidden by §2 of the project git rule).

**Do NOT use** for GitHub Pull Requests — that is the separate `github-ops`
skill (`gh` CLI). This project is on GitLab.

## Tool Requirements

- **`glab` CLI** authenticated against the internal GitLab host. **Resolve the
  binary portably** — do not assume it is on `PATH`:
  ```bash
  # Find glab even when it is installed off-PATH (common on Windows, where the
  # installer drops it in %LOCALAPPDATA%\Programs\glab\glab.exe). This prints
  # an absolute path, or "NOT FOUND".
  GLAB=$(node scripts/check-tooling.js glab | sed 's/^glab: //')
  "$GLAB" auth status
  # if not logged in:
  "$GLAB" auth login --hostname gitlab.scm.service.infosys.yamaha.com
  ```
  A bare `glab --version` / `which glab` / `command -v glab` / `Get-Command glab`
  only checks `PATH` and will **falsely** report glab "not installed" when it is
  installed but unlinked — always resolve via `check-tooling.js` (or set
  `GLAB_PATH=<absolute path>`) before concluding it is missing.
- **Signed commits configured** (GPG or SSH). See project rule §3.
- **Real Yamaha email** in `user.email`.

If `check-tooling.js` prints `NOT FOUND`, then install it (`winget install
GLab.GLab` / `brew install glab` / `scoop install glab` / `apt install glab`),
or point `GLAB_PATH` at an existing install. Do not fall back to the web UI when
scripting an automated flow.

## End-to-end Flow

### 1. Branch

```bash
# from up-to-date main
git checkout main && git pull --ff-only
git checkout -b <type>/L<layer>-PBI-<number>-<topic>
```

Branch name MUST match `<type>/L<layer>-PBI-<number>-<topic>` per project rule
§2. Layer codes: `1`, `2`, `3`, `4`, `ai`, `infra`, `cross`. `PBI-<number>` is
the Product Backlog Item the branch delivers (`PBI` upper-case, no leading
zeros). Examples:

- `feat/L3-PBI-34-spc-window`
- `fix/L1-PBI-52-gateway-reconnect`
- `refactor/L4-PBI-18-dashboard-grid`
- `hotfix/L2-PBI-61-store-forward-overflow`

- `chore/Lcross-NOPBI-rule-sync` — work that has no PBI

If you do not know the PBI number, **ask the user** — never invent one. Work
that has no PBI (agent-model upkeep, non-project work) puts `NOPBI` in place
of `PBI-<number>`; use it only when the user says the work has no PBI.

If the name is wrong, fix it before pushing (`pre:bash:branch-name-guard`
blocks `git push` / `glab mr create` otherwise, and CI `ecc-policy` fails):
```bash
git branch -m <correct-name>
```

### 2. Commit

- Conventional Commits format (`<type>: <description>`).
- Atomic commits — one logical change each.
- Commits must be signed; verify with `git log --show-signature -1`.
- Never use `--no-verify` (blocked by `block-no-verify.js`).

### 3. Push and open the MR

```bash
git push -u origin HEAD
glab mr create \
  --fill \
  --target-branch main \
  --remove-source-branch \
  --squash-before-merge
```

`--fill` uses the latest commit subject/body as the MR title/description
draft. **Always edit the description afterwards** to populate every required
section from `.gitlab/merge_request_templates/default.md` (layer impact, test
plan, data-migration, confidential-data check) and to name the branch's PBI
under "Related issues / links".

To force the template explicitly:
```bash
glab mr create --template default
```

### 4. Assign reviewers (layer-aware)

Map affected layers to reviewers per
[iotpf-agents-skills.md](../../rules/iotpf-agents-skills.md):

| Affected layer | Required reviewer role |
|----------------|------------------------|
| L1 / L2 | Rust reviewer |
| L3 | TS reviewer (+ Rust reviewer if Rust files changed) |
| L4 | TS reviewer (+ accessibility reviewer if UI surface changed) |
| AI service | Python reviewer |
| auth / DB schema / external API | **also** a security-reviewer-trained engineer |

```bash
glab mr update <mr-iid> --reviewer <user1>,<user2>
glab mr update <mr-iid> --label "layer::L3,type::feat,review::needed"
```

If you do not know the team's assignment list, **ask the user** before
assigning — do not guess reviewer handles.

### 5. Watch CI

```bash
glab ci status               # current branch's pipeline
glab ci view                 # interactive pipeline view
glab mr view <mr-iid> --web  # open MR in browser
```

Do not request review until CI is green. If CI fails:

1. Read the failure (`glab ci view`).
2. Fix locally; commit; push.
3. CI re-runs automatically; check again with `glab ci status`.

### 6. Address review

- Resolve every thread before merge.
- Force-push only with `--force-with-lease` and only on your own branch.
  Notify reviewers in the MR thread when you do.

### 7. Merge

```bash
glab mr merge <mr-iid> --squash --yes
```

- Squash commit subject MUST be a Conventional Commit and reference the MR id:
  `feat: SPC window auto-tuning (!42)`.
- Source branch is deleted automatically by the `--remove-source-branch` flag
  set at MR creation.

## Common Recipes

### Quick "open MR for current branch"

```bash
git push -u origin HEAD && \
glab mr create --fill --target-branch main \
  --remove-source-branch --squash-before-merge
```

### List my open MRs

```bash
glab mr list --assignee @me
glab mr list --reviewer @me   # what I need to review
```

### Check approval state

```bash
glab mr view <mr-iid>          # shows approvals, threads, CI
glab mr approve <mr-iid>       # approve (reviewer side)
```

### Mark MR as draft / ready

```bash
glab mr update <mr-iid> --draft           # convert to draft
glab mr update <mr-iid> --ready           # mark ready for review
```

### Cherry-pick a hot-fix into a release branch

```bash
glab mr cherry-pick <mr-iid> --branch release/2026.06
```

## Failure Modes to Avoid

- **Direct push to `main`** — blocked by project policy. If you typed
  `git push origin main`, stop and convert to a feature branch + MR.
- **Force-push to a reviewed branch** — use `--force-with-lease`, and only
  after coordinating with the reviewer in the MR thread.
- **Skipping the template sections** — MRs without layer impact, test plan,
  data-migration declaration, and confidential-data check should be sent back
  for completion before review.
- **Assigning reviewers from the wrong layer** — reviews from someone outside
  the affected layer do not satisfy the rule. Re-route.
- **Merging with unresolved threads or red CI** — both are blocking; do not
  merge through them.

## Cross-references

- Procedural rule (the "what"): `.claude/rules/iotpf-git-workflow.md`
- Reviewer routing per layer: `.claude/rules/iotpf-agents-skills.md`
- MR template content: `.gitlab/merge_request_templates/default.md`
- Project context, layers, data sovereignty: `CLAUDE.md`
