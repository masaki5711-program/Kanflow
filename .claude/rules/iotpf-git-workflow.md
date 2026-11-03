# IoTPF / ZEVA-Link — Git Workflow

Project-specific git rules for the Yamaha IoT Platform (IoTPF v2) and the
ZEVA-Link system. This file owns the git/MR process — the project is on
GitLab with a multi-layer team, not GitHub.

## 1. Hosting & tooling

- **Forge:** internal GitLab
  (`gitlab.scm.service.infosys.yamaha.com/.../agents_skills_claudecode`).
- **Workflow surface:** **Merge Requests (MRs)**, not Pull Requests. Use the
  **`glab`** CLI for automation; do not assume `gh`.
- **Default branch:** `main`. Long-lived release branches use `release/*`.

### 1.1 Two repositories — agent model here, product code in its own project (workspace model)

**Split executed 2026-07-22** (this was the "deliberate future split" this
section previously reserved). The layout is now:

- **This repository = the agent model** (`.claude/`, `scripts/`, `docs/`,
  `evals/`, rules, hooks, mistake-memory records). Its lifecycle is
  independent: hook/gate/knowledge updates (e.g. `.claude/mistakes/records.jsonl`)
  push/pull here without touching any product release flow. The model is
  **generic** — it hosts the development of *many* systems/apps over time.
- **`apps/` is a multi-project WORKSPACE, not a tracked tree.** Each
  system/app gets **its own GitLab project, created when that development
  starts**, and is cloned to `apps/<project>/`. This repository ignores the
  whole workspace (`/apps/*` in `.gitignore`, only `apps/README.md` is
  tracked). Working from this repo's root, `apps/**` files are on disk as
  usual — hooks, gates, and the spec rules all apply by path — but `git`
  inside `apps/<project>` talks to **that project's remote**, while `git` at
  the root talks to the **agent-model remote**. Independent push/pull per
  project, one working tree.

Daily setup (new machine / new member):

```bash
git clone <agent-model URL> agents_skills_claudecode   # 1. agent model first
cd agents_skills_claudecode
git clone <project URL> apps/<project>                  # 2. each product INTO apps/<project>
# starting a brand-new system: create its GitLab project first, then clone it
# empty into apps/<project> and build there (a references/ directory at ITS
# root — index + manifest.json + decisions.md + rich material; the
# pre:edit:apps-spec-check gate resolves apps/<project>/references/).
```

- **IoTPF scaffold archive**: the pre-split `apps/` content (edge-ref PFE,
  hub/ai/dashboard scaffolds, proto/schemas incl. pfsdb DDL, legacy spec.md —
  48 commits) is preserved on the branch **`archive/apps-iotpf-scaffold`** of
  this repo. To start the IoTPF product from it:
  `git push <new project URL> archive/apps-iotpf-scaffold:main`, then clone.

Rules that follow from the split:

- **Never commit product code to this repo** — the workspace is ignored; if
  `apps/**` (other than `apps/README.md`) appears in a root `git status`,
  something is wrong.
- **Each repo keeps its own MR flow** (§4 applies to every repo). Per-layer
  toolchain CI (rust/typescript/python) lives in the **product repo's**
  `.gitlab-ci.yml` (a template ships on the archive branch); this repo's CI
  validates the agent model only (its apps-dependent gates skip cleanly when
  the workspace is empty).
- **A change spanning both layers** (e.g. a new gate plus the product code it
  validates) is two MRs — land the agent-model MR first, reference it from the
  product MR.
- The `stop:test-gate` hook detects nested product checkouts under
  `apps/<project>/` and asks *their* git for uncommitted changes, so the test
  gate keeps working across the boundary.

## 2. Branch strategy

- **`main` is protected.** No direct pushes. Every change lands through an MR.
- **Feature branches branch off `main`** and are short-lived (target: merge or
  drop within 5 working days).
- **Branch naming:** `<type>/L<layer>-PBI-<number>-<short-topic>`; the topic
  is kebab-case.
  - `<type>` ∈ `feat`, `fix`, `refactor`, `docs`, `test`, `chore`, `perf`,
    `ci`, `hotfix` (matches Conventional Commits).
  - `<layer>` ∈ `1`, `2`, `3`, `4`, `ai`, `infra`, `cross` — matching
    ZEVA-Link layers (see [CLAUDE.md](../../CLAUDE.md) §1.2) and
    [iotpf-agents-skills.md](./iotpf-agents-skills.md).
  - `PBI-<number>` is the Product Backlog Item the branch delivers: `PBI`
    upper-case, the number without leading zeros, directly after the layer.
    If the number is unknown, ask; never invent one. One branch = one PBI; a
    PBI may be delivered by several branches (different topics).
  - **Work that has no PBI** (agent-model upkeep, anything not run as a
    project backlog item) says so explicitly: `NOPBI` takes the place of
    `PBI-<number>` — `<type>/L<layer>-NOPBI-<short-topic>`. Omitting the
    segment is not allowed. `NOPBI` states a fact about the work; it is not a
    way to skip looking the number up, and an agent uses it only when the user
    has said the work has no PBI.
  - Examples: `feat/L3-PBI-34-spc-window`, `fix/L1-PBI-52-gateway-reconnect`,
    `refactor/L4-PBI-18-dashboard-grid`, `feat/Lai-PBI-7-anomaly-router`,
    `hotfix/L2-PBI-61-store-forward-overflow`, `chore/Lcross-NOPBI-rule-sync`.
  - Enforced at `git push` / `glab mr create` (`pre:bash:branch-name-guard`)
    and in CI (`ecc-policy`) — both read the one pattern in
    `scripts/validate-git-policy.js`.
- **Hot-fixes** branch off `main` (or the affected `release/*`), are reviewed
  with the same MR process, and merge back into both `main` and `release/*`
  when applicable.

## 3. Commits

- **Conventional Commits.** `<type>: <description>`, `<type>` ∈ `feat`, `fix`,
  `refactor`, `docs`, `test`, `chore`, `perf`, `ci`, `hotfix`.
- **Signed commits required** for shared branches. Configure either GPG or
  SSH signing locally:
  ```bash
  git config --global commit.gpgsign true
  # or:
  git config --global gpg.format ssh
  git config --global user.signingkey ~/.ssh/<key>.pub
  git config --global commit.gpgsign true
  ```
- **Author identity** must be your real Yamaha email. Do not commit with the
  auto-detected `<user>@<host>` form.
- **No `--no-verify`.** Bypassing the local hooks is blocked by
  `scripts/hooks/block-no-verify.js`; do not work around it.
- **Atomic commits.** One logical change per commit. If a feature touches
  multiple layers, prefer multiple commits (one per layer) within the same MR.

## 4. MR lifecycle (the only path into `main`)

1. **Branch + commit + push** with `-u origin <branch>`.
2. **Open the MR** with `glab mr create` and the project template (see
   `.gitlab/merge_request_templates/default.md`).
3. **Fill every required section** in the template: layer impact, test plan,
   data-migration declaration, confidential-data check.
4. **Assign reviewers per affected layer**, using the routing in
   [iotpf-agents-skills.md](./iotpf-agents-skills.md). Reviewer rules:
   - L1 / L2 (Rust): assign a Rust reviewer.
   - L3 (TS/Rust): assign a TS reviewer; add a Rust reviewer if Rust files
     changed.
   - L4 (Next.js): assign a TS reviewer; add an accessibility reviewer if UI
     surfaces change.
   - AI service (Python): assign a Python reviewer.
   - Anything touching auth, DB schema, or external APIs: **also** assign a
     `security-reviewer`-trained engineer.
5. **CI must be green** (all GitLab CI pipelines pass) before merge.
6. **Resolve every review thread.** No unresolved threads at merge.
7. **Merge method:** **squash merge**. The squash commit message MUST follow
   Conventional Commits and reference the MR (`(!<MR id>)`).
8. **Delete the source branch** on merge (default GitLab option).

### 4.1 Keep an open MR mergeable (conflict prevention)

MR !3 became unmergeable because its source branch was never synced with its
target while open **and** a sibling branch edited the same files in parallel —
the conflict only surfaced at merge time. To stop this class of error recurring:

- **Target `main`, not a sibling branch.** An MR's target is `main` (or a
  declared `release/*`) — never another in-flight `feat/*` / `chore/*` branch.
  Two moving targets guarantee drift. If you genuinely must stack, declare the
  base in the MR description and rebase the instant the base merges.
- **Sync the target into your branch early and often** — at minimum daily and
  immediately when GitLab reports "cannot be merged":
  ```bash
  git fetch origin
  git merge origin/<target>     # or rebase on your own un-reviewed branch (§5)
  # resolve → node scripts/self-heal.js --check → push
  ```
  (`node scripts/worktree.js sync` does the fetch, merge and self-heal in one step.)
  The point is to surface conflicts while they are small; never let them
  accumulate to merge time.
- **Don't let two open branches edit the same shared files.** Eval specs, the
  asset inventory, `docs/agent-model-changelog.md`, and generated decks are
  conflict magnets. Land such an edit on one branch and rebase the others onto
  it — do not duplicate the same change on parallel branches.
- **Binary docs (`*.pptx`, images) are deliberate, isolated commits.** Git
  cannot 3-way-merge a binary, so two independent regenerations always collide
  (exactly what hit `docs/claude-code-executive.pptx` in MR !3). One owner, one
  commit, one stated reason — never regenerate a binary as a byproduct of an
  unrelated commit.

### 4.2 Parallel sessions — one git worktree per session

Several Claude Code sessions on one repository each get their **own worktree**;
the main checkout stays on `main` as the landing area. Procedure and build-cache
guidance: `parallel-worktrees` skill. Tool: `node scripts/worktree.js`.

- **Create** with `worktree.js new <type>/L<layer>-PBI-<number>-<topic>` (add
  `--app <project>` to pair a worktree of that product repo at
  `apps/<project>`). A `worktree-<name>` branch from `claude --worktree` must be
  renamed to the §2 form before push — `pre:bash:branch-name-guard` blocks it.
- **Stay inside it.** Editing another worktree's files is blocked
  (`pre:edit:worktree-boundary`); a file already changed in another worktree
  blocks once — split tasks so files do not overlap.
- **Start with 2–3 sessions.** Review capacity is the bottleneck, not compute.
- **Land in order.** `worktree.js status` shows overlaps; branches touching a
  registration point (settings, hook dispatcher, routing, changelog, CI) land
  one at a time. After each merge the others run `worktree.js sync` (merge
  trunk, regenerate inventory / mistake views) and push.
- **Write the changelog entry last**, after the final sync.
- **After the squash merge** run `worktree.js done <name>` — never reuse a
  landed worktree or branch.

## 5. Force-push policy

- **`main` and `release/*`:** force-push is **strictly forbidden**. Treat the
  history on these branches as immutable.
- **Feature branches:** force-push is allowed **only on your own
  un-reviewed branch**. Once a reviewer has commented or approved, use
  `git push --force-with-lease` (never `--force`) and notify reviewers in the
  MR thread.
- **History rewriting** (`git rebase -i`, `git filter-repo`) on shared branches
  requires team-wide coordination and a documented reason. Default answer:
  **don't**.

## 6. Data sovereignty in version control

Manufacturing-confidential content must never enter the repository. This is a
hard rule derived from [CLAUDE.md](../../CLAUDE.md) §2 (Data sovereignty).
**Block before commit, not after.**

Never commit:

- **Raw waveforms, PLC dumps, sensor capture files**, or any sample that
  contains real shop-floor data (`.csv`, `.pcap`, `.bin`, `.parquet`, etc.
  with real values).
- **Real plant codes, line names, edge IPs, MAC addresses, serial numbers,
  lot numbers**, customer names, material IDs.
- **Credentials of any kind** — API keys, DB passwords, VPN configs,
  certificate private keys.
- **Local machine paths** that leak organizational structure
  (`C:\Users\<name>\...`, `\\<server>\<share>\...`).

When example data is needed, **synthesize it** and mark the source as
`synthetic` in comments / test fixtures.

If something confidential was committed: do not just `git rm` it. Treat it as a
**leak** — rotate any credentials, notify the team, then perform a coordinated
history purge (`git filter-repo`) and force-push following §5 with team
sign-off.

## 7. Pre-merge checklist

The MR template (`.gitlab/merge_request_templates/default.md`) owns the
pre-merge checklist — it mirrors §2–§6 of this file. Do not restate it here.

## 8. What overrides this file

- A specific [CLAUDE.md](../../CLAUDE.md) hard rule overrides any procedural
  rule here.
- A production incident allows skipping §4 step 1–4 *only* if a senior engineer
  signs off in writing; the post-incident MR documenting the fix still goes
  through the normal flow.
