import type { BadgeTone } from "@/components/ui/badge"

/**
 * JS-side access to the design tokens defined in `src/app/globals.css`.
 *
 * Screen rendering (SVG, Recharts, inline styles) must use the CSS variables
 * below so charts follow the same palette as Badge tones. Only contexts that
 * cannot rely on CSS variables (print stylesheets) use `TOKEN_HEX`, which
 * mirrors globals.css (kept in sync by design-tokens.test.ts).
 */
export const TOKEN_HEX = {
  primary: "#2563eb",
  success: "#15803d",
  warning: "#b45309",
  danger: "#dc2626",
  info: "#0369a1",
  border: "#e2e8f0",
  fg: "#0f172a",
  fgMuted: "#475569",
} as const

/** Stroke / line colour per Badge tone. */
export const TONE_COLOR: Record<BadgeTone, string> = {
  neutral: "var(--color-fg-subtle)",
  primary: "var(--color-primary)",
  success: "var(--color-success)",
  warning: "var(--color-warning)",
  danger: "var(--color-danger)",
  info: "var(--color-info)",
}

/** Soft background per Badge tone (the same pairs Badge uses). */
export const TONE_SOFT: Record<BadgeTone, string> = {
  neutral: "var(--color-surface-sunken)",
  primary: "var(--color-primary-soft)",
  success: "var(--color-success-soft)",
  warning: "var(--color-warning-soft)",
  danger: "var(--color-danger-soft)",
  info: "var(--color-info-soft)",
}

/** Sprint status → Badge tone (single source for badges, bars and chart bands). */
export const SPRINT_STATUS_TONE: Readonly<Record<string, BadgeTone>> = {
  planning: "warning",
  active: "primary",
  review: "info",
  done: "success",
  archived: "neutral",
}

export function sprintStatusTone(status: string): BadgeTone {
  return SPRINT_STATUS_TONE[status] ?? "neutral"
}

/** Categorical series palette for charts (`--color-chart-1..7`). */
export const CHART_SERIES_COLORS: readonly string[] = [1, 2, 3, 4, 5, 6, 7].map((i) => `var(--color-chart-${i})`)

export const CHART_GRID_COLOR = "var(--color-chart-grid)"
