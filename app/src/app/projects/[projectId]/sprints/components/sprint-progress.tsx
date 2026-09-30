"use client"

import { useLanguage } from "@/lib/language-context"
import { cn, TaskStatusIcon } from "@/components/ui"
import type { SprintMetrics } from "../lib/sprint-metrics"
import { Gauge } from "lucide-react"
interface Props {
  capacity: number
  metrics: SprintMetrics
}

/** Capacity gauge (committed band + done band) and task status counts. */
export default function SprintProgress({ capacity, metrics: m }: Props) {
  const { t } = useLanguage()
  return (
    <div className="px-6 pb-4 space-y-3">
      <div>
        <div className="flex flex-wrap justify-between gap-2 text-body text-fg-muted mb-1">
          <span className="inline-flex items-center gap-1.5">
            <Gauge className="w-4 h-4 text-fg-subtle" />
            {t.sprintWorkload}: {m.currentWorkload} / {capacity}
          </span>
          <span className="flex items-center gap-3">
            <span className="text-success font-medium">
              {t.sprintActualScore}: {Math.round(m.completedWorkload * 10) / 10}
            </span>
            <span className={cn("font-medium", m.isOver ? "text-danger" : "text-fg-muted")}>{m.progress}%</span>
          </span>
        </div>
        <div className="w-full bg-surface-sunken rounded-full h-2 relative overflow-hidden" aria-hidden="true">
          <div className={cn("absolute inset-y-0 left-0", m.isOver ? "bg-danger/30" : "bg-primary/25")}
            style={{ width: `${m.committedProgress}%` }} />
          <div className="absolute inset-y-0 left-0 w-full bg-success origin-left transition-transform duration-500"
            style={{ transform: `scaleX(${m.doneProgress / 100})` }} />
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-body">
        <span className="text-fg-muted">{t.sprintTasks}: {m.totalTasks}</span>
        {m.totalTasks > 0 && (
          <>
            <span className="inline-flex items-center gap-1 text-success">
              <TaskStatusIcon status="done" className="w-4 h-4" /> {t.taskDone}: {m.doneTasks}
            </span>
            <span className="inline-flex items-center gap-1 text-primary">
              <TaskStatusIcon status="in_progress" className="w-4 h-4" /> {t.taskInProgress}: {m.inProgressTasks}
            </span>
            <span className="inline-flex items-center gap-1 text-fg-muted">
              <TaskStatusIcon status="todo" className="w-4 h-4" /> {t.taskTodo}: {m.todoTasks}
            </span>
          </>
        )}
      </div>
    </div>
  )
}
