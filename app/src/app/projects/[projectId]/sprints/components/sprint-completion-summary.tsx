"use client"

import { useLanguage } from "@/lib/language-context"
import { unfinishedWork } from "../lib/sprint-metrics"
import type { SprintItem } from "./types"
import { TriangleAlert } from "lucide-react"

interface Props {
  items: readonly SprintItem[]
}

/**
 * Shown in the "complete sprint" dialog: what is left unfinished and what
 * completing does (auto-archive, AI review, unfinished PBIs stay Ready).
 */
export default function SprintCompletionSummary({ items }: Props) {
  const { t } = useLanguage()
  const left = unfinishedWork(items)
  const hasUnfinished = left.tasks > 0 || left.pbis > 0
  return (
    <section aria-label={t.sprintCompleteCheckTitle} data-testid="sprint-completion-summary"
      className="bg-warning-soft border border-warning/30 rounded-ui-md px-4 py-3 space-y-1.5 text-body">
      <p className="flex items-center gap-2 font-semibold text-warning-strong">
        <TriangleAlert className="w-4 h-4" aria-hidden="true" />
        {t.sprintCompleteCheckTitle}
      </p>
      <p className="text-fg">
        {hasUnfinished
          ? t.sprintCompleteUnfinished.replace("{tasks}", String(left.tasks)).replace("{pbis}", String(left.pbis))
          : t.sprintCompleteAllDone}
      </p>
      <p className="text-fg-muted">{t.sprintCompleteArchiveNote}</p>
      {left.pbis > 0 && <p className="text-fg-muted">{t.sprintCompleteCarryOverNote}</p>}
    </section>
  )
}
