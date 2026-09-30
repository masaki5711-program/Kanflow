"use client"

import Link from "next/link"
import { useLanguage } from "@/lib/language-context"
import { Badge, Button, buttonClasses, PageHeader } from "@/components/ui"
import { Archive, Calendar, ChartColumn, Plus, TrendingDown, Zap } from "lucide-react"
interface Props {
  projectId: string
  avgActual: number | null
  doneSprintCount: number
  archivedCount: number
  showArchived: boolean
  onToggleArchived: () => void
  /** True while an active/planning sprint exists — creating another is blocked. */
  isCreateBlocked: boolean
  onCreate: () => void
}

export default function SprintsHeader({
  projectId, avgActual, doneSprintCount, archivedCount, showArchived, onToggleArchived, isCreateBlocked, onCreate,
}: Props) {
  const { t, pt } = useLanguage()
  return (
    <PageHeader
      title={pt.sprintTitle}
      icon={<Zap className="w-7 h-7 text-primary" />}
      description={
        avgActual !== null && (
          <Badge tone="primary" size="md">
            <ChartColumn className="w-4 h-4" />
            {t.sprintAvgScore.replace("{count}", String(doneSprintCount))}: {avgActual}
          </Badge>
        )
      }
      actions={
        <div className="flex flex-wrap items-center gap-2">
          <Link href={`/projects/${projectId}/calendar`} className={buttonClasses({ variant: "secondary" })}>
            <Calendar className="w-4 h-4" />
            {t.calendarTitle}
          </Link>
          <Link href={`/projects/${projectId}/burndown`} className={buttonClasses({ variant: "secondary" })}>
            <TrendingDown className="w-4 h-4" />
            {t.burndownOpenPage}
          </Link>
          <Button variant={showArchived ? "secondary" : "ghost"} aria-pressed={showArchived} onClick={onToggleArchived}
            leftIcon={<Archive className="w-4 h-4" />}>
            {t.sprintArchivedSprints}
            {archivedCount > 0 && <Badge tone="neutral" size="sm">{archivedCount}</Badge>}
          </Button>
          <Button onClick={onCreate} disabled={isCreateBlocked} leftIcon={<Plus className="w-4 h-4" />}
            title={isCreateBlocked ? t.sprintCreateBlocked : undefined}
            aria-describedby={isCreateBlocked ? "sprint-create-blocked-hint" : undefined}>
            {t.sprintCreate}
          </Button>
        </div>
      }
    >
      {isCreateBlocked && (
        <p id="sprint-create-blocked-hint" className="w-full text-right text-caption text-fg-muted">
          {t.sprintCreateBlocked}
        </p>
      )}
    </PageHeader>
  )
}
