---
name: factory-floor-ui-designer
description: Design operator-facing UI for factory-floor terminals (tablets, touch-panel PCs) — large touch targets for gloved hands, poka-yoke confirmation on destructive actions, barcode-scanner input, and status colors readable from a distance. Use for shop-floor operator screens, not office or dashboard UI.
origin: project
---

# Factory Floor UI Designer

Design UI for the physical reality of a manufacturing floor: operators wearing gloves, dim or harsh lighting, barcode readers as the primary input, and screens that must be read from several meters away.

## Relationship to `frontend-design`

This skill is **different from `frontend-design`**. `frontend-design` targets modern, distinctive, aesthetic interfaces (office dashboards, admin tools). This skill targets ruggedized operator terminals where error prevention and at-a-distance legibility beat visual sophistication. **For shop-floor operator screens, this skill takes precedence.** It aligns with the CLAUDE.md Layer 4 rule: visibility first, minimal animation.

## When To Use

- screens an operator uses on a factory-floor tablet or touch-panel PC
- production reporting, work instructions, andon, equipment status, barcode-driven workflows

## Design Requirements

### 1. Touch targets

- Buttons and input areas must be at least **48px × 48px** — sized for a gloved finger.
- Spacing between adjacent targets must prevent mis-taps; do not pack controls tightly.

### 2. Poka-yoke (mistake-proofing)

- Destructive or irreversible actions (delete, completion report, line stop) require an explicit confirmation dialog, or a deliberate gesture — long-press or swipe — never a single tap.
- Make the safe choice the easy one; never place a destructive action where a normal tap lands.

### 3. Hardware input

- Assume a barcode scanner in keyboard-wedge mode is the main input device.
- On screen load, `autofocus` the field that should receive the scan, so the operator does not have to tap first.
- Handle the scanner's trailing Enter/Tab; do not let it submit a half-filled form unexpectedly.

### 4. Status visibility

- Equipment / OEE status must be identifiable from a distance by **color and a large icon**: running = green, fault = red, idle/standby = yellow.
- Never rely on color alone — pair every status color with an icon and a text label (color-blind safety, WCAG).
- Use high-contrast, large type; avoid thin fonts and low-contrast grays that vanish in dim lighting.

## Execution Instructions

When building a shop-floor operator screen:

1. **Confirm context** — which terminal, what the operator does, what input device is used.
2. **Apply the four requirements above**, and state which decisions they drove.
3. **Output the code** — Next.js + Tailwind + shadcn/ui per the project stack — copy-paste-ready.
4. **Add notes** on touch sizing, poka-yoke, and scanner focus behavior.

## Notes

- Minimal animation: motion that delays an operator's confirmed action is a defect here, not polish.
- Verify legibility at the real viewing distance and under the real lighting, not at a desk.
