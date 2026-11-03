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

# Web Patterns

## Component Composition

| Situation | Pattern |
|-----------|---------|
| Related UI sharing state and interaction semantics | Compound components — parent owns state, children consume via context; prefer over prop drilling |
| Shared behavior, varying markup | Render props / slots — keep keyboard handling, ARIA, and focus logic in the headless layer |
| Data loading vs. rendering | Container/presentational split — containers own fetching and side effects; presentational components stay pure and prop-driven |

## State Management

| Concern | Tooling |
|---------|---------|
| Server state | TanStack Query, SWR, tRPC |
| Client state | Zustand, Jotai, signals |
| URL state | search params, route segments |
| Form state | React Hook Form or equivalent |

- Do not duplicate server state into client stores
- Derive values instead of storing redundant computed state

## URL As State

Persist shareable state in the URL: filters, sort order, pagination,
active tab, search query.

## Data Fetching

- Stale-while-revalidate: cached data immediately, revalidate in the
  background — use an existing library, do not roll this by hand
- Optimistic updates: snapshot current state, apply, roll back on failure,
  emit visible error feedback on rollback
- Fetch independent data in parallel; avoid parent-child request waterfalls;
  prefetch likely next routes only when justified
