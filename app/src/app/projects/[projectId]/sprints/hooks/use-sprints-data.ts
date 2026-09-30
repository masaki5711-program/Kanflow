"use client"

import { useMemo } from "react"
import { useSession } from "next-auth/react"
import { useApiQuery } from "@/hooks"
import type { CalendarEvent, Member, ProjectSettings, ReadyPbItem, Sprint } from "../components/types"
import type { BacklogListResponse, ProjectDetailDto } from "@/types/api"

type ProjectResponse = ProjectDetailDto
type BacklogResponse = Pick<BacklogListResponse<ReadyPbItem>, "readyItems">

const EMPTY_SPRINTS: Sprint[] = []
const EMPTY_READY: ReadyPbItem[] = []
const EMPTY_EVENTS: CalendarEvent[] = []
const EMPTY_MEMBERS: Member[] = []

/**
 * All data the sprints page needs, fetched in parallel. Every query is
 * aborted on unmount and errors surface as toasts.
 */
export function useSprintsData(projectId: string) {
  const base = `/api/projects/${projectId}`
  const sprintsQuery = useApiQuery<Sprint[]>(`${base}/sprints`, { toastOnError: true })
  // Only READY items are needed here (sprint creation / add-PBI lists).
  const backlogQuery = useApiQuery<BacklogResponse>(`${base}/backlog?status=ready`, { toastOnError: true })
  const eventsQuery = useApiQuery<CalendarEvent[]>(`${base}/events`, { toastOnError: true })
  const membersQuery = useApiQuery<Member[]>(`${base}/members`, { toastOnError: true })
  const projectQuery = useApiQuery<ProjectResponse>(base, { toastOnError: true })

  const { data: session } = useSession()
  const members = membersQuery.data ?? EMPTY_MEMBERS
  const userId = session?.user?.id
  const isAdmin = (session?.user as { role?: string } | undefined)?.role === "admin"
  const myRole = useMemo(
    () => (userId ? members.find((m) => m.user.id === userId)?.role ?? null : null),
    [members, userId],
  )

  const project = projectQuery.data
  const settings = useMemo<ProjectSettings | null>(
    () =>
      project
        ? {
            defaultCapacity: project.defaultCapacity ?? 0,
            sprintDurationDays: project.sprintDurationDays ?? 7,
            pointUnit: project.pointUnit ?? "SP",
            pointDescription: project.pointDescription ?? null,
          }
        : null,
    [project],
  )

  return {
    sprints: sprintsQuery.data ?? EMPTY_SPRINTS,
    isLoadingSprints: sprintsQuery.isLoading,
    refetchSprints: sprintsQuery.refetch,
    mutateSprints: sprintsQuery.mutate,
    readyPbItems: backlogQuery.data?.readyItems ?? EMPTY_READY,
    refetchReady: backlogQuery.refetch,
    events: eventsQuery.data ?? EMPTY_EVENTS,
    members,
    /** Signed-in user (the "me" assignee filter, per-user view preference). */
    userId: userId ?? null,
    settings,
    canEditPbi: isAdmin || myRole === "po" || myRole === "sm",
  }
}

export type SprintsData = ReturnType<typeof useSprintsData>
