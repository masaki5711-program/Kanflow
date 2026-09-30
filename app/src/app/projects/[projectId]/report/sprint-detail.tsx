"use client"

import { useLanguage } from "@/lib/language-context"
import {
  achievementRate,
  sprintStatusBadge,
  taskCounts,
  taskStatusBadge,
  type ReportFormat,
  type Sprint,
  type SprintItem,
  type SprintPbItem,
} from "./types"

function groupTasksByPbi(items: SprintItem[]): { pbItem: SprintPbItem; tasks: SprintItem[] }[] {
  const map = new Map<string, { pbItem: SprintPbItem; tasks: SprintItem[] }>()
  for (const item of items) {
    const existing = map.get(item.pbItem.id)
    map.set(item.pbItem.id, existing ? { ...existing, tasks: [...existing.tasks, item] } : { pbItem: item.pbItem, tasks: [item] })
  }
  return Array.from(map.values())
}

function PbiTaskTable({ pbItem, tasks, fmt }: { pbItem: SprintPbItem; tasks: SprintItem[]; fmt: ReportFormat }) {
  const { t } = useLanguage()
  const allDone = tasks.every((task) => task.status === "done")
  const totalEst = tasks.reduce((s, task) => s + (task.estimatedHours ?? 0), 0)
  const totalAct = tasks.reduce((s, task) => s + (task.actualHours ?? 0), 0)
  const taskLabel = (status: string) =>
    status === "done" ? t.taskDone : status === "in_progress" ? t.taskInProgress : t.taskTodo
  return (
    <div className="border border-gray-200 rounded p-2">
      <div className="flex flex-wrap items-center gap-2 mb-1">
        <span className="text-caption font-mono text-fg-muted">#{pbItem.displayId}</span>
        <span className={`text-xs font-medium ${allDone ? "text-green-800 line-through" : "text-gray-800"}`}>
          {fmt.pick(pbItem.i18n, "initiative", pbItem.initiative) || fmt.pick(pbItem.i18n, "userStory", pbItem.userStory) || "-"}
        </span>
        {pbItem.epic && <span className="text-caption text-fg-muted">[{fmt.pick(pbItem.i18n, "epic", pbItem.epic)}]</span>}
        <span className="text-caption bg-orange-100 text-orange-800 px-1 py-0.5 rounded">
          {pbItem.workloadScore} {fmt.pointUnit}
        </span>
        {allDone && <span className="text-caption text-green-800 font-medium">{t.taskDone}</span>}
      </div>
      <table className="w-full text-caption">
        <thead>
          <tr className="text-fg-muted border-b border-gray-100">
            <th scope="col" className="text-left pb-0.5 pr-2 font-medium">{t.sprintTaskName}</th>
            <th scope="col" className="text-left pb-0.5 pr-2 font-medium">{t.sprintAssignee}</th>
            <th scope="col" className="text-right pb-0.5 pr-2 font-medium">{t.sprintEstimatedHoursShort}</th>
            <th scope="col" className="text-right pb-0.5 pr-2 font-medium">{t.sprintActualHoursShort}</th>
            <th scope="col" className="text-center pb-0.5 font-medium">{t.sprintStatus}</th>
          </tr>
        </thead>
        <tbody>
          {tasks.map((task) => (
            <tr key={task.id} className="border-b border-gray-50">
              <td className="py-0.5 pr-2">{fmt.pick(task.i18n, "taskName", task.taskName) || "-"}</td>
              <td className="py-0.5 pr-2">{task.assignee || "-"}</td>
              <td className="py-0.5 pr-2 text-right">{task.estimatedHours ?? "-"}</td>
              <td className="py-0.5 pr-2 text-right">{task.actualHours ?? "-"}</td>
              <td className="py-0.5 text-center">
                <span className={`px-1 py-0.5 rounded ${taskStatusBadge(task.status)}`}>{taskLabel(task.status)}</span>
              </td>
            </tr>
          ))}
          {tasks.length > 1 && (
            <tr className="border-t border-gray-200 font-medium text-gray-700">
              <td className="py-0.5 pr-2" colSpan={2}></td>
              <td className="py-0.5 pr-2 text-right">{totalEst || "-"}</td>
              <td className="py-0.5 pr-2 text-right">{totalAct || "-"}</td>
              <td></td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}

function RetroNote({ label, text, className, labelClass, textClass }: {
  label: string; text: string; className: string; labelClass: string; textClass: string
}) {
  return (
    <div className={`${className} border rounded px-2 py-1.5`}>
      <span className={`text-caption font-semibold ${labelClass}`}>{label}:</span>
      <p className={`text-xs whitespace-pre-wrap ${textClass}`}>{text}</p>
    </div>
  )
}

function RetroNotes({ sprint, fmt }: { sprint: Sprint; fmt: ReportFormat }) {
  const { t } = useLanguage()
  const hasKpt = sprint.retrospectiveKeep || sprint.retrospectiveProblem || sprint.retrospectiveTry
  if (!sprint.reviewComment && !hasKpt && !sprint.retrospectiveMemo) return null
  const pick = (field: keyof Sprint & string, value: string) => fmt.pick(sprint.i18n, field, value)
  return (
    <div className="mt-2 space-y-1.5">
      {sprint.reviewComment && (
        <RetroNote label={`${t.sprintReviewComment} ${t.reportLegacy}`} text={pick("reviewComment", sprint.reviewComment)} className="bg-amber-50 border-amber-200" labelClass="text-amber-800" textClass="text-amber-900" />
      )}
      {hasKpt && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-1.5">
          {sprint.retrospectiveKeep && (
            <RetroNote label={`K ${t.sprintKptKeep}`} text={pick("retrospectiveKeep", sprint.retrospectiveKeep)} className="bg-emerald-50 border-emerald-200" labelClass="text-emerald-800" textClass="text-emerald-900" />
          )}
          {sprint.retrospectiveProblem && (
            <RetroNote label={`P ${t.sprintKptProblem}`} text={pick("retrospectiveProblem", sprint.retrospectiveProblem)} className="bg-rose-50 border-rose-200" labelClass="text-rose-800" textClass="text-rose-900" />
          )}
          {sprint.retrospectiveTry && (
            <RetroNote label={`T ${t.sprintKptTry}`} text={pick("retrospectiveTry", sprint.retrospectiveTry)} className="bg-sky-50 border-sky-200" labelClass="text-sky-800" textClass="text-sky-900" />
          )}
        </div>
      )}
      {sprint.retrospectiveMemo && (
        <RetroNote label={t.sprintRetrospectiveOther} text={pick("retrospectiveMemo", sprint.retrospectiveMemo)} className="bg-gray-50 border-gray-200" labelClass="text-gray-700" textClass="text-gray-800" />
      )}
    </div>
  )
}

/** Full sprint block: meta, task counts, PBI-grouped task tables and retro notes. */
export function SprintDetail({ sprint, fmt }: { sprint: Sprint; fmt: ReportFormat }) {
  const { t, pt } = useLanguage()
  const counts = taskCounts(sprint.items)
  const pbiGroups = groupTasksByPbi(sprint.items)

  return (
    <div className="mb-6 last:mb-0">
      <div className="flex flex-wrap items-center gap-3 mb-2">
        <h4 className="text-sm font-bold text-gray-800">{fmt.pick(sprint.i18n, "sprintName", sprint.sprintName)}</h4>
        <span className={`text-caption px-2 py-0.5 rounded-full font-medium ${sprintStatusBadge(sprint.status)}`}>
          {fmt.statusLabel(sprint.status)}
        </span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1 text-xs text-gray-700 mb-2">
        <div>{t.dashboardPeriod}: {fmt.formatDate(sprint.startDate)} ~ {fmt.formatDate(sprint.endDate)}</div>
        <div>
          {t.sprintCapacity}: {sprint.capacity} {fmt.pointUnit} / {t.sprintActualScore}:{" "}
          <span className="font-semibold text-green-800">{sprint.actualScore}</span> ({achievementRate(sprint)}%)
        </div>
        {sprint.sprintGoal && (
          <div className="sm:col-span-2 whitespace-pre-wrap">{pt.sprintGoal}: {fmt.pick(sprint.i18n, "sprintGoal", sprint.sprintGoal)}</div>
        )}
      </div>

      <div className="flex flex-wrap gap-4 text-xs mb-3">
        <span className="text-fg-muted">{t.sprintTasks}: {counts.total}</span>
        <span className="text-green-800">{t.taskDone}: {counts.done}</span>
        <span className="text-blue-800">{t.taskInProgress}: {counts.inProgress}</span>
        <span className="text-fg-muted">{t.taskTodo}: {counts.todo}</span>
      </div>

      {pbiGroups.length > 0 && (
        <div className="space-y-2">
          {pbiGroups.map(({ pbItem, tasks }) => (
            <PbiTaskTable key={pbItem.id} pbItem={pbItem} tasks={tasks} fmt={fmt} />
          ))}
        </div>
      )}

      <RetroNotes sprint={sprint} fmt={fmt} />
    </div>
  )
}
