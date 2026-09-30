"use client"

import { useMemo } from "react"
import { autoNameWidth, estimateTextWidth } from "../lib/grid-layout"
import type { PlanItem } from "../lib/plan-types"
import type { FlatRow } from "../lib/tree"

/** Font size of the name cell (text-body = 0.875rem). */
const NAME_FONT_PX = 14

let canvasContext: CanvasRenderingContext2D | null | undefined

/** A 2D context for measuring text (null in environments without canvas, e.g. tests / SSR). */
function measureContext(): CanvasRenderingContext2D | null {
  if (canvasContext !== undefined) return canvasContext
  if (typeof document === "undefined" || typeof navigator === "undefined" || /jsdom/i.test(navigator.userAgent)) return (canvasContext = null)
  try {
    canvasContext = document.createElement("canvas").getContext("2d")
  } catch {
    canvasContext = null
  }
  return canvasContext
}

function measureText(text: string, bold: boolean): number {
  const ctx = measureContext()
  if (!ctx || typeof window === "undefined") return estimateTextWidth(text, NAME_FONT_PX)
  const family = window.getComputedStyle(document.body).fontFamily || "sans-serif"
  ctx.font = `${bold ? 600 : 400} ${NAME_FONT_PX}px ${family}`
  return ctx.measureText(text).width
}

/**
 * Default name column width on wide screens: long enough for the longest
 * shown name (A4-06). Null when `enabled` is false (the regular default applies).
 */
export function useNameAutoWidth(rows: readonly FlatRow[], nameOf: (item: PlanItem) => string, enabled: boolean): number | null {
  return useMemo(() => {
    if (!enabled || rows.length === 0) return null
    return autoNameWidth(
      rows.map((r) => ({ depth: r.depth, text: nameOf(r.item), bold: r.hasChildren, milestone: r.item.isMilestone })),
      measureText,
    )
  }, [enabled, rows, nameOf])
}
