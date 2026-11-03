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

# Web Performance Rules

## Core Web Vitals Targets

| Metric | Target |
|--------|--------|
| LCP | < 2.5s |
| INP | < 200ms |
| CLS | < 0.1 |
| FCP | < 1.5s |
| TBT | < 200ms |

## Bundle Budget

| Page Type | JS Budget (gzipped) | CSS Budget |
|-----------|---------------------|------------|
| Landing page | < 150kb | < 30kb |
| App page | < 300kb | < 50kb |
| Microsite | < 80kb | < 15kb |

## Loading Strategy

- Inline critical above-the-fold CSS where justified; preload the hero image
  and primary font only; defer non-critical CSS/JS; dynamically import heavy
  libraries (animation, charting, 3D)

## Images and Fonts

- Explicit `width`/`height` on all images; eager + high fetch priority for
  hero media only, lazy for below-the-fold; AVIF/WebP with fallbacks; never
  ship sources far beyond rendered size
- Max two font families; `font-display: swap`; subset where possible;
  preload only the truly critical weight/style

## Animation and Checklist

- Compositor-friendly properties only; `will-change` narrowly, removed when done
- CSS for simple transitions; `requestAnimationFrame` or established libraries
  for JS motion; IntersectionObserver over scroll handler churn
- [ ] No accidental render-blocking resources
- [ ] No layout shifts from dynamic content
- [ ] Third-party scripts async/defer and only when needed
