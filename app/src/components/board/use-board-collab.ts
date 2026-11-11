"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { apiFetch } from "@/hooks"
import { isBox, type BoardElement } from "@/lib/board/model"
import { STROKE_COLOR } from "@/lib/board/palette"
import { sheetUrl } from "./board-api"
import type { PbiBadgeInfo } from "./element-view"

/** Who else has the sheet open (from the presence API). */
export interface Viewer {
  userId: string
  name: string
  selection: string[]
}

/** How often the open sheet says "I am here" (and reads who else is). */
export const PRESENCE_MS = 5000

/** Colours of other people's selections (the board's palette tokens; by person, stable). */
export const VIEWER_COLORS = [STROKE_COLOR.violet, STROKE_COLOR.amber, STROKE_COLOR.green, STROKE_COLOR.red, STROKE_COLOR.blue]

export function viewerColor(userId: string): string {
  let h = 0
  for (const ch of userId) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  return VIEWER_COLORS[h % VIEWER_COLORS.length]
}

/**
 * The sheet's presence: every PRESENCE_MS (while the tab is visible) it says what this person has selected and
 * reads who else is on the sheet. Leaving the sheet says so (best effort). Failures are quiet: presence is a hint.
 */
export function usePresence(projectId: string, boardId: string, sheetId: string, selection: readonly string[]): { viewers: Viewer[]; offset: number } {
  const [viewers, setViewers] = useState<Viewer[]>([])
  /** Server clock minus this computer's (ms): a shared timer counts down to the same moment everywhere. */
  const [offset, setOffset] = useState(0)
  const selectionRef = useRef(selection)
  useEffect(() => {
    selectionRef.current = selection
  }, [selection])
  const url = `${sheetUrl(projectId, boardId, sheetId)}/presence`

  useEffect(() => {
    let live = true
    const abort = new AbortController()
    async function beat() {
      if (typeof document !== "undefined" && document.visibilityState === "hidden") return
      try {
        const sent = Date.now()
        const body = await apiFetch<{ viewers: Viewer[]; now?: number }>(url, { method: "POST", json: { selection: selectionRef.current.slice(0, 50) }, signal: abort.signal })
        if (!live) return
        setViewers(body.viewers)
        // The answer was made about half way through the round trip.
        // Kept steady: only a change of more than 250 ms (not the jitter of one round trip) moves the shared clock.
        if (typeof body.now === "number") {
          const next = Math.round(body.now - (sent + Date.now()) / 2)
          setOffset((prev) => (Math.abs(next - prev) > 250 ? next : prev))
        }
      } catch {
        // Presence is a hint: a failed beat changes nothing (the next one tries again).
      }
    }
    void beat()
    const timer = window.setInterval(() => void beat(), PRESENCE_MS)
    return () => {
      live = false
      abort.abort()
      window.clearInterval(timer)
      // keepalive: still sent when the page is being closed.
      void fetch(url, { method: "DELETE", keepalive: true }).catch(() => {})
    }
  }, [url])

  return { viewers, offset }
}

/** A backlog item as the board shows it. */
export interface PbiSummary {
  id: string
  displayId: number
  title: string
  status: string
  assignee: string | null
  confidential: boolean
}

/** The badge of a box's PBI: number, title and state colour. */
export function pbiBadge(item: PbiSummary | undefined, labels: { missing: string; confidential: string }): PbiBadgeInfo {
  if (!item) return { label: labels.missing, tone: "missing" }
  const title = item.title ? ` ${item.title}` : ""
  return {
    label: `#${item.displayId}${item.confidential ? ` (${labels.confidential})` : ""}${title}`,
    tone: item.status === "completed" ? "done" : item.status === "ready" ? "ready" : "notReady",
  }
}

/** The PBIs the sheet's boxes stand for, read live (again whenever the set of linked ids changes, and every minute). */
export function usePbiInfo(projectId: string, boardId: string, elements: Readonly<Record<string, BoardElement>>, labels: { missing: string; confidential: string }) {
  const ids = useMemo(() => {
    const set = new Set<string>()
    for (const el of Object.values(elements)) if (isBox(el) && el.pbiId) set.add(el.pbiId)
    return [...set].sort().slice(0, 100)
  }, [elements])
  const key = ids.join(",")
  const [loaded, setLoaded] = useState<{ key: string; items: Map<string, PbiSummary> } | null>(null)
  const items = loaded?.items ?? null
  const [tick, setTick] = useState(0)

  useEffect(() => {
    if (!key) return
    const timer = window.setInterval(() => setTick((n) => n + 1), 60_000)
    return () => window.clearInterval(timer)
  }, [key])

  useEffect(() => {
    if (!key) return
    let live = true
    apiFetch<{ items: PbiSummary[] }>(`/api/projects/${projectId}/boards/${boardId}/pbis?ids=${encodeURIComponent(key)}`)
      .then((body) => {
        if (live) setLoaded({ key, items: new Map(body.items.map((i) => [i.id, i])) })
      })
      .catch(() => {
        // Kept as it was: the badges show "…" until a read succeeds.
      })
    return () => {
      live = false
    }
  }, [projectId, boardId, key, tick])

  const { missing, confidential } = labels
  const loadedKey = loaded?.key ?? null
  const info = useCallback(
    (id: string): PbiBadgeInfo | null => {
      if (!items) return null
      // An id linked since the last read is not "missing" yet: it is being read.
      if (!items.has(id) && loadedKey !== key) return null
      return pbiBadge(items.get(id), { missing, confidential })
    },
    [items, loadedKey, key, missing, confidential],
  )
  return { info, items }
}

/** A comment of the board. */
export interface BoardCommentItem {
  id: string
  sheetId: string
  elementId: string | null
  author: { id: string; name: string }
  body: string
  createdAt: string
  resolved: boolean
}

/** The board's comments (read when opened and every 15 s while visible) and the commands on them. */
export function useBoardComments(projectId: string, boardId: string) {
  const url = `/api/projects/${projectId}/boards/${boardId}/comments`
  const [comments, setComments] = useState<BoardCommentItem[]>([])
  const [failed, setFailed] = useState(false)

  const reload = useCallback(async () => {
    try {
      const body = await apiFetch<{ comments: BoardCommentItem[] }>(url)
      setComments(body.comments)
      setFailed(false)
    } catch {
      setFailed(true)
    }
  }, [url])

  useEffect(() => {
    let live = true
    const load = () =>
      apiFetch<{ comments: BoardCommentItem[] }>(url)
        .then((body) => {
          if (!live) return
          setComments(body.comments)
          setFailed(false)
        })
        .catch(() => {
          if (live) setFailed(true)
        })
    void load()
    const timer = window.setInterval(() => {
      if (document.visibilityState !== "hidden") void load()
    }, 15_000)
    return () => {
      live = false
      window.clearInterval(timer)
    }
  }, [url])

  return {
    comments,
    failed,
    reload,
    add: async (input: { sheetId: string; elementId: string | null; body: string }) => {
      const created = await apiFetch<BoardCommentItem>(url, { method: "POST", json: input })
      setComments((list) => [...list, created])
    },
    resolve: async (id: string, resolved: boolean) => {
      const next = await apiFetch<BoardCommentItem>(`${url}/${id}`, { method: "PATCH", json: { resolved } })
      setComments((list) => list.map((c) => (c.id === id ? next : c)))
    },
    remove: async (id: string) => {
      await apiFetch(`${url}/${id}`, { method: "DELETE" })
      setComments((list) => list.filter((c) => c.id !== id))
    },
  }
}
