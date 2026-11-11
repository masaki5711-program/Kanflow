"use client"

import { useId, useMemo } from "react"
import { useLanguage } from "@/lib/language-context"
import { VisuallyHidden } from "@/components/ui"
import { describable, describeElement } from "./describe"
import { boundsOf, sortByZ, type ElementMap } from "@/lib/board/geometry"
import { isBox, isLine } from "@/lib/board/model"
import { ElementView, lineEndsOf } from "./element-view"

interface SheetPreviewProps {
  elements: ElementMap
  /** Accessible name of the picture. */
  label: string
  /** An element to mark (a box a PBI stands for, a comment's element). */
  focusId?: string | null
  className?: string
}

/**
 * A sheet drawn as a still picture, fitted into its box (history versions, the boards a PBI stands for). Read only:
 * nothing in it can be selected or changed. Needs the board's render context around it (images, timer texts).
 */
export function SheetPreview({ elements, label, focusId, className }: SheetPreviewProps) {
  const { t } = useLanguage()
  const descId = useId()
  const ordered = useMemo(() => sortByZ(elements).filter((el) => isBox(el) || isLine(el)), [elements])
  const bounds = useMemo(
    () =>
      boundsOf(
        ordered.map((el) => el.id),
        elements,
      ),
    [ordered, elements],
  )
  const focus = focusId ? boundsOf([focusId], elements) : null
  if (!bounds) return <div role="img" aria-label={label} className={className} />
  const pad = 24
  // What the picture shows, in words (first 40 elements).
  const words = describable(ordered).slice(0, 40)
  return (
    <>
    <VisuallyHidden>
      <ul id={descId}>
        {words.map((el) => (
          <li key={el.id}>{describeElement(el, elements, t)}</li>
        ))}
      </ul>
    </VisuallyHidden>
    <svg role="img" aria-label={label} aria-describedby={descId} className={className} viewBox={`${bounds.x - pad} ${bounds.y - pad} ${bounds.w + pad * 2} ${bounds.h + pad * 2}`} preserveAspectRatio="xMidYMid meet" data-testid="sheet-preview">
      {ordered.map((el) => (
        <ElementView key={el.id} el={el} ends={lineEndsOf(el, elements)} />
      ))}
      {focus && (
        <rect x={focus.x - 8} y={focus.y - 8} width={focus.w + 16} height={focus.h + 16} rx={8} fill="none" style={{ stroke: "var(--color-primary)" }} strokeWidth={Math.max(3, bounds.w / 300)} data-preview-focus="" />
      )}
    </svg>
    </>
  )
}
