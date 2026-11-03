---
# On-demand (CLAUDE.md §9): attach only when UI surfaces are touched.
paths:
  - "**/*.tsx"
  - "**/*.jsx"
  - "**/*.vue"
  - "**/*.svelte"
  - "**/*.css"
  - "**/*.scss"
  - "**/*.html"
  - "apps/dashboard/**"
---

# Web Hooks

Frontend quality hooks are already wired in `.claude/settings.json` — do not
add ad-hoc per-file format/lint/typecheck hooks:

- `pre:edit:design-direction-check` — settles visual direction before the
  session's first UI edit
- `pre:edit:ui-i18n-check` — confirms the i18n requirement before building UI
- `post:edit:design-quality-check` — warns when edits drift toward template UI
- `post:edit:format` — auto-formats edited JS/TS (Biome or Prettier)
- `stop:format-typecheck` — batch format, lint (ESLint/Stylelint), and
  typecheck of edited files at Stop
- `stop:test-gate` — runs the test suite after code changes

New hooks follow CLAUDE.md §7: Node.js in `scripts/hooks/`, fail open,
runtime-resolved paths.
