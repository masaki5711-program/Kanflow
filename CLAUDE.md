# CLAUDE.md — Kanflow

Guidance for Claude Code in the **Kanflow** repository. This repository carries
the shared **agent model** (`.claude/` agents, commands, skills, rules;
`scripts/` hooks and gates), imported unchanged from the agent-model repository
(`D:\APP\Agents_skills_Claudecode`, see §7 for how to update it). This file holds
only what cannot be derived from the code: Kanflow's context and hard rules, and
the generic agent-model contracts. Do not append session facts or learnings here
(see §6).

---

## 1. What Kanflow is

Yamaha-internal agile project management tool (IceBox → Product Backlog →
Sprint → Release, 全体計画, Collabora documents, local AI on Ollama, ja / en / id),
run on **one internal server**. Layer: **L4** (Next.js). Relation to IoTPF:
**none** — no IoTPF data or interface; the DB engine follows the platform spec
(PostgreSQL 16 + TimescaleDB 2.28.1). The IoTPF-specific rules and agents of the
agent model (edge, PFE, Tier-2, ZEVA-Engine) do not apply to Kanflow.

- **v2** (in development): PostgreSQL, GitStation integration, schedule from
  actuals. Design source of truth: `D:\APP\git_station\Git\docs\plan\` — 02
  (integration API), 11 (M3 plan, K1–K4), 12 (schedule from actuals, E0–E6).
  Index and decisions: `references/README.md`, `references/decisions.md`.
- **Production is Ver2 since 2026-11-05** (v1 detached the same day): folder
  `D:\APP\KanflowV2` (detached at the latest `v2-prod-*` tag; `git -C D:/APP/KanflowV2 describe --tags`), service `KanflowV2`
  on :3000, PostgreSQL container `kanflow-v2-pg` (127.0.0.1:25440, DB
  `scrum_tool`), secrets `C:\KanflowV2Secrets`. v1 (`D:\APP\Kanflow`, service
  `Kanflow` set to Manual, MySQL) is stopped and kept only for rollback.

## 2. Hard rules (production safety)

1. **Never touch production.** `D:\APP\KanflowV2` (:3000, PG 127.0.0.1:25440)
   serves real work: no file, `.env`, service, `node_modules` or checkout change
   there and no connection to its database, except a deployment the user
   approved (new tag, build into `.next-new`, swap; dump the DB first when a
   migration ships). The stopped v1 (`D:\APP\Kanflow`, MySQL :3306) is the
   rollback: leave it untouched too. **v2 is one line: branch
   `feat/L4-NOPBI-kanflow-v2`, folder `D:\APP\Kanflow-v2`.** New work branches
   from it in its own worktree and merges back into it:
   `git worktree add D:/APP/Kanflow-<name> -b <type>/L4-NOPBI-<topic> feat/L4-NOPBI-kanflow-v2`.
2. **The K1 lineage (PostgreSQL) does not enter `main`** before the K2 cutover
   (runbook + human approval): production auto-deploy would run PG code against
   the MySQL URL. Every v2 branch descends from K1.
3. **Synthetic data only in tests.** Test PG: `ops/test-env/compose.yml`
   (127.0.0.1:25434, `kanflow_dev`; the v2 line uses `scrum_tool_v2` +
   `scrum_tool_v2_shadow`). DB tests run only with `KANFLOW_DB_TESTS=1` and the
   `app/.env` values exported (see `.github/workflows/ci.yml`). A branch with its own
   migrations uses its own database in that container (e.g. `scrum_tool_k3`).
   Anything using production data (K2 rehearsal) needs the user's approval.
4. **Push only after the user says so.** Remotes: `origin` (internal GitLab,
   MR flow), `github`. Commit author `Masaki Fujikawa
   <masaki.fujikawa@music.yamaha.com>`, passed per commit
   (`git -c user.name=… -c user.email=…`); never edit the shared repo config
   (it also governs the production checkout).

## 3. Commands (run in `app/`)

| Task | Command |
|------|---------|
| Install | `npm ci`, then `npx prisma generate` (typecheck needs the client) |
| Lint / types | `npm run lint` · `npm run typecheck` |
| Unit + DB tests | `npm test` (DB tests read `app/.env` → test PG) |
| One area | `npx vitest run src/lib/plan-estimate` |
| E2E | `npm run test:e2e` (Playwright, test instance only) |
| Agent-model gates (repo root) | `node scripts/validate-ecc-config.js` · `node scripts/self-heal.js --check` |

`app/.env` is never committed; copy it from another v2 worktree. Pre-existing
lint errors (`e2e/`, `windows-service` scripts) are not regressions — check the
files you touched.

## 4. Kanflow conventions (in addition to the agent model)

- **Branches**: `<type>/L4-PBI-<n>-<topic>` or `<type>/L4-NOPBI-<topic>` (the
  branch-name guard blocks a push otherwise). Older v2 branches
  (`feat/L4-db-postgresql`, `feat/L4-plan-estimate-engine`, …) must be renamed
  before their first push.
- **i18n**: every user-facing string in ja / en / id (`app/src/i18n/`); stored
  messages (e.g. `lastError`) are Japanese and translated in the UI.
- **Authorization**: one decision point, `app/src/lib/authz/policy.ts`; a new
  action gets allow + deny rows in `policy.test.ts`.
- **Confidential PBIs (D-5)**: never returned through MCP or to GitStation, and
  never sent by the background LLM jobs (rule drafts, actuals review); the
  interactive chat on the local Ollama may read them (decided 2026-11-10,
  `references/decisions.md`). Confidentiality is checked at use time, never
  frozen.
- **Local LLM**: Ollama only (shared with BankMasalah); the deterministic path
  must work when the LLM is down.
- **Done** = lint, typecheck, tests (incl. PG DB tests) green and the reviewers
  named in plan 11 §5.6 / plan 12 §6 report no CRITICAL / HIGH.

## 5. Agent & skill routing, conventions, hooks

- Routing lives in `.claude/rules/iotpf-agents-skills.md` (always loaded): for
  Kanflow use the L4 / TypeScript / web / DB rows (typescript-reviewer,
  database-reviewer, security-reviewer, silent-failure-hunter, a11y-architect,
  i18n-sync-auditor, e2e-runner).
- Commits: Conventional Commits — `.claude/rules/iotpf-git-workflow.md` (its
  workspace-model §1.1 describes the agent-model repository; in Kanflow the
  agent model is carried in-repo instead).
- **Hooks must fail open**: any parse error or internal error passes the action
  through (`exit 0`); only a PreToolUse hook returning `exit 2` blocks. Hooks
  resolve paths at runtime (`CLAUDE_PROJECT_DIR`); verify a hook change with
  `echo '{"tool_input":{"command":"git status"}}' | node scripts/hooks/<hook>.js`.

## 6. Memory & knowledge placement

| Kind | Home |
|------|------|
| User / project facts spanning sessions | Auto Memory (per user) |
| Error signature → proven fix | mistake-memory (`.claude/mistakes/records.jsonl`) |
| Session continuity | `docs/handoff/` and the session-end summary |
| Reviewed decisions | `references/decisions.md`, `docs/` (MR-reviewed) |

When the conversation is compacted, preserve: modified files, the active branch,
unresolved gate failures and the exact failing test commands.

## 7. Updating the agent model

`.claude/` and `scripts/` are copies of the agent-model repository's tracked
files (source commit in `references/decisions.md`). Never hand-edit them here;
change the agent model in its own repository, then re-import:
`git -C D:/APP/Agents_skills_Claudecode archive HEAD .claude scripts | tar -x -C <worktree>`
and record the new source commit in `references/decisions.md`.

## 8. Always-on rules (imported)

@.claude/rules/common/baseline.md
@.claude/rules/iotpf-agents-skills.md
@.claude/rules/iotpf-git-workflow.md
@.claude/rules/iotpf-self-improvement.md

Everything else under `.claude/rules/` loads on demand via `paths:` frontmatter
(typescript, web and DB rules attach when matching files are touched).
