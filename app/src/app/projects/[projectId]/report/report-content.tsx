"use client"

import Link from "next/link"
import { useMemo } from "react"
import { Button } from "@/components/ui"
import { useLanguage } from "@/lib/language-context"
import { formatPointUnit } from "@/lib/i18n"
import BurndownChart from "@/components/burndown-chart"
import { pickText } from "@/lib/translation/pick-text"
import type { EntityI18n } from "@/lib/translation/types"
import { BacklogSection } from "./backlog-section"
import { IceboxSection, ProjectOverviewSection, UpcomingEventsSection } from "./overview-sections"
import { ReportPrintStyles, usePrintExpandDetails } from "./report-print-styles"
import { SprintDetail } from "./sprint-detail"
import { NowSnapshot, PastSprintList, SprintSummaryTable, UpcomingSprintCard } from "./sprint-sections"
import {
  SPRINT_STATUS_ORDER,
  type BacklogItem,
  type BacklogSummary,
  type CalendarEvent,
  type IceboxSummary,
  type Member,
  type ReportFormat,
  type ReportProductGoal,
  type Sprint,
} from "./types"
import { useProjectDocumentTitle } from "@/components/app-shell/project-title-context"

interface ReportContentProps {
  projectId: string
  projectName: string
  projectDescription: string | null
  projectI18n?: EntityI18n
  language: string
  pointUnit: string
  members: Member[]
  productGoals: ReportProductGoal[]
  sprints: Sprint[]
  backlogItems: BacklogItem[]
  backlogSummary: BacklogSummary
  icebox: IceboxSummary
  events: CalendarEvent[]
}

export function ReportContent({
  projectId,
  projectName,
  projectDescription,
  projectI18n,
  language,
  pointUnit: rawPointUnit,
  members,
  productGoals,
  sprints,
  backlogItems,
  backlogSummary,
  icebox,
  events,
}: ReportContentProps) {
  const { t, language: uiLanguage } = useLanguage()
  useProjectDocumentTitle(t.reportTitle)
  usePrintExpandDetails(".report-container")
  const locale = language === "ja" ? "ja-JP" : language === "id" ? "id-ID" : "en-US"

  const fmt: ReportFormat = useMemo(() => {
    const statusLabels: Record<string, string> = {
      planning: t.sprintStatusPlanning,
      active: t.sprintStatusActive,
      review: t.sprintStatusReview,
      done: t.sprintStatusDone,
      archived: t.sprintStatusArchived,
    }
    return {
      pick: (i18n, field, original) => pickText(i18n, field, original, uiLanguage).text,
      formatDate: (iso) => new Date(iso).toLocaleDateString(locale),
      pointUnit: formatPointUnit(rawPointUnit, t),
      statusLabel: (status) => statusLabels[status] ?? status,
    }
  }, [t, uiLanguage, locale, rawPointUnit])

  const groups = useMemo(() => {
    // Active first, then by status order, newest start date within a status.
    const sorted = [...sprints].sort((a, b) => {
      const diff = SPRINT_STATUS_ORDER.indexOf(a.status) - SPRINT_STATUS_ORDER.indexOf(b.status)
      return diff !== 0 ? diff : new Date(b.startDate).getTime() - new Date(a.startDate).getTime()
    })
    // Time axis: Now → Upcoming → Past instead of one flat list.
    return {
      current: sorted.filter((s) => s.status === "active" || s.status === "review"),
      upcoming: sorted.filter((s) => s.status === "planning"),
      past: sorted.filter((s) => s.status === "done" || s.status === "archived"),
    }
  }, [sprints])

  const avgActual = groups.past.length > 0
    ? Math.round(groups.past.reduce((sum, s) => sum + s.actualScore, 0) / groups.past.length)
    : null
  const today = new Date().toLocaleDateString(locale)

  return (
    <div className="report-container">
      <div className="print-hide flex flex-wrap items-center justify-between gap-2 mb-6">
        <Link href={`/projects/${projectId}`} className="text-body text-primary hover:text-primary-hover hover:underline">
          <span aria-hidden="true">&larr; </span>{t.back}
        </Link>
        <Button onClick={() => window.print()}>{t.reportPrint}</Button>
      </div>

      <div className="text-center mb-8 pb-4 border-b-2 border-gray-300">
        <h1 className="text-2xl font-bold text-gray-900">{t.reportTitle}</h1>
        <h2 className="text-xl font-semibold text-gray-800 mt-2 break-words">{fmt.pick(projectI18n, "name", projectName)}</h2>
        <p className="text-sm text-fg-muted mt-1" suppressHydrationWarning>{t.reportGeneratedAt}: {today}</p>
      </div>

      <ProjectOverviewSection description={projectDescription} projectI18n={projectI18n} goals={productGoals} members={members} fmt={fmt} />

      <section className="report-section">
        <h3 className="report-heading">{t.reportSectionNow}</h3>
        <NowSnapshot sprints={groups.current} fmt={fmt} />
      </section>

      <section className="report-section">
        <h3 className="report-heading">{t.reportSprintResults}</h3>
        {avgActual !== null && (
          <p className="text-sm text-blue-800 bg-blue-50 px-3 py-2 rounded mb-3">
            {t.settingsAvgScore}: <strong>{avgActual}</strong> ({t.reportSprintCount.replace("{n}", String(groups.past.length))})
          </p>
        )}
        {sprints.length > 0 ? (
          <SprintSummaryTable groups={groups} fmt={fmt} />
        ) : (
          <p className="text-sm text-fg-muted">{t.sprintNoSprints}</p>
        )}
      </section>

      <section className="report-section">
        <BurndownChart projectId={projectId} />
      </section>

      {groups.current.length > 0 && (
        <section className="report-section">
          <h3 className="report-heading">{t.reportSectionNow} - {t.reportActiveSprintDetail}</h3>
          {groups.current.map((sprint) => <SprintDetail key={sprint.id} sprint={sprint} fmt={fmt} />)}
        </section>
      )}

      {groups.upcoming.length > 0 && (
        <section className="report-section">
          <h3 className="report-heading">{t.reportSectionUpcoming}</h3>
          <div className="space-y-2">
            {groups.upcoming.map((sprint) => <UpcomingSprintCard key={sprint.id} sprint={sprint} fmt={fmt} />)}
          </div>
        </section>
      )}

      {groups.past.length > 0 && (
        <section className="report-section">
          <h3 className="report-heading">{t.reportSectionHistory}</h3>
          <PastSprintList sprints={groups.past} fmt={fmt} />
        </section>
      )}

      <BacklogSection items={backlogItems} summary={backlogSummary} fmt={fmt} />
      <IceboxSection icebox={icebox} />
      <UpcomingEventsSection events={events} fmt={fmt} />

      <ReportPrintStyles />
    </div>
  )
}
