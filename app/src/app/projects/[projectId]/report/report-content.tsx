"use client"

import { Fragment, useEffect } from "react"
import { useLanguage } from "@/lib/language-context"
import { formatPointUnit } from "@/lib/i18n"
import BurndownChart from "@/components/burndown-chart"

interface Member {
  name: string
  email: string
  role: string
}

interface ProductGoal {
  title: string
  description: string | null
}

interface SprintPbItem {
  id: string
  displayId: number
  initiative: string | null
  epic: string | null
  userStory: string | null
  workloadScore: number
}

interface SprintItem {
  id: string
  taskName: string | null
  assignee: string | null
  estimatedHours: number | null
  actualHours: number | null
  status: string
  pbItem: SprintPbItem
}

interface Sprint {
  id: string
  sprintName: string
  startDate: string
  endDate: string
  sprintGoal: string | null
  capacity: number
  actualScore: number
  status: string
  reviewComment: string | null
  retrospectiveMemo: string | null
  retrospectiveKeep: string | null
  retrospectiveProblem: string | null
  retrospectiveTry: string | null
  items: SprintItem[]
}

interface BacklogItem {
  displayId: number
  initiative: string | null
  epic: string | null
  userStory: string | null
  workloadScore: number
  status: string
  assignedPo: string | null
  completedAt: string | null
  productGoalTitle: string | null
}

interface CalendarEvent {
  id: string
  title: string
  description: string | null
  date: string
  endDate: string | null
  color: string
}

interface ReportContentProps {
  projectId: string
  projectName: string
  projectDescription: string | null
  language: string
  pointUnit: string
  members: Member[]
  productGoals: ProductGoal[]
  sprints: Sprint[]
  backlogItems: BacklogItem[]
  backlogSummary: {
    ready: number
    notReady: number
    completed: number
    totalReadyWorkload: number
  }
  icebox: {
    unreviewed: number
    reviewed: number
    frozen: number
  }
  events: CalendarEvent[]
}

const roleLabels: Record<string, Record<string, string>> = {
  ja: { po: "PO", sm: "SM", dev: "Dev" },
  en: { po: "PO", sm: "SM", dev: "Dev" },
  id: { po: "PO", sm: "SM", dev: "Dev" },
}

const eventColorDot: Record<string, string> = {
  blue: "bg-blue-500",
  green: "bg-green-500",
  red: "bg-red-500",
  yellow: "bg-yellow-500",
  purple: "bg-purple-500",
  gray: "bg-gray-500",
}

const statusOrder = ["active", "review", "planning", "done", "archived"]

export function ReportContent({
  projectId,
  projectName,
  projectDescription,
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
  const { t, pt } = useLanguage()
  const pointUnit = formatPointUnit(rawPointUnit, t)
  const locale = language === "ja" ? "ja-JP" : language === "id" ? "id-ID" : "en-US"
  const today = new Date().toLocaleDateString(locale)

  const statusLabels: Record<string, string> = {
    planning: t.sprintStatusPlanning,
    active: t.sprintStatusActive,
    review: t.sprintStatusReview,
    done: t.sprintStatusDone,
    archived: t.sprintStatusArchived,
  }

  const backlogStatusLabels: Record<string, string> = {
    ready: t.backlogStatusReady,
    not_ready: t.backlogStatusNotReady,
    completed: t.backlogStatusCompleted,
  }

  const doneSprints = sprints.filter((s) => s.status === "done" || s.status === "archived")
  const avgActual = doneSprints.length > 0
    ? Math.round(doneSprints.reduce((sum, s) => sum + s.actualScore, 0) / doneSprints.length)
    : null

  // Sort sprints: active first, then by status order
  const sortedSprints = [...sprints].sort((a, b) => {
    const ai = statusOrder.indexOf(a.status)
    const bi = statusOrder.indexOf(b.status)
    if (ai !== bi) return ai - bi
    return new Date(b.startDate).getTime() - new Date(a.startDate).getTime()
  })

  // Categorize sprints along a time axis so the report reads as
  // Now → Upcoming → Past instead of one flat list.
  const currentSprints = sortedSprints.filter((s) => s.status === "active" || s.status === "review")
  const upcomingSprints = sortedSprints.filter((s) => s.status === "planning")
  const pastSprints = sortedSprints.filter((s) => s.status === "done" || s.status === "archived")

  // When printing, force every <details> open so collapsed history still
  // appears on paper.
  useEffect(() => {
    function setAllDetailsOpen(open: boolean) {
      document.querySelectorAll<HTMLDetailsElement>(".report-container details").forEach((el) => {
        if (open) el.dataset.userOpen = el.open ? "1" : "0"
        if (open) el.open = true
        else if (el.dataset.userOpen === "0") el.open = false
      })
    }
    const onBefore = () => setAllDetailsOpen(true)
    const onAfter = () => setAllDetailsOpen(false)
    window.addEventListener("beforeprint", onBefore)
    window.addEventListener("afterprint", onAfter)
    return () => {
      window.removeEventListener("beforeprint", onBefore)
      window.removeEventListener("afterprint", onAfter)
    }
  }, [])

  function formatDate(iso: string): string {
    return new Date(iso).toLocaleDateString(locale)
  }

  function groupTasksByPbi(items: SprintItem[]) {
    const map = new Map<string, { pbItem: SprintPbItem; tasks: SprintItem[] }>()
    for (const item of items) {
      const existing = map.get(item.pbItem.id)
      if (existing) {
        existing.tasks.push(item)
      } else {
        map.set(item.pbItem.id, { pbItem: item.pbItem, tasks: [item] })
      }
    }
    return Array.from(map.values())
  }

  // Render a sprint detail block (reused for all sprints)
  function renderSprintDetail(sprint: Sprint) {
    const totalTasks = sprint.items.length
    const doneTasks = sprint.items.filter((i) => i.status === "done").length
    const inProgressTasks = sprint.items.filter((i) => i.status === "in_progress").length
    const todoTasks = totalTasks - doneTasks - inProgressTasks
    const pbiGroups = groupTasksByPbi(sprint.items)
    const rate = sprint.capacity > 0 ? Math.round((sprint.actualScore / sprint.capacity) * 100) : 0

    return (
      <div key={sprint.id} className="mb-6 last:mb-0">
        {/* Sprint header */}
        <div className="flex items-center gap-3 mb-2">
          <h4 className="text-sm font-bold text-gray-800">{sprint.sprintName}</h4>
          <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
            sprint.status === "active" ? "bg-blue-100 text-blue-700" :
            sprint.status === "review" ? "bg-purple-100 text-purple-700" :
            sprint.status === "done" ? "bg-green-100 text-green-700" :
            sprint.status === "archived" ? "bg-gray-100 text-gray-600" :
            "bg-yellow-100 text-yellow-700"
          }`}>
            {statusLabels[sprint.status] ?? sprint.status}
          </span>
        </div>

        {/* Sprint meta */}
        <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs text-gray-600 mb-2">
          <div>{t.dashboardPeriod}: {formatDate(sprint.startDate)} ~ {formatDate(sprint.endDate)}</div>
          <div>{t.sprintCapacity}: {sprint.capacity} {pointUnit} / {t.sprintActualScore}: <span className="font-semibold text-green-600">{sprint.actualScore}</span> ({rate}%)</div>
          {sprint.sprintGoal && (
            <div className="col-span-2 whitespace-pre-wrap">{pt.sprintGoal}: {sprint.sprintGoal}</div>
          )}
        </div>

        {/* Task counts */}
        <div className="flex gap-4 text-xs mb-3">
          <span className="text-gray-500">{t.sprintTasks}: {totalTasks}</span>
          <span className="text-green-600">{t.taskDone}: {doneTasks}</span>
          <span className="text-blue-600">{t.taskInProgress}: {inProgressTasks}</span>
          <span className="text-gray-400">{t.taskTodo}: {todoTasks}</span>
        </div>

        {/* PBI-grouped tasks */}
        {pbiGroups.length > 0 && (
          <div className="space-y-2">
            {pbiGroups.map(({ pbItem, tasks }) => {
              const allDone = tasks.every((t) => t.status === "done")
              const totalEst = tasks.reduce((s, t) => s + (t.estimatedHours ?? 0), 0)
              const totalAct = tasks.reduce((s, t) => s + (t.actualHours ?? 0), 0)
              return (
                <div key={pbItem.id} className="border border-gray-200 rounded p-2">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-[10px] font-mono text-gray-400">#{pbItem.displayId}</span>
                    <span className={`text-xs font-medium ${allDone ? "text-green-700 line-through" : "text-gray-800"}`}>
                      {pbItem.initiative || pbItem.userStory || "-"}
                    </span>
                    {pbItem.epic && <span className="text-[10px] text-gray-400">[{pbItem.epic}]</span>}
                    <span className="text-[10px] bg-orange-100 text-orange-700 px-1 py-0.5 rounded">
                      {pbItem.workloadScore} {pointUnit}
                    </span>
                    {allDone && <span className="text-[10px] text-green-600 font-medium">DONE</span>}
                  </div>
                  <table className="w-full text-[11px]">
                    <thead>
                      <tr className="text-gray-400 border-b border-gray-100">
                        <th className="text-left pb-0.5 pr-2 font-medium">{t.sprintTaskName}</th>
                        <th className="text-left pb-0.5 pr-2 font-medium">{t.sprintAssignee}</th>
                        <th className="text-right pb-0.5 pr-2 font-medium">{t.sprintEstimatedHoursShort}</th>
                        <th className="text-right pb-0.5 pr-2 font-medium">{t.sprintActualHoursShort}</th>
                        <th className="text-center pb-0.5 font-medium">{t.sprintStatus}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {tasks.map((task) => (
                        <tr key={task.id} className="border-b border-gray-50">
                          <td className="py-0.5 pr-2">{task.taskName || "-"}</td>
                          <td className="py-0.5 pr-2">{task.assignee || "-"}</td>
                          <td className="py-0.5 pr-2 text-right">{task.estimatedHours ?? "-"}</td>
                          <td className="py-0.5 pr-2 text-right">{task.actualHours ?? "-"}</td>
                          <td className="py-0.5 text-center">
                            <span className={`px-1 py-0.5 rounded text-[10px] ${
                              task.status === "done" ? "bg-green-100 text-green-700" :
                              task.status === "in_progress" ? "bg-blue-100 text-blue-700" :
                              "bg-gray-100 text-gray-600"
                            }`}>
                              {task.status === "done" ? t.taskDone :
                               task.status === "in_progress" ? t.taskInProgress : t.taskTodo}
                            </span>
                          </td>
                        </tr>
                      ))}
                      {tasks.length > 1 && (
                        <tr className="border-t border-gray-200 font-medium text-gray-600">
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
            })}
          </div>
        )}

        {/* Review / Retrospective */}
        {(sprint.reviewComment
          || sprint.retrospectiveKeep
          || sprint.retrospectiveProblem
          || sprint.retrospectiveTry
          || sprint.retrospectiveMemo) && (
          <div className="mt-2 space-y-1.5">
            {sprint.reviewComment && (
              <div className="bg-amber-50 border border-amber-200 rounded px-2 py-1.5">
                <span className="text-[10px] font-semibold text-amber-700">
                  {t.sprintReviewComment} (legacy):
                </span>
                <p className="text-xs text-amber-900 whitespace-pre-wrap">{sprint.reviewComment}</p>
              </div>
            )}
            {(sprint.retrospectiveKeep || sprint.retrospectiveProblem || sprint.retrospectiveTry) && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-1.5">
                {sprint.retrospectiveKeep && (
                  <div className="bg-emerald-50 border border-emerald-200 rounded px-2 py-1.5">
                    <span className="text-[10px] font-semibold text-emerald-700">K {t.sprintKptKeep}:</span>
                    <p className="text-xs text-emerald-900 whitespace-pre-wrap">{sprint.retrospectiveKeep}</p>
                  </div>
                )}
                {sprint.retrospectiveProblem && (
                  <div className="bg-rose-50 border border-rose-200 rounded px-2 py-1.5">
                    <span className="text-[10px] font-semibold text-rose-700">P {t.sprintKptProblem}:</span>
                    <p className="text-xs text-rose-900 whitespace-pre-wrap">{sprint.retrospectiveProblem}</p>
                  </div>
                )}
                {sprint.retrospectiveTry && (
                  <div className="bg-sky-50 border border-sky-200 rounded px-2 py-1.5">
                    <span className="text-[10px] font-semibold text-sky-700">T {t.sprintKptTry}:</span>
                    <p className="text-xs text-sky-900 whitespace-pre-wrap">{sprint.retrospectiveTry}</p>
                  </div>
                )}
              </div>
            )}
            {sprint.retrospectiveMemo && (
              <div className="bg-gray-50 border border-gray-200 rounded px-2 py-1.5">
                <span className="text-[10px] font-semibold text-gray-600">{t.sprintRetrospectiveOther}:</span>
                <p className="text-xs text-gray-800 whitespace-pre-wrap">{sprint.retrospectiveMemo}</p>
              </div>
            )}
          </div>
        )}
      </div>
    )
  }

  // Compact sprint card — used for upcoming sprints where task tables would
  // be overkill. Shows just the essentials so the reader can quickly see
  // what's planned next without scrolling through empty task lists.
  function renderSprintCompact(sprint: Sprint) {
    const totalTasks = sprint.items.length
    return (
      <div
        key={sprint.id}
        className="border border-gray-200 rounded-lg p-3 flex flex-wrap items-center gap-x-4 gap-y-1"
      >
        <div className="flex items-center gap-2 min-w-0">
          <h4 className="text-sm font-bold text-gray-800 truncate">{sprint.sprintName}</h4>
          <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
            sprint.status === "planning" ? "bg-yellow-100 text-yellow-700" : "bg-gray-100 text-gray-600"
          }`}>
            {statusLabels[sprint.status] ?? sprint.status}
          </span>
        </div>
        <div className="text-xs text-gray-600">
          {formatDate(sprint.startDate)} ~ {formatDate(sprint.endDate)}
        </div>
        <div className="text-xs text-gray-600">
          {t.sprintCapacity}: {sprint.capacity} {pointUnit}
        </div>
        <div className="text-xs text-gray-500">
          {t.sprintTasks}: {totalTasks}
        </div>
        {sprint.sprintGoal && (
          <div className="basis-full text-xs text-gray-700 whitespace-pre-wrap pt-1 border-t border-gray-100 mt-1">
            <span className="text-gray-500">{pt.sprintGoal}:</span> {sprint.sprintGoal}
          </div>
        )}
      </div>
    )
  }

  // "Now snapshot" hero card — at-a-glance view of the user's currently
  // active sprint. Shows days remaining, achievement rate, and per-status
  // task counts so the reader doesn't have to scan a table to know status.
  function renderNowSnapshot() {
    if (currentSprints.length === 0) {
      return (
        <div className="rounded-2xl border border-dashed border-gray-200 bg-white px-6 py-6 text-center">
          <p className="text-sm text-gray-500">{t.reportNoCurrentSprint}</p>
        </div>
      )
    }
    return (
      <div className="space-y-3">
        {currentSprints.map((sprint) => {
          const start = new Date(sprint.startDate)
          const end = new Date(sprint.endDate)
          const now = new Date()
          const msPerDay = 86400000
          const totalDays = Math.max(1, Math.round((end.getTime() - start.getTime()) / msPerDay))
          const remaining = Math.round((end.getTime() - now.getTime()) / msPerDay)
          const elapsed = Math.max(0, Math.min(totalDays, Math.round((now.getTime() - start.getTime()) / msPerDay)))
          const elapsedPct = Math.round((elapsed / totalDays) * 100)
          const totalTasks = sprint.items.length
          const doneTasks = sprint.items.filter((i) => i.status === "done").length
          const inProgressTasks = sprint.items.filter((i) => i.status === "in_progress").length
          const todoTasks = totalTasks - doneTasks - inProgressTasks
          const taskPct = totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 100) : 0
          const achievementPct = sprint.capacity > 0 ? Math.round((sprint.actualScore / sprint.capacity) * 100) : 0

          return (
            <div
              key={sprint.id}
              className="rounded-2xl border border-blue-200 bg-gradient-to-br from-blue-50 to-indigo-50 p-5 print:bg-white"
            >
              <div className="flex flex-wrap items-start gap-3 mb-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h4 className="text-base font-bold text-gray-900 truncate">{sprint.sprintName}</h4>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                      sprint.status === "active" ? "bg-blue-100 text-blue-700" : "bg-purple-100 text-purple-700"
                    }`}>
                      {statusLabels[sprint.status] ?? sprint.status}
                    </span>
                  </div>
                  <div className="text-xs text-gray-600 mt-0.5">
                    {formatDate(sprint.startDate)} ~ {formatDate(sprint.endDate)}
                  </div>
                </div>
                <div className="text-right">
                  <div className={`text-2xl font-bold leading-none ${remaining < 0 ? "text-rose-600" : "text-blue-700"}`}>
                    {Math.abs(remaining)}
                  </div>
                  <div className="text-[10px] text-gray-500">
                    {remaining < 0 ? t.reportDaysOverdue : t.reportDaysRemaining}
                  </div>
                </div>
              </div>

              {/* Period progress bar */}
              <div className="mb-3">
                <div className="flex justify-between text-[10px] text-gray-500 mb-1">
                  <span>{t.dashboardPeriod}</span>
                  <span>{elapsedPct}%</span>
                </div>
                <div className="h-1.5 bg-white rounded-full overflow-hidden">
                  <div
                    className="h-full bg-blue-500"
                    style={{ width: `${Math.min(100, elapsedPct)}%` }}
                  />
                </div>
              </div>

              {/* Stats row */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                <div className="bg-white rounded-lg px-3 py-2 text-center">
                  <div className="text-[10px] text-gray-500">{t.sprintCapacity}</div>
                  <div className="text-sm font-bold text-gray-900">{sprint.capacity} <span className="text-[10px] font-normal text-gray-500">{pointUnit}</span></div>
                </div>
                <div className="bg-white rounded-lg px-3 py-2 text-center">
                  <div className="text-[10px] text-gray-500">{t.sprintActualScore}</div>
                  <div className="text-sm font-bold text-green-600">{sprint.actualScore} <span className="text-[10px] font-normal text-gray-500">({achievementPct}%)</span></div>
                </div>
                <div className="bg-white rounded-lg px-3 py-2 text-center">
                  <div className="text-[10px] text-gray-500">{t.reportTaskProgress}</div>
                  <div className="text-sm font-bold text-indigo-600">{doneTasks}/{totalTasks} <span className="text-[10px] font-normal text-gray-500">({taskPct}%)</span></div>
                </div>
                <div className="bg-white rounded-lg px-3 py-2 text-center">
                  <div className="text-[10px] text-gray-500">{t.sprintTasks}</div>
                  <div className="text-xs">
                    <span className="text-blue-600 font-semibold">{inProgressTasks}</span>
                    <span className="text-gray-300 mx-0.5">/</span>
                    <span className="text-gray-500 font-semibold">{todoTasks}</span>
                  </div>
                  <div className="text-[9px] text-gray-400">
                    {t.taskInProgress}/{t.taskTodo}
                  </div>
                </div>
              </div>

              {sprint.sprintGoal && (
                <div className="mt-3 bg-white/60 rounded-lg px-3 py-2">
                  <div className="text-[10px] font-semibold text-gray-500 mb-0.5">{pt.sprintGoal}</div>
                  <p className="text-xs text-gray-800 whitespace-pre-wrap">{sprint.sprintGoal}</p>
                </div>
              )}
            </div>
          )
        })}
      </div>
    )
  }

  // Render backlog detail table
  function renderBacklogTable(items: BacklogItem[], label: string, color: string) {
    if (items.length === 0) return null
    const totalWorkload = items.reduce((s, i) => s + (i.workloadScore ?? 0), 0)
    return (
      <div className="mb-4">
        <div className="flex items-center gap-2 mb-2">
          <h4 className={`text-xs font-semibold ${color}`}>{label} ({items.length}{t.reportItems})</h4>
          <span className="text-xs text-gray-400">{t.reportTotalWorkload}: {totalWorkload} {pointUnit}</span>
        </div>
        <table className="w-full text-[11px] border-collapse">
          <thead>
            <tr className="border-b border-gray-300 text-gray-500">
              <th className="text-left pb-1 pr-2 w-10">#</th>
              <th className="text-left pb-1 pr-2">{pt.backlogInitiative}</th>
              <th className="text-left pb-1 pr-2">{pt.backlogEpic}</th>
              <th className="text-left pb-1 pr-2">{pt.backlogUserStory}</th>
              <th className="text-right pb-1 pr-2">{pt.backlogWorkloadScore}</th>
              <th className="text-left pb-1 pr-2">{t.dashboardProductGoals}</th>
              {items[0]?.completedAt !== undefined && items.some((i) => i.completedAt) && (
                <th className="text-left pb-1">{t.backlogCompletedDate}</th>
              )}
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.displayId} className="border-b border-gray-100">
                <td className="py-1 pr-2 font-mono text-gray-400">{item.displayId}</td>
                <td className="py-1 pr-2 text-gray-800">{item.initiative || "-"}</td>
                <td className="py-1 pr-2 text-gray-600">{item.epic || "-"}</td>
                <td className="py-1 pr-2 text-gray-600 max-w-[200px] truncate">{item.userStory || "-"}</td>
                <td className="py-1 pr-2 text-right font-medium">{item.workloadScore}</td>
                <td className="py-1 pr-2 text-gray-500">{item.productGoalTitle || "-"}</td>
                {items.some((i) => i.completedAt) && (
                  <td className="py-1 text-gray-400">{item.completedAt ? formatDate(item.completedAt) : "-"}</td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )
  }

  return (
    <div className="report-container">
      {/* Print button */}
      <div className="print-hide flex items-center justify-between mb-6">
        <a href={`/projects/${projectId}`} className="text-sm text-blue-600 hover:text-blue-800">
          {t.back}
        </a>
        <button
          onClick={() => window.print()}
          className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 text-sm font-medium"
        >
          {t.reportPrint}
        </button>
      </div>

      {/* Report Header */}
      <div className="text-center mb-8 pb-4 border-b-2 border-gray-300">
        <h1 className="text-2xl font-bold text-gray-900">{t.reportTitle}</h1>
        <h2 className="text-xl font-semibold text-gray-700 mt-2">{projectName}</h2>
        <p className="text-sm text-gray-500 mt-1">{t.reportGeneratedAt}: {today}</p>
      </div>

      {/* 1. Project Overview */}
      <section className="report-section">
        <h3 className="report-heading">{t.reportProjectOverview}</h3>
        {projectDescription && (
          <p className="text-sm text-gray-700 whitespace-pre-wrap mb-4">{projectDescription}</p>
        )}
        {productGoals.length > 0 && (
          <div className="mb-4">
            <h4 className="text-sm font-semibold text-gray-700 mb-2">{t.dashboardProductGoals}</h4>
            <ul className="list-disc list-inside space-y-1">
              {productGoals.map((g, i) => (
                <li key={i} className="text-sm text-gray-700">
                  <span className="font-medium">{g.title}</span>
                  {g.description && <span className="text-gray-500"> — {g.description}</span>}
                </li>
              ))}
            </ul>
          </div>
        )}
        <div>
          <h4 className="text-sm font-semibold text-gray-700 mb-2">{t.reportMembers}</h4>
          <div className="flex flex-wrap gap-2">
            {members.map((m, i) => (
              <span key={i} className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border border-gray-200 bg-gray-50">
                <span className="font-semibold text-gray-600">
                  {(roleLabels[language] ?? roleLabels.ja)[m.role] ?? m.role}
                </span>
                <span className="text-gray-700">{m.name}</span>
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* 1.5 Now Snapshot — at-a-glance current sprint dashboard */}
      <section className="report-section">
        <h3 className="report-heading">{t.reportSectionNow}</h3>
        {renderNowSnapshot()}
      </section>

      {/* 2. Sprint Results Summary Table */}
      <section className="report-section">
        <h3 className="report-heading">{t.reportSprintResults}</h3>
        {avgActual !== null && (
          <p className="text-sm text-blue-700 bg-blue-50 px-3 py-2 rounded mb-3">
            {t.settingsAvgScore}: <strong>{avgActual}</strong> ({doneSprints.length} sprints)
          </p>
        )}
        {sprints.length > 0 ? (
          <table className="w-full text-sm border-collapse mb-4">
            <thead>
              <tr className="border-b-2 border-gray-300 text-left text-gray-600">
                <th className="pb-2 pr-3">{t.colSprint}</th>
                <th className="pb-2 pr-3 text-center">{t.sprintStatus}</th>
                <th className="pb-2 pr-3">{t.dashboardPeriod}</th>
                <th className="pb-2 pr-3 text-right">{t.colCapacity}</th>
                <th className="pb-2 pr-3 text-right">{t.colActualScore}</th>
                <th className="pb-2 pr-3 text-right">{t.colAchievementRate}</th>
                <th className="pb-2 text-right">{t.colDiff}</th>
              </tr>
            </thead>
            <tbody>
              {[
                { label: t.reportSectionNow, items: currentSprints, color: "text-blue-700 bg-blue-50/50" },
                { label: t.reportSectionUpcoming, items: upcomingSprints, color: "text-yellow-700 bg-yellow-50/50" },
                { label: t.reportSectionHistory, items: pastSprints, color: "text-gray-600 bg-gray-50/60" },
              ].map((group) =>
                group.items.length === 0 ? null : (
                  <Fragment key={group.label}>
                    <tr className={group.color}>
                      <td colSpan={7} className="py-1 px-2 text-[11px] font-semibold uppercase tracking-wide">
                        {group.label} ({group.items.length})
                      </td>
                    </tr>
                    {group.items.map((s) => {
                      const rate = s.capacity > 0 ? Math.round((s.actualScore / s.capacity) * 100) : 0
                      const diff = s.actualScore - s.capacity
                      return (
                        <tr key={s.id} className="border-b border-gray-200">
                          <td className="py-1.5 pr-3 font-medium">{s.sprintName}</td>
                          <td className="py-1.5 pr-3 text-center">
                            <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                              s.status === "active" ? "bg-blue-100 text-blue-700" :
                              s.status === "review" ? "bg-purple-100 text-purple-700" :
                              s.status === "done" ? "bg-green-100 text-green-700" :
                              s.status === "archived" ? "bg-gray-100 text-gray-600" :
                              "bg-yellow-100 text-yellow-700"
                            }`}>
                              {statusLabels[s.status] ?? s.status}
                            </span>
                          </td>
                          <td className="py-1.5 pr-3 text-xs text-gray-500">{formatDate(s.startDate)} ~ {formatDate(s.endDate)}</td>
                          <td className="py-1.5 pr-3 text-right">{s.capacity}</td>
                          <td className="py-1.5 pr-3 text-right">{s.actualScore}</td>
                          <td className="py-1.5 pr-3 text-right">{rate}%</td>
                          <td className={`py-1.5 text-right font-medium ${
                            diff > 0 ? "text-green-600" : diff < 0 ? "text-red-600" : "text-gray-500"
                          }`}>
                            {diff > 0 ? `+${diff}` : diff}
                          </td>
                        </tr>
                      )
                    })}
                  </Fragment>
                )
              )}
            </tbody>
          </table>
        ) : (
          <p className="text-sm text-gray-400">{t.sprintNoSprints}</p>
        )}
      </section>

      {/* 3. Burndown Chart */}
      <section className="report-section">
        <BurndownChart projectId={projectId} />
      </section>

      {/* 4a. Current Sprint Detail — full task tables */}
      {currentSprints.length > 0 && (
        <section className="report-section">
          <h3 className="report-heading">{t.reportSectionNow} - {t.reportActiveSprintDetail}</h3>
          {currentSprints.map((sprint) => renderSprintDetail(sprint))}
        </section>
      )}

      {/* 4b. Upcoming Sprints — compact preview */}
      {upcomingSprints.length > 0 && (
        <section className="report-section">
          <h3 className="report-heading">{t.reportSectionUpcoming}</h3>
          <div className="space-y-2">
            {upcomingSprints.map((sprint) => renderSprintCompact(sprint))}
          </div>
        </section>
      )}

      {/* 4c. Past Sprints — collapsed by default, click to expand each */}
      {pastSprints.length > 0 && (
        <section className="report-section">
          <h3 className="report-heading">{t.reportSectionHistory}</h3>
          <div className="space-y-2">
            {pastSprints.map((sprint) => {
              const totalTasks = sprint.items.length
              const doneTasks = sprint.items.filter((i) => i.status === "done").length
              const rate = sprint.capacity > 0 ? Math.round((sprint.actualScore / sprint.capacity) * 100) : 0
              return (
                <details key={sprint.id} className="border border-gray-200 rounded-lg group/details">
                  <summary className="px-3 py-2 cursor-pointer list-none flex flex-wrap items-center gap-x-4 gap-y-1 hover:bg-gray-50 rounded-lg">
                    <span className="text-gray-400 text-xs group-open/details:rotate-90 inline-block transition-transform">▶</span>
                    <span className="text-sm font-semibold text-gray-800">{sprint.sprintName}</span>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                      sprint.status === "done" ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-600"
                    }`}>
                      {statusLabels[sprint.status] ?? sprint.status}
                    </span>
                    <span className="text-xs text-gray-500">{formatDate(sprint.startDate)} ~ {formatDate(sprint.endDate)}</span>
                    <span className="text-xs text-gray-500">{t.sprintActualScore}: <strong className="text-green-700">{sprint.actualScore}</strong>/{sprint.capacity} ({rate}%)</span>
                    <span className="text-xs text-gray-500">{t.sprintTasks}: {doneTasks}/{totalTasks}</span>
                    <span className="ml-auto text-[10px] text-blue-600 font-medium">{t.reportShowDetails}</span>
                  </summary>
                  <div className="px-3 pb-3 pt-2 border-t border-gray-100">
                    {renderSprintDetail(sprint)}
                  </div>
                </details>
              )
            })}
          </div>
        </section>
      )}

      {/* 5. Backlog Status + Detail */}
      <section className="report-section">
        <h3 className="report-heading">{pt.backlogTitle} - {t.sprintStatus}</h3>

        {/* Summary cards */}
        <div className="grid grid-cols-4 gap-3 mb-4">
          <div className="text-center p-3 bg-blue-50 rounded-lg">
            <div className="text-xs text-blue-600 font-medium">{t.reportReadyItems}</div>
            <div className="text-2xl font-bold text-blue-700 mt-1">{backlogSummary.ready}</div>
            <div className="text-xs text-blue-500 mt-1">{backlogSummary.totalReadyWorkload} {pointUnit}</div>
          </div>
          <div className="text-center p-3 bg-yellow-50 rounded-lg">
            <div className="text-xs text-yellow-600 font-medium">{t.reportNotReadyItems}</div>
            <div className="text-2xl font-bold text-yellow-700 mt-1">{backlogSummary.notReady}</div>
          </div>
          <div className="text-center p-3 bg-green-50 rounded-lg">
            <div className="text-xs text-green-600 font-medium">{t.reportCompletedItems}</div>
            <div className="text-2xl font-bold text-green-700 mt-1">{backlogSummary.completed}</div>
          </div>
          <div className="text-center p-3 bg-gray-50 rounded-lg">
            <div className="text-xs text-gray-500 font-medium">{pt.backlogTitle}</div>
            <div className="text-2xl font-bold text-gray-700 mt-1">
              {backlogSummary.ready + backlogSummary.notReady + backlogSummary.completed}
            </div>
          </div>
        </div>

        {/* Backlog detail tables */}
        {renderBacklogTable(
          backlogItems.filter((i) => i.status === "ready"),
          t.reportReadyItems,
          "text-blue-700"
        )}
        {renderBacklogTable(
          backlogItems.filter((i) => i.status === "not_ready"),
          t.reportNotReadyItems,
          "text-yellow-700"
        )}
        {renderBacklogTable(
          backlogItems.filter((i) => i.status === "completed"),
          t.reportCompletedItems,
          "text-green-700"
        )}
      </section>

      {/* 6. IceBox Status */}
      <section className="report-section">
        <h3 className="report-heading">{pt.iceboxTitle} - {t.sprintStatus}</h3>
        <div className="grid grid-cols-3 gap-3">
          <div className="text-center p-4 bg-gray-50 rounded-lg">
            <div className="text-xs text-gray-600 font-medium">{t.iceboxStatusUnreviewed}</div>
            <div className="text-2xl font-bold text-gray-700 mt-1">{icebox.unreviewed}</div>
          </div>
          <div className="text-center p-4 bg-blue-50 rounded-lg">
            <div className="text-xs text-blue-600 font-medium">{t.iceboxStatusReviewed}</div>
            <div className="text-2xl font-bold text-blue-700 mt-1">{icebox.reviewed}</div>
          </div>
          <div className="text-center p-4 bg-indigo-50 rounded-lg">
            <div className="text-xs text-indigo-600 font-medium">{t.iceboxStatusFrozen}</div>
            <div className="text-2xl font-bold text-indigo-700 mt-1">{icebox.frozen}</div>
          </div>
        </div>
      </section>

      {/* 7. Upcoming Events */}
      <section className="report-section">
        <h3 className="report-heading">{t.reportUpcomingEvents}</h3>
        {events.length > 0 ? (
          <div className="space-y-2">
            {events.map((ev) => (
              <div key={ev.id} className="flex items-center gap-3 text-sm py-1.5 border-b border-gray-100">
                <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${eventColorDot[ev.color] ?? "bg-gray-400"}`} />
                <span className="text-gray-500 w-24 flex-shrink-0">{formatDate(ev.date)}</span>
                <span className="font-medium text-gray-800">{ev.title}</span>
                {ev.description && <span className="text-gray-500 text-xs">— {ev.description}</span>}
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-gray-400">{t.reportNoEvents}</p>
        )}
      </section>

      {/* Print styles */}
      <style jsx global>{`
        @media print {
          header, aside, .print-hide {
            display: none !important;
          }
          body {
            margin: 0;
            padding: 0;
            background: white !important;
          }
          .flex {
            display: block !important;
          }
          main, .report-container {
            max-width: 100% !important;
            width: 100% !important;
            margin: 0 !important;
            padding: 10mm !important;
          }
          .report-section {
            page-break-inside: avoid;
            break-inside: avoid;
          }
          svg {
            max-width: 100%;
          }
          @page {
            size: A4;
            margin: 15mm;
          }
          * {
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
        }
        .report-section {
          margin-bottom: 1.5rem;
          padding-bottom: 1.5rem;
          border-bottom: 1px solid #e5e7eb;
        }
        .report-section:last-of-type {
          border-bottom: none;
        }
        .report-heading {
          font-size: 1rem;
          font-weight: 700;
          color: #1f2937;
          margin-bottom: 0.75rem;
          padding-bottom: 0.5rem;
          border-bottom: 2px solid #3b82f6;
        }
      `}</style>
    </div>
  )
}
