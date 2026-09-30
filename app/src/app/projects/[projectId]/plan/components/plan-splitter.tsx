"use client"

import { useId, useRef, type KeyboardEvent, type PointerEvent } from "react"

interface Props {
  /** X of the grid / timeline border inside the chart wrapper. */
  left: number
  /** Current name column width (what the splitter changes). */
  value: number
  min: number
  max: number
  onChange: (value: number) => void
  label: string
  hint: string
}

const STEP = 16
const BIG_STEP = 64

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

/**
 * Vertical splitter between the grid and the timeline (WAI-ARIA window
 * splitter): drag with mouse / touch, or focus it and use ←/→ (Shift = larger
 * steps), Home / End. It resizes the name column; the value is persisted by the caller.
 */
export function PlanSplitter({ left, value, min, max, onChange, label, hint }: Props) {
  const hintId = useId()
  const drag = useRef<{ startX: number; startValue: number } | null>(null)

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return
    e.preventDefault()
    e.currentTarget.setPointerCapture?.(e.pointerId)
    drag.current = { startX: e.clientX, startValue: value }
  }
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (!drag.current) return
    onChange(clamp(drag.current.startValue + e.clientX - drag.current.startX, min, max))
  }
  const end = () => {
    drag.current = null
  }
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const step = e.shiftKey ? BIG_STEP : STEP
    const next =
      e.key === "ArrowLeft" ? value - step
        : e.key === "ArrowRight" ? value + step
          : e.key === "Home" ? min
            : e.key === "End" ? max
              : null
    if (next === null) return
    e.preventDefault()
    onChange(clamp(next, min, max))
  }

  return (
    <div
      role="separator"
      tabIndex={0}
      aria-orientation="vertical"
      aria-label={label}
      aria-describedby={hintId}
      aria-valuenow={value}
      aria-valuemin={min}
      aria-valuemax={max}
      data-plan-splitter=""
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={end}
      onPointerCancel={end}
      onKeyDown={onKeyDown}
      className="group absolute inset-y-px z-40 w-3 -translate-x-1/2 cursor-col-resize touch-none outline-none print:hidden"
      style={{ left }}
    >
      <span id={hintId} className="sr-only">{hint}</span>
      <span
        aria-hidden="true"
        className="absolute inset-y-0 left-1/2 w-0.5 -translate-x-1/2 bg-transparent transition-colors group-hover:bg-primary group-focus-visible:w-1 group-focus-visible:bg-focus group-active:bg-primary"
      />
      <span
        aria-hidden="true"
        className="absolute left-1/2 top-1/2 h-8 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-border-strong opacity-60 transition-opacity group-hover:bg-primary group-hover:opacity-100 group-focus-visible:bg-focus group-focus-visible:opacity-100"
      />
    </div>
  )
}
