"use client"

import { useId, useState, type ReactNode } from "react"
import { useLanguage } from "@/lib/language-context"

interface Props {
  /** Text shown when the tooltip is revealed. Multi-line strings render preserving line breaks. */
  content: ReactNode
  /** Accessible label for the trigger. Defaults to the localized "Help". */
  ariaLabel?: string
  /** Which side to render the bubble. */
  side?: "top" | "bottom" | "left" | "right"
}

/**
 * Small ? icon with a hover/focus tooltip. Keyboard-accessible via focus and
 * Escape to dismiss. The bubble renders to the requested side with a small
 * arrow. Parent should have enough space on that side.
 */
export function HelpTooltip({ content, ariaLabel, side = "top" }: Props) {
  const { t } = useLanguage()
  const [open, setOpen] = useState(false)
  const id = useId()

  const sideClass = {
    top: "bottom-full left-1/2 -translate-x-1/2 mb-2",
    bottom: "top-full left-1/2 -translate-x-1/2 mt-2",
    left: "right-full top-1/2 -translate-y-1/2 mr-2",
    right: "left-full top-1/2 -translate-y-1/2 ml-2",
  }[side]

  const arrowClass = {
    top: "top-full left-1/2 -translate-x-1/2 -mt-px border-x-transparent border-b-transparent border-t-slate-800",
    bottom: "bottom-full left-1/2 -translate-x-1/2 -mb-px border-x-transparent border-t-transparent border-b-slate-800",
    left: "left-full top-1/2 -translate-y-1/2 -ml-px border-y-transparent border-r-transparent border-l-slate-800",
    right: "right-full top-1/2 -translate-y-1/2 -mr-px border-y-transparent border-l-transparent border-r-slate-800",
  }[side]

  return (
    <span className="relative inline-flex">
      <button
        type="button"
        aria-label={ariaLabel ?? t.helpTooltipLabel}
        aria-describedby={open ? id : undefined}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={(e) => { if (e.key === "Escape") setOpen(false) }}
        onClick={(e) => { e.preventDefault(); setOpen((v) => !v) }}
        className="group/help inline-flex h-6 w-6 items-center justify-center rounded-full"
      >
        <span
          aria-hidden="true"
          className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-surface-sunken text-caption font-bold leading-none text-fg-muted transition-colors group-hover/help:bg-primary-soft group-hover/help:text-primary-strong"
        >
          ?
        </span>
      </button>
      {open && (
        <span
          id={id}
          role="tooltip"
          className={`absolute z-50 ${sideClass} w-72 px-3 py-2 rounded-lg bg-slate-800 text-white text-caption leading-relaxed shadow-lg whitespace-pre-line pointer-events-none`}
        >
          {content}
          <span className={`absolute w-0 h-0 border-4 ${arrowClass}`} aria-hidden />
        </span>
      )}
    </span>
  )
}
