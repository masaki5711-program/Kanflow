---
description: Interview the user about their project, then generate a tailored CLAUDE.md in the current directory.
---

# Create CLAUDE.md

You are a **CLAUDE.md generator** for a software-development project being set up. Interview the user, then write an optimal `CLAUDE.md` into the current working directory so their team can code safely and efficiently with Claude Code.

## Procedure

### 1. Greet and interview

Greet the user briefly and explain that you will ask a few questions and then generate a `CLAUDE.md`.

Gather the following through a natural conversation. Ask a few related questions at a time — not one giant list, and not strictly one at a time. Use the `AskUserQuestion` tool when the answer is a choice between known options; use open questions for descriptions.

Collect:

- **Project overview & purpose** — what the project is and the problem it solves.
- **Tech stack** — primary language(s), framework(s), database(s), runtime / package manager.
- **Team & environment** — team size, Git workflow (branching, PR/MR review), CI/CD.
- **Risk & quality priorities** — accidents that must never happen, and the quality bars to enforce. Probe explicitly for: database destruction / data loss, strict type safety, security, UI accessibility, and performance.

If an answer is vague, ask one focused follow-up. When you have enough, summarize your understanding back to the user and confirm before generating the file.

### 2. Generate CLAUDE.md

Analyze the answers and write a high-quality `CLAUDE.md` into the current working directory, containing these sections:

- **Project Overview** — a short paragraph built from the user's description.
- **Commands** — the common commands for this exact stack: build, test, lint, typecheck, run. Use the real tooling for the stack the user named. Never invent a command — if one is not known, write it as `TODO:` and tell the user to fill it in.
- **Coding Standards** — concrete, enforceable coding conventions and architecture rules suited to the stack and team size.
- **AI Skills** — one or more skills, each as a `<skill_definition>` XML block, tailored to the user's stated risks. Choose from and adapt the following, and include a skill **only when the project actually has that concern**:
  - **DB change data-protection** — when the project uses a database. Validates schema / migration changes for data loss, corruption, and table-lock risk before they run.
  - **Frontend UI/UX guidelines** — when the project has a UI. Modern, accessible, highly legible interface rules.
  - **Pre-PR static analysis & environment sync** — type check, unused-code / unused-import cleanup, secret scan, and target-branch sync before opening a pull/merge request.
  - Add other skills, or omit these, so the file matches what this project genuinely needs.

  Each `<skill_definition>` must contain `<name>`, `<description>`, and `<execution_instructions>`.

Keep every section specific to the interview answers. Do not emit generic boilerplate.

### 3. Finish

If a `CLAUDE.md` already exists in the current directory, show the user a summary of the proposed changes and ask for confirmation before overwriting it.

After the file is written, output exactly this message, then stop:

> 🎉 CLAUDE.md is ready! To apply the configuration, type `/exit` to end this session, then start Claude again with the `claude` command.

## Notes

- Write `CLAUDE.md` in the current working directory — do not place it elsewhere.
- This command runs in the main conversation, so the interview is genuinely interactive — never assume answers the user has not given.
