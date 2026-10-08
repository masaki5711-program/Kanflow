"use client"

import { useCallback, useEffect, useRef } from "react"
import { useSession } from "next-auth/react"
import { useLiveRefetch } from "@/components/realtime/use-live-refetch"
import type { RealtimeSignal } from "@/components/realtime/realtime-hub"
import { fillTemplate } from "@/lib/fill-template"
import { useLanguage } from "@/lib/language-context"
import { createSeenSet, desktopNotifyState, isInBackground, showDesktopNotification } from "./desktop-notify"
import { describeNotification, type NotificationPage } from "./notification-format"

const LIVE_TYPES = ["notification", "team-message"] as const
const LIST_URL = "/api/notifications?unreadOnly=true&limit=10"
/** At most this many popups per burst; the bell has the rest. */
const MAX_POPUPS = 3
const BODY_MAX = 120

interface ChatMessageLite {
  id: string
  author: { id: string; name: string } | null
  body: string
  mentionsMe: boolean
  repliesToMe: boolean
}

// The popup may be clicked long after the tab last rendered: a plain navigation is the robust way in.
function openPage(href: string): void {
  window.location.assign(href)
}

// Plain fetch, NOT apiFetch: background checks must not count as user activity (idle logout).
async function getJson<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url, { headers: { Accept: "application/json" } })
    return res.ok ? ((await res.json()) as T) : null
  } catch {
    return null
  }
}

/**
 * Mounted once (providers): when a new notification or team-chat message
 * arrives over the real-time stream while the person is not looking at
 * Kanflow, shows it as a desktop notification (if they turned that on in
 * /me). Everything it announces is read through the normal authorized APIs.
 */
export function DesktopNotifier() {
  const { t, language } = useLanguage()
  const { data: session } = useSession()
  const me = session?.user?.id ?? null
  const seen = useRef(createSeenSet())
  const textRef = useRef({ t, language })
  useEffect(() => {
    textRef.current = { t, language }
  })

  // What is already unread when the tab opens is not "new": remember it silently.
  useEffect(() => {
    if (!me || desktopNotifyState() === "unsupported") return
    let cancelled = false
    void getJson<NotificationPage>(LIST_URL).then((page) => {
      if (cancelled) return
      for (const n of page?.items ?? []) seen.current.add(n.id)
    })
    return () => {
      cancelled = true
    }
  }, [me])

  const announceNotifications = useCallback(async (background: boolean) => {
    const page = await getJson<NotificationPage>(LIST_URL)
    const fresh = (page?.items ?? []).filter((n) => !seen.current.has(n.id))
    for (const n of fresh) seen.current.add(n.id)
    if (!background) return
    const { t: tr, language: lang } = textRef.current
    for (const n of fresh.slice(0, MAX_POPUPS).reverse()) {
      const { text, projectName, href } = describeNotification(n, tr, lang)
      showDesktopNotification({
        title: projectName ? `Kanflow · ${projectName}` : "Kanflow",
        body: text,
        tag: `notification-${n.id}`,
        onOpen: () => href && openPage(href),
      })
    }
  }, [])

  const announceChat = useCallback(async (projectId: string, background: boolean) => {
    const page = await getJson<{ items: ChatMessageLite[] }>(`/api/projects/${encodeURIComponent(projectId)}/talk/messages`)
    const last = page?.items.at(-1)
    const key = last ? `chat-${last.id}` : ""
    if (!last || seen.current.has(key)) return
    seen.current.add(key)
    // Mentions and replies already arrive as notifications (announced above).
    if (!background || last.author?.id === me || last.mentionsMe || last.repliesToMe) return
    const { t: tr } = textRef.current
    const body = last.body.replace(/\s+/g, " ").trim()
    showDesktopNotification({
      title: last.author ? fillTemplate(tr.desktopNotifyChatFrom, { name: last.author.name }) : tr.desktopNotifyChat,
      body: body.length > BODY_MAX ? `${body.slice(0, BODY_MAX)}…` : body,
      tag: `chat-${projectId}`,
      onOpen: () => openPage(`/projects/${encodeURIComponent(projectId)}/talk?message=${encodeURIComponent(last.id)}`),
    })
  }, [me])

  const onSignals = useCallback(
    (signals: readonly RealtimeSignal[]) => {
      if (!me || desktopNotifyState() === "unsupported") return
      const background = isInBackground() && desktopNotifyState() === "on"
      if (signals.some((s) => s.type === "notification")) void announceNotifications(background)
      const chatProjects = new Set<string>()
      for (const s of signals) {
        if (s.type === "team-message" && s.action === "create" && s.actorId !== me && s.projectId) chatProjects.add(s.projectId)
      }
      for (const projectId of chatProjects) void announceChat(projectId, background)
    },
    [me, announceNotifications, announceChat],
  )

  useLiveRefetch(onSignals, { types: LIVE_TYPES, resync: false, enabled: Boolean(me) })
  return null
}
