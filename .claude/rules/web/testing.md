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

# Web Testing Rules

## Priority Order

1. **Visual regression** — Playwright screenshots at breakpoints 320 / 768 /
   1024 / 1440; cover hero, scrollytelling, and meaningful states; if both
   themes exist, test both
2. **Accessibility** — automated checks, keyboard navigation, reduced-motion
   behavior, color contrast
3. **Performance** — Lighthouse (or equivalent) on meaningful pages; hold the
   CWV targets in [performance.md](performance.md)
4. **Cross-browser** — minimum Chrome, Firefox, Safari; test scrolling,
   motion, and fallback behavior
5. **Responsive** — 320 / 375 / 768 / 1024 / 1440 / 1920; no overflow; touch
   interactions work

## E2E

- Deterministic waits only — never flaky timeout-based assertions

## Unit Tests

- Test utilities, data transforms, and custom hooks
- For highly visual components, visual regression carries more signal than
  brittle markup assertions
- Visual regression supplements coverage targets; it does not replace them
