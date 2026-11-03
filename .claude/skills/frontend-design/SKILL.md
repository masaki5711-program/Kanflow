---
name: frontend-design
description: Generate modern, highly legible, user-friendly UI designs and frontend code (e.g. React/Vue + Tailwind CSS). Build distinctive, accessible, production-grade frontend interfaces — use when creating web components, pages, or dashboards where visual direction, usability, and code quality all matter.
origin: ECC
---

# Frontend Design

Use this when the task is not just "make it work" but "make it look designed."

This skill is for product pages, dashboards, app shells, components, or visual systems that need a clear point of view instead of generic AI-looking UI.

## When To Use

- building a landing page, dashboard, or app surface from scratch
- upgrading a bland interface into something intentional and memorable
- translating a product concept into a concrete visual direction
- implementing a frontend where typography, composition, and motion matter

## Core Principles

Every design and implementation decision must follow these four principles.

- **Clarity** — Make the information hierarchy explicit so users can operate the interface intuitively.
- **Minimalism** — Strip away unnecessary decoration so the content itself stands out.
- **Accessibility** — Maintain sufficient contrast ratios and account for keyboard operation and screen readers (WCAG-compliant).
- **Responsiveness** — Design mobile-first so the interface works optimally at every device size.

On top of that, **pick a visual direction and commit to it**. Safe-average UI is usually worse than a strong, coherent aesthetic with a few bold choices.

## Design Workflow

### 1. Frame the interface first

Before coding, settle:

- purpose
- audience
- emotional tone
- visual direction
- one thing the user should remember

Possible directions: brutally minimal / editorial / industrial / luxury / playful / geometric / retro-futurist / soft and organic / maximalist.

Do not mix directions casually. Choose one and execute it cleanly.

### 2. Build the visual system

Define: type hierarchy / color variables / spacing rhythm / layout logic / motion rules / surface, border, and shadow treatment.

Use CSS variables or the project's token system so the interface stays coherent as it grows. Define concrete values according to the **Design Guidelines** below.

**Do not start from a blank palette.** [`design-tokens.json`](design-tokens.json)
in this skill is the ZEVA-Link default token set — light/dark palettes, semantic
status colors (SPC severity), JA/EN/ID-capable font pairings, type scale, 8pt
spacing, radii, elevation, motion, and chart palettes. Consume it (map into
Tailwind `theme.extend` or CSS custom properties), then override deliberately
for the product's visual direction. [`recipes.md`](recipes.md) has copy-paste
component starting points (stat tile, severity badge, data table, dashboard
shell) that already follow the tokens. For charts, prefer the `dataviz` skill
when available; otherwise use the `charts` section of the tokens.

### 3. Compose with intention

Prefer: asymmetry when it sharpens hierarchy / overlap when it creates depth / strong whitespace when it clarifies focus / dense layouts only when the product benefits from density.

Avoid defaulting to a symmetrical card grid unless it is clearly the right fit.

### 4. Make motion meaningful

Use animation to reveal hierarchy, stage information, reinforce user action, and create one or two memorable moments. Do not scatter generic micro-interactions everywhere. One well-directed load sequence is usually stronger than twenty random hover effects.

## Design Guidelines

Concrete, measurable standards. Define the visual system (step 2) according to these.

### Typography

- Establish a clear scale for font sizes (e.g. 12 / 14 / 16 / 20 / 24px …).
- Set line-height to 1.5–1.7 for body text and 1.2–1.3 for headings to improve readability.
- On information-dense screens, control information priority with font weight.
- Pick fonts with character. On a design-led page, pair a distinctive display face with a readable body face, and avoid generic defaults.

### Color & Contrast

- Clearly separate the roles of the base color (background), main color (primary actions), and accent color (warnings / emphasis).
- Ensure a contrast ratio of **at least 4.5:1** between text and background.
- Choose a color palette that assumes dark mode support from the start.
- One dominant field with selective accents usually works better than an evenly weighted multi-color palette. Use the cliché purple-gradient-on-white only when the product genuinely calls for it.

### Spacing & Layout

- Apply a consistent spacing rule based on multiples of 8px (8 / 16 / 24 / 32 …) — the 8pt grid system.
- Do not fear whitespace; use it to visually express the grouping between elements.
- Break the grid when the composition benefits from it. Use diagonals, offsets, and grouping intentionally — but keep the reading flow obvious even when the layout is unconventional.

### Background

A flat, empty background is rarely the best answer for a product surface. Create atmosphere with gradients / meshes / textures / subtle noise / patterns / layered transparency.

### Interaction & Feedback

- Always implement hover, focus, and active state changes for buttons and links.
- Display loading states and error messages clearly and helpfully, in a way that removes user anxiety.

## Anti-Patterns

Never default to:

- interchangeable SaaS hero sections
- generic card piles with no hierarchy
- random accent colors without a system
- placeholder-feeling typography
- motion that exists only because animation was easy to add

## Execution Instructions

When the user requests a UI component or screen, generate the response in the following steps.

1. **Confirm the purpose** — Briefly define the problem the UI should solve and the target user's behavior.
2. **Present the design proposal** — Concisely explain what layout and color scheme will be used, with reasoning.
3. **Output the code** — Using the specified tech stack (e.g. TypeScript + Tailwind CSS), output clean, copy-paste-ready code.
4. **Add implementation notes** — Add one or two implementation points regarding accessibility and responsive behavior.

Supplementary rules:

- Preserve the established design system when working inside an existing product.
- Match technical complexity to the visual idea.
- Keep accessibility and responsiveness intact. The frontend should feel deliberate on both desktop and mobile.

## Quality Gate

Before delivering, confirm:

- the interface has a clear visual point of view
- typography and spacing feel intentional (they follow the type scale and 8pt grid)
- color and motion support the product instead of decorating it randomly
- contrast ratio is at least 4.5:1, and keyboard operation and screen readers are supported
- there is no layout breakage at the major breakpoints (mobile-first)
- hover / focus / active states and loading / error states are all implemented
- the result does not read like generic AI UI
- the implementation is production-grade, not just visually interesting
