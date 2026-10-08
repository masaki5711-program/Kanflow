"use client"

import { useId } from "react"
import { useLanguage } from "@/lib/language-context"

interface Props {
  checked: boolean
  onChange: (checked: boolean) => void
  disabled?: boolean
}

/** 「土日を除いて日数を数える」: whether a 5-day stage counts Saturdays and Sundays. */
export function WeekendOption({ checked, onChange, disabled }: Props) {
  const { t } = useLanguage()
  const hintId = useId()
  return (
    <div className={disabled ? "opacity-60" : undefined}>
      <label className="inline-flex min-h-8 items-center gap-2 text-body text-fg">
        <input
          type="checkbox"
          className="h-4 w-4"
          checked={checked}
          disabled={disabled}
          aria-describedby={hintId}
          onChange={(e) => onChange(e.target.checked)}
          data-testid="tpl-skip-weekends"
        />
        {t.tplSkipWeekends}
      </label>
      <p id={hintId} className="ml-6 text-caption text-fg-muted">
        {t.tplSkipWeekendsHint}
      </p>
    </div>
  )
}
