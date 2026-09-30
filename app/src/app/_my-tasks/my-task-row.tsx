"use client"

import Link from "next/link"
import { Badge, Select } from "@/components/ui"
import { I18nText } from "@/components/i18n-text"
import { useLanguage } from "@/lib/language-context"
import { pickText } from "@/lib/translation/pick-text"
import type { Translations } from "@/lib/i18n"
import type { EntityI18n } from "@/lib/translation/types"
import type { Urgency } from "./task-urgency"

export interface MyTaskRowTask {
  id: string
  taskName: string | null
  status: string
  estimatedHours: number | null
  actualHours: number | null
  pbId: string
  pbDisplayId: number
  pbUserStory: string | null
  sprintName: string
  sprintEndDate: string
  projectId: string
  i18n?: EntityI18n
  pbI18n?: EntityI18n
  sprintI18n?: EntityI18n
}

interface Props {
  task: MyTaskRowTask
  urgency: Urgency
  pending: boolean
  onStatusChange: (next: string) => void
}

const EDITABLE_STATUSES = ["todo", "in_progress", "done"] as const

function statusLabel(status: string, t: Translations): string {
  const labels: Record<string, string> = { todo: t.taskTodo, in_progress: t.taskInProgress, review: t.topTaskReview, done: t.taskDone }
  return labels[status] ?? status
}

function formatDate(iso: string): string {
  const d = new Date(iso)
  return isNaN(d.getTime()) ? "" : `${d.getMonth() + 1}/${d.getDate()}`
}

/** Deep link into the sprint board (the sprints page may highlight `?task=`). */
export function taskHref(task: Pick<MyTaskRowTask, "id" | "projectId">): string {
  return `/projects/${task.projectId}/sprints?task=${encodeURIComponent(task.id)}`
}

function UrgencyBadge({ urgency }: { urgency: Urgency }) {
  const { t } = useLanguage()
  if (urgency === "overdue") return <Badge tone="danger" dot>{t.topTaskOverdueBadge}</Badge>
  if (urgency === "due_soon") return <Badge tone="warning" dot>{t.topTaskDueSoonBadge}</Badge>
  return null
}

/** One of "my tasks": inline status select, title link to the sprint, due / hours meta. */
export function MyTaskRow({ task, urgency, pending, onStatusChange }: Props) {
  const { t, language } = useLanguage()
  const taskText = pickText(task.i18n, "taskName", task.taskName, language)
  const plainTitle = taskText.text || task.pbUserStory || t.sprintNoTaskName
  const options: string[] = EDITABLE_STATUSES.includes(task.status as (typeof EDITABLE_STATUSES)[number])
    ? [...EDITABLE_STATUSES]
    : [task.status, ...EDITABLE_STATUSES]
  const isDone = task.status === "done"

  return (
    <li className="flex items-start gap-3 px-4 py-2.5 sm:px-5">
      <Select
        selectSize="sm"
        aria-label={t.topTaskStatusLabel.replace("{task}", plainTitle)}
        value={task.status}
        disabled={pending}
        aria-busy={pending || undefined}
        onChange={(e) => onStatusChange(e.target.value)}
        className="w-[7.5rem] shrink-0"
      >
        {options.map((s) => (
          <option key={s} value={s}>
            {statusLabel(s, t)}
          </option>
        ))}
      </Select>
      <div className="min-w-0 flex-1">
        <Link
          href={taskHref(task)}
          className={`line-clamp-2 break-words rounded-sm text-body font-medium transition-colors hover:text-primary ${isDone ? "text-fg-muted line-through decoration-fg-subtle" : "text-fg"}`}
        >
          {taskText.text ? (
            <I18nText i18n={task.i18n} field="taskName" original={task.taskName} noBadge />
          ) : task.pbUserStory ? (
            <I18nText i18n={task.pbI18n} field="userStory" original={task.pbUserStory} noBadge />
          ) : (
            t.sprintNoTaskName
          )}
        </Link>
        <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-caption text-fg-muted">
          <span className="font-mono">#{task.pbDisplayId}</span>
          <span aria-hidden="true">·</span>
          <span className="truncate">
            <I18nText i18n={task.sprintI18n} field="sprintName" original={task.sprintName} noBadge />
          </span>
          <span aria-hidden="true">·</span>
          <span className={urgency === "overdue" ? "font-semibold text-danger-strong" : undefined}>
            {t.topTaskDueOn.replace("{date}", formatDate(task.sprintEndDate))}
          </span>
          {task.estimatedHours != null && (
            <>
              <span aria-hidden="true">·</span>
              <span>
                {task.actualHours != null ? `${task.actualHours}/` : ""}
                {task.estimatedHours}h
              </span>
            </>
          )}
        </p>
      </div>
      <div className="shrink-0 pt-1">
        <UrgencyBadge urgency={urgency} />
      </div>
    </li>
  )
}
