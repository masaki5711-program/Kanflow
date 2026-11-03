---
description: Curate the automatic session summary — add hand-written notes and next-step context to the current session file maintained by the session-end hook.
---

# Save Session Command

Session continuity is written **automatically** by the `session:end` hook
(`scripts/hooks/session-end.js`) — it is the only writer of new files in
`~/.claude/session-data/`. This command does not create a competing file; it
**curates** the current session's file (memory-role separation, CLAUDE.md §8).

## Process

1. Locate the current session file in `~/.claude/session-data/`
   (`YYYY-MM-DD-<short-id>-session.tmp`, newest matching this project /
   worktree). If none exists yet, create one following
   `SESSION_FILENAME_REGEX` in `session-manager.js` — the hook will adopt and
   update it at session end.
2. **Do not touch** the `<!-- ECC:SUMMARY:START -->` … `<!-- ECC:SUMMARY:END -->`
   block — the hook owns it.
3. Fill or update the human-curated sections outside that block:
   - **Notes for Next Session** — what worked (with evidence), what failed
     (with the exact reason), open decisions, immediate next steps.
   - **Context to Load** — the specific files/specs the next session should
     read first.
4. Show the result to the user and confirm accuracy before finishing.

## Role boundaries (do not cross)

- Durable user/project **facts** → Auto Memory, never this file.
- Error→fix pairs → mistake-memory (`node scripts/mistakes.js add`).
- Reviewed decisions → `docs/agent-model-changelog.md` / ADR.
- This file is **ephemeral continuity only** (pruned after ~30 days by
  `session-start.js`).
