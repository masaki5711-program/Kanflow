"use client"

import { useEffect, useRef } from "react"
import { useApiQuery } from "@/hooks"
import { quietActivityFor } from "@/hooks/activity"
import { LIVE_QUIET_MS, useLiveRefetch } from "@/components/realtime/use-live-refetch"

/** Same event the chat page fires after marking it read (app/projects/[projectId]/talk/use-team-chat.ts). */
const TEAM_CHAT_READ_EVENT = "kanflow:team-chat-read"
/** Background refresh of the sidebar badge (ms); real-time events refresh it at once. */
export const CHAT_SUMMARY_POLL_MS = 60_000

export interface TeamChatSummary {
  unread: number
  forYou: number
}

const LIVE_TYPES = ["team-message", "comment", "notification"] as const

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0)

/** Unread team chat counts for the sidebar badge: reloads on navigation, after reading, on real-time events and every minute. */
export function useTeamChatSummary(projectId: string, reloadKey: string): TeamChatSummary | undefined {
  const query = useApiQuery<TeamChatSummary>(`/api/projects/${encodeURIComponent(projectId)}/talk/read`, {
    parse: (raw) => {
      const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>
      return { unread: num(r.unread), forYou: num(r.forYou) }
    },
  })
  const { refetch } = query
  useEffect(() => {
    const onRead = (e: Event) => {
      if ((e as CustomEvent<string>).detail === projectId) refetch()
    }
    window.addEventListener(TEAM_CHAT_READ_EVENT, onRead)
    const timer = window.setInterval(() => {
      if (document.visibilityState !== "visible") return
      // Background poll: not the user's activity (idle logout).
      quietActivityFor(LIVE_QUIET_MS)
      refetch()
    }, CHAT_SUMMARY_POLL_MS)
    return () => {
      window.removeEventListener(TEAM_CHAT_READ_EVENT, onRead)
      window.clearInterval(timer)
    }
  }, [projectId, refetch])
  // New chat messages / mirrored comments in this project: the unread badge follows live.
  useLiveRefetch(refetch, { types: LIVE_TYPES, projectId })
  const lastKey = useRef(reloadKey)
  useEffect(() => {
    if (lastKey.current === reloadKey) return
    lastKey.current = reloadKey
    refetch()
  }, [reloadKey, refetch])
  return query.data
}
