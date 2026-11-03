---
name: frontend-patterns
description: React/Next.js implementation patterns for L4 UI — component structure, state management, data fetching, rendering performance, and form/error handling decisions. Use when: writing or reviewing React/Next.js component logic, choosing between useState/Context/Zustand or SWR/React-Query/server-fetch, fixing re-render or list performance, structuring forms and error boundaries. Do not use when: deciding visual direction, colors, spacing, or typography (frontend-design skill owns tokens; design-reviewer agent owns the review), accessibility audits (accessibility skill / a11y-architect), chart styling (dataviz), factory-floor operator terminals (factory-floor-ui-designer), or writing Playwright tests (e2e-testing).
origin: ECC
---

# Frontend Patterns (L4 — Next.js UI)

## Repo-specific constraints

- L4 UI is Next.js/TypeScript. Web rules auto-attach from `.claude/rules/web/` on UI files; `web/design-quality.md` is mandatory before building UI.
- All colors, spacing, and type come from `frontend-design` (`design-tokens.json`, `recipes.md`). Never invent ad-hoc values — consume tokens.
- No hardcoded user-facing strings: JA/EN/ID i18n from the start (CLAUDE.md §4); run `i18n-sync-auditor` on new surfaces.
- Stream-fed views (MQTT/judgment events): batch/throttle renders, clean up every subscription, no unbounded client buffers (CLAUDE.md §4).

## State management — decision table

| Situation | Choice |
|---|---|
| Local to one component | useState / useReducer |
| Shared by one subtree (theme, auth, tabs) | Context (+ reducer if multi-action) |
| App-wide client state with frequent updates | Store (Zustand-style) — Context here causes re-render storms |
| Server data | Never mirrored into client state — lives in the data-fetching cache |
| Filters, page, selection that survive reload | URL query params, not component state |

## Data fetching — decision table

| Situation | Choice |
|---|---|
| Initial page data, non-interactive | Server Components / server-side fetch |
| Client reads needing cache + revalidation | SWR or React Query — not hand-rolled useEffect fetch |
| Mutations | Query-library mutation + explicit cache invalidation |
| Live telemetry / judgment-event streams | Subscription hook with cleanup + render batching |

## Performance constraints

- Memoize (useMemo / useCallback / React.memo) only for measured re-render cost — not by default.
- Virtualize lists beyond ~100 rows; paginate everything else (no unbounded queries reach the client).
- Lazy-load heavy components (charts, 3D) behind Suspense; code-split by route.
- Debounce user-driven queries — never one request per keystroke.

## Forms and errors

- Schema validation (Zod) shared with the API boundary; show field-level errors.
- Every async surface has all states: loading / empty / error / success — design-reviewer blocks on missing states.
- Error boundaries around independently failing regions; errors surface visibly, never swallowed (CLAUDE.md §2.5).

## Anti-patterns (no code needed)

- useEffect-based data fetching where a query library or server fetch fits.
- Deriving state that can be computed during render.
- Prop-drilling past two levels instead of composition or context.
- Fixed-height magic numbers instead of token spacing.

## Related (read first)

- `frontend-design` skill — visual direction + token set; required for new/renovated UI.
- `.claude/rules/web/design-quality.md` — anti-template policy, 10 mandatory quality checks.
- `accessibility` skill / `a11y-architect` agent — WCAG 2.2 AA.
- `dataviz` skill — chart/graph palette (falls back to design-tokens `charts`).
- `e2e-testing` skill — Playwright authoring; `e2e-runner` agent executes.
