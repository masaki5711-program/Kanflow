"use client"

import { useRouter } from "next/navigation"
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

  function formatDate(iso: string) {
    const d = new Date(iso)
    return `${d.getMonth() + 1}/${d.getDate()}`
  }

  return (
    <div className="grid gap-3 md:grid-cols-2">
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
            <span className="text-sm font-semibold text-gray-700 truncate">{project.projectName}</span>
          </div>

          {/* Sprints */}
          {Array.from(project.sprints.values()).map((sprint) => (
            <div key={sprint.sprintId} className="px-5 py-3">
              {/* Sprint info */}
              <div
                onClick={() => router.push(`/projects/${project.projectId}/sprints`)}
                className="flex flex-wrap items-center gap-2 mb-2 cursor-pointer group/sprint"
              >
                <svg className="w-3.5 h-3.5 text-gray-400 shrink-0" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M11.3 1.046A1 1 0 0112 2v5h4a1 1 0 01.82 1.573l-7 10A1 1 0 018 18v-5H4a1 1 0 01-.82-1.573l7-10a1 1 0 011.12-.38z" clipRule="evenodd"/>
                </svg>
                <span className="text-sm font-medium text-gray-600 group-hover/sprint:text-blue-600 transition-colors truncate">
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
  )
}
