---
name: web-design-guidelines
description: Review Layer 4 (Next.js) back-office / dashboard UI code against the Vercel Web Interface Guidelines checklist — forms, animation, hydration safety, content handling, touch/interaction, dark mode, and Intl-based locale formatting. Use for "review my UI", "check my dashboard against best practices", "audit this component". Not for shop-floor operator terminals — see Relationship section.
origin: project (customized from vercel-labs/agent-skills)
---

# Web Interface Guidelines (IoTPF/ZEVA-Link customization)

Code-level UI review checklist for Layer 4 (`apps/hub` Next.js, per
[iotpf-architecture-contracts.md](../../rules/iotpf-architecture-contracts.md) §4). Adapted from
[vercel-labs/agent-skills](https://github.com/vercel-labs/agent-skills)'
`web-design-guidelines`, trimmed to avoid duplicating agents/skills this repo already runs.

## Relationship to other L4 agents/skills (read first)

- **Not for factory-floor operator terminals.** Shop-floor tablets / touch-panel PCs are
  `factory-floor-ui-designer`'s territory (48px touch targets for gloved hands, poka-yoke
  confirmation, barcode-scanner focus handling) — that skill **takes precedence** there. This
  skill targets back-office surfaces: monitoring dashboards, DMAIC analysis screens, admin/config
  UI (CLAUDE.md §1.2 L4 responsibilities).
- **Accessibility / Focus States sections below are supplementary, not primary.** WCAG 2.2 AA
  compliance is owned by the `accessibility` skill and the `a11y-architect` agent — run those for
  a full audit. Use this skill's Accessibility/Focus States items only as a fast pre-check.
- **Locale & i18n section here checks *implementation* (`Intl.DateTimeFormat`,
  `Intl.NumberFormat`, `translate="no"`), not translation-key drift.** Translation completeness
  and JA/EN/ID string-parity checks stay with `i18n-sync-auditor`.
- **Timestamp rendering correctness** (tz-aware display, DST) is `timezone-correctness-auditor`'s
  job, not this skill's — the Hydration Safety item below only flags server/client date-string
  mismatches, not tz correctness.

## How It Works

1. Try to fetch the latest upstream guidelines via `WebFetch` from:
   `https://raw.githubusercontent.com/vercel-labs/web-interface-guidelines/main/command.md`
2. **If the fetch fails or is unreachable** (e.g. a factory-network session with restricted
   egress), fall back to the vendored snapshot at
   [`reference/command.md`](reference/command.md) — same ruleset, captured 2026-07-01. Re-sync
   that file from upstream periodically; don't let it silently drift more than a few months stale.
3. Read the specified files (ask the user for a file/pattern if none given).
4. Apply the rules, **skipping** items already owned by another agent/skill per the Relationship
   section above (don't duplicate accessibility or i18n-key findings — cross-reference instead of
   re-reporting).
5. Output findings in the terse `file:line` format defined by the fetched/vendored guidelines.

## Usage

Given a file or glob pattern:

1. Fetch guidelines (live, else vendored fallback).
2. Read the target files.
3. Apply the ruleset, noting the precedence/hand-off rules above.
4. Group findings by file, `file:line - issue`, terse, no preamble — per the output format in the
   fetched content.

If no files are specified, ask which files to review.
