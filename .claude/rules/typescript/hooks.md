---
paths:
  - "**/*.ts"
  - "**/*.tsx"
  - "**/*.js"
  - "**/*.jsx"
---
# TypeScript/JavaScript Hooks

Wired in this repo's `.claude/settings.json` (project-scoped):

- **PostToolUse** `post:edit:format` — auto-formats edited JS/TS files (Biome `check --write`, or Prettier).
- **PostToolUse** `post:edit:console-warn` — warns about `console.log` in edited files.
- **Stop** `stop:format-typecheck` — batch format, lint, and `tsc` typecheck of edited files.
- **Stop** `stop:check-console-log` — final `console.log` audit of modified files.
