"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { apiFetch } from "@/hooks"
import { quietActivityFor } from "@/hooks/activity"
import { LIVE_QUIET_MS, useLiveRefetch, useRealtimeConnected } from "@/components/realtime/use-live-refetch"
import { announceNotificationsChanged } from "@/lib/notification-events"
import type { TeamMessage } from "./types"

/** How often the open chat asks for new messages (ms) — the fallback when the real-time stream is down. */
export const TALK_POLL_MS = 10_000
/** Safety-net poll while the real-time stream is connected (events refresh the chat at once). */
export const TALK_POLL_LIVE_MS = 60_000
/** Real-time refresh of the chat: messages, mirrored comments (create / edit / delete). */
const LIVE_TYPES = ["team-message", "comment"] as const
/** Short window: a chat message should appear "immediately". */
const LIVE_DEBOUNCE_MS = 200
/** Window event: the viewer's chat read state changed (sidebar badge reloads). Detail: projectId. */
export const TEAM_CHAT_READ_EVENT = "kanflow:team-chat-read"

interface Page {
  items: TeamMessage[]
  hasMore: boolean
}

const base = (projectId: string) => `/api/projects/${encodeURIComponent(projectId)}/talk`

/** Pure: append without duplicates (polling re-reads the boundary second), oldest first. */
export function mergeMessages(current: readonly TeamMessage[], incoming: readonly TeamMessage[]): TeamMessage[] {
  const seen = new Set(current.map((m) => m.id))
  return [...current, ...incoming.filter((m) => !seen.has(m.id))]
}

/**
 * Pure: merge the latest page into the list. Everything older than the page
 * stays as loaded; inside the page's time range the server's version wins,
 * so new messages appear, edited mirrors update and deleted ones disappear.
 */
export function reconcileLatest(current: readonly TeamMessage[], latestPage: Page): TeamMessage[] {
  const first = latestPage.items[0]
  if (!first) return latestPage.hasMore ? [...current] : []
  const older = latestPage.hasMore ? current.filter((m) => m.createdAt < first.createdAt) : []
  return [...older, ...latestPage.items]
}

/**
 * Team chat data: the latest page (or only the viewer's messages), polling
 * for new ones while the page is visible, older pages, send / delete, and
 * the read mark ("unread from here" uses the mark from before this visit).
 */
export function useTeamChat(projectId: string, forMe: boolean) {
  const [messages, setMessages] = useState<TeamMessage[]>([])
  const [hasMore, setHasMore] = useState(false)
  // Which query (project + tab) the list belongs to; loading = the current one has not answered yet.
  const key = `${projectId}|${forMe}`
  const [answered, setAnswered] = useState<{ key: string; error: Error | null } | null>(null)
  const loading = answered?.key !== key
  const error = answered?.key === key ? answered.error : null
  /** Last read time before this visit (null = never / not loaded yet). */
  const [readMark, setReadMark] = useState<string | null | undefined>(undefined)
  const latest = useRef<string | null>(null)
  const messagesRef = useRef(messages)
  useEffect(() => {
    messagesRef.current = messages
  })

  const markRead = useCallback(async () => {
    try {
      await apiFetch(`${base(projectId)}/read`, { method: "POST" })
      window.dispatchEvent(new CustomEvent(TEAM_CHAT_READ_EVENT, { detail: projectId }))
      announceNotificationsChanged()
    } catch {
      // The badge just stays until the next visit.
    }
  }, [projectId])

  // The mark from before this visit, read once, then this visit counts as read.
  useEffect(() => {
    let cancelled = false
    void apiFetch<{ lastReadAt: string | null }>(`${base(projectId)}/read`)
      .then((s) => !cancelled && setReadMark(s?.lastReadAt ?? null))
      .catch(() => !cancelled && setReadMark(null))
      .finally(() => void markRead())
    return () => {
      cancelled = true
    }
  }, [projectId, markRead])

  useEffect(() => {
    let cancelled = false
    const k = `${projectId}|${forMe}`
    apiFetch<Page>(`${base(projectId)}/messages${forMe ? "?forMe=1" : ""}`)
      .then((page) => {
        if (cancelled) return
        setMessages(page.items)
        setHasMore(page.hasMore)
        latest.current = page.items.at(-1)?.createdAt ?? new Date().toISOString()
        setAnswered({ key: k, error: null })
      })
      .catch((err: unknown) => !cancelled && setAnswered({ key: k, error: err instanceof Error ? err : new Error(String(err)) }))
    return () => {
      cancelled = true
    }
  }, [projectId, forMe])

  const poll = useCallback(async () => {
    if (!latest.current || document.visibilityState !== "visible") return
    const q = new URLSearchParams({ after: latest.current, ...(forMe ? { forMe: "1" } : {}) })
    try {
      const page = await apiFetch<Page>(`${base(projectId)}/messages?${q}`)
      if (page.items.length === 0) return
      latest.current = page.items.at(-1)?.createdAt ?? latest.current
      setMessages((prev) => mergeMessages(prev, page.items))
      void markRead()
    } catch {
      // Try again on the next tick.
    }
  }, [projectId, forMe, markRead])

  // Someone posted / edited / deleted: re-read the latest page (the sender already shows their own message).
  const refreshLatest = useCallback(async () => {
    if (!latest.current) return
    try {
      const page = await apiFetch<Page>(`${base(projectId)}/messages${forMe ? "?forMe=1" : ""}`)
      const known = new Set(messagesRef.current.map((m) => m.id))
      setMessages((prev) => reconcileLatest(prev, page))
      latest.current = page.items.at(-1)?.createdAt ?? latest.current
      if (page.items.some((m) => !known.has(m.id))) void markRead()
    } catch {
      // The next event or poll tries again.
    }
  }, [projectId, forMe, markRead])
  useLiveRefetch(() => void refreshLatest(), { types: LIVE_TYPES, projectId, debounceMs: LIVE_DEBOUNCE_MS })

  const isLive = useRealtimeConnected()
  useEffect(() => {
    const timer = window.setInterval(() => {
      // A background poll is not the user's activity (else the idle logout never fires on this page).
      quietActivityFor(LIVE_QUIET_MS)
      void poll()
    }, isLive ? TALK_POLL_LIVE_MS : TALK_POLL_MS)
    return () => window.clearInterval(timer)
  }, [poll, isLive])

  const loadOlder = useCallback(async () => {
    const first = messages[0]
    if (!first) return
    const q = new URLSearchParams({ before: first.createdAt, ...(forMe ? { forMe: "1" } : {}) })
    const page = await apiFetch<Page>(`${base(projectId)}/messages?${q}`)
    setMessages((prev) => [...page.items.filter((m) => !prev.some((p) => p.id === m.id)), ...prev])
    setHasMore(page.hasMore)
  }, [messages, projectId, forMe])

  const send = useCallback(
    async (body: string, files: readonly File[], replyToId: string | null): Promise<TeamMessage> => {
      const form = new FormData()
      form.append("body", body)
      if (replyToId) form.append("replyToId", replyToId)
      for (const f of files) form.append("files", f)
      const saved = await apiFetch<TeamMessage>(`${base(projectId)}/messages`, { method: "POST", body: form })
      setMessages((prev) => mergeMessages(prev, [saved]))
      latest.current = saved.createdAt > (latest.current ?? "") ? saved.createdAt : latest.current
      return saved
    },
    [projectId],
  )

  const remove = useCallback(
    async (id: string) => {
      await apiFetch(`${base(projectId)}/messages/${encodeURIComponent(id)}`, { method: "DELETE" })
      setMessages((prev) => prev.filter((m) => m.id !== id))
    },
    [projectId],
  )

  return { messages, hasMore, loading, error, readMark, loadOlder, send, remove, poll }
}

export const attachmentUrl = (projectId: string, id: string) => `${base(projectId)}/attachments/${encodeURIComponent(id)}`
