"use client"

import { useMemo } from "react"
import { apiFetch, useApiMutation, useApiQuery } from "@/hooks"
import { useLanguage } from "@/lib/language-context"
import { pickText } from "@/lib/translation/pick-text"
import {
  type CalendarEvent,
  type DeadlineEntry,
  type EventFormState,
  type ProjectMember,
  type Sprint,
  datePart,
  i18nOf,
  toEventBody,
} from "./calendar-types"

export interface SprintPhase extends Sprint {
  doneCount: number
  total: number
  progress: number
}

export interface SaveEventVars {
  id: string | null
  form: EventFormState
}

const EMPTY_EVENTS: CalendarEvent[] = []
const EMPTY_SPRINTS: Sprint[] = []
const EMPTY_MEMBERS: ProjectMember[] = []

/**
 * Loads events, sprints and members in parallel (each aborted on unmount /
 * project change) and exposes event mutations with optimistic updates.
 */
export function useCalendarData(projectId: string) {
  const { t, language } = useLanguage()
  const base = `/api/projects/${projectId}`
  const toastOnError = () => t.calendarLoadFailed

  const eventsQ = useApiQuery<CalendarEvent[]>(`${base}/events`, { toastOnError })
  const sprintsQ = useApiQuery<Sprint[]>(`${base}/sprints`, { toastOnError })
  const membersQ = useApiQuery<ProjectMember[]>(`${base}/members`, { toastOnError })

  const events = eventsQ.data ?? EMPTY_EVENTS
  const sprints = sprintsQ.data ?? EMPTY_SPRINTS
  const members = membersQ.data ?? EMPTY_MEMBERS
  const { mutate: setEvents, refetch: refetchEvents } = eventsQ

  const saveEvent = useApiMutation(
    ({ id, form }: SaveEventVars) =>
      id
        ? apiFetch(`${base}/events/${id}`, { method: "PATCH", json: toEventBody(form) })
        : apiFetch(`${base}/events`, { method: "POST", json: toEventBody(form) }),
    {
      onMutate: ({ id, form }) => {
        const prev = eventsQ.data
        if (id) {
          // Optimistic patch of an existing event (dates, title, colour…).
          setEvents((list) =>
            list?.map((ev) =>
              ev.id === id
                ? {
                    ...ev,
                    title: form.title.trim(),
                    description: form.description.trim() || null,
                    date: form.date,
                    endDate: form.endDate || null,
                    color: form.color,
                    sprintId: form.sprintId || null,
                  }
                : ev,
            ),
          )
        }
        return prev
      },
      rollback: (prev) => setEvents(prev),
      onSuccess: () => refetchEvents(),
      toastOnError: () => t.calendarSaveFailed,
      toastOnSuccess: t.calendarEventSaved,
    },
  )

  const deleteEvent = useApiMutation(
    (id: string) => apiFetch(`${base}/events/${id}`, { method: "DELETE" }),
    {
      onMutate: (id) => {
        const prev = eventsQ.data
        setEvents((list) => list?.filter((ev) => ev.id !== id))
        return prev
      },
      rollback: (prev) => setEvents(prev),
      toastOnError: () => t.calendarDeleteFailed,
      toastOnSuccess: t.calendarEventDeleted,
    },
  )

  const taskDeadlinesByDate = useMemo(() => {
    const map: Record<string, DeadlineEntry[]> = {}
    for (const sp of sprints) {
      const endStr = datePart(sp.endDate)
      map[endStr] = [
        ...(map[endStr] ?? []),
        { tasks: sp.items, sprintName: pickText(i18nOf(sp), "sprintName", sp.sprintName, language).text },
      ]
    }
    return map
  }, [sprints, language])

  const sprintPhases = useMemo<SprintPhase[]>(
    () =>
      sprints.map((sp) => {
        const doneCount = sp.items.filter((it) => it.status === "done").length
        const total = sp.items.length
        const progress = total > 0 ? Math.round((doneCount / total) * 100) : 0
        return { ...sp, doneCount, total, progress }
      }),
    [sprints],
  )

  return {
    events,
    sprints,
    members,
    isLoading: eventsQ.isLoading || sprintsQ.isLoading || membersQ.isLoading,
    taskDeadlinesByDate,
    sprintPhases,
    saveEvent,
    deleteEvent,
  }
}
