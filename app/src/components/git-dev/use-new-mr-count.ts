"use client"

import { useCallback, useEffect, useState } from "react"
import { useApiQuery } from "@/hooks"
import { quietActivityFor } from "@/hooks/activity"
import { LIVE_QUIET_MS, useLiveRefetch } from "@/components/realtime/use-live-refetch"
import { GIT_SYNCED_EVENT, gitApiBase } from "./git-client-state"

/** Background refresh of the sidebar pill (ms); real-time git events refresh it at once. */
export const NEW_MR_POLL_MS = 60_000

const seenKey = (projectId: string) => `kanflow:git-seen:${projectId}`

/** When this browser last opened the Git page of the project (null = never / storage unavailable). */
export function readGitSeen(projectId: string): string | null {
  try {
    return window.localStorage.getItem(seenKey(projectId))
  } catch {
    return null
  }
}

export function writeGitSeen(projectId: string, at: Date = new Date()): string {
  const iso = at.toISOString()
  try {
    window.localStorage.setItem(seenKey(projectId), iso)
  } catch {
    // Private window / blocked storage: the pill just clears for this page view.
  }
  return iso
}

/**
 * Open MRs that came in since the viewer last opened the Git page — the red
 * number on the sidebar's 開発 entry, like unread chat. Opening the Git page
 * (`onGitPage`) marks them seen. The "seen" time lives in this browser.
 * Returns 0 while loading, when the integration is off, or on the Git page.
 */
export function useNewMrCount(projectId: string, enabled: boolean, onGitPage: boolean): number {
  // The stamp taken when the viewer left the Git page (falls back to what storage holds).
  const [left, setLeft] = useState<{ projectId: string; at: string } | null>(null)
  useEffect(() => {
    if (!onGitPage) return
    writeGitSeen(projectId)
    // MRs that arrive while the page is open were seen there: stamp again on leaving.
    return () => setLeft({ projectId, at: writeGitSeen(projectId) })
  }, [projectId, onGitPage])
  const seen = left?.projectId === projectId ? left.at : readGitSeen(projectId)

  const url = enabled && !onGitPage
    ? `${gitApiBase(projectId)}/new-mrs${seen ? `?since=${encodeURIComponent(seen)}` : ""}`
    : null
  const { data, refetch } = useApiQuery<number>(url, {
    parse: (raw) => {
      const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>
      return r.enabled === true && typeof r.count === "number" && Number.isFinite(r.count) ? r.count : 0
    },
  })

  const poll = useCallback(() => {
    if (document.visibilityState !== "visible") return
    // Background poll: not the user's activity (idle logout).
    quietActivityFor(LIVE_QUIET_MS)
    refetch()
  }, [refetch])
  useEffect(() => {
    if (url === null) return
    window.addEventListener(GIT_SYNCED_EVENT, refetch)
    const timer = window.setInterval(poll, NEW_MR_POLL_MS)
    return () => {
      window.removeEventListener(GIT_SYNCED_EVENT, refetch)
      window.clearInterval(timer)
    }
  }, [url, refetch, poll])
  useLiveRefetch(refetch, { types: ["git"], projectId, enabled: url !== null })

  return url === null ? 0 : (data ?? 0)
}
