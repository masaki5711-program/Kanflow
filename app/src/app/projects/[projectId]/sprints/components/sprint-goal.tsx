"use client"

import { useId, useState } from "react"
import { I18nText } from "@/components/i18n-text"
import { useLanguage } from "@/lib/language-context"
import type { Sprint } from "./types"

/** Goals longer than this get the phone-only "show all" toggle (about three lines at 375 px). */
export const GOAL_CLAMP_CHARS = 120

/**
 * Sprint goal under the card header. On phones a long goal is clamped to three
 * lines with a toggle, so the board is not pushed a screen down (A3-17); from
 * `sm` up it is always shown in full.
 */
export function SprintGoal({ sprint }: { sprint: Pick<Sprint, "id" | "sprintGoal" | "i18n"> }) {
  const { t } = useLanguage()
  const id = useId()
  const [expanded, setExpanded] = useState(false)
  if (!sprint.sprintGoal) return null
  const isLong = sprint.sprintGoal.length > GOAL_CLAMP_CHARS
  const clamp = isLong && !expanded ? "line-clamp-3 sm:line-clamp-none" : ""
  return (
    <div className="px-6 pb-2">
      <div id={id}>
        <I18nText as="p" i18n={sprint.i18n} field="sprintGoal" original={sprint.sprintGoal}
          entity={{ type: "sprint", id: sprint.id }} className={`text-body text-fg-muted italic whitespace-pre-wrap ${clamp}`} />
      </div>
      {isLong && (
        <button type="button" aria-expanded={expanded} aria-controls={id} onClick={() => setExpanded((v) => !v)}
          className="mt-1 min-h-8 text-caption font-medium text-primary underline-offset-2 hover:underline sm:hidden">
          {expanded ? t.sprintGoalShowLess : t.sprintGoalShowAll}
        </button>
      )}
    </div>
  )
}
