"use client"

import { Badge, type BadgeTone } from "@/components/ui"
import { fillTemplate } from "@/lib/fill-template"
import type { Translations } from "@/lib/i18n"

/** State badge: text + dot (colour is never the only signal). */
const STATE_TONE: Record<string, BadgeTone> = { draft: "warning", confirmed: "success", systemized: "primary", retired: "neutral" }

export function stateLabel(state: string, t: Translations): string {
  switch (state) {
    case "draft":
      return t.feedbackStateDraft
    case "confirmed":
      return t.feedbackStateConfirmed
    case "systemized":
      return t.feedbackStateSystemized
    case "retired":
      return t.feedbackStateRetired
    default:
      return state
  }
}

export function StateBadge({ state, t }: { state: string; t: Translations }) {
  return (
    <Badge tone={STATE_TONE[state] ?? "neutral"} dot data-lesson-state={state}>
      {stateLabel(state, t)}
    </Badge>
  )
}

export function scopeLabel(scope: string, t: Translations): string {
  if (scope.startsWith("tech:")) return fillTemplate(t.feedbackScopeTech, { name: scope.slice(5) })
  if (scope.startsWith("project:")) return fillTemplate(t.feedbackScopeProject, { id: scope.slice(8) })
  return t.feedbackScopeGlobal
}
