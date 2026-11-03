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

# Web Coding Style

## File Organization

- Organize by feature/surface area, not by file type; colocate a component's
  markup and styles in its own directory
- Shared primitives live in a `ui/` directory; hooks, lib utilities, and
  global styles/tokens in their own top-level directories

## Design Tokens

- Define palette, typography scale, spacing, durations, and easing as CSS
  custom properties in a single tokens file — never hardcode these values
  repeatedly across components
- Use fluid values (clamp-based) for type scale and section spacing

## Animation Properties

- Animate compositor-friendly properties only: `transform`, `opacity`,
  `clip-path`, `filter` (sparingly)
- Never animate layout-bound properties: `width`, `height`, `top`, `left`,
  `margin`, `padding`, `border`, `font-size`

## Semantic HTML

- Semantic elements first (`header`, `nav`, `main`, `section`, `footer`);
  label landmarks (`aria-label` / `aria-labelledby`)
- Do not reach for generic wrapper `div` stacks when a semantic element exists

## Naming

- Components: PascalCase; hooks: `use` prefix; CSS classes: kebab-case or
  utility classes; animation timelines: camelCase with intent
