"use client"

import { useLanguage } from "@/lib/language-context"

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
  items: SprintItem[]
}

interface CalendarEvent {
  id: string
  title: string
  description: string | null
  date: string
  endDate: string | null
  color: string
  sprintId: string | null
  sprint: { id: string; sprintName: string } | null
}

interface SprintCardProps {
  sprint: Sprint
  events: CalendarEvent[]
  isExpanded: boolean
  onToggleExpand: () => void
  onRequestStatusChange: (sprintId: string, nextStatus: string) => void
  onUpdateSprintStatus: (sprintId: string, status: string, reviewComment: string | null, retrospectiveMemo: string | null) => void
  onDeleteSprint: (sprintId: string) => void
  onOpenTaskForm: (sprintId: string, pbItemId?: string) => void
  onStartEditTask: (sprintId: string, task: SprintItem) => void
  onDeleteTask: (sprintId: string, taskId: string) => void
  onQuickUpdateTaskStatus: (sprintId: string, taskId: string, status: string) => void
  onOpenStatusDialog: (sprint: Sprint) => void
  pointUnit: string
}

/* ── SVG Icon helpers ── */
type IC = { className?: string }
const S = (p: IC & { d: string; children?: React.ReactNode }) => (
  <svg className={p.className} viewBox="0 0 20 20" fill="currentColor">{p.children}<path d={p.d} /></svg>
)
const Sf = (p: IC & { d: string; children?: React.ReactNode }) => (
  <svg className={p.className} viewBox="0 0 20 20" fill="currentColor">{p.children}<path fillRule="evenodd" d={p.d} clipRule="evenodd" /></svg>
)
function IconBolt({ className = "w-5 h-5" }: IC) {
  return <S className={className} d="M11.983 1.907a.75.75 0 00-1.292-.657l-8.5 9.5A.75.75 0 002.75 12h6.572l-1.305 6.093a.75.75 0 001.292.657l8.5-9.5A.75.75 0 0017.25 8h-6.572l1.305-6.093z" />
}
function IconChevron({ open, className = "w-5 h-5" }: { open: boolean; className?: string }) {
  return <Sf className={`${className} transition-transform duration-200 ${open ? "rotate-90" : ""}`} d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z" />
}
function IconPencil({ className = "w-4 h-4" }: IC) {
  return <S className={className} d="M2.695 14.763l-1.262 3.154a.5.5 0 00.65.65l3.155-1.262a4 4 0 001.343-.885L17.5 5.5a2.121 2.121 0 00-3-3L3.58 13.42a4 4 0 00-.885 1.343z" />
}
function IconPlay({ className = "w-4 h-4" }: IC) {
  return <S className={className} d="M6.3 2.841A1.5 1.5 0 004 4.11v11.78a1.5 1.5 0 002.3 1.269l9.344-5.89a1.5 1.5 0 000-2.538L6.3 2.84z" />
}
function IconEye({ className = "w-4 h-4" }: IC) {
  return <svg className={className} viewBox="0 0 20 20" fill="currentColor"><path d="M10 12.5a2.5 2.5 0 100-5 2.5 2.5 0 000 5z" /><path fillRule="evenodd" d="M.664 10.59a1.651 1.651 0 010-1.186A10.004 10.004 0 0110 3c4.257 0 7.893 2.66 9.336 6.41.147.381.146.804 0 1.186A10.004 10.004 0 0110 17c-4.257 0-7.893-2.66-9.336-6.41zM14 10a4 4 0 11-8 0 4 4 0 018 0z" clipRule="evenodd" /></svg>
}
function IconCheck({ className = "w-4 h-4" }: IC) {
  return <Sf className={className} d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" />
}
function IconArchive({ className = "w-4 h-4" }: IC) {
  return <svg className={className} viewBox="0 0 20 20" fill="currentColor"><path d="M2 3a1 1 0 00-1 1v1a1 1 0 001 1h16a1 1 0 001-1V4a1 1 0 00-1-1H2z" /><path fillRule="evenodd" d="M2 7.5h16l-.811 7.71a2 2 0 01-1.99 1.79H4.802a2 2 0 01-1.99-1.79L2 7.5zM7 11a1 1 0 011-1h4a1 1 0 110 2H8a1 1 0 01-1-1z" clipRule="evenodd" /></svg>
}
function IconCalendar({ className = "w-4 h-4" }: IC) {
  return <Sf className={className} d="M5.75 2a.75.75 0 01.75.75V4h7V2.75a.75.75 0 011.5 0V4h.25A2.75 2.75 0 0118 6.75v8.5A2.75 2.75 0 0115.25 18H4.75A2.75 2.75 0 012 15.25v-8.5A2.75 2.75 0 014.75 4H5V2.75A.75.75 0 015.75 2zm-1 5.5c-.69 0-1.25.56-1.25 1.25v6.5c0 .69.56 1.25 1.25 1.25h10.5c.69 0 1.25-.56 1.25-1.25v-6.5c0-.69-.56-1.25-1.25-1.25H4.75z" />
}
function IconGauge({ className = "w-4 h-4" }: IC) {
  return <Sf className={className} d="M10 18a8 8 0 100-16 8 8 0 000 16zm.75-11.25a.75.75 0 00-1.5 0v2.5c0 .414.336.75.75.75h2.5a.75.75 0 000-1.5h-1.75v-1.75z" />
}
function IconArrowRight({ className = "w-4 h-4" }: IC) {
  return <Sf className={className} d="M3 10a.75.75 0 01.75-.75h10.638L10.23 5.29a.75.75 0 111.04-1.08l5.5 5.25a.75.75 0 010 1.08l-5.5 5.25a.75.75 0 11-1.04-1.08l4.158-3.96H3.75A.75.75 0 013 10z" />
}
function IconClipboard({ className = "w-4 h-4" }: IC) {
  return <Sf className={className} d="M13.887 3.182c.396.037.79.08 1.183.128C16.194 3.45 17 4.414 17 5.517V16.75A2.25 2.25 0 0114.75 19h-9.5A2.25 2.25 0 013 16.75V5.517c0-1.103.806-2.068 1.93-2.207.393-.048.787-.09 1.183-.128A3.001 3.001 0 019 1h2c1.373 0 2.531.923 2.887 2.182zM7.5 4A1.5 1.5 0 019 2.5h2A1.5 1.5 0 0112.5 4v.5h-5V4z" />
}
function IconScale({ className = "w-3.5 h-3.5" }: IC) {
  return <Sf className={className} d="M10 2a.75.75 0 01.75.75v.258a33.186 33.186 0 016.668.83.75.75 0 01-.336 1.461 31.28 31.28 0 00-1.103-.232l1.702 7.545a.75.75 0 01-.387.832A4.981 4.981 0 0114 14c-1.09 0-2.077-.363-2.884-.956L10 2.75A.75.75 0 0110 2zM5 14c-1.09 0-2.077-.363-2.884-.956L3.82 6.591A31.28 31.28 0 002.72 6.36a.75.75 0 01-.337-1.462 33.186 33.186 0 016.668-.83V2.75a.75.75 0 011.5 0v.258c.22.012.44.027.66.044l1.702 7.545a.75.75 0 01-.387.832A4.981 4.981 0 015 14z" />
}
function IconPerson({ className = "w-3.5 h-3.5" }: IC) {
  return <S className={className} d="M10 8a3 3 0 100-6 3 3 0 000 6zM3.465 14.493a1.23 1.23 0 00.41 1.412A9.957 9.957 0 0010 18c2.31 0 4.438-.784 6.131-2.1.43-.333.604-.903.408-1.41a7.002 7.002 0 00-13.074.003z" />
}
function IconClock({ className = "w-3.5 h-3.5" }: IC) {
  return <Sf className={className} d="M10 18a8 8 0 100-16 8 8 0 000 16zm.75-13a.75.75 0 00-1.5 0v5c0 .414.336.75.75.75h4a.75.75 0 000-1.5h-3.25V5z" />
}
function IconTrash({ className = "w-4 h-4" }: IC) {
  return <Sf className={className} d="M8.75 1A2.75 2.75 0 006 3.75v.443c-.795.077-1.584.176-2.365.298a.75.75 0 10.23 1.482l.149-.022.841 10.518A2.75 2.75 0 007.596 19h4.807a2.75 2.75 0 002.742-2.53l.841-10.52.149.023a.75.75 0 00.23-1.482A41.03 41.03 0 0014 3.68V3.75A2.75 2.75 0 0011.25 1h-2.5zM10 4c.84 0 1.673.025 2.5.075V3.75c0-.69-.56-1.25-1.25-1.25h-2.5c-.69 0-1.25.56-1.25 1.25v.325C8.327 4.025 9.16 4 10 4zM8.58 7.72a.75.75 0 00-1.5.06l.3 7.5a.75.75 0 101.5-.06l-.3-7.5zm4.34.06a.75.75 0 10-1.5-.06l-.3 7.5a.75.75 0 101.5.06l.3-7.5z" />
}
function IconPlusCircle({ className = "w-4 h-4" }: IC) {
  return <Sf className={className} d="M10 18a8 8 0 100-16 8 8 0 000 16zm.75-11.25a.75.75 0 00-1.5 0v2.5h-2.5a.75.75 0 000 1.5h2.5v2.5a.75.75 0 001.5 0v-2.5h2.5a.75.75 0 000-1.5h-2.5v-2.5z" />
}
function IconChatBubble({ className = "w-4 h-4" }: IC) {
  return <Sf className={className} d="M3.43 2.524A41.29 41.29 0 0110 2c2.236 0 4.43.18 6.57.524 1.437.231 2.43 1.49 2.43 2.902v5.148c0 1.413-.993 2.67-2.43 2.902a41.102 41.102 0 01-3.55.414c-.28.02-.521.18-.643.413l-1.712 3.293a.75.75 0 01-1.33 0l-1.713-3.293a.783.783 0 00-.642-.413 41.108 41.108 0 01-3.55-.414C1.993 13.245 1 11.986 1 10.574V5.426c0-1.413.993-2.67 2.43-2.902z" />
}

/* Task status icons */
function TaskStatusIcon({ status, className = "w-5 h-5" }: { status: string; className?: string }) {
  if (status === "done") {
    return (
      <svg className={className} viewBox="0 0 20 20" fill="currentColor">
        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z" clipRule="evenodd" />
      </svg>
    )
  }
  if (status === "in_progress") {
    return (
      <svg className={className} viewBox="0 0 20 20" fill="currentColor">
        <path fillRule="evenodd" d="M2 10a8 8 0 1116 0 8 8 0 01-16 0zm6.39-2.908a.75.75 0 01.766.027l3.5 2.25a.75.75 0 010 1.262l-3.5 2.25A.75.75 0 018 12.25v-4.5a.75.75 0 01.39-.658z" clipRule="evenodd" />
      </svg>
    )
  }
  return (
    <svg className={className} viewBox="0 0 20 20" fill="currentColor">
      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm0-2a6 6 0 100-12 6 6 0 000 12z" clipRule="evenodd" />
    </svg>
  )
}

/* Sprint status icon */
function StatusIcon({ status }: { status: string }) {
  const cls = "w-3.5 h-3.5"
  switch (status) {
    case "planning": return <IconPencil className={cls} />
    case "active": return <IconPlay className={cls} />
    case "review": return <IconEye className={cls} />
    case "done": return <IconCheck className={cls} />
    case "archived": return <IconArchive className={cls} />
    default: return null
  }
}

const statusBadge: Record<string, string> = {
  planning: "bg-amber-100 text-amber-800 border border-amber-200",
  active: "bg-blue-100 text-blue-800 border border-blue-200",
  review: "bg-violet-100 text-violet-800 border border-violet-200",
  done: "bg-emerald-100 text-emerald-800 border border-emerald-200",
  archived: "bg-slate-100 text-slate-600 border border-slate-200",
}

const eventColorBg: Record<string, string> = {
  blue: "bg-blue-50 text-blue-700 border-blue-200",
  green: "bg-green-50 text-green-700 border-green-200",
  red: "bg-red-50 text-red-700 border-red-200",
  yellow: "bg-yellow-50 text-yellow-700 border-yellow-200",
  purple: "bg-purple-50 text-purple-700 border-purple-200",
  gray: "bg-gray-50 text-gray-700 border-gray-200",
}

function groupTasksByPb(items: SprintItem[]) {
  const groups: Record<string, { pbItem: SprintPbItem; tasks: SprintItem[] }> = {}
  for (const item of items) {
    const pbId = item.pbItem.id
    if (!groups[pbId]) {
      groups[pbId] = { pbItem: item.pbItem, tasks: [] }
    }
    groups[pbId].tasks.push(item)
  }
  return Object.values(groups)
}

export default function SprintCard({
  sprint, events, isExpanded, onToggleExpand, onRequestStatusChange,
  onUpdateSprintStatus, onDeleteSprint, onOpenTaskForm, onStartEditTask,
  onDeleteTask, onQuickUpdateTaskStatus, onOpenStatusDialog, pointUnit,
}: SprintCardProps) {
  const { language, t, pt } = useLanguage()

  const taskStatusLabels: Record<string, string> = {
    todo: t.taskTodo, in_progress: t.taskInProgress, done: t.taskDone,
  }
  const statusLabels: Record<string, string> = {
    planning: t.sprintStatusPlanning, active: t.sprintStatusActive,
    review: t.sprintStatusReview, done: t.sprintStatusDone, archived: t.sprintStatusArchived,
  }

  const seenPbIds = new Set<string>()
  const currentWorkload = sprint.items.reduce((sum, i) => {
    const pbId = i.pbItem?.id
    if (!pbId || seenPbIds.has(pbId)) return sum
    seenPbIds.add(pbId)
    return sum + (i.pbItem?.workloadScore ?? 0)
  }, 0)
  const isOver = currentWorkload > sprint.capacity
  const progress = sprint.capacity > 0 ? Math.round((currentWorkload / sprint.capacity) * 100) : 0
  const sprintEvents = events.filter((ev) => ev.sprintId === sprint.id)
  const pbGroups = groupTasksByPb(sprint.items)
  const totalTasks = sprint.items.length
  const doneTasks = sprint.items.filter((i) => i.status === "done").length
  const inProgressTasks = sprint.items.filter((i) => i.status === "in_progress").length
  const todoTasks = totalTasks - doneTasks - inProgressTasks

  const nextStatuses: Record<string, string[]> = {
    planning: ["active"], active: ["review", "done"], review: ["done", "active"],
    done: ["review", "active"], archived: ["done"],
  }

  const locale = language === "ja" ? "ja-JP" : language === "id" ? "id-ID" : "en-US"

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
      {/* ── Header ── */}
      <div className="px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3 min-w-0">
          <button onClick={onToggleExpand} className="text-gray-400 hover:text-gray-600 flex-shrink-0">
            <IconChevron open={isExpanded} />
          </button>
          <IconBolt className="w-5 h-5 text-blue-500 flex-shrink-0" />
          <h3 className="text-lg font-semibold text-gray-900 truncate">{sprint.sprintName}</h3>
          <span className={`inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full font-medium ${statusBadge[sprint.status] ?? "bg-gray-100"}`}>
            <StatusIcon status={sprint.status} />
            {statusLabels[sprint.status] ?? sprint.status}
          </span>
          {nextStatuses[sprint.status]?.map((ns) => (
            <button key={ns} onClick={() => onRequestStatusChange(sprint.id, ns)}
              className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 hover:border-gray-300 transition-colors">
              <IconArrowRight className="w-3.5 h-3.5" />
              {statusLabels[ns] ?? ns}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-3 flex-shrink-0">
          <span className="inline-flex items-center gap-1.5 text-sm text-gray-500">
            <IconCalendar className="w-4 h-4 text-gray-400" />
            {new Date(sprint.startDate).toLocaleDateString(locale)} - {new Date(sprint.endDate).toLocaleDateString(locale)}
          </span>
          {(sprint.status === "review" || sprint.status === "done") && (
            <button onClick={() => onOpenStatusDialog(sprint)}
              className="inline-flex items-center gap-1 text-xs text-violet-600 hover:text-violet-800 bg-violet-50 px-2.5 py-1 rounded-lg transition-colors">
              <IconChatBubble className="w-3.5 h-3.5" />
              {t.sprintReviewComment}
            </button>
          )}
          {sprint.status === "done" && (
            <button onClick={() => onUpdateSprintStatus(sprint.id, "archived", null, null)}
              className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700 border border-gray-200 px-2.5 py-1 rounded-lg transition-colors">
              <IconArchive className="w-3.5 h-3.5" />
              {t.sprintArchive}
            </button>
          )}
          {sprint.status === "archived" && (
            <button onClick={() => onUpdateSprintStatus(sprint.id, "done", null, null)}
              className="inline-flex items-center gap-1 text-xs text-blue-500 hover:text-blue-700 border border-blue-200 px-2.5 py-1 rounded-lg transition-colors">
              <IconArchive className="w-3.5 h-3.5" />
              {t.sprintUnarchive}
            </button>
          )}
          <button onClick={() => onDeleteSprint(sprint.id)}
            className="p-1.5 text-gray-300 hover:text-red-500 rounded-lg hover:bg-red-50 transition-colors">
            <IconTrash className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* ── Goal ── */}
      {sprint.sprintGoal && (
        <div className="px-6 pb-2">
          <p className="text-sm text-gray-600 italic">{sprint.sprintGoal}</p>
        </div>
      )}

      {/* ── Review / Retro ── */}
      {(sprint.reviewComment || sprint.retrospectiveMemo) && (
        <div className="px-6 pb-3 space-y-2">
          {sprint.reviewComment && (
            <div className="bg-violet-50 border border-violet-200 rounded-lg px-3 py-2">
              <span className="text-xs font-semibold text-violet-700">{t.sprintReviewComment}</span>
              <p className="text-sm text-violet-900 whitespace-pre-wrap mt-0.5">{sprint.reviewComment}</p>
            </div>
          )}
          {sprint.retrospectiveMemo && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg px-3 py-2">
              <span className="text-xs font-semibold text-blue-700">{t.sprintRetrospectiveMemo}</span>
              <p className="text-sm text-blue-900 whitespace-pre-wrap mt-0.5">{sprint.retrospectiveMemo}</p>
            </div>
          )}
        </div>
      )}

      {/* ── Info bar: gauge + task summary ── */}
      <div className="px-6 pb-4 space-y-3">
        {/* Capacity gauge */}
        <div>
          <div className="flex justify-between text-sm text-gray-600 mb-1">
            <span className="inline-flex items-center gap-1.5">
              <IconGauge className="w-4 h-4 text-gray-400" />
              {t.sprintWorkload}: {currentWorkload} / {sprint.capacity}
            </span>
            <span className="flex items-center gap-3">
              <span className="text-emerald-600 font-medium">{t.sprintActualScore}: {sprint.actualScore}</span>
              <span className={`font-medium ${isOver ? "text-red-600" : "text-gray-500"}`}>{progress}%</span>
            </span>
          </div>
          <div className="w-full bg-gray-100 rounded-full h-2">
            <div className={`h-2 rounded-full transition-all duration-300 ${isOver ? "bg-red-500" : progress > 80 ? "bg-amber-400" : "bg-emerald-500"}`}
              style={{ width: `${Math.min(progress, 100)}%` }} />
          </div>
        </div>
        {/* Task summary */}
        <div className="flex items-center gap-5 text-sm">
          <span className="text-gray-500">{t.sprintTasks}: {totalTasks}</span>
          {totalTasks > 0 && (
            <>
              <span className="inline-flex items-center gap-1 text-emerald-600">
                <TaskStatusIcon status="done" className="w-4 h-4" /> {t.taskDone}: {doneTasks}
              </span>
              <span className="inline-flex items-center gap-1 text-blue-600">
                <TaskStatusIcon status="in_progress" className="w-4 h-4" /> {t.taskInProgress}: {inProgressTasks}
              </span>
              <span className="inline-flex items-center gap-1 text-gray-400">
                <TaskStatusIcon status="todo" className="w-4 h-4" /> {t.taskTodo}: {todoTasks}
              </span>
            </>
          )}
        </div>
      </div>

      {/* ── Expanded: PBI groups ── */}
      {isExpanded && (
        <div className="border-t border-gray-100 px-6 py-4 space-y-4 bg-gray-50/50">
          {pbGroups.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-6">{t.sprintNoTasks}</p>
          ) : pbGroups.map(({ pbItem, tasks }) => {
            const taskEffortSum = tasks.reduce((sum, tsk) => sum + (tsk.estimatedHours ?? 0), 0)
            const pbCapacity = pbItem.workloadScore
            const pbProgress = pbCapacity > 0 ? Math.round((taskEffortSum / pbCapacity) * 100) : 0
            const pbIsOver = taskEffortSum > pbCapacity && pbCapacity > 0
            return (
              <div key={pbItem.id} className="bg-white border border-gray-200 rounded-lg p-4">
                {/* PBI header */}
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <IconClipboard className="w-4 h-4 text-gray-400 flex-shrink-0" />
                    <span className="text-xs font-mono text-gray-400">#{pbItem.displayId}</span>
                    <span className="text-sm font-medium text-gray-800 truncate">
                      {pbItem.initiative || pbItem.userStory || t.sprintNotEntered}
                    </span>
                    <span className="inline-flex items-center gap-1 text-xs bg-orange-50 text-orange-700 border border-orange-200 px-2 py-0.5 rounded-full">
                      <IconScale />
                      {pbItem.workloadScore} {pointUnit}
                    </span>
                  </div>
                  <button onClick={() => onOpenTaskForm(sprint.id, pbItem.id)}
                    className="inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 hover:bg-blue-50 px-2 py-1 rounded-lg transition-colors">
                    <IconPlusCircle className="w-4 h-4" />
                    {t.sprintAddTaskShort}
                  </button>
                </div>

                {/* PBI progress bar */}
                {pbCapacity > 0 && (
                  <div className="mb-3">
                    <div className="flex justify-between text-xs text-gray-500 mb-0.5">
                      <span>{t.sprintWorkload}: {taskEffortSum} / {pbCapacity} {pointUnit}</span>
                      <span className={pbIsOver ? "text-red-600 font-medium" : ""}>{pbProgress}%</span>
                    </div>
                    <div className="w-full bg-gray-100 rounded-full h-1.5">
                      <div className={`h-1.5 rounded-full transition-all duration-300 ${pbIsOver ? "bg-red-500" : pbProgress > 80 ? "bg-amber-400" : "bg-blue-500"}`}
                        style={{ width: `${Math.min(pbProgress, 100)}%` }} />
                    </div>
                  </div>
                )}

                {pbItem.epic && (
                  <p className="text-xs text-gray-500 mb-2">{pt.backlogEpic}: {pbItem.epic}</p>
                )}

                {/* Tasks */}
                <div className="space-y-0.5">
                  {tasks.map((task) => (
                    <div key={task.id} className="flex items-center gap-2.5 py-2 px-2 rounded-lg hover:bg-gray-50 group transition-colors">
                      <button
                        onClick={() => {
                          const next = task.status === "todo" ? "in_progress" : task.status === "in_progress" ? "done" : "todo"
                          onQuickUpdateTaskStatus(sprint.id, task.id, next)
                        }}
                        className={`flex-shrink-0 transition-colors ${
                          task.status === "done" ? "text-emerald-500 hover:text-emerald-600"
                          : task.status === "in_progress" ? "text-blue-500 hover:text-blue-600"
                          : "text-gray-300 hover:text-gray-400"
                        }`}
                        title={t.sprintStatusClickToggle.replace("{status}", taskStatusLabels[task.status])}
                      >
                        <TaskStatusIcon status={task.status} className="w-5 h-5" />
                      </button>

                      <span className={`text-sm flex-1 truncate ${task.status === "done" ? "line-through text-gray-400" : "text-gray-700"}`}>
                        {task.taskName || t.sprintNoTaskName}
                      </span>

                      {task.assignee ? (
                        <span className="inline-flex items-center gap-1 text-xs bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded-full">
                          <IconPerson /> {task.assignee}
                        </span>
                      ) : (
                        <span className="text-xs text-gray-300">{t.sprintUnassigned}</span>
                      )}

                      {(task.estimatedHours || task.actualHours) && (
                        <span className="inline-flex items-center gap-1 text-xs text-gray-400">
                          <IconClock /> {task.actualHours ?? "-"}/{task.estimatedHours ?? "-"} {pointUnit}
                        </span>
                      )}

                      <div className="opacity-0 group-hover:opacity-100 flex gap-0.5 transition-opacity">
                        <button onClick={() => onStartEditTask(sprint.id, task)}
                          className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors">
                          <IconPencil className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={() => onDeleteTask(sprint.id, task.id)}
                          className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors">
                          <IconTrash className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* ── Events ── */}
      {sprintEvents.length > 0 && (
        <div className={`border-t border-gray-100 px-6 py-3 ${isExpanded ? "" : ""}`}>
          <p className="text-xs font-medium text-gray-500 mb-2">{t.eventEvents}:</p>
          <div className="flex flex-wrap gap-1.5">
            {sprintEvents.map((ev) => (
              <span key={ev.id} className={`inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-lg border ${eventColorBg[ev.color] ?? eventColorBg.blue}`}>
                <IconCalendar className="w-3.5 h-3.5" />
                {new Date(ev.date).toLocaleDateString("ja-JP", { month: "short", day: "numeric" })} {ev.title}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
