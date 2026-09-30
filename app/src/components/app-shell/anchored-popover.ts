"use client"

import { useCallback, useLayoutEffect, useState, type CSSProperties, type RefObject } from "react"

/** Gap between the popover and the viewport edges (px). */
export const POPOVER_VIEWPORT_MARGIN = 8
/** Gap between the anchor and the popover (px). */
export const POPOVER_OFFSET = 8

export interface AnchorRect {
  top: number
  bottom: number
  left: number
  right: number
}

export interface PopoverPlacement {
  top: number
  left: number
  width: number
}

/**
 * Place a popover under its anchor, right-aligned to it, then shift it so it
 * stays fully inside the viewport ("flip/shift" for a header dropdown). The
 * width shrinks to the viewport on phones.
 */
export function placePopover(
  anchor: AnchorRect,
  preferredWidth: number,
  viewportWidth: number,
  margin: number = POPOVER_VIEWPORT_MARGIN,
): PopoverPlacement {
  const width = Math.max(0, Math.min(preferredWidth, viewportWidth - margin * 2))
  const rightAligned = anchor.right - width
  const maxLeft = viewportWidth - margin - width
  const left = Math.min(Math.max(rightAligned, margin), maxLeft)
  return { top: anchor.bottom + POPOVER_OFFSET, left: Math.max(margin, left), width }
}

/** Smallest max-height a popover is squeezed to (px) — below that it scrolls anyway. */
export const POPOVER_MIN_HEIGHT = 120

/**
 * Max height for a popover that starts at `top`, so its bottom stays inside a
 * short viewport (phone landscape, 375x600): the panel then scrolls internally.
 */
export function popoverMaxHeight(top: number, viewportHeight: number, margin: number = POPOVER_VIEWPORT_MARGIN): number {
  return Math.max(POPOVER_MIN_HEIGHT, Math.floor(viewportHeight - top - margin))
}

export interface AnchoredPopoverOptions {
  /** Also cap the height to the viewport (`maxHeight`); the panel must scroll its content. */
  fitHeight?: boolean
}

/**
 * Fixed-position style for a header popover anchored to `anchorRef`.
 * Recomputed on open, resize and scroll; `undefined` while closed.
 */
export function useAnchoredPopover(
  anchorRef: RefObject<HTMLElement | null>,
  open: boolean,
  preferredWidth: number,
  { fitHeight = false }: AnchoredPopoverOptions = {},
): CSSProperties | undefined {
  const [placement, setPlacement] = useState<(PopoverPlacement & { maxHeight: number }) | null>(null)

  const measure = useCallback(() => {
    const el = anchorRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    const placed = placePopover({ top: r.top, bottom: r.bottom, left: r.left, right: r.right }, preferredWidth, window.innerWidth)
    setPlacement({ ...placed, maxHeight: popoverMaxHeight(placed.top, window.innerHeight) })
  }, [anchorRef, preferredWidth])

  useLayoutEffect(() => {
    if (!open) return
    measure()
    window.addEventListener("resize", measure)
    window.addEventListener("scroll", measure, true)
    return () => {
      window.removeEventListener("resize", measure)
      window.removeEventListener("scroll", measure, true)
    }
  }, [open, measure])

  if (!open || !placement) return undefined
  const style: CSSProperties = { position: "fixed", top: placement.top, left: placement.left, width: placement.width }
  return fitHeight ? { ...style, maxHeight: placement.maxHeight } : style
}
