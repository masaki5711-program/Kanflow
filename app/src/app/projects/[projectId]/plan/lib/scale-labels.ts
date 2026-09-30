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
