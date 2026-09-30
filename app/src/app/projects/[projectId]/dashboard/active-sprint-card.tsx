"use client"

import Link from "next/link"
import type { ReactNode } from "react"
import { EmptyState, buttonClasses } from "@/components/ui"
import { I18nText } from "@/components/i18n-text"
import { useLanguage } from "@/lib/language-context"
import { formatDateLocal, type ActiveSprint } from "./types"
import { Calendar, Circle, CircleArrowDown, CircleCheck, Gauge, Rocket } from "lucide-react"

function TaskCount({ icon, label, count, className, labelClass, countClass }: {
  icon: ReactNode; label: string; count: number; className: string; labelClass: string; countClass: string
}) {
  return (
    <div className={`${className} rounded-ui-md p-4 text-center`}>
      <div className="flex justify-center mb-1.5">{icon}</div>
      <div className={`text-caption font-medium ${labelClass}`}>{label}</div>
      <div className={`text-2xl font-bold mt-0.5 ${countClass}`}>{count}</div>
    </div>
  )
}

/** Summary of the running sprint; the whole card links to the sprints page. */
export function ActiveSprintCard({ projectId, sprint }: { projectId: string; sprint: ActiveSprint | null }) {
  const { t } = useLanguage()
  const total = sprint ? sprint.taskCounts.todo + sprint.taskCounts.inProgress + sprint.taskCounts.done : 0
  const donePercent = sprint && total > 0 ? Math.min(100, Math.round((sprint.taskCounts.done / total) * 100)) : 0

  return (
    <section aria-labelledby="dashboard-active-sprint-heading">
      <h2 id="dashboard-active-sprint-heading" className="text-caption font-semibold mb-4 text-fg-muted uppercase tracking-wider">
        {t.dashboardActiveSprint}
      </h2>
      {!sprint ? (
        <div className="bg-surface rounded-ui-lg border border-border shadow-ui-sm">
          <EmptyState
            icon={<Rocket className="w-6 h-6 text-fg-subtle" />}
            title={t.dashboardNoActiveSprint}
            headingLevel={3}
            action={
              <Link href={`/projects/${projectId}/sprints`} className={buttonClasses({ variant: "secondary", size: "sm" })}>
                {t.dashboardOpenSprints}
              </Link>
            }
          />
        </div>
      ) : (
        <Link
          href={`/projects/${projectId}/sprints`}
          className="block bg-surface rounded-ui-lg border border-border shadow-ui-sm overflow-hidden hover:shadow-ui-md hover:border-border-strong transition-[box-shadow,border-color]"
        >
          <div aria-hidden="true" className="h-[3px] bg-gradient-to-r from-violet-500 to-purple-500" />
          <div className="p-4 sm:p-6">
            <div className="flex items-center gap-2.5 mb-3">
              <Rocket className="w-5 h-5 text-violet-600" />
              <h3 className="text-xl font-bold text-fg">
                <I18nText i18n={sprint.i18n} field="sprintName" original={sprint.name} entity={{ type: "sprint", id: sprint.id }} />
              </h3>
            </div>
            {sprint.goal && (
              <div className="border-l-[3px] border-violet-300 bg-violet-50/50 rounded-r-lg px-4 py-2.5 mb-4">
                <I18nText as="p" className="text-body text-fg italic whitespace-pre-wrap" i18n={sprint.i18n} field="sprintGoal" original={sprint.goal} entity={{ type: "sprint", id: sprint.id }} />
              </div>
            )}
            <div className="flex flex-wrap gap-x-6 gap-y-1 text-body text-fg-muted mb-5">
              <span className="inline-flex items-center gap-1.5"><Calendar className="w-4 h-4 text-fg-subtle" />{formatDateLocal(sprint.startDate)} ~ {formatDateLocal(sprint.endDate)}</span>
              <span className="inline-flex items-center gap-1.5"><Gauge className="w-4 h-4 text-fg-subtle" />{t.dashboardCapacity}: {sprint.capacity}</span>
            </div>
            <div className="mb-4">
              <div className="flex items-center justify-between text-caption text-fg-muted mb-1.5">
                <span>{t.taskDone}: {sprint.taskCounts.done}/{total}</span>
                <span className="font-semibold text-success">{donePercent}%</span>
              </div>
              <div
                role="progressbar"
                aria-label={t.taskDone}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={donePercent}
                className="w-full bg-surface-sunken rounded-full h-2 overflow-hidden"
              >
                <div className="bg-green-600 h-2 rounded-full transition-[width] duration-500" style={{ width: `${donePercent}%` }} />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <TaskCount icon={<Circle className="w-5 h-5 text-fg-subtle" />} label={t.taskTodo} count={sprint.taskCounts.todo} className="bg-surface-muted" labelClass="text-fg-muted" countClass="text-fg" />
              <TaskCount icon={<CircleArrowDown className="w-5 h-5 text-primary" />} label={t.taskInProgress} count={sprint.taskCounts.inProgress} className="bg-primary-soft/60" labelClass="text-primary-strong" countClass="text-primary-active" />
              <TaskCount icon={<CircleCheck className="w-5 h-5 text-success" />} label={t.taskDone} count={sprint.taskCounts.done} className="bg-success-soft" labelClass="text-success-strong" countClass="text-success-strong" />
            </div>
          </div>
        </Link>
      )}
    </section>
  )
}
