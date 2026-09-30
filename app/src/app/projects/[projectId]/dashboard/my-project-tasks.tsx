"use client"

import Link from "next/link"
import { CheckCheck, UserRound } from "lucide-react"
import { Badge, EmptyState, type BadgeTone } from "@/components/ui"
import { I18nText } from "@/components/i18n-text"
import { useLanguage } from "@/lib/language-context"
import { pickText } from "@/lib/translation/pick-text"
import type { DashboardMyTask } from "./types"

/** Rows shown before the "N more" link. */
export const MY_TASKS_VISIBLE = 5

const STATUS_TONE: Record<string, BadgeTone> = { todo: "neutral", in_progress: "primary", review: "info", done: "success" }

/** My open tasks of this project's planning / active sprints, linked into the sprint board. */
export function MyProjectTasks({ projectId, tasks }: { projectId: string; tasks: DashboardMyTask[] }) {
  const { t, language } = useLanguage()
  const statusLabel: Record<string, string> = { todo: t.taskTodo, in_progress: t.taskInProgress, review: t.topTaskReview, done: t.taskDone }
  const sprintsHref = `/projects/${projectId}/sprints`
  const visible = tasks.slice(0, MY_TASKS_VISIBLE)
  const hidden = tasks.length - visible.length

  return (
    <section aria-labelledby="dashboard-my-tasks-heading" className="flex flex-col rounded-ui-lg border border-border bg-surface p-4 shadow-ui-sm">
      <h2 id="dashboard-my-tasks-heading" className="flex items-center gap-2 text-body font-semibold text-fg">
        <UserRound aria-hidden="true" className="h-4 w-4 text-fg-muted" />
        {t.dashboardMyTasksTitle}
        {tasks.length > 0 && <span className="text-caption font-normal text-fg-muted">({tasks.length})</span>}
      </h2>
      {tasks.length === 0 ? (
        <EmptyState compact headingLevel={3} icon={<CheckCheck className="h-5 w-5" />} title={t.dashboardMyTasksEmpty} />
      ) : (
        <>
          <ul className="mt-2 divide-y divide-border">
            {visible.map((task) => {
              const hasName = !!pickText(task.i18n, "taskName", task.taskName, language).text
              return (
                <li key={task.id} className="flex items-start gap-2 py-2">
                  <Badge tone={STATUS_TONE[task.status] ?? "neutral"}>{statusLabel[task.status] ?? task.status}</Badge>
                  <Link
                    href={`${sprintsHref}?task=${encodeURIComponent(task.id)}`}
                    className="line-clamp-2 min-w-0 flex-1 break-words rounded-sm text-body text-fg hover:text-primary"
                  >
                    <span className="mr-1.5 font-mono text-caption text-fg-muted">#{task.pbDisplayId}</span>
                    {hasName ? (
                      <I18nText i18n={task.i18n} field="taskName" original={task.taskName} noBadge />
                    ) : task.pbUserStory ? (
                      <I18nText i18n={task.pbI18n} field="userStory" original={task.pbUserStory} noBadge />
                    ) : (
                      t.sprintNoTaskName
                    )}
                  </Link>
                </li>
              )
            })}
          </ul>
          {hidden > 0 && (
            <Link href={sprintsHref} className="mt-auto pt-2 text-caption font-medium text-primary-strong hover:underline">
              {t.dashboardMyTasksMore.replace("{count}", String(hidden))}
            </Link>
          )}
        </>
      )}
    </section>
  )
}
