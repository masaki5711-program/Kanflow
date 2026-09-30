"use client"

import { EmptyState, Modal, cn } from "@/components/ui"
import { I18nText } from "@/components/i18n-text"
import { useLanguage } from "@/lib/language-context"
import { type SprintItem, fmt, i18nOf } from "./calendar-types"

export interface DeadlineInfo {
  dateStr: string
  tasks: SprintItem[]
  sprintName: string
}

const STATUS_DOT: Record<string, string> = {
  done: "bg-success",
  in_progress: "bg-primary",
}

/** Tasks due on a sprint end date (opened from the red badge in the month grid). */
export default function DeadlineDialog({ info, onClose }: { info: DeadlineInfo | null; onClose: () => void }) {
  const { t } = useLanguage()

  return (
    <Modal
      open={info !== null}
      onClose={onClose}
      size="sm"
      closeOnOverlayClick
      title={info ? fmt(t.calendarDeadlineTitle, { sprint: info.sprintName, date: info.dateStr }) : ""}
    >
      {info && info.tasks.length === 0 ? (
        <EmptyState compact title={t.calendarNoTasks} />
      ) : (
        <ul className="space-y-2">
          {info?.tasks.map((task) => (
            <li key={task.id} className="flex items-center gap-2.5 text-body p-2 rounded-ui-sm bg-surface-muted">
              <span
                className={cn("w-2 h-2 rounded-full shrink-0", STATUS_DOT[task.status] ?? "bg-fg-subtle")}
                aria-hidden
              />
              <span className="min-w-0 text-fg font-medium break-words">
                {task.pbItem.displayId ? `#${task.pbItem.displayId} ` : ""}
                <I18nText
                  i18n={i18nOf(task.pbItem)}
                  field="userStory"
                  original={task.pbItem.userStory}
                  entity={{ type: "backlog_item", id: task.pbItem.id }}
                />
              </span>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  )
}
