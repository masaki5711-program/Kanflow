"use client"

import { Fragment, useState } from "react"
import { useLanguage } from "@/lib/language-context"
import { SprintDetail } from "./sprint-detail"
import { achievementRate, sprintStatusBadge, taskCounts, type ReportFormat, type Sprint } from "./types"

const MS_PER_DAY = 86_400_000

function StatTile({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-lg px-3 py-2 text-center">
      <div className="text-caption text-fg-muted">{label}</div>
      {children}
    </div>
  )
}

function NowSprintCard({ sprint, fmt, now }: { sprint: Sprint; fmt: ReportFormat; now: number }) {
  const { t, pt } = useLanguage()
  const start = new Date(sprint.startDate).getTime()
  const end = new Date(sprint.endDate).getTime()
  const totalDays = Math.max(1, Math.round((end - start) / MS_PER_DAY))
  const remaining = Math.round((end - now) / MS_PER_DAY)
  const elapsed = Math.max(0, Math.min(totalDays, Math.round((now - start) / MS_PER_DAY)))
  const elapsedPct = Math.round((elapsed / totalDays) * 100)
  const counts = taskCounts(sprint.items)
  const taskPct = counts.total > 0 ? Math.round((counts.done / counts.total) * 100) : 0

  return (
    <div className="rounded-2xl border border-blue-200 bg-gradient-to-br from-blue-50 to-indigo-50 p-4 sm:p-5 print:bg-white">
      <div className="flex flex-wrap items-start gap-3 mb-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h4 className="text-base font-bold text-gray-900 break-words">{fmt.pick(sprint.i18n, "sprintName", sprint.sprintName)}</h4>
            <span className={`text-caption px-2 py-0.5 rounded-full font-medium ${sprintStatusBadge(sprint.status)}`}>
              {fmt.statusLabel(sprint.status)}
            </span>
          </div>
          <div className="text-xs text-gray-700 mt-0.5">{fmt.formatDate(sprint.startDate)} ~ {fmt.formatDate(sprint.endDate)}</div>
        </div>
        <div className="text-right">
          <div className={`text-2xl font-bold leading-none ${remaining < 0 ? "text-rose-700" : "text-blue-800"}`}>{Math.abs(remaining)}</div>
          <div className="text-caption text-fg-muted">{remaining < 0 ? t.reportDaysOverdue : t.reportDaysRemaining}</div>
        </div>
      </div>

      <div className="mb-3">
        <div className="flex justify-between text-caption text-fg-muted mb-1">
          <span>{t.dashboardPeriod}</span>
          <span>{elapsedPct}%</span>
        </div>
        <div className="h-1.5 bg-white rounded-full overflow-hidden">
          <div className="h-full bg-blue-600" style={{ width: `${Math.min(100, elapsedPct)}%` }} />
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <StatTile label={t.sprintCapacity}>
          <div className="text-sm font-bold text-gray-900">{sprint.capacity} <span className="text-caption font-normal text-fg-muted">{fmt.pointUnit}</span></div>
        </StatTile>
        <StatTile label={t.sprintActualScore}>
          <div className="text-sm font-bold text-green-800">{sprint.actualScore} <span className="text-caption font-normal text-fg-muted">({achievementRate(sprint)}%)</span></div>
        </StatTile>
        <StatTile label={t.reportTaskProgress}>
          <div className="text-sm font-bold text-indigo-700">{counts.done}/{counts.total} <span className="text-caption font-normal text-fg-muted">({taskPct}%)</span></div>
        </StatTile>
        <StatTile label={t.sprintTasks}>
          <div className="text-xs">
            <span className="text-blue-800 font-semibold">{counts.inProgress}</span>
            <span className="text-fg-subtle mx-0.5">/</span>
            <span className="text-fg-muted font-semibold">{counts.todo}</span>
          </div>
          <div className="text-caption text-fg-muted">{t.taskInProgress}/{t.taskTodo}</div>
        </StatTile>
      </div>

      {sprint.sprintGoal && (
        <div className="mt-3 bg-white/60 rounded-lg px-3 py-2">
          <div className="text-caption font-semibold text-fg-muted mb-0.5">{pt.sprintGoal}</div>
          <p className="text-xs text-gray-800 whitespace-pre-wrap">{fmt.pick(sprint.i18n, "sprintGoal", sprint.sprintGoal)}</p>
        </div>
      )}
    </div>
  )
}

/** "Now" hero cards — days remaining, achievement rate and task counts at a glance. */
export function NowSnapshot({ sprints, fmt }: { sprints: Sprint[]; fmt: ReportFormat }) {
  // Captured once per mount so re-renders stay stable.
  const [now] = useState(() => Date.now())
  const { t } = useLanguage()
  if (sprints.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-gray-200 bg-white px-6 py-6 text-center">
        <p className="text-sm text-fg-muted">{t.reportNoCurrentSprint}</p>
      </div>
    )
  }
  return (
    <div className="space-y-3">
      {sprints.map((sprint) => <NowSprintCard key={sprint.id} sprint={sprint} fmt={fmt} now={now} />)}
    </div>
  )
}

/** Compact card for planned sprints — no task tables. */
export function UpcomingSprintCard({ sprint, fmt }: { sprint: Sprint; fmt: ReportFormat }) {
  const { t, pt } = useLanguage()
  return (
    <div className="border border-gray-200 rounded-lg p-3 flex flex-wrap items-center gap-x-4 gap-y-1">
      <div className="flex flex-wrap items-center gap-2 min-w-0">
        <h4 className="text-sm font-bold text-gray-800 break-words">{fmt.pick(sprint.i18n, "sprintName", sprint.sprintName)}</h4>
        <span className={`text-caption px-2 py-0.5 rounded-full font-medium ${sprintStatusBadge(sprint.status)}`}>
          {fmt.statusLabel(sprint.status)}
        </span>
      </div>
      <div className="text-xs text-gray-700">{fmt.formatDate(sprint.startDate)} ~ {fmt.formatDate(sprint.endDate)}</div>
      <div className="text-xs text-gray-700">{t.sprintCapacity}: {sprint.capacity} {fmt.pointUnit}</div>
      <div className="text-xs text-fg-muted">{t.sprintTasks}: {sprint.items.length}</div>
      {sprint.sprintGoal && (
        <div className="basis-full text-xs text-gray-700 whitespace-pre-wrap pt-1 border-t border-gray-100 mt-1">
          <span className="text-fg-muted">{pt.sprintGoal}:</span> {fmt.pick(sprint.i18n, "sprintGoal", sprint.sprintGoal)}
        </div>
      )}
    </div>
  )
}

/** Past sprints collapsed in <details>; the page forces them open while printing. */
export function PastSprintList({ sprints, fmt }: { sprints: Sprint[]; fmt: ReportFormat }) {
  const { t } = useLanguage()
  return (
    <div className="space-y-2">
      {sprints.map((sprint) => {
        const counts = taskCounts(sprint.items)
        return (
          <details key={sprint.id} className="border border-gray-200 rounded-lg group/details">
            <summary className="px-3 py-2 cursor-pointer list-none flex flex-wrap items-center gap-x-4 gap-y-1 hover:bg-gray-50 rounded-lg">
              <span aria-hidden="true" className="text-fg-muted text-xs group-open/details:rotate-90 inline-block transition-transform">▶</span>
              <span className="text-sm font-semibold text-gray-800">{fmt.pick(sprint.i18n, "sprintName", sprint.sprintName)}</span>
              <span className={`text-caption px-2 py-0.5 rounded-full font-medium ${sprintStatusBadge(sprint.status)}`}>
                {fmt.statusLabel(sprint.status)}
              </span>
              <span className="text-xs text-fg-muted">{fmt.formatDate(sprint.startDate)} ~ {fmt.formatDate(sprint.endDate)}</span>
              <span className="text-xs text-fg-muted">
                {t.sprintActualScore}: <strong className="text-green-800">{sprint.actualScore}</strong>/{sprint.capacity} ({achievementRate(sprint)}%)
              </span>
              <span className="text-xs text-fg-muted">{t.sprintTasks}: {counts.done}/{counts.total}</span>
              <span className="ml-auto text-caption text-primary font-medium print-hide">{t.reportShowDetails}</span>
            </summary>
            <div className="px-3 pb-3 pt-2 border-t border-gray-100">
              <SprintDetail sprint={sprint} fmt={fmt} />
            </div>
          </details>
        )
      })}
    </div>
  )
}

interface SprintGroups {
  current: Sprint[]
  upcoming: Sprint[]
  past: Sprint[]
}

/** Now / Upcoming / Past summary table with achievement rate and diff. */
export function SprintSummaryTable({ groups, fmt }: { groups: SprintGroups; fmt: ReportFormat }) {
  const { t } = useLanguage()
  const rows = [
    { key: "now", label: t.reportSectionNow, items: groups.current, color: "text-blue-800 bg-blue-50/50" },
    { key: "upcoming", label: t.reportSectionUpcoming, items: groups.upcoming, color: "text-yellow-800 bg-yellow-50/50" },
    { key: "past", label: t.reportSectionHistory, items: groups.past, color: "text-gray-700 bg-gray-50/60" },
  ]
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm border-collapse mb-4">
        <thead>
          <tr className="border-b-2 border-gray-300 text-left text-gray-700">
            <th scope="col" className="pb-2 pr-3">{t.colSprint}</th>
            <th scope="col" className="pb-2 pr-3 text-center">{t.sprintStatus}</th>
            <th scope="col" className="pb-2 pr-3">{t.dashboardPeriod}</th>
            <th scope="col" className="pb-2 pr-3 text-right">{t.colCapacity}</th>
            <th scope="col" className="pb-2 pr-3 text-right">{t.colActualScore}</th>
            <th scope="col" className="pb-2 pr-3 text-right">{t.colAchievementRate}</th>
            <th scope="col" className="pb-2 text-right">{t.colDiff}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((group) =>
            group.items.length === 0 ? null : (
              <Fragment key={group.key}>
                <tr className={group.color}>
                  <th scope="colgroup" colSpan={7} className="py-1 px-2 text-left text-caption font-semibold uppercase tracking-wide">
                    {group.label} ({group.items.length})
                  </th>
                </tr>
                {group.items.map((s) => {
                  const diff = s.actualScore - s.capacity
                  return (
                    <tr key={s.id} className="border-b border-gray-200">
                      <td className="py-1.5 pr-3 font-medium">{fmt.pick(s.i18n, "sprintName", s.sprintName)}</td>
                      <td className="py-1.5 pr-3 text-center">
                        <span className={`text-caption px-1.5 py-0.5 rounded-full ${sprintStatusBadge(s.status)}`}>{fmt.statusLabel(s.status)}</span>
                      </td>
                      <td className="py-1.5 pr-3 text-xs text-fg-muted">{fmt.formatDate(s.startDate)} ~ {fmt.formatDate(s.endDate)}</td>
                      <td className="py-1.5 pr-3 text-right">{s.capacity}</td>
                      <td className="py-1.5 pr-3 text-right">{s.actualScore}</td>
                      <td className="py-1.5 pr-3 text-right">{achievementRate(s)}%</td>
                      <td className={`py-1.5 text-right font-medium ${diff > 0 ? "text-green-800" : diff < 0 ? "text-red-700" : "text-fg-muted"}`}>
                        {diff > 0 ? `+${diff}` : diff}
                      </td>
                    </tr>
                  )
                })}
              </Fragment>
            ),
          )}
        </tbody>
      </table>
    </div>
  )
}
