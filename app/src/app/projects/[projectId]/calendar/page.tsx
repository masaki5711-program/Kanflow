"use client"

import { useEffect, useState, useCallback, useMemo, useRef } from "react"
import { useParams, useRouter } from "next/navigation"
import { useLanguage } from "@/lib/language-context"
import { useConfirm } from "@/components/confirm-dialog"
import WeekView from "./week-view"
import TeamView from "./team-view"
import EventModal from "./event-modal"
import MiniCalendar from "./mini-calendar"
import {
  CalendarEvent,
  Sprint,
  SprintItem,
  ProjectMember,
  EventFormState,
  ViewMode,
  emptyForm,
  eventColorBorder,
  sprintGradient,
  sprintStatusColor,
  sprintTextColor,
  toDateStr,
  isSameDay,
  buildCalendarDays,
  getWeekStart,
} from "./calendar-types"

export default function CalendarPage() {
  const params = useParams()
  const projectId = params.projectId as string
  const router = useRouter()
  const { t } = useLanguage()
  const confirm = useConfirm()

  const today = useMemo(() => new Date(), [])
  const [currentYear, setCurrentYear] = useState(today.getFullYear())
  const [currentMonth, setCurrentMonth] = useState(today.getMonth())
  const [events, setEvents] = useState<CalendarEvent[]>([])
  const [sprints, setSprints] = useState<Sprint[]>([])
  const [members, setMembers] = useState<ProjectMember[]>([])
  const [loading, setLoading] = useState(true)

  const [viewMode, setViewMode] = useState<ViewMode>("month")
  const [showModal, setShowModal] = useState(false)
  const [editingEventId, setEditingEventId] = useState<string | null>(null)
  const [eventForm, setEventForm] = useState<EventFormState>({ ...emptyForm })

  // Drag-to-create
  const [dragStart, setDragStart] = useState<string | null>(null)
  const [dragEnd, setDragEnd] = useState<string | null>(null)
  const isDragging = useRef(false)

  // Deadline popover
  const [deadlinePopover, setDeadlinePopover] = useState<{
    dateStr: string
    tasks: SprintItem[]
    sprintName: string
    x: number
    y: number
  } | null>(null)

  // Expand "+N more" events
  const [expandedDay, setExpandedDay] = useState<string | null>(null)

  const [currentWeekStart, setCurrentWeekStart] = useState(() => getWeekStart(today))

  // ── Data Fetching ────────────────────────────────────────────────

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const [evRes, spRes, memRes] = await Promise.all([
        fetch(`/api/projects/${projectId}/events`),
        fetch(`/api/projects/${projectId}/sprints`),
        fetch(`/api/projects/${projectId}/members`),
      ])
      if (evRes.ok) setEvents(await evRes.json())
      if (spRes.ok) setSprints(await spRes.json())
      if (memRes.ok) setMembers(await memRes.json())
    } catch {
      // silent
    } finally {
      setLoading(false)
    }
  }, [projectId])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  // ── Computed ─────────────────────────────────────────────────────

  const calendarDays = useMemo(
    () => buildCalendarDays(currentYear, currentMonth),
    [currentYear, currentMonth]
  )

  const taskDeadlinesByDate = useMemo(() => {
    const map: Record<string, { tasks: SprintItem[]; sprintName: string }[]> = {}
    for (const sp of sprints) {
      const endStr = sp.endDate.split("T")[0]
      if (!map[endStr]) map[endStr] = []
      map[endStr].push({ tasks: sp.items, sprintName: sp.sprintName })
    }
    return map
  }, [sprints])

  const sprintPhases = useMemo(() => {
    return sprints.map((sp) => {
      const doneCount = sp.items.filter((it) => it.status === "done").length
      const total = sp.items.length
      const progress = total > 0 ? Math.round((doneCount / total) * 100) : 0
      return { ...sp, doneCount, total, progress }
    })
  }, [sprints])

  const eventsOnDay = useCallback(
    (day: Date): CalendarEvent[] => {
      const dayStr = toDateStr(day)
      return events.filter((ev) => {
        const startStr = ev.date.split("T")[0]
        const endStr = ev.endDate ? ev.endDate.split("T")[0] : startStr
        return dayStr >= startStr && dayStr <= endStr
      })
    },
    [events]
  )

  // ── Navigation ───────────────────────────────────────────────────

  function goToday() {
    const now = new Date()
    setCurrentYear(now.getFullYear())
    setCurrentMonth(now.getMonth())
    setCurrentWeekStart(getWeekStart(now))
  }

  function goPrev() {
    if (viewMode === "week" || viewMode === "team") {
      if (viewMode === "week") {
        setCurrentWeekStart((ws) => {
          const prev = new Date(ws.getFullYear(), ws.getMonth(), ws.getDate() - 7)
          setCurrentYear(prev.getFullYear())
          setCurrentMonth(prev.getMonth())
          return prev
        })
      } else {
        if (currentMonth === 0) {
          setCurrentYear((y) => y - 1)
          setCurrentMonth(11)
        } else {
          setCurrentMonth((m) => m - 1)
        }
      }
    } else {
      if (currentMonth === 0) {
        setCurrentYear((y) => y - 1)
        setCurrentMonth(11)
      } else {
        setCurrentMonth((m) => m - 1)
      }
    }
  }

  function goNext() {
    if (viewMode === "week") {
      setCurrentWeekStart((ws) => {
        const next = new Date(ws.getFullYear(), ws.getMonth(), ws.getDate() + 7)
        setCurrentYear(next.getFullYear())
        setCurrentMonth(next.getMonth())
        return next
      })
    } else {
      if (currentMonth === 11) {
        setCurrentYear((y) => y + 1)
        setCurrentMonth(0)
      } else {
        setCurrentMonth((m) => m + 1)
      }
    }
  }

  // ── Event CRUD ───────────────────────────────────────────────────

  function openCreateForm(dateStr: string, endDateStr?: string) {
    setEditingEventId(null)
    setEventForm({ ...emptyForm, date: dateStr, endDate: endDateStr ?? "" })
    setShowModal(true)
  }

  function openEditForm(ev: CalendarEvent) {
    setEditingEventId(ev.id)
    setEventForm({
      title: ev.title,
      description: ev.description ?? "",
      date: ev.date.split("T")[0],
      endDate: ev.endDate ? ev.endDate.split("T")[0] : "",
      color: ev.color,
      sprintId: ev.sprintId ?? "",
    })
    setShowModal(true)
  }

  function closeModal() {
    setShowModal(false)
    setEditingEventId(null)
    setEventForm({ ...emptyForm })
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    if (!eventForm.title.trim() || !eventForm.date) return

    const body = {
      title: eventForm.title.trim(),
      description: eventForm.description.trim() || undefined,
      date: eventForm.date,
      endDate: eventForm.endDate || undefined,
      color: eventForm.color,
      sprintId: eventForm.sprintId || undefined,
    }

    try {
      if (editingEventId) {
        await fetch(`/api/projects/${projectId}/events/${editingEventId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        })
      } else {
        await fetch(`/api/projects/${projectId}/events`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        })
      }
      closeModal()
      await fetchData()
    } catch {
      // silent
    }
  }

  async function handleDelete() {
    if (!editingEventId) return
    const ok = await confirm({
      message: t.eventDeleteConfirm,
      variant: "danger",
    })
    if (!ok) return

    try {
      await fetch(`/api/projects/${projectId}/events/${editingEventId}`, {
        method: "DELETE",
      })
      closeModal()
      await fetchData()
    } catch {
      // silent
    }
  }

  // ── Drag to Create ──────────────────────────────────────────────

  function handleDayMouseDown(dayStr: string) {
    if (viewMode !== "month") return
    isDragging.current = true
    setDragStart(dayStr)
    setDragEnd(dayStr)
  }

  function handleDayMouseEnter(dayStr: string) {
    if (!isDragging.current) return
    setDragEnd(dayStr)
  }

  function handleDayMouseUp() {
    if (!isDragging.current || !dragStart || !dragEnd) {
      isDragging.current = false
      setDragStart(null)
      setDragEnd(null)
      return
    }
    isDragging.current = false
    const start = dragStart < dragEnd ? dragStart : dragEnd
    const end = dragStart < dragEnd ? dragEnd : dragStart
    setDragStart(null)
    setDragEnd(null)
    if (start !== end) {
      openCreateForm(start, end)
    }
  }

  function isDayInDragRange(dayStr: string): boolean {
    if (!dragStart || !dragEnd) return false
    const s = dragStart < dragEnd ? dragStart : dragEnd
    const e = dragStart < dragEnd ? dragEnd : dragStart
    return dayStr >= s && dayStr <= e
  }

  // ── Labels ──────────────────────────────────────────────────────

  const monthLabel = useMemo(() => {
    if (viewMode === "week") {
      const endOfWeek = new Date(
        currentWeekStart.getFullYear(),
        currentWeekStart.getMonth(),
        currentWeekStart.getDate() + 6
      )
      const startLabel = currentWeekStart.toLocaleDateString("default", {
        month: "short",
        day: "numeric",
      })
      const endLabel = endOfWeek.toLocaleDateString("default", {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
      return `${startLabel} - ${endLabel}`
    }
    const d = new Date(currentYear, currentMonth, 1)
    return d.toLocaleDateString("default", { year: "numeric", month: "long" })
  }, [currentYear, currentMonth, viewMode, currentWeekStart])

  // ── Deadline popover handler ─────────────────────────────────────

  function handleDeadlineBadgeClick(
    e: React.MouseEvent,
    dateStr: string,
    entries: { tasks: SprintItem[]; sprintName: string }[]
  ) {
    e.stopPropagation()
    const allTasks = entries.flatMap((en) => en.tasks)
    setDeadlinePopover({
      dateStr,
      tasks: allTasks,
      sprintName: entries.map((en) => en.sprintName).join(", "),
      x: e.clientX,
      y: e.clientY,
    })
  }

  // ── Loading ──────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="flex items-center gap-3">
          <div className="w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
          <span className="text-gray-500 font-medium">{t.loading}</span>
        </div>
      </div>
    )
  }

  // ── Render ──────────────────────────────────────────────────────

  const viewModes: { key: ViewMode; label: string }[] = [
    { key: "month", label: t.calendarMonthView },
    { key: "week", label: t.calendarWeekView },
    { key: "team", label: t.calendarTeamView },
  ]

  return (
    <div
      className="flex flex-col h-full min-h-0"
      onMouseUp={handleDayMouseUp}
      onMouseLeave={() => {
        if (isDragging.current) {
          isDragging.current = false
          setDragStart(null)
          setDragEnd(null)
        }
      }}
    >
      {/* ── Professional Header Bar ── */}
      <div className="flex items-center justify-between px-5 py-3 bg-white border-b shadow-sm shrink-0">
        {/* Left: Month/Year + Nav */}
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <button
              onClick={goPrev}
              className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-500 transition-colors"
              aria-label="Previous"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <h1 className="text-lg font-bold text-gray-900 min-w-[200px] text-center">
              {monthLabel}
            </h1>
            <button
              onClick={goNext}
              className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-500 transition-colors"
              aria-label="Next"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>
        </div>

        {/* Center: Segmented Control */}
        <div className="flex bg-gray-100 rounded-xl p-1 gap-0.5">
          {viewModes.map((vm) => (
            <button
              key={vm.key}
              onClick={() => setViewMode(vm.key)}
              className={`px-4 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                viewMode === vm.key
                  ? "bg-blue-600 text-white shadow-sm shadow-blue-200"
                  : "text-gray-500 hover:text-gray-700 hover:bg-gray-50"
              }`}
            >
              {vm.label}
            </button>
          ))}
        </div>

        {/* Right: Today + Add Event */}
        <div className="flex items-center gap-2.5">
          <button
            onClick={goToday}
            className="relative px-3.5 py-2 text-sm font-medium border border-gray-200 rounded-xl hover:bg-gray-50 text-gray-700 transition-colors"
          >
            <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 bg-red-500 rounded-full" />
            {t.ganttToday}
          </button>
          <button
            onClick={() => openCreateForm(toDateStr(today))}
            className="px-4 py-2 text-sm font-semibold bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-xl hover:from-blue-700 hover:to-blue-800 shadow-sm shadow-blue-200 transition-all flex items-center gap-1.5"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
            </svg>
            {t.eventAdd}
          </button>
        </div>
      </div>

      {/* ── Main Content ── */}
      <div className="flex flex-1 min-h-0">
        {viewMode === "team" ? (
          <TeamView
            members={members}
            sprints={sprints}
            calendarDays={calendarDays}
            currentMonth={currentMonth}
            currentYear={currentYear}
            viewMode={viewMode}
            currentWeekStart={currentWeekStart}
            today={today}
          />
        ) : viewMode === "week" ? (
          <div className="flex-1 flex flex-col min-h-0">
            <WeekView
              weekStart={currentWeekStart}
              events={events}
              weekdays={t.calendarWeekdays}
              onEventClick={openEditForm}
              onSlotClick={(dateStr) => openCreateForm(dateStr)}
            />
          </div>
        ) : (
          <>
            {/* Month View */}
            <div className="flex-1 flex flex-col min-h-0">
              <MonthGrid
                calendarDays={calendarDays}
                currentMonth={currentMonth}
                today={today}
                events={events}
                sprintPhases={sprintPhases}
                taskDeadlinesByDate={taskDeadlinesByDate}
                expandedDay={expandedDay}
                dragStart={dragStart}
                dragEnd={dragEnd}
                weekdays={t.calendarWeekdays}
                eventsOnDay={eventsOnDay}
                isDayInDragRange={isDayInDragRange}
                onDayMouseDown={handleDayMouseDown}
                onDayMouseEnter={handleDayMouseEnter}
                onDayClick={openCreateForm}
                onEventClick={openEditForm}
                onSprintBarClick={(sprintId) => router.push(`/projects/${projectId}/sprints?sprintId=${sprintId}`)}
                onDeadlineBadgeClick={handleDeadlineBadgeClick}
                onExpandDay={setExpandedDay}
              />
            </div>

            {/* Mini Calendar Sidebar */}
            <MiniCalendar
              currentYear={currentYear}
              currentMonth={currentMonth}
              today={today}
              events={events}
              weekdays={t.calendarWeekdays}
              onDateClick={(d) => {
                setCurrentYear(d.getFullYear())
                setCurrentMonth(d.getMonth())
              }}
            />
          </>
        )}
      </div>

      {/* ── Deadline Popover ── */}
      {deadlinePopover && (
        <div className="fixed inset-0 z-40" onClick={() => setDeadlinePopover(null)}>
          <div
            className="absolute bg-white rounded-xl shadow-2xl border border-gray-100 p-4 w-80 max-h-72 overflow-auto z-50"
            style={{
              left: Math.min(deadlinePopover.x, window.innerWidth - 340),
              top: Math.min(deadlinePopover.y + 8, window.innerHeight - 300),
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="text-xs font-bold text-gray-500 mb-3 uppercase tracking-wider">
              {deadlinePopover.sprintName} - {deadlinePopover.dateStr}
            </div>
            <div className="space-y-2">
              {deadlinePopover.tasks.map((task) => (
                <div
                  key={task.id}
                  className="flex items-center gap-2.5 text-xs p-2 rounded-lg bg-gray-50 hover:bg-gray-100 transition-colors"
                >
                  <span
                    className={`w-2 h-2 rounded-full shrink-0 ${
                      task.status === "done"
                        ? "bg-emerald-500"
                        : task.status === "in_progress"
                        ? "bg-blue-500"
                        : "bg-gray-400"
                    }`}
                  />
                  <span className="truncate text-gray-700 font-medium">
                    {task.pbItem.displayId ? `#${task.pbItem.displayId} ` : ""}
                    {task.pbItem.userStory}
                  </span>
                </div>
              ))}
              {deadlinePopover.tasks.length === 0 && (
                <div className="text-xs text-gray-400 text-center py-2">No tasks</div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Event Modal ── */}
      <EventModal
        show={showModal}
        editingEventId={editingEventId}
        eventForm={eventForm}
        sprints={sprints}
        t={t}
        onFormChange={setEventForm}
        onSave={handleSave}
        onDelete={handleDelete}
        onClose={closeModal}
      />
    </div>
  )
}

// ── Month Grid Sub-Component ─────────────────────────────────────

interface SprintPhase extends Sprint {
  doneCount: number
  total: number
  progress: number
}

function MonthGrid({
  calendarDays,
  currentMonth,
  today,
  events,
  sprintPhases,
  taskDeadlinesByDate,
  expandedDay,
  dragStart,
  dragEnd,
  weekdays,
  eventsOnDay,
  isDayInDragRange,
  onDayMouseDown,
  onDayMouseEnter,
  onDayClick,
  onEventClick,
  onSprintBarClick,
  onDeadlineBadgeClick,
  onExpandDay,
}: {
  calendarDays: Date[]
  currentMonth: number
  today: Date
  events: CalendarEvent[]
  sprintPhases: SprintPhase[]
  taskDeadlinesByDate: Record<string, { tasks: SprintItem[]; sprintName: string }[]>
  expandedDay: string | null
  dragStart: string | null
  dragEnd: string | null
  weekdays: string[]
  eventsOnDay: (day: Date) => CalendarEvent[]
  isDayInDragRange: (dayStr: string) => boolean
  onDayMouseDown: (dayStr: string) => void
  onDayMouseEnter: (dayStr: string) => void
  onDayClick: (dateStr: string) => void
  onEventClick: (ev: CalendarEvent) => void
  onSprintBarClick: (sprintId: string) => void
  onDeadlineBadgeClick: (
    e: React.MouseEvent,
    dateStr: string,
    entries: { tasks: SprintItem[]; sprintName: string }[]
  ) => void
  onExpandDay: (dayStr: string | null) => void
}) {
  const MAX_VISIBLE_EVENTS = 3

  return (
    <>
      {/* Weekday Headers */}
      <div className="grid grid-cols-7 border-b border-l bg-white shrink-0">
        {weekdays.map((wd, i) => (
          <div
            key={i}
            className={`py-2.5 text-center text-[11px] font-bold uppercase tracking-widest border-r ${
              i === 0 || i === 6
                ? "text-gray-400"
                : "text-gray-500"
            }`}
          >
            {wd}
          </div>
        ))}
      </div>

      {/* Day Grid */}
      <div className="grid grid-cols-7 flex-1 min-h-0 overflow-auto">
        {calendarDays.map((day, idx) => {
          const isCurrentMonth = day.getMonth() === currentMonth
          const isToday = isSameDay(day, today)
          const dayEvents = eventsOnDay(day)
          const dayStr = toDateStr(day)
          const isWeekend = day.getDay() === 0 || day.getDay() === 6
          const deadlineEntries = taskDeadlinesByDate[dayStr]
          const totalDeadlineTasks = deadlineEntries
            ? deadlineEntries.reduce((sum, en) => sum + en.tasks.length, 0)
            : 0
          const inDragRange = isDayInDragRange(dayStr)
          const isExpanded = expandedDay === dayStr

          // Sprint phase bars for this day
          const sprintPhasesForDay = sprintPhases.filter((sp) => {
            const start = sp.startDate.split("T")[0]
            const end = sp.endDate.split("T")[0]
            return dayStr >= start && dayStr <= end
          })

          const visibleEvents = isExpanded
            ? dayEvents
            : dayEvents.slice(0, MAX_VISIBLE_EVENTS)
          const hiddenCount = dayEvents.length - MAX_VISIBLE_EVENTS

          return (
            <div
              key={idx}
              className={`border-b border-r ${idx % 7 === 0 ? "border-l" : ""} min-h-[120px] flex flex-col cursor-pointer transition-all select-none rounded-lg ${
                isWeekend && !isToday ? "bg-slate-50/60" : "bg-white"
              } ${isToday ? "bg-blue-50/40 ring-1 ring-inset ring-blue-300" : ""} ${
                inDragRange
                  ? "bg-blue-100/60"
                  : "hover:shadow-inner hover:bg-gray-50/40"
              }`}
              onMouseDown={() => onDayMouseDown(dayStr)}
              onMouseEnter={() => onDayMouseEnter(dayStr)}
              onClick={() => {
                if (!dragStart) {
                  onDayClick(dayStr)
                }
              }}
            >
              {/* Sprint Phase Bars — clickable to jump to the sprints page */}
              {sprintPhasesForDay.length > 0 && (
                <div className="space-y-0.5 px-0.5 pt-0.5">
                  {sprintPhasesForDay.map((sp) => {
                    const gradient = sprintGradient[sp.status] ?? "from-gray-200/80 to-gray-100/40"
                    const isSprintStart = sp.startDate.split("T")[0] === dayStr
                    const isSprintEnd = sp.endDate.split("T")[0] === dayStr
                    return (
                      <button
                        key={sp.id}
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation()
                          onSprintBarClick(sp.id)
                        }}
                        className={`w-full h-[6px] bg-gradient-to-r ${gradient} relative cursor-pointer hover:brightness-110 transition ${
                          isSprintStart ? "rounded-l-full ml-0.5" : ""
                        } ${isSprintEnd ? "rounded-r-full mr-0.5" : ""}`}
                        title={`${sp.sprintName} (${sp.progress}%) — クリックでスプリント画面へ`}
                      >
                        {isSprintStart && (
                          <span
                            className={`absolute left-1 -top-[2px] text-[7px] font-bold whitespace-nowrap z-10 pointer-events-none ${
                              sprintTextColor[sp.status] ?? "text-gray-600"
                            }`}
                          >
                            {sp.sprintName} {sp.progress}%
                          </span>
                        )}
                        <div
                          className={`absolute left-0 top-0 h-full ${
                            sprintStatusColor[sp.status] ?? "bg-gray-400"
                          } opacity-40 pointer-events-none ${isSprintStart ? "rounded-l-full" : ""} ${
                            isSprintEnd ? "rounded-r-full" : ""
                          }`}
                          style={{ width: `${sp.progress}%` }}
                        />
                      </button>
                    )
                  })}
                </div>
              )}

              {/* Day Number + Deadline Badge */}
              <div className="flex items-center justify-between px-2 pt-1.5">
                <span
                  className={`text-xs font-semibold leading-none ${
                    isToday
                      ? "bg-blue-600 text-white rounded-full w-6 h-6 flex items-center justify-center shadow-sm shadow-blue-200"
                      : isCurrentMonth
                      ? "text-gray-800"
                      : "text-gray-300"
                  }`}
                >
                  {day.getDate()}
                </span>
                {totalDeadlineTasks > 0 && (
                  <button
                    type="button"
                    onClick={(e) => onDeadlineBadgeClick(e, dayStr, deadlineEntries)}
                    className="bg-red-100 text-red-700 text-[9px] font-bold rounded-full px-1.5 py-0.5 hover:bg-red-200 transition-colors shadow-sm"
                    title={`${totalDeadlineTasks} tasks due`}
                  >
                    {totalDeadlineTasks}
                  </button>
                )}
              </div>

              {/* Events */}
              <div className="flex-1 px-1 mt-1 space-y-0.5 overflow-hidden">
                {visibleEvents.map((ev) => (
                  <button
                    key={ev.id}
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      onEventClick(ev)
                    }}
                    className={`w-full text-left text-[10px] leading-tight px-1.5 py-1 rounded-md border-l-[3px] bg-white truncate shadow-sm hover:shadow transition-shadow ${
                      eventColorBorder[ev.color] ?? "border-l-gray-500"
                    }`}
                    title={ev.title}
                  >
                    <span className="font-medium text-gray-800">{ev.title}</span>
                  </button>
                ))}
                {hiddenCount > 0 && !isExpanded && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      onExpandDay(dayStr)
                    }}
                    className="w-full text-center text-[10px] font-semibold text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded-md py-0.5 transition-colors"
                  >
                    +{hiddenCount} more
                  </button>
                )}
                {isExpanded && dayEvents.length > MAX_VISIBLE_EVENTS && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      onExpandDay(null)
                    }}
                    className="w-full text-center text-[10px] font-semibold text-gray-500 hover:text-gray-700 hover:bg-gray-50 rounded-md py-0.5 transition-colors"
                  >
                    Show less
                  </button>
                )}
              </div>

              {/* Drag preview */}
              {inDragRange && dragStart && dragEnd && dragStart !== dragEnd && (
                <div className="mx-1 mb-1 h-1 rounded-full bg-blue-400/60" />
              )}
            </div>
          )
        })}
      </div>
    </>
  )
}
