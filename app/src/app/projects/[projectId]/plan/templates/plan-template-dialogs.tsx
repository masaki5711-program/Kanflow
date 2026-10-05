"use client"

import { useState } from "react"
import { CalendarClock, X } from "lucide-react"
import { Button, IconButton, useToast } from "@/components/ui"
import { fillTemplate } from "@/lib/fill-template"
import { useLanguage } from "@/lib/language-context"
import { useProjectName } from "@/components/app-shell/project-title-context"
import type { ApplyResult } from "@/services/plan-templates/plan-templates.apply"
import type { PlanItem } from "../lib/plan-types"
import { SaveAsTemplateDialog } from "./save-as-template-dialog"
import { ScheduleFromDialog } from "./schedule-from-dialog"
import { TemplateLoadDialog } from "./template-load-dialog"

export type TemplateDialogMode = "load" | "save" | "schedule" | null

interface Props {
  mode: TemplateDialogMode
  onMode: (mode: TemplateDialogMode) => void
  projectId: string
  items: readonly PlanItem[]
  nameOf: (item: PlanItem) => string
  today: string
  /** Reload the plan after a write. */
  onChanged: () => void
  /** The first created row (select + reveal it). */
  onLoaded: (firstId: string | null) => void
  /** Dates were pencilled in (the page fits the timeline to them). */
  onScheduled: () => void
}

/**
 * The plan page's template flows: load dialog, save-as dialog and the
 * 「日程を仮置き」 dialog, plus the banner that offers 仮置き for the stages
 * just loaded (only when the template has 目安期間).
 */
export function PlanTemplateDialogs({ mode, onMode, projectId, items, nameOf, today, onChanged, onLoaded, onScheduled }: Props) {
  const { t } = useLanguage()
  const toast = useToast()
  const projectName = useProjectName()
  /** Roots of the last load with durations (banner + scoped 仮置き); null = none. */
  const [loadedRoots, setLoadedRoots] = useState<string[] | null>(null)
  const close = () => onMode(null)

  function applied(result: ApplyResult, template: { name: string }) {
    close()
    onChanged()
    onLoaded(result.createdRootIds[0] ?? null)
    setLoadedRoots(result.hasDurations ? result.createdRootIds : null)
    toast.success(fillTemplate(t.tplLoaded, { name: template.name, n: result.createdCount }))
  }

  return (
    <>
      {loadedRoots && (
        <div role="status" data-testid="tpl-schedule-banner" className="flex flex-wrap items-center gap-2 rounded-ui-md border border-info/30 bg-info-soft px-3 py-2 text-body text-info">
          <CalendarClock aria-hidden="true" className="h-4 w-4 shrink-0" />
          <span className="min-w-0 flex-1">{t.tplScheduleBanner}</span>
          <Button size="sm" onClick={() => onMode("schedule")}>{t.tplScheduleAction}</Button>
          <IconButton size="sm" label={t.close} icon={<X className="h-4 w-4" />} onClick={() => setLoadedRoots(null)} />
        </div>
      )}
      {mode === "load" && <TemplateLoadDialog projectId={projectId} items={items} nameOf={nameOf} onClose={close} onApplied={applied} />}
      {mode === "save" && <SaveAsTemplateDialog projectId={projectId} defaultName={projectName} onClose={close} />}
      {mode === "schedule" && (
        <ScheduleFromDialog
          projectId={projectId}
          rootIds={loadedRoots}
          defaultStart={today}
          onClose={close}
          onDone={() => {
            close()
            setLoadedRoots(null)
            onScheduled()
            onChanged()
          }}
        />
      )}
    </>
  )
}
