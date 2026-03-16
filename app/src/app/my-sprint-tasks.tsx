"use client"

import { useRouter } from "next/navigation"
import { useState } from "react"
import { useLanguage } from "@/lib/language-context"

export interface MyTask {
  id: string
  taskName: string | null
  status: string
  estimatedHours: number | null
  actualHours: number | null
  pbDisplayId: number
  pbUserStory: string | null
  sprintId: string
  sprintName: string
  sprintStatus: string
  sprintStartDate: string
  sprintEndDate: string
  projectId: string
  projectName: string
}

interface Props {
  tasks: MyTask[]
}

const statusColors: Record<string, string> = {
  todo: "bg-gray-100 text-gray-700",
  in_progress: "bg-blue-100 text-blue-700",
  done: "bg-green-100 text-green-700",
}

const sprintStatusColors: Record<string, string> = {
  planning: "bg-yellow-100 text-yellow-700",
  active: "bg-blue-100 text-blue-700",
}

export function MySprintTasks({ tasks }: Props) {
  const router = useRouter()
  const [collapsed, setCollapsed] = useState(false)
  const { t } = useLanguage()

  const statusLabels: Record<string, string> = {
    todo: t.taskTodo,
    in_progress: t.taskInProgress,
    done: t.taskDone,
  }

  const sprintStatusLabels: Record<string, string> = {
    planning: t.sprintStatusPlanning,
    active: t.sprintStatusActive,
  }

  // Group tasks by project, then by sprint
  const grouped = new Map<string, { projectName: string; projectId: string; sprints: Map<string, { sprintName: string; sprintId: string; sprintStatus: string; startDate: string; endDate: string; tasks: MyTask[] }> }>()

  for (const task of tasks) {
    if (!grouped.has(task.projectId)) {
      grouped.set(task.projectId, {
        projectName: task.projectName,
        projectId: task.projectId,
        sprints: new Map(),
      })
    }
    const project = grouped.get(task.projectId)!
    if (!project.sprints.has(task.sprintId)) {
      project.sprints.set(task.sprintId, {
        sprintName: task.sprintName,
        sprintId: task.sprintId,
        sprintStatus: task.sprintStatus,
        startDate: task.sprintStartDate,
        endDate: task.sprintEndDate,
        tasks: [],
      })
    }
    project.sprints.get(task.sprintId)!.tasks.push(task)
  }

  const inProgressCount = tasks.filter((t) => t.status === "in_progress").length
  const todoCount = tasks.filter((t) => t.status === "todo").length
  const doneCount = tasks.filter((t) => t.status === "done").length

  function formatDate(iso: string) {
    const d = new Date(iso)
    return `${d.getMonth() + 1}/${d.getDate()}`
  }

  return (
    <div className="mb-8">
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="flex items-center gap-3 w-full text-left mb-3 group"
      >
        <svg
          className={`w-4 h-4 text-gray-400 transition-transform ${collapsed ? "" : "rotate-90"}`}
          viewBox="0 0 20 20"
          fill="currentColor"
        >
          <path fillRule="evenodd" d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z" clipRule="evenodd"/>
        </svg>
        <div className="flex items-center gap-2">
          <svg className="w-5 h-5 text-indigo-500" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M6 2a1 1 0 00-1 1v1H4a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2h-1V3a1 1 0 10-2 0v1H7V3a1 1 0 00-1-1zm0 5a1 1 0 000 2h8a1 1 0 100-2H6z" clipRule="evenodd"/>
          </svg>
          <h2 className="text-lg font-bold text-gray-900">{t.navSprints} - {t.sprintTasks}</h2>
        </div>
        <div className="flex items-center gap-2 ml-auto">
          {inProgressCount > 0 && (
            <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 font-medium">
              {t.taskInProgress} {inProgressCount}
            </span>
          )}
          {todoCount > 0 && (
            <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-700 font-medium">
              {t.taskTodo} {todoCount}
            </span>
          )}
          {doneCount > 0 && (
            <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-700 font-medium">
              {t.taskDone} {doneCount}
            </span>
          )}
        </div>
      </button>

      {!collapsed && (
        <div className="space-y-3">
          {Array.from(grouped.values()).map((project) => (
            <div
              key={project.projectId}
              className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden"
            >
              {/* Project header */}
              <div
                onClick={() => router.push(`/projects/${project.projectId}`)}
                className="flex items-center gap-2 px-5 py-3 bg-gray-50/80 border-b border-gray-100 cursor-pointer hover:bg-gray-100/80 transition-colors"
              >
                <svg className="w-4 h-4 text-gray-400" viewBox="0 0 20 20" fill="currentColor">
                  <path d="M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z"/>
                </svg>
                <span className="text-sm font-semibold text-gray-700">{project.projectName}</span>
              </div>

              {/* Sprints */}
              {Array.from(project.sprints.values()).map((sprint) => (
                <div key={sprint.sprintId} className="px-5 py-3">
                  {/* Sprint info */}
                  <div
                    onClick={() => router.push(`/projects/${project.projectId}/sprints`)}
                    className="flex items-center gap-2 mb-2 cursor-pointer group/sprint"
                  >
                    <svg className="w-3.5 h-3.5 text-gray-400" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M11.3 1.046A1 1 0 0112 2v5h4a1 1 0 01.82 1.573l-7 10A1 1 0 018 18v-5H4a1 1 0 01-.82-1.573l7-10a1 1 0 011.12-.38z" clipRule="evenodd"/>
                    </svg>
                    <span className="text-sm font-medium text-gray-600 group-hover/sprint:text-blue-600 transition-colors">
                      {sprint.sprintName}
                    </span>
                    <span className={`text-xs px-1.5 py-0.5 rounded-md font-medium ${sprintStatusColors[sprint.sprintStatus] ?? "bg-gray-100 text-gray-600"}`}>
                      {sprintStatusLabels[sprint.sprintStatus] ?? sprint.sprintStatus}
                    </span>
                    <span className="text-xs text-gray-400">
                      {formatDate(sprint.startDate)} - {formatDate(sprint.endDate)}
                    </span>
                  </div>

                  {/* Task list */}
                  <div className="space-y-1.5 ml-5">
                    {sprint.tasks.map((task) => (
                      <div
                        key={task.id}
                        onClick={() => router.push(`/projects/${project.projectId}/sprints`)}
                        className="flex items-center gap-3 py-1.5 px-3 rounded-lg hover:bg-gray-50 cursor-pointer transition-colors"
                      >
                        <span className={`text-xs px-2 py-0.5 rounded-md font-medium whitespace-nowrap ${statusColors[task.status] ?? "bg-gray-100 text-gray-600"}`}>
                          {statusLabels[task.status] ?? task.status}
                        </span>
                        <span className="text-xs text-gray-400 font-mono shrink-0">
                          #{task.pbDisplayId}
                        </span>
                        <span className="text-sm text-gray-800 truncate flex-1">
                          {task.taskName ?? task.pbUserStory ?? t.sprintNoTaskName}
                        </span>
                        {task.estimatedHours != null && (
                          <span className="text-xs text-gray-400 shrink-0">
                            {task.actualHours != null ? `${task.actualHours}/` : ""}{task.estimatedHours}h
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
