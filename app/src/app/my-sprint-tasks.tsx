"use client"

import Link from "next/link"
import { useMemo } from "react"
import { Folder } from "lucide-react"
import { I18nText } from "@/components/i18n-text"
import type { EntityI18n } from "@/lib/translation/types"
import { MyTaskRow } from "./_my-tasks/my-task-row"
import { groupByProject, urgencyOf } from "./_my-tasks/task-urgency"
import type { MyTaskStatusController } from "./_my-tasks/use-my-task-statuses"

export interface MyTask {
  id: string
  taskName: string | null
  status: string
  /** Optimistic-lock version (inline status changes send it back). */
  version?: number
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

interface Props {
  /** Tasks as loaded — the order (most urgent first) is fixed from these so rows don't jump while editing. */
  tasks: MyTask[]
  statuses: MyTaskStatusController<MyTask>
  now: Date
}

/** My open sprint tasks grouped by project, overdue / due soon first, with inline status change. */
export function MySprintTasks({ tasks, statuses, now }: Props) {
  const groups = useMemo(() => groupByProject(tasks, now), [tasks, now])

  return (
    <div className="grid gap-3 lg:grid-cols-2">
      {groups.map((group) => {
        const first = group.tasks[0]
        return (
          <article key={group.projectId} className="overflow-hidden rounded-ui-lg border border-border bg-surface shadow-ui-sm">
            <h3>
              <Link
                href={`/projects/${group.projectId}`}
                className="flex items-center gap-2 border-b border-border bg-surface-muted px-4 py-2.5 transition-colors hover:bg-surface-sunken sm:px-5"
              >
                <Folder aria-hidden="true" className="h-4 w-4 shrink-0 text-fg-muted" />
                <span className="truncate text-body font-semibold text-fg">
                  <I18nText i18n={first.projectI18n} field="name" original={first.projectName} noBadge />
                </span>
              </Link>
            </h3>
            <ul className="divide-y divide-border">
              {group.tasks.map((task) => {
                const liveTask = statuses.live(task)
                return (
                  <MyTaskRow
                    key={task.id}
                    task={liveTask}
                    urgency={urgencyOf(liveTask, now)}
                    pending={statuses.isPending(task.id)}
                    onStatusChange={(next) => void statuses.changeStatus(task, next)}
                  />
                )
              })}
            </ul>
          </article>
        )
      })}
    </div>
  )
}
