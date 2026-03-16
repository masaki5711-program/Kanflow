"use client"

import { useEffect, useState, useCallback } from "react"
import { useParams } from "next/navigation"
import BurndownChart from "@/components/burndown-chart"
import { useLanguage } from "@/lib/language-context"
import { useConfirm } from "@/components/confirm-dialog"
import SprintCalendar from "./components/sprint-calendar"
import SprintStatusDialog from "./components/sprint-status-dialog"
import EventFormModal from "./components/event-form-modal"
import TaskFormModal from "./components/task-form-modal"
import SprintCard from "./components/sprint-card"

interface PbItemFull {
  id: string
  displayId: number
  initiative: string | null
  epic: string | null
  userStory: string | null
  workloadScore: number
  status: string
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

interface ProjectSettings {
  defaultCapacity: number
  sprintDurationWeeks: number
  pointUnit: string
  pointDescription: string | null
}

interface Member {
  id: string
  userId: string
  role: string
  user: { id: string; name: string; email: string }
}

/* ── SVG Icon helpers ── */
function IconBolt({ className = "w-5 h-5" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 20 20" fill="currentColor">
      <path d="M11.983 1.907a.75.75 0 00-1.292-.657l-8.5 9.5A.75.75 0 002.75 12h6.572l-1.305 6.093a.75.75 0 001.292.657l8.5-9.5A.75.75 0 0017.25 8h-6.572l1.305-6.093z" />
    </svg>
  )
}
function IconPlus({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 20 20" fill="currentColor">
      <path d="M10.75 4.75a.75.75 0 00-1.5 0v4.5h-4.5a.75.75 0 000 1.5h4.5v4.5a.75.75 0 001.5 0v-4.5h4.5a.75.75 0 000-1.5h-4.5v-4.5z" />
    </svg>
  )
}
function IconChartBar({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 20 20" fill="currentColor">
      <path d="M15.5 2A1.5 1.5 0 0014 3.5v13a1.5 1.5 0 001.5 1.5h1a1.5 1.5 0 001.5-1.5v-13A1.5 1.5 0 0016.5 2h-1zM9.5 6A1.5 1.5 0 008 7.5v9A1.5 1.5 0 009.5 18h1a1.5 1.5 0 001.5-1.5v-9A1.5 1.5 0 0010.5 6h-1zM3.5 10A1.5 1.5 0 002 11.5v5A1.5 1.5 0 003.5 18h1A1.5 1.5 0 006 16.5v-5A1.5 1.5 0 004.5 10h-1z" />
    </svg>
  )
}
function IconCalendar({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 20 20" fill="currentColor">
      <path fillRule="evenodd" d="M5.75 2a.75.75 0 01.75.75V4h7V2.75a.75.75 0 011.5 0V4h.25A2.75 2.75 0 0118 6.75v8.5A2.75 2.75 0 0115.25 18H4.75A2.75 2.75 0 012 15.25v-8.5A2.75 2.75 0 014.75 4H5V2.75A.75.75 0 015.75 2zm-1 5.5c-.69 0-1.25.56-1.25 1.25v6.5c0 .69.56 1.25 1.25 1.25h10.5c.69 0 1.25-.56 1.25-1.25v-6.5c0-.69-.56-1.25-1.25-1.25H4.75z" clipRule="evenodd" />
    </svg>
  )
}
function IconArchive({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 20 20" fill="currentColor">
      <path d="M2 3a1 1 0 00-1 1v1a1 1 0 001 1h16a1 1 0 001-1V4a1 1 0 00-1-1H2z" />
      <path fillRule="evenodd" d="M2 7.5h16l-.811 7.71a2 2 0 01-1.99 1.79H4.802a2 2 0 01-1.99-1.79L2 7.5zM7 11a1 1 0 011-1h4a1 1 0 110 2H8a1 1 0 01-1-1z" clipRule="evenodd" />
    </svg>
  )
}
function IconTag({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 20 20" fill="currentColor">
      <path fillRule="evenodd" d="M5.5 3A2.5 2.5 0 003 5.5v2.879a2.5 2.5 0 00.732 1.767l6.5 6.5a2.5 2.5 0 003.536 0l2.878-2.878a2.5 2.5 0 000-3.536l-6.5-6.5A2.5 2.5 0 008.38 3H5.5zM6 7a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
    </svg>
  )
}
function IconTarget({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 20 20" fill="currentColor">
      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm0-2a6 6 0 100-12 6 6 0 000 12zm0-2a4 4 0 100-8 4 4 0 000 8zm0-2a2 2 0 100-4 2 2 0 000 4z" clipRule="evenodd" />
    </svg>
  )
}
function IconGauge({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 20 20" fill="currentColor">
      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm.75-11.25a.75.75 0 00-1.5 0v2.5c0 .414.336.75.75.75h2.5a.75.75 0 000-1.5h-1.75v-1.75z" clipRule="evenodd" />
    </svg>
  )
}
function IconClipboard({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 20 20" fill="currentColor">
      <path fillRule="evenodd" d="M13.887 3.182c.396.037.79.08 1.183.128C16.194 3.45 17 4.414 17 5.517V16.75A2.25 2.25 0 0114.75 19h-9.5A2.25 2.25 0 013 16.75V5.517c0-1.103.806-2.068 1.93-2.207.393-.048.787-.09 1.183-.128A3.001 3.001 0 019 1h2c1.373 0 2.531.923 2.887 2.182zM7.5 4A1.5 1.5 0 019 2.5h2A1.5 1.5 0 0112.5 4v.5h-5V4z" clipRule="evenodd" />
    </svg>
  )
}
function IconChevron({ open, className = "w-5 h-5" }: { open: boolean; className?: string }) {
  return (
    <svg className={`${className} transition-transform duration-200 ${open ? "rotate-90" : ""}`} viewBox="0 0 20 20" fill="currentColor">
      <path fillRule="evenodd" d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z" clipRule="evenodd" />
    </svg>
  )
}
function IconEventAdd({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 20 20" fill="currentColor">
      <path fillRule="evenodd" d="M5.75 2a.75.75 0 01.75.75V4h7V2.75a.75.75 0 011.5 0V4h.25A2.75 2.75 0 0118 6.75v8.5A2.75 2.75 0 0115.25 18H4.75A2.75 2.75 0 012 15.25v-8.5A2.75 2.75 0 014.75 4H5V2.75A.75.75 0 015.75 2zm4.25 7.25a.75.75 0 00-1.5 0v1.5h-1.5a.75.75 0 000 1.5h1.5v1.5a.75.75 0 001.5 0v-1.5h1.5a.75.75 0 000-1.5h-1.5v-1.5z" clipRule="evenodd" />
    </svg>
  )
}
function IconDelete({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 20 20" fill="currentColor">
      <path fillRule="evenodd" d="M8.75 1A2.75 2.75 0 006 3.75v.443c-.795.077-1.584.176-2.365.298a.75.75 0 10.23 1.482l.149-.022.841 10.518A2.75 2.75 0 007.596 19h4.807a2.75 2.75 0 002.742-2.53l.841-10.52.149.023a.75.75 0 00.23-1.482A41.03 41.03 0 0014 3.68V3.75A2.75 2.75 0 0011.25 1h-2.5zM10 4c.84 0 1.673.025 2.5.075V3.75c0-.69-.56-1.25-1.25-1.25h-2.5c-.69 0-1.25.56-1.25 1.25v.325C8.327 4.025 9.16 4 10 4zM8.58 7.72a.75.75 0 00-1.5.06l.3 7.5a.75.75 0 101.5-.06l-.3-7.5zm4.34.06a.75.75 0 10-1.5-.06l-.3 7.5a.75.75 0 101.5.06l.3-7.5z" clipRule="evenodd" />
    </svg>
  )
}

export default function SprintsPage() {
  const params = useParams()
  const projectId = params.projectId as string
  const { language, t, pt } = useLanguage()
  const confirm = useConfirm()

  const statusLabels: Record<string, string> = {
    planning: t.sprintStatusPlanning, active: t.sprintStatusActive,
    review: t.sprintStatusReview, done: t.sprintStatusDone, archived: t.sprintStatusArchived,
  }
  const statusColors: Record<string, string> = {
    planning: "bg-amber-100 text-amber-800 border border-amber-200",
    active: "bg-blue-100 text-blue-800 border border-blue-200",
    review: "bg-violet-100 text-violet-800 border border-violet-200",
    done: "bg-emerald-100 text-emerald-800 border border-emerald-200",
    archived: "bg-slate-100 text-slate-600 border border-slate-200",
  }

  const [sprints, setSprints] = useState<Sprint[]>([])
  const [events, setEvents] = useState<CalendarEvent[]>([])
  const [projectSettings, setProjectSettings] = useState<ProjectSettings | null>(null)
  const [members, setMembers] = useState<Member[]>([])
  const [readyPbItems, setReadyPbItems] = useState<PbItemFull[]>([])
  const [selectedPbIds, setSelectedPbIds] = useState<Set<string>>(new Set())
  const [showForm, setShowForm] = useState(false)
  const [showCalendar, setShowCalendar] = useState(true)
  const [calendarMonth, setCalendarMonth] = useState(() => {
    const now = new Date()
    return new Date(now.getFullYear(), now.getMonth(), 1)
  })

  const [showEventForm, setShowEventForm] = useState(false)
  const [editingEventId, setEditingEventId] = useState<string | null>(null)
  const [eventForm, setEventForm] = useState({
    title: "", description: "", date: "", endDate: "", color: "blue", sprintId: "",
  })

  const [showTaskForm, setShowTaskForm] = useState(false)
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null)
  const [taskFormSprintId, setTaskFormSprintId] = useState<string>("")
  const [taskForm, setTaskForm] = useState({
    pbItemId: "", taskName: "", assignee: "", estimatedHours: "", actualHours: "", status: "todo" as string,
  })

  const [expandedSprintId, setExpandedSprintId] = useState<string | null>(null)
  const [burndownKey, setBurndownKey] = useState(0)
  const [showArchived, setShowArchived] = useState(false)

  const [statusDialog, setStatusDialog] = useState<{
    sprintId: string; sprintName: string; nextStatus: string; reviewComment: string; retrospectiveMemo: string;
  } | null>(null)

  const [form, setForm] = useState({
    sprintName: "", startDate: "", endDate: "", sprintGoal: "", capacity: 0,
  })

  const fetchSprints = useCallback(async () => {
    const res = await fetch(`/api/projects/${projectId}/sprints`)
    if (res.ok) setSprints(await res.json())
  }, [projectId])

  const fetchReadyPbItems = useCallback(async () => {
    const res = await fetch(`/api/projects/${projectId}/backlog`)
    if (res.ok) {
      const data = await res.json()
      setReadyPbItems(data.readyItems)
    }
  }, [projectId])

  const fetchEvents = useCallback(async () => {
    const res = await fetch(`/api/projects/${projectId}/events`)
    if (res.ok) setEvents(await res.json())
  }, [projectId])

  const fetchMembers = useCallback(async () => {
    const res = await fetch(`/api/projects/${projectId}/members`)
    if (res.ok) setMembers(await res.json())
  }, [projectId])

  useEffect(() => {
    fetchSprints()
    fetchReadyPbItems()
    fetchEvents()
    fetchMembers()
    fetch(`/api/projects/${projectId}`)
      .then((r) => r.json())
      .then((p) => {
        setProjectSettings({
          defaultCapacity: p.defaultCapacity ?? 0,
          sprintDurationWeeks: p.sprintDurationWeeks ?? 1,
          pointUnit: p.pointUnit ?? t.pointUnitManDay,
          pointDescription: p.pointDescription ?? null,
        })
      })
  }, [fetchSprints, fetchReadyPbItems, fetchEvents, fetchMembers, projectId])

  function togglePbSelection(id: string) {
    setSelectedPbIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const selectedWorkload = readyPbItems
    .filter((item) => selectedPbIds.has(item.id))
    .reduce((sum, item) => sum + item.workloadScore, 0)

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    const res = await fetch(`/api/projects/${projectId}/sprints`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...form, sprintGoal: form.sprintGoal || undefined,
        selectedPbIds: Array.from(selectedPbIds),
      }),
    })
    if (res.ok) {
      setShowForm(false)
      setForm({ sprintName: "", startDate: "", endDate: "", sprintGoal: "", capacity: 0 })
      setSelectedPbIds(new Set())
      fetchSprints()
      fetchReadyPbItems()
      setBurndownKey((k) => k + 1)
    }
  }

  function requestStatusChange(sprintId: string, nextStatus: string) {
    if (nextStatus === "review" || nextStatus === "done") {
      const sprint = sprints.find((s) => s.id === sprintId)
      setStatusDialog({
        sprintId, sprintName: sprint?.sprintName ?? "", nextStatus,
        reviewComment: sprint?.reviewComment ?? "", retrospectiveMemo: sprint?.retrospectiveMemo ?? "",
      })
    } else {
      updateSprintStatus(sprintId, nextStatus, null, null)
    }
  }

  async function updateSprintStatus(
    sprintId: string, status: string, reviewComment: string | null, retrospectiveMemo: string | null
  ) {
    const payload: Record<string, unknown> = { status }
    if (reviewComment !== null) payload.reviewComment = reviewComment || null
    if (retrospectiveMemo !== null) payload.retrospectiveMemo = retrospectiveMemo || null
    const res = await fetch(`/api/projects/${projectId}/sprints/${sprintId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    })
    if (res.ok) {
      fetchSprints()
      setBurndownKey((k) => k + 1)
    }
  }

  async function handleStatusDialogSubmit() {
    if (!statusDialog) return
    await updateSprintStatus(
      statusDialog.sprintId, statusDialog.nextStatus,
      statusDialog.reviewComment, statusDialog.retrospectiveMemo
    )
    setStatusDialog(null)
  }

  function openTaskForm(sprintId: string, pbItemId?: string) {
    setTaskFormSprintId(sprintId)
    setEditingTaskId(null)
    setTaskForm({ pbItemId: pbItemId || "", taskName: "", assignee: "", estimatedHours: "", actualHours: "", status: "todo" })
    setShowTaskForm(true)
  }

  function startEditTask(sprintId: string, task: SprintItem) {
    setTaskFormSprintId(sprintId)
    setEditingTaskId(task.id)
    setTaskForm({
      pbItemId: task.pbItem.id, taskName: task.taskName ?? "",
      assignee: task.assignee ?? "", estimatedHours: task.estimatedHours?.toString() ?? "",
      actualHours: task.actualHours?.toString() ?? "", status: task.status,
    })
    setShowTaskForm(true)
  }

  async function handleTaskSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (editingTaskId) {
      const payload: Record<string, unknown> = {}
      if (taskForm.taskName) payload.taskName = taskForm.taskName
      if (taskForm.assignee !== undefined) payload.assignee = taskForm.assignee || null
      if (taskForm.estimatedHours) payload.estimatedHours = parseFloat(taskForm.estimatedHours)
      else payload.estimatedHours = null
      if (taskForm.actualHours) payload.actualHours = parseFloat(taskForm.actualHours)
      else payload.actualHours = null
      if (taskForm.status) payload.status = taskForm.status

      const res = await fetch(
        `/api/projects/${projectId}/sprints/${taskFormSprintId}/tasks/${editingTaskId}`,
        { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) }
      )
      if (res.ok) {
        setShowTaskForm(false)
        fetchSprints()
        setBurndownKey((k) => k + 1)
      } else {
        const err = await res.json().catch(() => null)
        alert(`${t.sprintUpdateFailed}: ${err?.error || res.statusText}`)
      }
    } else {
      const res = await fetch(
        `/api/projects/${projectId}/sprints/${taskFormSprintId}/tasks`,
        {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            pbItemId: taskForm.pbItemId, taskName: taskForm.taskName,
            assignee: taskForm.assignee || null,
            estimatedHours: taskForm.estimatedHours ? parseFloat(taskForm.estimatedHours) : null,
          }),
        }
      )
      if (res.ok) {
        setShowTaskForm(false)
        fetchSprints()
        setBurndownKey((k) => k + 1)
      } else {
        const err = await res.json().catch(() => null)
        alert(`${t.sprintAddFailed}: ${err?.error || res.statusText}`)
      }
    }
  }

  async function handleDeleteTask(sprintId: string, taskId: string) {
    if (!await confirm({ message: t.sprintDeleteTaskConfirm, confirmLabel: t.delete, cancelLabel: t.cancel, variant: "danger" })) return
    const res = await fetch(
      `/api/projects/${projectId}/sprints/${sprintId}/tasks/${taskId}`, { method: "DELETE" }
    )
    if (res.ok) {
      fetchSprints()
      setBurndownKey((k) => k + 1)
    }
  }

  async function quickUpdateTaskStatus(sprintId: string, taskId: string, status: string) {
    const res = await fetch(
      `/api/projects/${projectId}/sprints/${sprintId}/tasks/${taskId}`,
      { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }) }
    )
    if (res.ok) {
      fetchSprints()
      setBurndownKey((k) => k + 1)
    }
  }

  function openEventForm(dateStr?: string) {
    setEditingEventId(null)
    setEventForm({
      title: "", description: "", date: dateStr || new Date().toISOString().split("T")[0],
      endDate: "", color: "blue", sprintId: "",
    })
    setShowEventForm(true)
  }

  function startEditEvent(ev: CalendarEvent) {
    setEditingEventId(ev.id)
    setEventForm({
      title: ev.title, description: ev.description ?? "",
      date: ev.date.split("T")[0], endDate: ev.endDate ? ev.endDate.split("T")[0] : "",
      color: ev.color, sprintId: ev.sprintId ?? "",
    })
    setShowEventForm(true)
  }

  async function handleEventSubmit(e: React.FormEvent) {
    e.preventDefault()
    const url = editingEventId
      ? `/api/projects/${projectId}/events/${editingEventId}`
      : `/api/projects/${projectId}/events`
    const method = editingEventId ? "PATCH" : "POST"
    const res = await fetch(url, {
      method, headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...eventForm, endDate: eventForm.endDate || undefined,
        sprintId: eventForm.sprintId || undefined,
      }),
    })
    if (res.ok) {
      setShowEventForm(false)
      setEditingEventId(null)
      fetchEvents()
    }
  }

  async function handleDeleteEvent(eventId: string) {
    if (!await confirm({ message: t.eventDeleteConfirm, confirmLabel: t.delete, cancelLabel: t.cancel, variant: "danger" })) return
    const res = await fetch(`/api/projects/${projectId}/events/${eventId}`, { method: "DELETE" })
    if (res.ok) fetchEvents()
  }

  async function handleDeleteSprint(sprintId: string) {
    if (!await confirm({ message: t.sprintDeleteFullConfirm, confirmLabel: t.delete, cancelLabel: t.cancel, variant: "danger" })) return
    try {
      const res = await fetch(`/api/projects/${projectId}/sprints/${sprintId}`, { method: "DELETE" })
      if (res.ok) {
        fetchSprints()
        setBurndownKey((k) => k + 1)
      } else {
        const err = await res.json().catch(() => null)
        alert(`${t.error}: ${err?.error || res.statusText}`)
      }
    } catch {
      alert(t.error)
    }
  }

  const doneSprints = sprints.filter((s) => s.status === "done" || s.status === "archived")
  const avgActual = doneSprints.length > 0
    ? Math.round(doneSprints.reduce((sum, s) => sum + s.actualScore, 0) / doneSprints.length)
    : null

  const locale = language === "ja" ? "ja-JP" : language === "id" ? "id-ID" : "en-US"
  const archivedSprints = sprints.filter((s) => s.status === "archived")

  return (
    <div>
      {showEventForm && (
        <EventFormModal eventForm={eventForm} editingEventId={editingEventId} sprints={sprints}
          onSubmit={handleEventSubmit} onCancel={() => setShowEventForm(false)} onChange={setEventForm} />
      )}
      {showTaskForm && (
        <TaskFormModal taskForm={taskForm} editingTaskId={editingTaskId}
          sprint={sprints.find((s) => s.id === taskFormSprintId)} members={members}
          pointUnit={projectSettings?.pointUnit ?? ""}
          onSubmit={handleTaskSubmit} onCancel={() => setShowTaskForm(false)} onChange={setTaskForm} />
      )}
      {statusDialog && (
        <SprintStatusDialog sprint={sprints.find((s) => s.id === statusDialog.sprintId)}
          dialog={statusDialog} onDialogChange={setStatusDialog}
          onSubmit={handleStatusDialogSubmit} onCancel={() => setStatusDialog(null)} />
      )}

      {/* ── Page Header ── */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <IconBolt className="w-7 h-7 text-blue-500" />
          <h1 className="text-2xl font-bold text-gray-900">{pt.sprintTitle}</h1>
          {avgActual !== null && (
            <span className="inline-flex items-center gap-1.5 text-sm bg-blue-50 text-blue-700 border border-blue-200 px-3 py-1 rounded-full font-medium">
              <IconChartBar className="w-4 h-4" />
              {t.sprintAvgScore.replace("{count}", String(doneSprints.length))}: {avgActual}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => openEventForm()}
            className="inline-flex items-center gap-1.5 px-3 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 text-sm font-medium transition-colors shadow-sm">
            <IconEventAdd className="w-4 h-4" />
            {t.eventAdd}
          </button>
          <button onClick={() => setShowCalendar(!showCalendar)}
            className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${showCalendar ? "bg-gray-200 text-gray-700 hover:bg-gray-300" : "bg-gray-100 text-gray-500 hover:bg-gray-200"}`}>
            <IconCalendar className="w-4 h-4" />
            {showCalendar ? t.calendarHide : t.calendarShow}
          </button>
          <button onClick={() => setShowArchived(!showArchived)}
            className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${showArchived ? "bg-slate-200 text-slate-700 hover:bg-slate-300" : "bg-gray-100 text-gray-500 hover:bg-gray-200"}`}>
            <IconArchive className="w-4 h-4" />
            {showArchived ? t.sprintArchivedSprints : t.sprintArchivedSprints}
            {archivedSprints.length > 0 && <span className="text-xs bg-white/60 px-1.5 rounded-full">{archivedSprints.length}</span>}
          </button>
          <button onClick={() => {
            if (projectSettings) {
              const start = new Date()
              const end = new Date()
              end.setDate(end.getDate() + projectSettings.sprintDurationWeeks * 7)
              setForm({
                sprintName: "", startDate: start.toISOString().split("T")[0],
                endDate: end.toISOString().split("T")[0], sprintGoal: "",
                capacity: projectSettings.defaultCapacity,
              })
            }
            setSelectedPbIds(new Set())
            setShowForm(true)
          }}
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-lg hover:from-blue-700 hover:to-blue-800 text-sm font-medium transition-all shadow-sm">
            <IconPlus className="w-4 h-4" />
            {t.sprintCreate}
          </button>
        </div>
      </div>

      <SprintCalendar events={events} sprints={sprints} onAddEvent={openEventForm}
        onEditEvent={startEditEvent} onDeleteEvent={handleDeleteEvent} showCalendar={showCalendar}
        onToggle={() => setShowCalendar(!showCalendar)} currentMonth={calendarMonth}
        onMonthChange={setCalendarMonth} />

      {sprints.length > 0 && <BurndownChart projectId={projectId} refreshKey={burndownKey} />}

      {/* ── Sprint Creation Form ── */}
      {showForm && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden mb-6">
          <div className="h-1 bg-gradient-to-r from-blue-500 via-violet-500 to-blue-500" />
          <div className="p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">{t.sprintNewSprint}</h2>

            {avgActual !== null && (
              <div className="inline-flex items-center gap-2 bg-blue-50 border border-blue-200 rounded-lg px-4 py-2.5 mb-4 text-sm text-blue-800">
                <IconChartBar className="w-4 h-4 text-blue-500" />
                {t.sprintAvgScore.replace("{count}", String(doneSprints.length))}: <strong>{avgActual}</strong>
              </div>
            )}

            <form onSubmit={handleCreate} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="flex items-center gap-1.5 text-sm font-medium text-gray-700 mb-1.5">
                    <IconTag className="w-4 h-4 text-gray-400" /> {t.sprintName}
                  </label>
                  <input type="text" value={form.sprintName} onChange={(e) => setForm({ ...form, sprintName: e.target.value })}
                    required placeholder="Sprint-2026-03-W1"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-shadow" />
                </div>
                <div>
                  <label className="flex items-center gap-1.5 text-sm font-medium text-gray-700 mb-1.5">
                    <IconGauge className="w-4 h-4 text-gray-400" /> {t.sprintCapacity}
                  </label>
                  <div className="flex items-center gap-2">
                    <input type="number" min={0} value={form.capacity} onChange={(e) => setForm({ ...form, capacity: parseInt(e.target.value) || 0 })}
                      required className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-shadow" />
                    {projectSettings && <span className="text-xs text-gray-500 whitespace-nowrap">{projectSettings.pointUnit}</span>}
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="flex items-center gap-1.5 text-sm font-medium text-gray-700 mb-1.5">
                    <IconCalendar className="w-4 h-4 text-gray-400" /> {t.sprintStartDate}
                  </label>
                  <input type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })}
                    required className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500" />
                </div>
                <div>
                  <label className="flex items-center gap-1.5 text-sm font-medium text-gray-700 mb-1.5">
                    <IconCalendar className="w-4 h-4 text-gray-400" /> {t.sprintEndDate}
                  </label>
                  <input type="date" value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })}
                    required className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500" />
                </div>
              </div>
              <div>
                <label className="flex items-center gap-1.5 text-sm font-medium text-gray-700 mb-1.5">
                  <IconTarget className="w-4 h-4 text-gray-400" /> {pt.sprintGoal}
                </label>
                <textarea value={form.sprintGoal} onChange={(e) => setForm({ ...form, sprintGoal: e.target.value })}
                  rows={2} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-shadow" />
              </div>

              {/* PB Selection */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="flex items-center gap-1.5 text-sm font-medium text-gray-700">
                    <IconClipboard className="w-4 h-4 text-gray-400" /> {t.sprintPbImport}
                  </label>
                  <span className="text-sm text-gray-500">
                    {t.sprintSelectedWorkload}: <strong className={selectedWorkload > form.capacity ? "text-red-600" : "text-blue-600"}>{selectedWorkload}</strong> / {form.capacity}
                  </span>
                </div>
                {form.capacity > 0 && (
                  <div className="w-full bg-gray-100 rounded-full h-2.5 mb-3">
                    <div className={`h-2.5 rounded-full transition-all duration-300 ${selectedWorkload > form.capacity ? "bg-red-500" : selectedWorkload > form.capacity * 0.8 ? "bg-amber-400" : "bg-emerald-500"}`}
                      style={{ width: `${Math.min((selectedWorkload / form.capacity) * 100, 100)}%` }} />
                  </div>
                )}
                <div className="border border-gray-200 rounded-lg max-h-48 overflow-y-auto">
                  {readyPbItems.length === 0 ? (
                    <p className="text-sm text-gray-400 text-center py-4">{t.sprintNoPbReady}</p>
                  ) : readyPbItems.map((item) => (
                    <label key={item.id} className={`flex items-center gap-3 px-3 py-2.5 border-b border-gray-100 last:border-0 cursor-pointer hover:bg-blue-50/50 transition-colors ${selectedPbIds.has(item.id) ? "bg-blue-50" : ""}`}>
                      <input type="checkbox" checked={selectedPbIds.has(item.id)} onChange={() => togglePbSelection(item.id)}
                        className="rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
                      <IconClipboard className="w-3.5 h-3.5 text-gray-300 flex-shrink-0" />
                      <span className="text-xs font-mono text-gray-400">#{item.displayId}</span>
                      <span className="flex-1 text-sm truncate">{item.initiative || item.userStory || t.sprintNotEntered}</span>
                      <span className="text-xs font-medium bg-orange-50 text-orange-700 border border-orange-200 px-2 py-0.5 rounded-full">{item.workloadScore}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="flex gap-2 pt-2">
                <button type="submit"
                  className="inline-flex items-center gap-1.5 px-4 py-2 bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-lg hover:from-blue-700 hover:to-blue-800 text-sm font-medium transition-all shadow-sm">
                  <IconPlus className="w-4 h-4" />
                  {t.sprintCreateWithCount.replace("{count}", String(selectedPbIds.size))}
                </button>
                <button type="button" onClick={() => setShowForm(false)}
                  className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 text-sm font-medium transition-colors">
                  {t.cancel}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Sprint list ── */}
      <div className="space-y-4">
        {sprints.filter((s) => s.status !== "archived").map((sprint) => (
          <SprintCard key={sprint.id} sprint={sprint} events={events}
            isExpanded={expandedSprintId === sprint.id}
            onToggleExpand={() => setExpandedSprintId(expandedSprintId === sprint.id ? null : sprint.id)}
            onRequestStatusChange={requestStatusChange} onUpdateSprintStatus={updateSprintStatus}
            onDeleteSprint={handleDeleteSprint} onOpenTaskForm={openTaskForm}
            onStartEditTask={startEditTask} onDeleteTask={handleDeleteTask}
            onQuickUpdateTaskStatus={quickUpdateTaskStatus}
            onOpenStatusDialog={(s) => setStatusDialog({
              sprintId: s.id, sprintName: s.sprintName, nextStatus: s.status,
              reviewComment: s.reviewComment ?? "", retrospectiveMemo: s.retrospectiveMemo ?? "",
            })}
            pointUnit={projectSettings?.pointUnit ?? ""} />
        ))}

        {sprints.filter((s) => s.status !== "archived").length === 0 && archivedSprints.length === 0 && (
          <div className="text-center py-12 text-gray-500">
            <p>{t.sprintNoSprints}</p>
          </div>
        )}
      </div>

      {/* ── Archived sprints ── */}
      {archivedSprints.length > 0 && (
        <div className="mt-6">
          <button onClick={() => setShowArchived(!showArchived)}
            className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700 mb-3 transition-colors">
            <IconChevron open={showArchived} className="w-4 h-4" />
            <IconArchive className="w-4 h-4" />
            <span className="font-medium">{t.sprintArchivedSprints} ({archivedSprints.length})</span>
          </button>
          {showArchived && (
            <div className="space-y-3 opacity-80">
              {archivedSprints.map((sprint) => {
                const seenPbIds = new Set<string>()
                const currentWorkload = sprint.items.reduce((sum, i) => {
                  const pbId = i.pbItem?.id
                  if (!pbId || seenPbIds.has(pbId)) return sum
                  seenPbIds.add(pbId)
                  return sum + (i.pbItem?.workloadScore ?? 0)
                }, 0)
                const totalTasks = sprint.items.length
                const doneTasks = sprint.items.filter((i) => i.status === "done").length

                return (
                  <div key={sprint.id} className="bg-gray-50 rounded-xl border border-gray-200 p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <IconArchive className="w-4 h-4 text-gray-400" />
                        <h3 className="text-sm font-semibold text-gray-600">{sprint.sprintName}</h3>
                        <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium ${statusColors[sprint.status]}`}>
                          {statusLabels[sprint.status]}
                        </span>
                        <span className="text-xs text-gray-400">
                          {t.sprintTasks}: {doneTasks}/{totalTasks} | {t.sprintWorkload}: {currentWorkload}/{sprint.capacity}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="inline-flex items-center gap-1 text-xs text-gray-400">
                          <IconCalendar className="w-3.5 h-3.5" />
                          {new Date(sprint.startDate).toLocaleDateString(locale)} - {new Date(sprint.endDate).toLocaleDateString(locale)}
                        </span>
                        <button onClick={() => updateSprintStatus(sprint.id, "done", null, null)}
                          className="inline-flex items-center gap-1 text-xs text-blue-500 hover:text-blue-700 border border-blue-200 px-2.5 py-1 rounded-lg transition-colors">
                          {t.sprintUnarchive}
                        </button>
                        <button onClick={() => handleDeleteSprint(sprint.id)}
                          className="p-1 text-gray-300 hover:text-red-500 rounded-lg hover:bg-red-50 transition-colors">
                          <IconDelete className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                    {(sprint.reviewComment || sprint.retrospectiveMemo) && (
                      <div className="mt-2 flex gap-2">
                        {sprint.reviewComment && (
                          <div className="text-xs text-violet-600 bg-violet-50 border border-violet-200 px-2.5 py-1 rounded-lg">
                            {t.sprintReviewComment}: {sprint.reviewComment.substring(0, 100)}{sprint.reviewComment.length > 100 ? "..." : ""}
                          </div>
                        )}
                        {sprint.retrospectiveMemo && (
                          <div className="text-xs text-blue-600 bg-blue-50 border border-blue-200 px-2.5 py-1 rounded-lg">
                            {t.sprintRetrospectiveMemo}: {sprint.retrospectiveMemo.substring(0, 100)}{sprint.retrospectiveMemo.length > 100 ? "..." : ""}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
