"use client"

import Link from "next/link"
import { useLanguage } from "@/lib/language-context"
import { Badge, Button, buttonClasses, PageHeader } from "@/components/ui"
import { Archive, Calendar, ChartColumn, Plus, TrendingDown, Zap } from "lucide-react"
import { ExcelExportButton } from "@/components/excel/excel-export-button"
/** Below `sm` the secondary actions are icons only, so they fit one row above the board (A3-17). */
export const PHONE_ICON_ONLY_LABEL = "sr-only sm:not-sr-only"

interface Props {
  projectId: string
  avgActual: number | null
  doneSprintCount: number
  archivedCount: number
  showArchived: boolean
  onToggleArchived: () => void
  /** True while an active/planning sprint exists — creating another is blocked. */
  isCreateBlocked: boolean
  /** sprint.manage — without it the create button is hidden. */
  canCreate: boolean
  /** True until the project defaults (dates, capacity) are loaded — the create button waits for them (S-16). */
  isCreateLoading?: boolean
  onCreate: () => void
}

export default function SprintsHeader({
  projectId, avgActual, doneSprintCount, archivedCount, showArchived, onToggleArchived, isCreateBlocked, canCreate,
  isCreateLoading = false, onCreate,
}: Props) {
  const { t, pt } = useLanguage()
  return (
    <PageHeader
      title={pt.sprintTitle}
      icon={<Zap className="w-7 h-7 text-primary" />}
      description={
        avgActual !== null && (
          <Badge tone="primary" size="md" className="max-w-full whitespace-normal rounded-ui-md">
            <ChartColumn className="w-4 h-4" />
            {t.sprintAvgScore.replace("{count}", String(doneSprintCount))}: {avgActual}
          </Badge>
        )
      }
      actions={
        <div className="flex flex-wrap items-center gap-2">
          <ExcelExportButton href={`/api/projects/${projectId}/sprints/export`} iconOnlyOnPhone />
          <Link href={`/projects/${projectId}/calendar`} title={t.calendarTitle} className={buttonClasses({ variant: "secondary" })}>
            <Calendar aria-hidden className="w-4 h-4" />
            <span className={PHONE_ICON_ONLY_LABEL}>{t.calendarTitle}</span>
          </Link>
          <Link href={`/projects/${projectId}/burndown`} title={t.burndownOpenPage} className={buttonClasses({ variant: "secondary" })}>
            <TrendingDown aria-hidden className="w-4 h-4" />
            <span className={PHONE_ICON_ONLY_LABEL}>{t.burndownOpenPage}</span>
          </Link>
          <Button variant={showArchived ? "secondary" : "ghost"} aria-pressed={showArchived} onClick={onToggleArchived}
            title={t.sprintArchivedSprints} leftIcon={<Archive aria-hidden className="w-4 h-4" />}>
            <span className={PHONE_ICON_ONLY_LABEL}>{t.sprintArchivedSprints}</span>
            {archivedCount > 0 && <Badge tone="neutral" size="sm">{archivedCount}</Badge>}
          </Button>
          {canCreate && <Button onClick={onCreate} disabled={isCreateBlocked || isCreateLoading} leftIcon={<Plus className="w-4 h-4" />}
            title={isCreateBlocked ? t.sprintCreateBlocked : undefined}
            aria-describedby={isCreateBlocked ? "sprint-create-blocked-hint" : undefined}>
            {t.sprintCreate}
          </Button>}
        </div>
      }
    >
      {canCreate && isCreateBlocked && (
        <p id="sprint-create-blocked-hint" className="w-full text-right text-caption text-fg-muted">
          {t.sprintCreateBlocked}
        </p>
      )}
    </PageHeader>
  )
}
