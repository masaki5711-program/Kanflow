"use client"

import { useLayoutEffect, useState, type CSSProperties, type RefObject } from "react"
import { createPortal } from "react-dom"
import { useLanguage } from "@/lib/language-context"
import { cn } from "@/components/ui"
import type { MentionMember } from "./types"

/** Tallest the list gets (Tailwind max-h-60). */
const LIST_MAX_PX = 240
/** Below this much room under the text area the list opens above it (when there is more room there). */
const MIN_BELOW_PX = 160
const GAP_PX = 4
const VIEWPORT_MARGIN_PX = 8

export interface AnchorRect {
  top: number
  bottom: number
  left: number
  width: number
}

/**
 * Pure: fixed-position box for the list next to the text area, inside the
 * viewport — below it when there is room, otherwise above (whichever side
 * has more space), horizontally clamped to the viewport.
 */
export function mentionListStyle(anchor: AnchorRect, viewport: { width: number; height: number }): CSSProperties {
  const width = Math.min(anchor.width, viewport.width - 2 * VIEWPORT_MARGIN_PX)
  const left = Math.max(VIEWPORT_MARGIN_PX, Math.min(anchor.left, viewport.width - width - VIEWPORT_MARGIN_PX))
  const below = viewport.height - anchor.bottom - GAP_PX - VIEWPORT_MARGIN_PX
  const above = anchor.top - GAP_PX - VIEWPORT_MARGIN_PX
  if (below >= Math.min(LIST_MAX_PX, MIN_BELOW_PX) || below >= above) {
    return { position: "fixed", left, width, top: anchor.bottom + GAP_PX, maxHeight: Math.max(0, Math.min(LIST_MAX_PX, below)) }
  }
  return { position: "fixed", left, width, bottom: viewport.height - anchor.top + GAP_PX, maxHeight: Math.min(LIST_MAX_PX, above) }
}

/**
 * Where the list is rendered: inside the surrounding dialog (so it stays in
 * the aria-modal subtree; the dialog's overflow does not clip a fixed box,
 * whose containing block is the viewport-sized overlay), else <body>.
 */
function portalTarget(anchor: HTMLElement): HTMLElement {
  return anchor.closest<HTMLElement>('[role="dialog"]') ?? document.body
}

/** Follows the anchor while the page / a modal body scrolls or the window resizes. */
function useAnchoredStyle(anchorRef: RefObject<HTMLElement | null>): { style: CSSProperties; container: HTMLElement } | null {
  const [placed, setPlaced] = useState<{ style: CSSProperties; container: HTMLElement } | null>(null)
  useLayoutEffect(() => {
    function place() {
      const el = anchorRef.current
      if (!el) return
      const r = el.getBoundingClientRect()
      const style = mentionListStyle({ top: r.top, bottom: r.bottom, left: r.left, width: r.width }, { width: window.innerWidth, height: window.innerHeight })
      setPlaced({ style, container: portalTarget(el) })
    }
    place()
    window.addEventListener("resize", place)
    window.addEventListener("scroll", place, true)
    return () => {
      window.removeEventListener("resize", place)
      window.removeEventListener("scroll", place, true)
    }
  }, [anchorRef])
  return placed
}

interface Props {
  id: string
  anchorRef: RefObject<HTMLElement | null>
  suggestions: readonly MentionMember[]
  active: number
  optionId: (index: number) => string
  /** Members are still loading (the list says so instead of "no match"). */
  loading: boolean
  onPick: (member: MentionMember) => void
}

/**
 * The @mention suggestion list, portaled out of the text area's scroll
 * container with a fixed position inside the viewport, so a modal's sticky
 * footer or scrolling body can never clip it (F-08).
 * Focus stays in the text area (options are picked with mouse down prevented).
 */
export function MentionListbox({ id, anchorRef, suggestions, active, optionId, loading, onPick }: Props) {
  const { t } = useLanguage()
  const placed = useAnchoredStyle(anchorRef)
  if (!placed) return null
  return createPortal(
    <ul id={id} role="listbox" aria-label={t.commentsMentionListLabel} aria-busy={loading || undefined} style={placed.style}
      className="z-[150] overflow-auto rounded-ui-md border border-border bg-surface py-1 shadow-ui-lg">
      {suggestions.length === 0 ? (
        <li role="presentation" className="px-3 py-2 text-caption text-fg-muted">{loading ? t.loading : t.commentsMentionNoMatch}</li>
      ) : (
        suggestions.map((m, i) => (
          <li key={m.id} id={optionId(i)} role="option" aria-selected={i === active}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => onPick(m)}
            className={cn("cursor-pointer px-3 py-1.5 text-body", i === active ? "bg-primary-soft text-primary-strong" : "text-fg hover:bg-surface-muted")}>
            @{m.name}
            {m.hint && <span className="ml-2 text-caption text-fg-muted">{m.hint}</span>}
          </li>
        ))
      )}
    </ul>,
    placed.container,
  )
}
