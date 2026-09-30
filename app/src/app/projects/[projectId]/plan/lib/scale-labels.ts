/**
 * Placement of the scale header's top-tier labels around the "today" pill,
 * so the pill never covers "2026年10月" / "October 2026" / "2026".
 */

/** Rough caption (12px) text width: CJK ≈ 12px, other characters ≈ 7px. */
export function estimateTextWidth(text: string): number {
  let w = 0
  for (const ch of text) w += ch.charCodeAt(0) > 0xff ? 12 : 7
  return w
}

/** Horizontal padding (px-1.5) + border of the today pill. */
const PILL_CHROME = 14
/** Base left inset of a tier label (px-2). */
export const TIER_LABEL_INSET = 8
const GAP = 6

export interface PillBox {
  left: number
  right: number
}

/** The today pill's extent, centred on `todayX`. */
export function todayPillBox(todayX: number, label: string): PillBox {
  const half = (estimateTextWidth(label) + PILL_CHROME) / 2
  return { left: todayX - half, right: todayX + half }
}

/**
 * Left inset of a top-tier label starting at `cellX`: the normal inset, or
 * just right of the pill when the pill would cover the label.
 */
export function tierLabelInset(cellX: number, label: string, pill: PillBox | null): number {
  if (!pill) return TIER_LABEL_INSET
  const start = cellX + TIER_LABEL_INSET
  const end = start + estimateTextWidth(label)
  if (pill.right <= start || pill.left >= end) return TIER_LABEL_INSET
  return Math.round(pill.right - cellX + GAP)
}

/** Gap kept between the today pill and the edges of the visible timeline. */
const PILL_EDGE = 4

/**
 * Centre of the today pill: today's x, shifted inward just enough that the
 * pill stays inside the visible timeline `view` (timeline px). Null while
 * today is outside the view (the "今日 ◀/▶" edge pill points at it instead of
 * a half-clipped label) or the view is too narrow for the pill (phone
 * "names first" peek: the today line alone). No view (print, not measured): today's x.
 */
export function clampPillX(todayX: number, label: string, view: { left: number; width: number } | null): number | null {
  if (!view || view.width <= 0) return todayX
  if (todayX < view.left || todayX > view.left + view.width) return null
  const half = (estimateTextWidth(label) + PILL_CHROME) / 2
  const lo = view.left + half + PILL_EDGE
  const hi = view.left + view.width - half - PILL_EDGE
  if (lo > hi) return null
  return Math.round(Math.min(hi, Math.max(lo, todayX)))
}

/** A scale cell shows its label only when the text fits (`pad` = horizontal padding); print squeezes cells. */
export function labelFits(cellWidth: number, label: string, pad: number): boolean {
  return cellWidth >= estimateTextWidth(label) + pad
}
