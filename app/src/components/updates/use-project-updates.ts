"use client"

import { useCallback, useEffect, useRef } from "react"
import { apiFetch, useApiQuery } from "@/hooks"
import type { NotificationItem } from "@/components/notifications/notification-format"
import type { FeedEntry } from "@/app/projects/[projectId]/dashboard/activity-sentence"

/** Window event fired after the viewer's updates of a project changed (seen / read). Detail: projectId. */
export const PROJECT_UPDATES_EVENT = "kanflow:project-updates"

export interface UpdateSummary {
  newActivity: number
  unread: number
  mentions: number
}

export interface ProjectUpdates extends UpdateSummary {
  since: string
  firstVisit: boolean
  activity: FeedEntry[]
  notifications: NotificationItem[]
}

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0)
const list = <T>(v: unknown) => (Array.isArray(v) ? (v as T[]) : [])

/** Tolerant parser: a malformed / older response renders as "nothing new" instead of crashing. */
export function parseProjectUpdates(raw: unknown): ProjectUpdates {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>
  return {
    since: typeof r.since === "string" ? r.since : new Date(0).toISOString(),
    firstVisit: r.firstVisit === true,
    newActivity: num(r.newActivity),
    unread: num(r.unread),
    mentions: num(r.mentions),
    activity: list<FeedEntry>(r.activity),
    notifications: list<NotificationItem>(r.notifications),
  }
}

export const updatesUrl = (projectId: string) => `/api/projects/${encodeURIComponent(projectId)}/updates`

/** Tell the sidebar dot (and other listeners) to reload the project's counts. */
export function announceUpdatesChanged(projectId: string) {
  window.dispatchEvent(new CustomEvent(PROJECT_UPDATES_EVENT, { detail: projectId }))
}

/** The dashboard's "what's new" data plus the two writes (mark one read, mark all seen). */
export function useProjectUpdates(projectId: string) {
  const query = useApiQuery<ProjectUpdates>(updatesUrl(projectId), { parse: parseProjectUpdates })
  const { refetch } = query

  const markRead = useCallback(
    async (notificationId: string) => {
      await apiFetch(`/api/notifications/${encodeURIComponent(notificationId)}/read`, { method: "POST" })
      announceUpdatesChanged(projectId)
    },
    [projectId],
  )

  const markAllSeen = useCallback(async () => {
    await apiFetch(`${updatesUrl(projectId)}/seen`, { method: "POST" })
    announceUpdatesChanged(projectId)
    refetch()
  }, [projectId, refetch])

  return { ...query, markRead, markAllSeen }
}

/** Counts only (sidebar dot); reloads on navigation and whenever the updates change. */
export function useProjectUpdateSummary(projectId: string, reloadKey: string) {
  const query = useApiQuery<UpdateSummary>(`${updatesUrl(projectId)}?summary=1`, {
    parse: (raw) => {
      const p = parseProjectUpdates(raw)
      return { newActivity: p.newActivity, unread: p.unread, mentions: p.mentions }
    },
  })
  const { refetch } = query
  useEffect(() => {
    const onChange = (e: Event) => {
      if ((e as CustomEvent<string>).detail === projectId) refetch()
    }
    window.addEventListener(PROJECT_UPDATES_EVENT, onChange)
    return () => window.removeEventListener(PROJECT_UPDATES_EVENT, onChange)
  }, [projectId, refetch])
  // Navigating to another page of the project reloads (not the first render: the query loads itself).
  const lastKey = useRef(reloadKey)
  useEffect(() => {
    if (lastKey.current === reloadKey) return
    lastKey.current = reloadKey
    refetch()
  }, [reloadKey, refetch])
  return query.data
}
