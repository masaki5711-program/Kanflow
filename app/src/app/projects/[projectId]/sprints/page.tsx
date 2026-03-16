"use client"

import { useEffect, useState, useCallback } from "react"
import { useParams } from "next/navigation"
import BurndownChart from "@/components/burndown-chart"
import { useLanguage } from "@/lib/language-context"
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

const statusColors: Record<string, string> = {
  planning: "bg-yellow-100 text-yellow-800",
  active: "bg-blue-100 text-blue-800",
  review: "bg-purple-100 text-purple-800",
  done: "bg-green-100 text-green-800",
  archived: "bg-gray-100 text-gray-600",
}

export default function SprintsPage() {
  const params = useParams()
  const projectId = params.projectId as string
  const { language, t, pt } = useLanguage()

  const statusLabels: Record<string, string> = {
    planning: t.sprintStatusPlanning,
    active: t.sprintStatusActive,
    review: t.sprintStatusReview,
    done: t.sprintStatusDone,
    archived: t.sprintStatusArchived,
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

  // Event form
  const [showEventForm, setShowEventForm] = useState(false)
  const [editingEventId, setEditingEventId] = useState<string | null>(null)
  const [eventForm, setEventForm] = useState({
    title: "",
    description: "",
    date: "",
    endDate: "",
    color: "blue",
    sprintId: "",
  })

  // Task form
  const [showTaskForm, setShowTaskForm] = useState(false)
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null)
  const [taskFormSprintId, setTaskFormSprintId] = useState<string>("")
  const [taskForm, setTaskForm] = useState({
    pbItemId: "",
    taskName: "",
    assignee: "",
    estimatedHours: "",
    actualHours: "",
    status: "todo" as string,
  })

  // Expanded sprint
  const [expandedSprintId, setExpandedSprintId] = useState<string | null>(null)
  const [burndownKey, setBurndownKey] = useState(0)
  const [showArchived, setShowArchived] = useState(false)

  // Sprint status change dialog
  const [statusDialog, setStatusDialog] = useState<{
    sprintId: string
    sprintName: string
    nextStatus: string
    reviewComment: string
    retrospectiveMemo: string
  } | null>(null)

  const [form, setForm] = useState({
    sprintName: "",
    startDate: "",
    endDate: "",
    sprintGoal: "",
    capacity: 0,
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
        ...form,
        sprintGoal: form.sprintGoal || undefined,
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

  // Sprint status update — show dialog for review/done transitions
  function requestStatusChange(sprintId: string, nextStatus: string) {
    if (nextStatus === "review" || nextStatus === "done") {
      const sprint = sprints.find((s) => s.id === sprintId)
      setStatusDialog({
        sprintId,
        sprintName: sprint?.sprintName ?? "",
        nextStatus,
        reviewComment: sprint?.reviewComment ?? "",
        retrospectiveMemo: sprint?.retrospectiveMemo ?? "",
      })
    } else {
      updateSprintStatus(sprintId, nextStatus, null, null)
    }
  }

  async function updateSprintStatus(
    sprintId: string,
    status: string,
    reviewComment: string | null,
    retrospectiveMemo: string | null
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
      statusDialog.sprintId,
      statusDialog.nextStatus,
      statusDialog.reviewComment,
      statusDialog.retrospectiveMemo
    )
    setStatusDialog(null)
  }

  // Task handlers
  function openTaskForm(sprintId: string, pbItemId?: string) {
    setTaskFormSprintId(sprintId)
    setEditingTaskId(null)
    setTaskForm({
      pbItemId: pbItemId || "",
      taskName: "",
      assignee: "",
      estimatedHours: "",
      actualHours: "",
      status: "todo",
    })
    setShowTaskForm(true)
  }

  function startEditTask(sprintId: string, task: SprintItem) {
    setTaskFormSprintId(sprintId)
    setEditingTaskId(task.id)
    setTaskForm({
      pbItemId: task.pbItem.id,
      taskName: task.taskName ?? "",
      assignee: task.assignee ?? "",
      estimatedHours: task.estimatedHours?.toString() ?? "",
      actualHours: task.actualHours?.toString() ?? "",
      status: task.status,
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
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }
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
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            pbItemId: taskForm.pbItemId,
            taskName: taskForm.taskName,
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
    if (!confirm(t.sprintDeleteTaskConfirm)) return
    const res = await fetch(
      `/api/projects/${projectId}/sprints/${sprintId}/tasks/${taskId}`,
      { method: "DELETE" }
    )
    if (res.ok) {
      fetchSprints()
      setBurndownKey((k) => k + 1)
    }
  }

  async function quickUpdateTaskStatus(sprintId: string, taskId: string, status: string) {
    const res = await fetch(
      `/api/projects/${projectId}/sprints/${sprintId}/tasks/${taskId}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      }
    )
    if (res.ok) {
      fetchSprints()
      setBurndownKey((k) => k + 1)
    }
  }

  // Event handlers
  function openEventForm(dateStr?: string) {
    setEditingEventId(null)
    setEventForm({
      title: "",
      description: "",
      date: dateStr || new Date().toISOString().split("T")[0],
      endDate: "",
      color: "blue",
      sprintId: "",
    })
    setShowEventForm(true)
  }

  function startEditEvent(ev: CalendarEvent) {
    setEditingEventId(ev.id)
    setEventForm({
      title: ev.title,
      description: ev.description ?? "",
      date: ev.date.split("T")[0],
      endDate: ev.endDate ? ev.endDate.split("T")[0] : "",
      color: ev.color,
      sprintId: ev.sprintId ?? "",
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
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...eventForm,
        endDate: eventForm.endDate || undefined,
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
    if (!confirm(t.eventDeleteConfirm)) return
    const res = await fetch(`/api/projects/${projectId}/events/${eventId}`, {
      method: "DELETE",
    })
    if (res.ok) {
      fetchEvents()
    }
  }

  async function handleDeleteSprint(sprintId: string) {
    if (!confirm(t.sprintDeleteFullConfirm)) return
    const res = await fetch(`/api/projects/${projectId}/sprints/${sprintId}`, {
      method: "DELETE",
    })
    if (res.ok) {
      fetchSprints()
      setBurndownKey((k) => k + 1)
    }
  }

  const doneSprints = sprints.filter((s) => s.status === "done" || s.status === "archived")
  const avgActual = doneSprints.length > 0
    ? Math.round(doneSprints.reduce((sum, s) => sum + s.actualScore, 0) / doneSprints.length)
    : null

  return (
    <div>
      {showEventForm && (
        <EventFormModal
          eventForm={eventForm}
          editingEventId={editingEventId}
          sprints={sprints}
          onSubmit={handleEventSubmit}
          onCancel={() => setShowEventForm(false)}
          onChange={setEventForm}
        />
      )}
      {showTaskForm && (
        <TaskFormModal
          taskForm={taskForm}
          editingTaskId={editingTaskId}
          sprint={sprints.find((s) => s.id === taskFormSprintId)}
          members={members}
          pointUnit={projectSettings?.pointUnit ?? ""}
          onSubmit={handleTaskSubmit}
          onCancel={() => setShowTaskForm(false)}
          onChange={setTaskForm}
        />
      )}
      {statusDialog && (
        <SprintStatusDialog
          sprint={sprints.find((s) => s.id === statusDialog.sprintId)}
          dialog={statusDialog}
          onDialogChange={setStatusDialog}
          onSubmit={handleStatusDialogSubmit}
          onCancel={() => setStatusDialog(null)}
        />
      )}

      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">{pt.sprintTitle}</h1>
        <div className="flex gap-2">
          <button
            onClick={() => openEventForm()}
            className="px-3 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 text-sm"
          >
            {t.eventAdd}
          </button>
          <button
            onClick={() => setShowCalendar(!showCalendar)}
            className={`px-3 py-2 rounded-md text-sm ${showCalendar ? "bg-gray-200 text-gray-700" : "bg-gray-100 text-gray-500"}`}
          >
            {showCalendar ? t.calendarHide : t.calendarShow}
          </button>
          <button
            onClick={() => {
              if (projectSettings) {
                const start = new Date()
                const end = new Date()
                end.setDate(end.getDate() + projectSettings.sprintDurationWeeks * 7)
                setForm({
                  sprintName: "",
                  startDate: start.toISOString().split("T")[0],
                  endDate: end.toISOString().split("T")[0],
                  sprintGoal: "",
                  capacity: projectSettings.defaultCapacity,
                })
              }
              setSelectedPbIds(new Set())
              setShowForm(true)
            }}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 text-sm"
          >
            {t.sprintCreate}
          </button>
        </div>
      </div>

      <SprintCalendar
        events={events}
        sprints={sprints}
        onAddEvent={openEventForm}
        onEditEvent={startEditEvent}
        onDeleteEvent={handleDeleteEvent}
        showCalendar={showCalendar}
        onToggle={() => setShowCalendar(!showCalendar)}
        currentMonth={calendarMonth}
        onMonthChange={setCalendarMonth}
      />

      {/* Burndown Chart - project-wide */}
      {sprints.length > 0 && <BurndownChart projectId={projectId} refreshKey={burndownKey} />}

      {showForm && (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
          <h2 className="text-lg font-medium mb-4">{t.sprintNewSprint}</h2>

          {avgActual !== null && (
            <div className="bg-blue-50 border border-blue-200 rounded-md p-3 mb-4 text-sm text-blue-800">
              {t.sprintAvgScore.replace("{count}", String(doneSprints.length))}: <strong>{avgActual}</strong>
            </div>
          )}

          <form onSubmit={handleCreate} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t.sprintName}</label>
                <input type="text" value={form.sprintName} onChange={(e) => setForm({ ...form, sprintName: e.target.value })} required placeholder="例: Sprint-2026-03-W1" className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t.sprintCapacity}</label>
                <div className="flex items-center gap-2">
                  <input type="number" min={0} value={form.capacity} onChange={(e) => setForm({ ...form, capacity: parseInt(e.target.value) || 0 })} required className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  {projectSettings && <span className="text-xs text-gray-500 whitespace-nowrap">{projectSettings.pointUnit}</span>}
                </div>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t.sprintStartDate}</label>
                <input type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} required className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t.sprintEndDate}</label>
                <input type="date" value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} required className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm" />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{pt.sprintGoal}</label>
              <textarea value={form.sprintGoal} onChange={(e) => setForm({ ...form, sprintGoal: e.target.value })} rows={2} className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>

            {/* PB Selection */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="block text-sm font-medium text-gray-700">{t.sprintPbImport}</label>
                <span className="text-sm text-gray-500">
                  {t.sprintSelectedWorkload}: <strong className={selectedWorkload > form.capacity ? "text-red-600" : "text-blue-600"}>{selectedWorkload}</strong> / {form.capacity}
                </span>
              </div>
              {form.capacity > 0 && (
                <div className="w-full bg-gray-200 rounded-full h-2 mb-3">
                  <div className={`h-2 rounded-full transition-all ${selectedWorkload > form.capacity ? "bg-red-500" : selectedWorkload > form.capacity * 0.8 ? "bg-yellow-500" : "bg-green-500"}`} style={{ width: `${Math.min((selectedWorkload / form.capacity) * 100, 100)}%` }} />
                </div>
              )}
              <div className="border border-gray-200 rounded-md max-h-48 overflow-y-auto">
                {readyPbItems.length === 0 ? (
                  <p className="text-sm text-gray-400 text-center py-4">{t.sprintNoPbReady}</p>
                ) : readyPbItems.map((item) => (
                  <label key={item.id} className={`flex items-center gap-3 px-3 py-2 border-b border-gray-100 last:border-0 cursor-pointer hover:bg-gray-50 ${selectedPbIds.has(item.id) ? "bg-blue-50" : ""}`}>
                    <input type="checkbox" checked={selectedPbIds.has(item.id)} onChange={() => togglePbSelection(item.id)} className="rounded border-gray-300 text-blue-600" />
                    <span className="text-xs font-mono text-gray-400">#{item.displayId}</span>
                    <span className="flex-1 text-sm truncate">{item.initiative || item.userStory || t.sprintNotEntered}</span>
                    <span className="text-xs font-medium bg-orange-100 text-orange-800 px-2 py-0.5 rounded">{item.workloadScore}</span>
                  </label>
                ))}
              </div>
            </div>

            <div className="flex gap-2">
              <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 text-sm">{t.sprintCreateWithCount.replace("{count}", String(selectedPbIds.size))}</button>
              <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300 text-sm">{t.cancel}</button>
            </div>
          </form>
        </div>
      )}

      {/* Sprint list */}
      <div className="space-y-4">
        {sprints.filter((s) => s.status !== "archived").map((sprint) => (
          <SprintCard
            key={sprint.id}
            sprint={sprint}
            events={events}
            isExpanded={expandedSprintId === sprint.id}
            onToggleExpand={() => setExpandedSprintId(expandedSprintId === sprint.id ? null : sprint.id)}
            onRequestStatusChange={requestStatusChange}
            onUpdateSprintStatus={updateSprintStatus}
            onDeleteSprint={handleDeleteSprint}
            onOpenTaskForm={openTaskForm}
            onStartEditTask={startEditTask}
            onDeleteTask={handleDeleteTask}
            onQuickUpdateTaskStatus={quickUpdateTaskStatus}
            onOpenStatusDialog={(s) => setStatusDialog({
              sprintId: s.id,
              sprintName: s.sprintName,
              nextStatus: s.status,
              reviewComment: s.reviewComment ?? "",
              retrospectiveMemo: s.retrospectiveMemo ?? "",
            })}
            pointUnit={projectSettings?.pointUnit ?? ""}
          />
        ))}

        {sprints.filter((s) => s.status !== "archived").length === 0 && sprints.filter((s) => s.status === "archived").length === 0 && (
          <div className="text-center py-12 text-gray-500">
            <p>{t.sprintNoSprints}</p>
          </div>
        )}
      </div>

      {/* Archived sprints section */}
      {sprints.filter((s) => s.status === "archived").length > 0 && (
        <div className="mt-6">
          <button
            onClick={() => setShowArchived(!showArchived)}
            className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700 mb-3"
          >
            <span>{showArchived ? "\u25BC" : "\u25B6"}</span>
            <span>{t.sprintArchivedSprints} ({sprints.filter((s) => s.status === "archived").length})</span>
          </button>
          {showArchived && (
            <div className="space-y-3 opacity-75">
              {sprints.filter((s) => s.status === "archived").map((sprint) => {
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
                  <div key={sprint.id} className="bg-gray-50 rounded-lg shadow-sm border border-gray-200 p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <h3 className="text-sm font-semibold text-gray-600">{sprint.sprintName}</h3>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusColors[sprint.status]}`}>
                          {statusLabels[sprint.status]}
                        </span>
                        <span className="text-xs text-gray-400">
                          {t.sprintTasks}: {doneTasks}/{totalTasks} | {t.sprintWorkload}: {currentWorkload}/{sprint.capacity}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-gray-400">
                          {new Date(sprint.startDate).toLocaleDateString(language === "ja" ? "ja-JP" : language === "id" ? "id-ID" : "en-US")} - {new Date(sprint.endDate).toLocaleDateString(language === "ja" ? "ja-JP" : language === "id" ? "id-ID" : "en-US")}
                        </span>
                        <button
                          onClick={() => updateSprintStatus(sprint.id, "done", null, null)}
                          className="text-xs text-blue-500 hover:text-blue-700 border border-blue-300 px-2 py-0.5 rounded"
                        >
                          {t.sprintUnarchive}
                        </button>
                        <button
                          onClick={() => handleDeleteSprint(sprint.id)}
                          className="text-xs text-red-400 hover:text-red-600"
                        >
                          {t.delete}
                        </button>
                      </div>
                    </div>
                    {/* Review/Retro summary for archived */}
                    {(sprint.reviewComment || sprint.retrospectiveMemo) && (
                      <div className="mt-2 flex gap-2">
                        {sprint.reviewComment && (
                          <div className="text-xs text-purple-600 bg-purple-50 px-2 py-1 rounded">
                            {t.sprintReviewComment}: {sprint.reviewComment.substring(0, 100)}{sprint.reviewComment.length > 100 ? "..." : ""}
                          </div>
                        )}
                        {sprint.retrospectiveMemo && (
                          <div className="text-xs text-blue-600 bg-blue-50 px-2 py-1 rounded">
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
