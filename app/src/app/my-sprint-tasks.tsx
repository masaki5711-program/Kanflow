"use client"

import Link from "next/link"
import { Folder, Zap } from "lucide-react"
import { Badge, type BadgeTone } from "@/components/ui"
import { useLanguage } from "@/lib/language-context"
import { sprintStatusTone } from "@/lib/design-tokens"
import { I18nText } from "@/components/i18n-text"
import { pickText } from "@/lib/translation/pick-text"
import type { EntityI18n } from "@/lib/translation/types"

export interface MyTask {
  id: string
  taskName: string | null
  status: string
  estimatedHours: number | null
  actualHours: number | null
  pbId: string
  pbDisplayId: number
  pbUserStory: string | null
  sprintId: string
  sprintName: string
  sprintStatus: string
  sprintStartDate: string
  sprintEndDate: string
  projectId: string
  projectName: string
  /** Both-language text: task (taskName), PBI (userStory), sprint (sprintName), project (name). */
  i18n?: EntityI18n
  pbI18n?: EntityI18n
  sprintI18n?: EntityI18n
  projectI18n?: EntityI18n
}

interface SprintGroup {
  sprintId: string
  sprintName: string
  sprintI18n?: EntityI18n
  sprintStatus: string
  startDate: string
  endDate: string
  tasks: MyTask[]
}

interface ProjectGroup {
  projectId: string
  projectName: string
  projectI18n?: EntityI18n
  sprints: SprintGroup[]
}

const STATUS_TONE: Record<string, BadgeTone> = {
  todo: "neutral",
  in_progress: "primary",
  done: "success",
}

/** Group tasks by project, then by sprint, preserving first-seen order. */
function groupTasks(tasks: MyTask[]): ProjectGroup[] {
  return tasks.reduce<ProjectGroup[]>((groups, task) => {
    const project = groups.find((g) => g.projectId === task.projectId)
    const sprintOf = (existing: SprintGroup[]): SprintGroup[] => {
      const sprint = existing.find((s) => s.sprintId === task.sprintId)
      if (sprint) return existing.map((s) => (s === sprint ? { ...s, tasks: [...s.tasks, task] } : s))
      return [
        ...existing,
        {
          sprintId: task.sprintId,
          sprintName: task.sprintName,
          sprintI18n: task.sprintI18n,
          sprintStatus: task.sprintStatus,
          startDate: task.sprintStartDate,
          endDate: task.sprintEndDate,
          tasks: [task],
        },
      ]
    }
    if (project) return groups.map((g) => (g === project ? { ...g, sprints: sprintOf(g.sprints) } : g))
    return [
      ...groups,
      { projectId: task.projectId, projectName: task.projectName, projectI18n: task.projectI18n, sprints: sprintOf([]) },
    ]
  }, [])
}

function formatDate(iso: string) {
  const d = new Date(iso)
  return `${d.getMonth() + 1}/${d.getDate()}`
}

export function MySprintTasks({ tasks }: { tasks: MyTask[] }) {
  const { t, language } = useLanguage()

  const statusLabels: Record<string, string> = {
    todo: t.taskTodo,
    in_progress: t.taskInProgress,
    done: t.taskDone,
  }
  const sprintStatusLabels: Record<string, string> = {
    planning: t.sprintStatusPlanning,
    active: t.sprintStatusActive,
  }

  return (
    <div className="grid gap-3 md:grid-cols-2">
      {groupTasks(tasks).map((project) => (
        <article key={project.projectId} className="overflow-hidden rounded-2xl border border-border bg-surface shadow-ui-sm">
          <h3>
            <Link
              href={`/projects/${project.projectId}`}
              className="flex items-center gap-2 border-b border-border bg-surface-muted px-5 py-3 transition-colors hover:bg-surface-sunken"
            >
              <Folder aria-hidden="true" className="h-4 w-4 shrink-0 text-fg-muted" />
              <span className="truncate text-body font-semibold text-fg">
                <I18nText i18n={project.projectI18n} field="name" original={project.projectName} noBadge />
              </span>
            </Link>
          </h3>

          {project.sprints.map((sprint) => {
            const sprintsHref = `/projects/${project.projectId}/sprints`
            return (
              <div key={sprint.sprintId} className="px-5 py-3">
                <Link href={sprintsHref} className="group/sprint mb-2 flex flex-wrap items-center gap-2 rounded-md">
                  <Zap aria-hidden="true" className="h-3.5 w-3.5 shrink-0 text-fg-muted" />
                  <span className="truncate text-body font-medium text-fg-muted transition-colors group-hover/sprint:text-primary">
                    <I18nText i18n={sprint.sprintI18n} field="sprintName" original={sprint.sprintName} noBadge />
                  </span>
                  <Badge tone={sprintStatusTone(sprint.sprintStatus)}>
                    {sprintStatusLabels[sprint.sprintStatus] ?? sprint.sprintStatus}
                  </Badge>
                  <span className="text-caption text-fg-muted">
                    {formatDate(sprint.startDate)} - {formatDate(sprint.endDate)}
                  </span>
                </Link>

                <ul className="ml-5 space-y-1.5">
                  {sprint.tasks.map((task) => {
                    const taskText = pickText(task.i18n, "taskName", task.taskName, language)
                    return (
                      <li key={task.id}>
                        <Link
                          href={sprintsHref}
                          className="flex items-center gap-3 rounded-lg px-3 py-1.5 transition-colors hover:bg-surface-muted"
                        >
                          <Badge tone={STATUS_TONE[task.status] ?? "neutral"}>{statusLabels[task.status] ?? task.status}</Badge>
                          <span className="shrink-0 font-mono text-caption text-fg-muted">#{task.pbDisplayId}</span>
                          <span className="line-clamp-2 min-w-0 flex-1 break-words text-body text-fg">
                            {taskText.text ? (
                              <I18nText i18n={task.i18n} field="taskName" original={task.taskName} entity={{ type: "sprint_task", id: task.id }} />
                            ) : task.pbUserStory ? (
                              <I18nText i18n={task.pbI18n} field="userStory" original={task.pbUserStory} entity={{ type: "backlog_item", id: task.pbId }} />
                            ) : (
                              t.sprintNoTaskName
                            )}
                          </span>
                          {task.estimatedHours != null && (
                            <span className="shrink-0 text-caption text-fg-muted">
                              {task.actualHours != null ? `${task.actualHours}/` : ""}
                              {task.estimatedHours}h
                            </span>
                          )}
                        </Link>
                      </li>
                    )
                  })}
                </ul>
              </div>
            )
          })}
        </article>
      ))}
    </div>
  )
}
