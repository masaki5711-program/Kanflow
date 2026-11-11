import type { FillKey, StrokeKey } from "./model"

/**
 * Palette keys → design tokens (src/app/globals.css). Elements store the key, so the colours follow the
 * tokens. Text inside a filled box is always `--color-fg` (every fill is a soft token).
 */
export const STROKE_COLOR: Readonly<Record<StrokeKey, string>> = {
  ink: "var(--color-fg)",
  gray: "var(--color-fg-subtle)",
  blue: "var(--color-primary)",
  green: "var(--color-success)",
  amber: "var(--color-warning)",
  red: "var(--color-danger)",
  violet: "var(--color-chart-4)",
}

export const FILL_COLOR: Readonly<Record<FillKey, string>> = {
  none: "transparent",
  white: "var(--color-surface)",
  gray: "var(--color-surface-sunken)",
  blue: "var(--color-primary-soft)",
  green: "var(--color-success-soft)",
  amber: "var(--color-warning-soft)",
  red: "var(--color-danger-soft)",
  sky: "var(--color-info-soft)",
}
