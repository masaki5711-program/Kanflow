"use client"

import { RefreshCw } from "lucide-react"
import { useLanguage } from "@/lib/language-context"
import { Button, EmptyState, IconButton, SkeletonCard } from "@/components/ui"
import { useApiQuery } from "@/hooks"
import { actualPoints, type BurndownData } from "@/components/burndown/burndown-geometry"
import BurndownSvg, { SERIES_COLOR, sprintBand } from "@/components/burndown/burndown-svg"

interface Props {
  projectId: string
  /** Show a manual "reload" control (the dedicated burndown page). */
  refreshable?: boolean
}

function localToday(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`
}

function LegendLine({ color, dashed, label }: { color: string; dashed?: boolean; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <svg width="20" height="4" aria-hidden="true">
        <line x1="0" y1="2" x2="20" y2="2" stroke={color} strokeWidth={dashed ? 2 : 3} strokeDasharray={dashed ? "4,2" : undefined} />
      </svg>
      {label}
    </span>
  )
}

export default function BurndownChart({ projectId, refreshable = false }: Props) {
  const { t } = useLanguage()
  const { data, error, isLoading, isFetching, refetch } = useApiQuery<BurndownData>(
    `/api/projects/${projectId}/burndown`,
    { toastOnError: true },
  )

  if (isLoading) return <SkeletonCard label={t.loading} className="mb-6" />
  if (!data || data.days.length <= 1) {
    const canRetry = refreshable || !!error
    return (
      <EmptyState
        compact
        title={error && !data ? t.error : t.burndownEmpty}
        description={error && !data ? error.message : undefined}
        className="mb-6"
        action={canRetry ? (
          <Button variant="secondary" loading={isFetching} leftIcon={<RefreshCw className="h-4 w-4" aria-hidden="true" />} onClick={refetch}>
            {t.burndownRefresh}
          </Button>
        ) : undefined}
      />
    )
  }

  const points = actualPoints(data)
  const remaining = points.length > 0 ? points[points.length - 1].y : data.totalTasks
  const chartLabel = t.burndownChartLabel
    .replace("{total}", String(data.totalTasks))
    .replace("{remaining}", String(remaining))

  return (
    <section aria-labelledby={`burndown-title-${projectId}`} className="bg-surface rounded-ui-md shadow-ui-sm border border-border p-5 mb-6">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <h3 id={`burndown-title-${projectId}`} className="text-body-lg font-semibold text-fg">{t.burndownTitle}</h3>
        <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-caption text-fg">
          <LegendLine color={SERIES_COLOR.plan} dashed label={t.burndownPlan} />
          <LegendLine color={SERIES_COLOR.ideal} dashed label={t.burndownIdeal} />
          <LegendLine color={SERIES_COLOR.actual} label={t.burndownActual} />
          <span className="text-fg-muted">{t.burndownTotal.replace("{count}", String(data.totalTasks))}</span>
          {refreshable && (
            <IconButton label={t.burndownRefresh} icon={<RefreshCw className="h-4 w-4" />} size="sm"
              loading={isFetching} onClick={refetch} />
          )}
        </div>
      </div>

      {data.sprintMarkers.length > 0 && (
        <ul className="flex flex-wrap gap-2 mb-3">
          {data.sprintMarkers.map((sm) => {
            const band = sprintBand(sm.status)
            return (
              <li key={sm.id} className="text-caption px-2.5 py-1 rounded-ui-sm border flex items-center gap-2"
                style={{ borderColor: band.stroke, backgroundColor: band.fill }}>
                <span className="font-medium text-fg">{sm.name}</span>
                <span className="text-fg-muted">{sm.doneCount}/{sm.taskCount}{t.burndownCompleted}</span>
              </li>
            )
          })}
        </ul>
      )}

      <BurndownSvg data={data} todayIndex={data.days.indexOf(localToday())} label={chartLabel} />
    </section>
  )
}
