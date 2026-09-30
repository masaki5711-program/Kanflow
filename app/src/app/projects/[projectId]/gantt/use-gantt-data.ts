"use client"

import { useCallback, useMemo, useState } from "react"
import { useApiQuery } from "@/hooks"
import { useLanguage } from "@/lib/language-context"
import { pickText } from "@/lib/translation/pick-text"
import type { CalendarEvent, GanttText, Sprint } from "./gantt-types"
import { buildRows, computeTimeline, sortSprints } from "./gantt-utils"

const EMPTY_SPRINTS: Sprint[] = []
const EMPTY_EVENTS: CalendarEvent[] = []

/** Sprints + events for the Gantt chart (fetched in parallel, aborted on unmount). */
export function useGanttData(projectId: string) {
  const sprintsQuery = useApiQuery<Sprint[]>(`/api/projects/${projectId}/sprints`, { toastOnError: true })
  const eventsQuery = useApiQuery<CalendarEvent[]>(`/api/projects/${projectId}/events`, { toastOnError: true })

  const sprints = sprintsQuery.data ?? EMPTY_SPRINTS
  const events = eventsQuery.data ?? EMPTY_EVENTS

  // Every row starts expanded; only the rows the user collapsed are stored.
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})
  const isExpanded = useCallback((key: string) => !collapsed[key], [collapsed])
  const toggle = useCallback((key: string) => {
    setCollapsed((prev) => ({ ...prev, [key]: !prev[key] }))
  }, [])

  const sortedSprints = useMemo(() => sortSprints(sprints), [sprints])
  const timeline = useMemo(() => computeTimeline(sortedSprints), [sortedSprints])
  const rows = useMemo(() => buildRows(sortedSprints, isExpanded), [sortedSprints, isExpanded])

  return {
    sprints: sortedSprints,
    events,
    rows,
    isLoading: sprintsQuery.isLoading,
    error: sprintsQuery.error,
    refetch: sprintsQuery.refetch,
    isExpanded,
    toggle,
    ...timeline,
  }
}

/** Viewer-locale side of user text (bars / tooltips are too compact for bilingual badges). */
export function useGanttText(): GanttText {
  const { t, language } = useLanguage()
  return useMemo<GanttText>(() => {
    const sprintStatus: Record<string, string> = {
      planning: t.sprintStatusPlanning,
      active: t.sprintStatusActive,
      review: t.sprintStatusReview,
      done: t.sprintStatusDone,
      archived: t.sprintStatusArchived,
    }
    const taskStatus: Record<string, string> = { todo: t.taskTodo, in_progress: t.taskInProgress, done: t.taskDone }
    return {
      sprintName: (s) => pickText(s.i18n, "sprintName", s.sprintName, language).text,
      pbiLabel: (p) =>
        pickText(p.i18n, "initiative", p.initiative, language).text ||
        pickText(p.i18n, "userStory", p.userStory, language).text ||
        "PBI",
      taskName: (tk) => pickText(tk.i18n, "taskName", tk.taskName, language).text || "—",
      eventTitle: (ev) => pickText(ev.i18n, "title", ev.title, language).text,
      statusLabel: (status) => sprintStatus[status] ?? status,
      taskStatusLabel: (status) => taskStatus[status] ?? status,
    }
  }, [t, language])
}
