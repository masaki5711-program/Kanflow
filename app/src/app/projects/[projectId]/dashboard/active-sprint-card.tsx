"use client"

import Link from "next/link"
import { Calendar, Rocket, TrendingDown } from "lucide-react"
import { Badge, EmptyState, buttonClasses, type BadgeTone } from "@/components/ui"
import { I18nText } from "@/components/i18n-text"
import { useLanguage } from "@/lib/language-context"
import type { Translations } from "@/lib/i18n"
import { sprintTimeline, type SprintTimeline } from "./dashboard-summary"
import { SprintSparkline } from "./sprint-sparkline"
import { formatDateLocal, type ActiveSprint } from "./types"

/** Two days or less left reads as a warning. */
const TIGHT_DAYS = 2

function timelineBadge(tl: SprintTimeline, t: Translations): { tone: BadgeTone; text: string } {
  if (tl.kind === "today") return { tone: "warning", text: t.dashboardPulseEndsToday }
  if (tl.kind === "overdue") return { tone: "danger", text: t.dashboardPulseOverdue.replace("{days}", String(tl.days)) }
  return { tone: tl.days <= TIGHT_DAYS ? "warning" : "primary", text: t.dashboardPulseDaysLeft.replace("{days}", String(tl.days)) }
}

function Count({ label, value, dot }: { label: string; value: number; dot: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <span aria-hidden="true" className={`h-2 w-2 rounded-full ${dot}`} />
      <dt className="text-fg-muted">{label}</dt>
      <dd className="font-semibold text-fg">{value}</dd>
    </div>
  )
}

interface Props {
  projectId: string
  sprint: ActiveSprint | null
  now?: Date
}

/** The active sprint at a glance: time left, progress and a burndown sparkline. */
export function ActiveSprintCard({ projectId, sprint, now = new Date() }: Props) {
  const { t } = useLanguage()
  const sprintsHref = `/projects/${projectId}/sprints`

  if (!sprint) {
    return (
      <section aria-labelledby="dashboard-active-sprint-heading" className="rounded-ui-lg border border-border bg-surface shadow-ui-sm">
        <h2 id="dashboard-active-sprint-heading" className="sr-only">{t.dashboardActiveSprint}</h2>
        <EmptyState
          icon={<Rocket className="w-6 h-6 text-fg-subtle" />}
          title={t.dashboardNoActiveSprint}
          headingLevel={3}
          action={<Link href={sprintsHref} className={buttonClasses({ variant: "secondary", size: "sm" })}>{t.dashboardOpenSprints}</Link>}
        />
      </section>
    )
  }

  const { todo, inProgress, done } = sprint.taskCounts
  const total = todo + inProgress + done
  const donePercent = total > 0 ? Math.min(100, Math.round((done / total) * 100)) : 0
  const timeline = sprintTimeline(sprint.endDate, now)
  const badge = timeline ? timelineBadge(timeline, t) : null
  const spark = sprint.sparkline && sprint.sparkline.ideal.length > 1 ? sprint.sparkline : null

  return (
    <section aria-labelledby="dashboard-active-sprint-heading" className="relative overflow-hidden rounded-ui-lg border border-border bg-surface shadow-ui-md">
      <div aria-hidden="true" className="absolute inset-y-0 left-0 w-1.5 bg-primary" />
      <div className="p-5 pl-6 sm:p-6 sm:pl-7">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-caption font-semibold uppercase tracking-wider text-fg-muted">{t.dashboardActiveSprint}</p>
          {badge && <Badge tone={badge.tone} dot>{badge.text}</Badge>}
        </div>
        <h2 id="dashboard-active-sprint-heading" className="mt-1 text-heading font-bold leading-tight text-fg">
          <Link href={sprintsHref} className="rounded-sm hover:text-primary">
            <I18nText i18n={sprint.i18n} field="sprintName" original={sprint.name} entity={{ type: "sprint", id: sprint.id }} />
          </Link>
        </h2>
        {sprint.goal && (
          <I18nText as="p" className="mt-1 line-clamp-2 text-body text-fg-muted" i18n={sprint.i18n} field="sprintGoal" original={sprint.goal} entity={{ type: "sprint", id: sprint.id }} />
        )}
        <p className="mt-2 inline-flex items-center gap-1.5 text-caption text-fg-muted">
          <Calendar aria-hidden="true" className="h-3.5 w-3.5" />
          {formatDateLocal(sprint.startDate)} ~ {formatDateLocal(sprint.endDate)} · {t.dashboardCapacity}: {sprint.capacity}
        </p>

        <div className="mt-5 flex flex-wrap items-end justify-between gap-5">
          <div className="min-w-[12rem] flex-1">
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-[2rem] font-bold leading-none text-fg">{donePercent}%</span>
              <span className="text-caption text-fg-muted">
                {t.dashboardPulseProgress.replace("{done}", String(done)).replace("{total}", String(total))}
              </span>
            </div>
            <div
              role="progressbar"
              aria-label={t.taskDone}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={donePercent}
              className="mt-2 h-2 w-full overflow-hidden rounded-full bg-surface-sunken"
            >
              <div className="h-2 rounded-full bg-success transition-[width] duration-500" style={{ width: `${donePercent}%` }} />
            </div>
            <dl className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-caption">
              <Count label={t.taskTodo} value={todo} dot="bg-fg-subtle" />
              <Count label={t.taskInProgress} value={inProgress} dot="bg-primary" />
              <Count label={t.taskDone} value={done} dot="bg-success" />
            </dl>
          </div>
          {spark && (
            <div className="shrink-0">
              <SprintSparkline
                data={spark}
                label={t.dashboardPulseSparkline.replace("{total}", String(spark.total)).replace("{remaining}", String(spark.remaining))}
              />
              <Link href={`/projects/${projectId}/burndown`} className="mt-1 inline-flex items-center gap-1 rounded-sm text-caption font-medium text-primary-strong hover:underline">
                <TrendingDown aria-hidden="true" className="h-3.5 w-3.5" />
                {t.dashboardPulseOpenBurndown}
              </Link>
            </div>
          )}
        </div>
      </div>
    </section>
  )
}
