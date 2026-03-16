"use client"

import { useEffect, useState, useCallback, useRef, useMemo } from "react"
import { useParams } from "next/navigation"
import { useLanguage } from "@/lib/language-context"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

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
  items: SprintItem[]
}

interface CalendarEvent {
  id: string
  title: string
  date: string
  endDate: string | null
  color: string
  sprintId: string | null
}

interface PbiGroup {
  pbItem: SprintPbItem
  tasks: SprintItem[]
}

type GanttRow =
  | { kind: "sprint"; sprint: Sprint; key: string }
  | { kind: "pbi"; pbi: SprintPbItem; tasks: SprintItem[]; sprint: Sprint; key: string }
  | { kind: "task"; task: SprintItem; sprint: Sprint; pbiTasks: SprintItem[]; taskIndex: number; key: string }

type ZoomLevel = "week" | "2weeks" | "month"

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ROW_HEIGHT = 40
const LEFT_PANEL_WIDTH = 320
const DAY_WIDTH_MAP: Record<ZoomLevel, number> = { week: 50, "2weeks": 36, month: 20 }
const WEEKDAY_LABELS = ["S", "M", "T", "W", "T", "F", "S"]

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function daysBetween(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / 86_400_000)
}

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d)
  r.setDate(r.getDate() + n)
  return r
}

function isWeekend(d: Date): boolean {
  const day = d.getDay()
  return day === 0 || day === 6
}

function groupItemsByPbi(items: SprintItem[]): PbiGroup[] {
  const map = new Map<string, PbiGroup>()
  for (const item of items) {
    const existing = map.get(item.pbItem.id)
    if (existing) {
      existing.tasks = [...existing.tasks, item]
    } else {
      map.set(item.pbItem.id, { pbItem: item.pbItem, tasks: [item] })
    }
  }
  return Array.from(map.values())
}

function getInitials(name: string): string {
  return name.split(/[\s　]+/).map((w) => w[0] || "").join("").toUpperCase().slice(0, 2)
}

function sprintDonePercent(sprint: Sprint): number {
  if (sprint.items.length === 0) return 0
  const done = sprint.items.filter((i) => i.status === "done").length
  return Math.round((done / sprint.items.length) * 100)
}

function pbiDonePercent(tasks: SprintItem[]): number {
  if (tasks.length === 0) return 0
  const done = tasks.filter((t) => t.status === "done").length
  return Math.round((done / tasks.length) * 100)
}

// Color schemes per sprint status
const STATUS_COLORS: Record<string, { bar: string; barLight: string; badge: string; badgeText: string; gradient: string }> = {
  planning: { bar: "bg-amber-400", barLight: "bg-amber-100", badge: "bg-amber-100 text-amber-700", badgeText: "text-amber-700", gradient: "from-amber-500 to-amber-300" },
  active: { bar: "bg-blue-500", barLight: "bg-blue-100", badge: "bg-blue-100 text-blue-700", badgeText: "text-blue-700", gradient: "from-blue-600 to-blue-400" },
  review: { bar: "bg-violet-500", barLight: "bg-violet-100", badge: "bg-violet-100 text-violet-700", badgeText: "text-violet-700", gradient: "from-violet-600 to-violet-400" },
  done: { bar: "bg-emerald-500", barLight: "bg-emerald-100", badge: "bg-emerald-100 text-emerald-700", badgeText: "text-emerald-700", gradient: "from-emerald-600 to-emerald-400" },
  archived: { bar: "bg-slate-400", barLight: "bg-slate-100", badge: "bg-slate-100 text-slate-600", badgeText: "text-slate-600", gradient: "from-slate-500 to-slate-300" },
}

const TASK_STATUS_STYLES: Record<string, { bg: string; text: string; barBg: string }> = {
  todo: { bg: "bg-slate-100 text-slate-600", text: "todo", barBg: "bg-slate-400" },
  in_progress: { bg: "bg-blue-100 text-blue-700", text: "in_progress", barBg: "bg-blue-400" },
  done: { bg: "bg-emerald-100 text-emerald-700", text: "done", barBg: "bg-emerald-400" },
}

function getStatusColors(status: string) {
  return STATUS_COLORS[status] || STATUS_COLORS.active
}

function getTaskStyle(status: string) {
  return TASK_STATUS_STYLES[status] || TASK_STATUS_STYLES.todo
}

function eventFlagColor(color: string): string {
  const map: Record<string, string> = {
    blue: "text-blue-500", green: "text-emerald-500", red: "text-red-500",
    yellow: "text-amber-500", purple: "text-violet-500", gray: "text-slate-400",
  }
  return map[color] || "text-blue-400"
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function GanttPage() {
  const { projectId } = useParams<{ projectId: string }>()
  const { t } = useLanguage()

  const [sprints, setSprints] = useState<Sprint[]>([])
  const [events, setEvents] = useState<CalendarEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const [zoom, setZoom] = useState<ZoomLevel>("2weeks")
  const [hoveredRow, setHoveredRow] = useState<string | null>(null)

  const leftRef = useRef<HTMLDivElement>(null)
  const rightRef = useRef<HTMLDivElement>(null)
  const syncingRef = useRef(false)
  const scrolledRef = useRef(false)

  const DAY_WIDTH = DAY_WIDTH_MAP[zoom]

  // ---- Fetch ----
  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const [sprintsRes, eventsRes] = await Promise.all([
        fetch(`/api/projects/${projectId}/sprints`),
        fetch(`/api/projects/${projectId}/events`),
      ])
      if (sprintsRes.ok) {
        const data: Sprint[] = await sprintsRes.json()
        setSprints(data)
        const exp: Record<string, boolean> = {}
        for (const s of data) {
          exp[`sprint-${s.id}`] = true
          for (const g of groupItemsByPbi(s.items)) {
            exp[`pbi-${s.id}-${g.pbItem.id}`] = true
          }
        }
        setExpanded(exp)
      }
      if (eventsRes.ok) {
        setEvents(await eventsRes.json())
      }
    } finally {
      setLoading(false)
    }
  }, [projectId])

  useEffect(() => { fetchData() }, [fetchData])

  // ---- Scroll sync ----
  const handleLeftScroll = useCallback(() => {
    if (syncingRef.current) return
    syncingRef.current = true
    if (leftRef.current && rightRef.current) rightRef.current.scrollTop = leftRef.current.scrollTop
    syncingRef.current = false
  }, [])

  const handleRightScroll = useCallback(() => {
    if (syncingRef.current) return
    syncingRef.current = true
    if (leftRef.current && rightRef.current) leftRef.current.scrollTop = rightRef.current.scrollTop
    syncingRef.current = false
  }, [])

  // ---- Auto-scroll to today ----
  useEffect(() => {
    if (!loading && sprints.length > 0 && !scrolledRef.current && rightRef.current) {
      scrolledRef.current = true
      const today = startOfDay(new Date())
      const sorted = [...sprints].sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime())
      const tlStart = addDays(startOfDay(new Date(sorted[0].startDate)), -7)
      const offset = daysBetween(tlStart, today)
      const containerW = rightRef.current.clientWidth
      rightRef.current.scrollTo({ left: offset * DAY_WIDTH - containerW / 2, behavior: "smooth" })
    }
  }, [loading, sprints, DAY_WIDTH])

  const scrollToToday = useCallback(() => {
    if (!rightRef.current || sprints.length === 0) return
    const today = startOfDay(new Date())
    const sorted = [...sprints].sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime())
    const tlStart = addDays(startOfDay(new Date(sorted[0].startDate)), -7)
    const offset = daysBetween(tlStart, today)
    const containerW = rightRef.current.clientWidth
    rightRef.current.scrollTo({ left: offset * DAY_WIDTH - containerW / 2, behavior: "smooth" })
  }, [sprints, DAY_WIDTH])

  const toggle = useCallback((key: string) => {
    setExpanded((prev) => ({ ...prev, [key]: !prev[key] }))
  }, [])

  // ---- Timeline range ----
  const sortedSprints = useMemo(
    () => [...sprints].sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime()),
    [sprints]
  )

  const { timelineStart, timelineEnd, totalDays } = useMemo(() => {
    let s: Date, e: Date
    if (sortedSprints.length > 0) {
      s = addDays(startOfDay(new Date(sortedSprints[0].startDate)), -7)
      e = addDays(startOfDay(new Date(Math.max(...sortedSprints.map((sp) => new Date(sp.endDate).getTime())))), 7)
    } else {
      const now = new Date()
      s = addDays(startOfDay(now), -7)
      e = addDays(startOfDay(now), 28)
    }
    return { timelineStart: s, timelineEnd: e, totalDays: daysBetween(s, e) + 1 }
  }, [sortedSprints])

  // ---- Build rows ----
  const rows = useMemo(() => {
    const result: GanttRow[] = []
    for (const sprint of sortedSprints) {
      const sprintKey = `sprint-${sprint.id}`
      result.push({ kind: "sprint", sprint, key: sprintKey })
      if (expanded[sprintKey]) {
        for (const group of groupItemsByPbi(sprint.items)) {
          const pbiKey = `pbi-${sprint.id}-${group.pbItem.id}`
          result.push({ kind: "pbi", pbi: group.pbItem, tasks: group.tasks, sprint, key: pbiKey })
          if (expanded[pbiKey]) {
            group.tasks.forEach((task, idx) => {
              result.push({ kind: "task", task, sprint, pbiTasks: group.tasks, taskIndex: idx, key: `task-${task.id}` })
            })
          }
        }
      }
    }
    return result
  }, [sortedSprints, expanded])

  // ---- Date columns ----
  const dateColumns = useMemo(() => {
    const cols: { date: Date; dayNum: number; isWeekendDay: boolean; weekday: string; showMonth: boolean; monthLabel: string; monthYear: string; monthSpan: number }[] = []
    for (let i = 0; i < totalDays; i++) {
      const d = addDays(timelineStart, i)
      const prev = i > 0 ? addDays(timelineStart, i - 1) : null
      const showMonth = !prev || prev.getMonth() !== d.getMonth()
      let monthSpan = 0
      if (showMonth) {
        for (let j = i; j < totalDays; j++) {
          const dd = addDays(timelineStart, j)
          if (dd.getMonth() === d.getMonth() && dd.getFullYear() === d.getFullYear()) monthSpan++
          else break
        }
      }
      cols.push({
        date: d, dayNum: d.getDate(), isWeekendDay: isWeekend(d),
        weekday: WEEKDAY_LABELS[d.getDay()],
        showMonth, monthLabel: d.toLocaleDateString(undefined, { month: "short" }),
        monthYear: `${d.toLocaleDateString(undefined, { month: "short" })} ${d.getFullYear()}`,
        monthSpan,
      })
    }
    return cols
  }, [totalDays, timelineStart])

  // ---- Summary stats ----
  const totalTasks = sprints.reduce((sum, s) => sum + s.items.length, 0)
  const doneTasks = sprints.reduce((sum, s) => sum + s.items.filter((i) => i.status === "done").length, 0)
  const completionPct = totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 100) : 0

  // ---- Position helpers ----
  const barPos = useCallback((start: string, end: string) => {
    const s = startOfDay(new Date(start))
    const e = startOfDay(new Date(end))
    const left = daysBetween(timelineStart, s) * DAY_WIDTH
    const width = Math.max((daysBetween(s, e) + 1) * DAY_WIDTH - 4, 8)
    return { left, width }
  }, [timelineStart, DAY_WIDTH])

  const today = startOfDay(new Date())
  const todayOffset = daysBetween(timelineStart, today)

  // ---- Status label ----
  const statusLabel = useCallback((status: string): string => {
    const map: Record<string, string> = {
      planning: t.sprintStatusPlanning, active: t.sprintStatusActive,
      review: t.sprintStatusReview, done: t.sprintStatusDone, archived: t.sprintStatusArchived,
    }
    return map[status] || status
  }, [t])

  const taskStatusLabel = useCallback((status: string): string => {
    const map: Record<string, string> = { todo: t.taskTodo, in_progress: t.taskInProgress, done: t.taskDone }
    return map[status] || status
  }, [t])

  // ---- Loading / empty ----
  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-pulse flex items-center gap-2 text-slate-400">
          <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
          {t.loading}
        </div>
      </div>
    )
  }

  if (sprints.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-2">
        <svg className="h-12 w-12 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
        <div className="text-slate-400">{t.ganttNoData}</div>
      </div>
    )
  }

  const timelineWidth = totalDays * DAY_WIDTH
  const bodyHeight = rows.length * ROW_HEIGHT
  const headerHeight = 64

  return (
    <div className="flex flex-col h-full overflow-hidden bg-white dark:bg-gray-950">
      {/* ===== Header bar ===== */}
      <div className="px-4 py-2.5 border-b border-slate-200 dark:border-slate-700 bg-white dark:bg-gray-900 flex items-center gap-4 shrink-0 shadow-sm">
        <h1 className="text-lg font-bold text-slate-800 dark:text-slate-100">{t.ganttTitle}</h1>

        {/* Zoom controls */}
        <div className="flex items-center rounded-lg border border-slate-200 dark:border-slate-600 overflow-hidden text-xs font-medium">
          {(["week", "2weeks", "month"] as ZoomLevel[]).map((level) => (
            <button
              key={level}
              onClick={() => setZoom(level)}
              className={`px-3 py-1.5 transition-colors ${
                zoom === level
                  ? "bg-blue-500 text-white"
                  : "bg-white dark:bg-gray-800 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-gray-700"
              }`}
            >
              {level === "week" ? "Week" : level === "2weeks" ? "2 Weeks" : "Month"}
            </button>
          ))}
        </div>

        {/* Scroll to today */}
        <button
          onClick={scrollToToday}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950 transition-colors"
        >
          <span className="inline-block w-2 h-2 rounded-full bg-red-500" />
          {t.ganttToday}
        </button>

        {/* Stats */}
        <div className="ml-auto flex items-center gap-4 text-xs text-slate-500 dark:text-slate-400">
          <span>{sortedSprints.length} Sprints</span>
          <span>{totalTasks} Tasks</span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-16 h-1.5 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden">
              <span className="block h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${completionPct}%` }} />
            </span>
            {completionPct}%
          </span>
        </div>
      </div>

      {/* ===== Main container ===== */}
      <div className="flex flex-1 overflow-hidden">
        {/* ---- LEFT PANEL ---- */}
        <div className="flex flex-col shrink-0 bg-white dark:bg-gray-950" style={{ width: LEFT_PANEL_WIDTH }}>
          {/* Header spacer */}
          <div
            className="border-b border-r border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-gray-900 flex items-end px-3 pb-1 text-[10px] font-medium text-slate-400 uppercase tracking-wider"
            style={{ height: headerHeight }}
          >
            Task / Sprint
          </div>

          {/* Scrollable rows */}
          <div
            ref={leftRef}
            onScroll={handleLeftScroll}
            className="flex-1 overflow-y-auto overflow-x-hidden border-r border-slate-200 dark:border-slate-700"
            style={{ scrollbarWidth: "none" }}
          >
            <div style={{ height: bodyHeight }}>
              {rows.map((row) => {
                const isHovered = hoveredRow === row.key
                const hoverCls = isHovered ? "bg-blue-50/60 dark:bg-blue-950/30" : ""

                if (row.kind === "sprint") {
                  const colors = getStatusColors(row.sprint.status)
                  const pct = sprintDonePercent(row.sprint)
                  return (
                    <div
                      key={row.key}
                      className={`flex items-center border-b border-slate-100 dark:border-slate-800 cursor-pointer select-none hover:bg-slate-50 dark:hover:bg-slate-800/50 ${hoverCls}`}
                      style={{ height: ROW_HEIGHT }}
                      onClick={() => toggle(row.key)}
                      onMouseEnter={() => setHoveredRow(row.key)}
                      onMouseLeave={() => setHoveredRow(null)}
                    >
                      <div className="flex items-center gap-2 px-3 w-full min-w-0">
                        <span className="text-[10px] text-slate-400 shrink-0 w-3">{expanded[row.key] ? "\u25BC" : "\u25B6"}</span>
                        <span className="text-sm font-bold text-slate-800 dark:text-slate-100 truncate">{row.sprint.sprintName}</span>
                        <span className={`shrink-0 text-[10px] font-semibold px-2 py-0.5 rounded-full ${colors.badge}`}>
                          {statusLabel(row.sprint.status)}
                        </span>
                        {/* Capacity + progress */}
                        <div className="ml-auto flex items-center gap-2 shrink-0">
                          <span className="text-[10px] text-slate-400">{t.sprintCapacity}: {row.sprint.capacity}</span>
                          <span className="inline-block w-12 h-1.5 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden">
                            <span className="block h-full rounded-full bg-emerald-500" style={{ width: `${pct}%` }} />
                          </span>
                          <span className="text-[10px] text-slate-500 w-7 text-right">{pct}%</span>
                        </div>
                      </div>
                    </div>
                  )
                }

                if (row.kind === "pbi") {
                  const pct = pbiDonePercent(row.tasks)
                  return (
                    <div
                      key={row.key}
                      className={`flex items-center border-b border-slate-100 dark:border-slate-800 cursor-pointer select-none hover:bg-slate-50 dark:hover:bg-slate-800/50 ${hoverCls}`}
                      style={{ height: ROW_HEIGHT }}
                      onClick={() => toggle(row.key)}
                      onMouseEnter={() => setHoveredRow(row.key)}
                      onMouseLeave={() => setHoveredRow(null)}
                    >
                      <div className="flex items-center gap-2 pl-7 pr-3 w-full min-w-0">
                        <span className="text-[10px] text-slate-400 shrink-0 w-3">{expanded[row.key] ? "\u25BC" : "\u25B6"}</span>
                        <span className="text-[11px] font-mono text-slate-500 shrink-0">#{row.pbi.displayId}</span>
                        <span className="text-xs text-slate-700 dark:text-slate-300 truncate">
                          {row.pbi.initiative || row.pbi.userStory || "PBI"}
                        </span>
                        <div className="ml-auto flex items-center gap-2 shrink-0">
                          {row.pbi.workloadScore > 0 && (
                            <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-orange-50 text-orange-600 dark:bg-orange-950 dark:text-orange-400">
                              {t.sprintWorkload}: {row.pbi.workloadScore}
                            </span>
                          )}
                          <span className="text-[10px] text-slate-400">{pct}%</span>
                        </div>
                      </div>
                    </div>
                  )
                }

                // task
                const ts = getTaskStyle(row.task.status)
                return (
                  <div
                    key={row.key}
                    className={`flex items-center border-b border-slate-100 dark:border-slate-800 select-none hover:bg-slate-50 dark:hover:bg-slate-800/50 ${hoverCls}`}
                    style={{ height: ROW_HEIGHT }}
                    onMouseEnter={() => setHoveredRow(row.key)}
                    onMouseLeave={() => setHoveredRow(null)}
                  >
                    <div className="flex items-center gap-2 pl-14 pr-3 w-full min-w-0">
                      <span className={`shrink-0 text-[10px] font-medium px-1.5 py-0.5 rounded ${ts.bg}`}>
                        {taskStatusLabel(row.task.status)}
                      </span>
                      <span className="text-xs text-slate-700 dark:text-slate-300 truncate">{row.task.taskName || "\u2014"}</span>
                      <div className="ml-auto flex items-center gap-2 shrink-0">
                        {row.task.estimatedHours != null && (
                          <span className="text-[10px] text-slate-400">
                            {row.task.actualHours ?? 0}/{row.task.estimatedHours}h
                          </span>
                        )}
                        {row.task.assignee && (
                          <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-slate-200 dark:bg-slate-700 text-[9px] font-bold text-slate-600 dark:text-slate-300 shrink-0" title={row.task.assignee}>
                            {getInitials(row.task.assignee)}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>

        {/* ---- RIGHT PANEL (timeline) ---- */}
        <div ref={rightRef} onScroll={handleRightScroll} className="flex-1 overflow-auto">
          <div style={{ width: timelineWidth }}>
            {/* Sticky header */}
            <div className="sticky top-0 z-30 border-b border-slate-200 dark:border-slate-700" style={{ height: headerHeight }}>
              {/* Month row */}
              <div className="relative flex" style={{ height: 28 }}>
                {dateColumns.map((col, i) =>
                  col.showMonth ? (
                    <div
                      key={`m-${i}`}
                      className={`absolute flex items-center px-2 text-[11px] font-semibold tracking-wide border-l border-slate-200 dark:border-slate-700 ${
                        col.date.getMonth() % 2 === 0
                          ? "bg-white dark:bg-gray-900 text-slate-600 dark:text-slate-300"
                          : "bg-slate-50 dark:bg-gray-800 text-slate-500 dark:text-slate-400"
                      }`}
                      style={{ left: i * DAY_WIDTH, width: col.monthSpan * DAY_WIDTH, height: 28 }}
                    >
                      {col.monthYear}
                    </div>
                  ) : null
                )}

                {/* Event flags above header */}
                {events.map((evt) => {
                  const evtDate = startOfDay(new Date(evt.date))
                  const offset = daysBetween(timelineStart, evtDate)
                  if (offset < 0 || offset >= totalDays) return null
                  const left = offset * DAY_WIDTH + DAY_WIDTH / 2
                  return (
                    <div key={`evt-${evt.id}`} className={`absolute z-10 ${eventFlagColor(evt.color)}`} style={{ left: left - 5, top: 2 }} title={evt.title}>
                      <svg width="10" height="14" viewBox="0 0 10 14" fill="currentColor">
                        <path d="M1 0v14M1 0h8l-3 3.5L9 7H1" stroke="currentColor" strokeWidth="1" fill="currentColor" fillOpacity="0.3" />
                      </svg>
                    </div>
                  )
                })}
              </div>

              {/* Day row: weekday + number */}
              <div className="flex" style={{ height: 36 }}>
                {dateColumns.map((col, i) => {
                  const isToday = col.date.getTime() === today.getTime()
                  return (
                    <div
                      key={`d-${i}`}
                      className={`flex flex-col items-center justify-center shrink-0 text-[10px] border-l ${
                        isToday
                          ? "bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 font-bold border-blue-200 dark:border-blue-800"
                          : col.isWeekendDay
                            ? "bg-slate-100 dark:bg-slate-800/70 text-slate-400 border-slate-100 dark:border-slate-800"
                            : "bg-white dark:bg-gray-900 text-slate-500 dark:text-slate-400 border-slate-100 dark:border-slate-800"
                      }`}
                      style={{ width: DAY_WIDTH }}
                    >
                      <span className="leading-none">{col.weekday}</span>
                      <span className="leading-none mt-0.5">{col.dayNum}</span>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Timeline body */}
            <div style={{ height: bodyHeight }} className="relative">
              {/* Grid lines + weekend bg */}
              {dateColumns.map((col, i) => {
                const isToday = col.date.getTime() === today.getTime()
                return (
                  <div
                    key={`grid-${i}`}
                    className={`absolute top-0 bottom-0 border-l ${
                      isToday
                        ? "bg-blue-50/40 dark:bg-blue-950/20 border-blue-200 dark:border-blue-800"
                        : col.isWeekendDay
                          ? "bg-slate-50/80 dark:bg-slate-800/30 border-slate-100 dark:border-slate-800"
                          : "border-slate-100/60 dark:border-slate-800/40"
                    }`}
                    style={{ left: i * DAY_WIDTH, width: DAY_WIDTH }}
                  />
                )
              })}

              {/* Row stripes */}
              {rows.map((row, idx) => {
                const isHovered = hoveredRow === row.key
                return (
                  <div
                    key={`stripe-${row.key}`}
                    className={`absolute w-full border-b border-slate-100 dark:border-slate-800 ${
                      isHovered ? "bg-blue-50/40 dark:bg-blue-950/20" : ""
                    }`}
                    style={{ top: idx * ROW_HEIGHT, height: ROW_HEIGHT }}
                    onMouseEnter={() => setHoveredRow(row.key)}
                    onMouseLeave={() => setHoveredRow(null)}
                  />
                )
              })}

              {/* Today marker line */}
              {todayOffset >= 0 && todayOffset < totalDays && (
                <>
                  {/* Red diamond at top */}
                  <div
                    className="absolute z-20"
                    style={{ left: todayOffset * DAY_WIDTH + DAY_WIDTH / 2 - 5, top: -4 }}
                  >
                    <div className="w-2.5 h-2.5 rounded-full bg-red-500 ring-2 ring-red-200 dark:ring-red-900" />
                  </div>
                  {/* Dashed line */}
                  <div
                    className="absolute top-0 bottom-0 z-20 border-l-2 border-dashed border-red-500"
                    style={{ left: todayOffset * DAY_WIDTH + DAY_WIDTH / 2 }}
                  />
                </>
              )}

              {/* ---- Bars ---- */}
              {rows.map((row, idx) => {
                const top = idx * ROW_HEIGHT

                if (row.kind === "sprint") {
                  const { left, width } = barPos(row.sprint.startDate, row.sprint.endDate)
                  const pct = sprintDonePercent(row.sprint)
                  const colors = getStatusColors(row.sprint.status)
                  return (
                    <div
                      key={`bar-${row.key}`}
                      className={`absolute rounded-md overflow-hidden bg-gradient-to-r ${colors.gradient} shadow-sm`}
                      style={{ left: left + 2, top: top + 10, width, height: 20 }}
                      title={`${row.sprint.sprintName} | ${statusLabel(row.sprint.status)} | ${pct}% done`}
                    >
                      {/* Progress overlay */}
                      <div
                        className="absolute inset-y-0 left-0 bg-black/10 rounded-l-md"
                        style={{ width: `${pct}%` }}
                      />
                      <span className="relative text-[10px] text-white font-semibold px-2 truncate block leading-[20px] drop-shadow-sm">
                        {row.sprint.sprintName}
                      </span>
                    </div>
                  )
                }

                if (row.kind === "pbi") {
                  const { left, width } = barPos(row.sprint.startDate, row.sprint.endDate)
                  const pct = pbiDonePercent(row.tasks)
                  return (
                    <div
                      key={`bar-${row.key}`}
                      className="absolute rounded bg-indigo-200/70 dark:bg-indigo-800/50 overflow-hidden"
                      style={{ left: left + 4, top: top + 14, width: width - 4, height: 12 }}
                      title={`#${row.pbi.displayId} ${row.pbi.initiative || row.pbi.userStory || "PBI"} | ${pct}% done`}
                    >
                      <div className="absolute inset-y-0 left-0 bg-indigo-400/50 dark:bg-indigo-500/40 rounded-l" style={{ width: `${pct}%` }} />
                    </div>
                  )
                }

                if (row.kind === "task") {
                  const sprintStart = startOfDay(new Date(row.sprint.startDate))
                  const sprintEnd = startOfDay(new Date(row.sprint.endDate))
                  const sprintDays = daysBetween(sprintStart, sprintEnd) + 1
                  const ts = getTaskStyle(row.task.status)
                  const totalInPbi = row.pbiTasks.length
                  const taskIdx = row.taskIndex

                  // Distribute task proportionally within sprint range
                  const taskDayStart = Math.floor((taskIdx / totalInPbi) * sprintDays)
                  const taskDayEnd = Math.floor(((taskIdx + 1) / totalInPbi) * sprintDays)
                  const taskStartDate = addDays(sprintStart, taskDayStart)
                  const taskEndDate = addDays(sprintStart, Math.max(taskDayEnd - 1, taskDayStart))

                  const tLeft = daysBetween(timelineStart, taskStartDate) * DAY_WIDTH
                  const tWidth = Math.max((daysBetween(taskStartDate, taskEndDate) + 1) * DAY_WIDTH - 8, 12)

                  return (
                    <div
                      key={`bar-${row.key}`}
                      className={`absolute rounded-full ${ts.barBg} opacity-80`}
                      style={{ left: tLeft + 4, top: top + 16, width: tWidth, height: 8 }}
                      title={`${row.task.taskName || "\u2014"} | ${taskStatusLabel(row.task.status)}${row.task.assignee ? ` | ${row.task.assignee}` : ""}${row.task.estimatedHours ? ` | ${row.task.actualHours ?? 0}/${row.task.estimatedHours}h` : ""}`}
                    />
                  )
                }

                return null
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
