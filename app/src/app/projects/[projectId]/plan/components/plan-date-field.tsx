"use client"

import { useId, useRef, useState, type KeyboardEvent } from "react"
import { CalendarDays } from "lucide-react"
import { Input, cn } from "@/components/ui"
import { useLanguage } from "@/lib/language-context"
import { parseDateInput } from "../lib/date-input"
import { formatFullDate } from "../lib/date-format"
import { isYmd } from "../lib/date"
import type { Ymd } from "../lib/plan-types"
import { fillTemplate } from "../lib/template"

interface Props {
  /** "YYYY-MM-DD" or "" (empty). */
  value: string
  onChange: (value: string) => void
  /** The API's "today": anchor of the relative entries ("+2w", "来週金曜"). */
  today: Ymd
  /** Earliest pickable day in the calendar popup (typed dates are not limited). */
  min?: string
  /** Inline cell editing: small, focused on mount, Enter/Esc end the edit, no hint line. */
  inline?: { onDone: () => void; label: string }
  invalid?: boolean
  disabled?: boolean
}

/**
 * A date entry that understands short-hand ("+2w", "来週金曜", "月末", "10/20")
 * next to the calendar picker. The text is resolved on Enter / blur; what it
 * resolved to is shown underneath before that, so nothing is guessed silently.
 */
export function PlanDateField({ value, onChange, today, min, inline, invalid, disabled }: Props) {
  const { t, language } = useLanguage()
  const [draft, setDraft] = useState(value)
  const [bad, setBad] = useState(false)
  const pickerRef = useRef<HTMLInputElement>(null)
  const cancelledRef = useRef(false)
  const hintId = useId()

  // Follow outside changes (e.g. the duration field moved the end): adjusted during render, not in an effect.
  const [seenValue, setSeenValue] = useState(value)
  if (seenValue !== value) {
    setSeenValue(value)
    setDraft(value)
    setBad(false)
  }

  const resolved = draft.trim() && draft !== value ? parseDateInput(draft, today) : null

  function commit(): boolean {
    const text = draft.trim()
    if (!text) {
      setBad(false)
      if (value !== "") onChange("")
      return true
    }
    const next = parseDateInput(text, today)
    if (!next) {
      setBad(true)
      return false
    }
    setBad(false)
    setDraft(next)
    if (next !== value) onChange(next)
    return true
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      // The editor form submits on Enter; resolving the text comes first.
      if (!inline) e.preventDefault()
      if (commit() && inline) inline.onDone()
    } else if (e.key === "Escape" && inline) {
      e.stopPropagation()
      cancelledRef.current = true
      setDraft(value)
      inline.onDone()
    }
  }

  const showError = bad || invalid
  return (
    <div className={cn("relative", inline && "w-full")}>
      <div className="flex items-center gap-1">
        <Input
          type="text"
          inputMode="text"
          autoComplete="off"
          value={draft}
          disabled={disabled}
          placeholder={inline ? undefined : t.pscDateHint}
          inputSize={inline ? "sm" : "md"}
          aria-label={inline?.label}
          aria-invalid={showError ? true : undefined}
          aria-describedby={inline ? undefined : hintId}
          autoFocus={!!inline}
          title={inline && resolved ? fillTemplate(t.pscDateResolved, { date: formatFullDate(resolved, language) }) : undefined}
          className={cn(inline && "min-h-7 px-1.5 py-0 tabular-nums")}
          onChange={(e) => {
            setDraft(e.target.value)
            setBad(false)
          }}
          onBlur={() => {
            if (cancelledRef.current) return
            if (commit()) {
              inline?.onDone()
            } else if (inline) {
              // An unreadable entry in a cell is dropped rather than leaving the cell stuck in edit mode.
              setDraft(value)
              inline.onDone()
            }
          }}
          onKeyDown={onKeyDown}
          data-plan-date-input=""
        />
        {!inline && (
          <>
            <button
              type="button"
              disabled={disabled}
              aria-label={t.pscDatePick}
              title={t.pscDatePick}
              className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-ui-md border border-border-strong bg-surface text-fg-muted hover:bg-surface-muted hover:text-fg disabled:opacity-50"
              onClick={() => pickerRef.current?.showPicker?.()}
            >
              <CalendarDays className="h-4 w-4" />
            </button>
            <input
              ref={pickerRef}
              type="date"
              tabIndex={-1}
              aria-hidden="true"
              min={min}
              value={isYmd(value) ? value : ""}
              onChange={(e) => e.target.value && onChange(e.target.value)}
              className="pointer-events-none absolute h-0 w-0 opacity-0"
            />
          </>
        )}
      </div>
      {!inline && (
        <p id={hintId} aria-live="polite" className={cn("mt-1 min-h-4 text-caption", bad ? "font-medium text-danger" : "text-fg-muted")}>
          {bad ? t.pscDateInvalid : resolved ? fillTemplate(t.pscDateResolved, { date: formatFullDate(resolved, language) }) : ""}
        </p>
      )}
    </div>
  )
}
