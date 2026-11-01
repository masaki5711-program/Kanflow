"use client"

import { useEffect, useState } from "react"
import { useApiQuery } from "@/hooks"
import { toClaimList, type ScreenClaimList } from "./claim-view"

/** Claims are re-read this often while the page is visible (they change through AI sessions, not this UI). */
export const CLAIM_REFRESH_MS = 60_000
/** The state of a claim (active / expiring soon / expired) follows the clock this often. */
const CLOCK_TICK_MS = 30_000

export type WorkClaimScope = { sprintId: string } | { pbiId: string }

export function workClaimsUrl(projectId: string, scope: WorkClaimScope): string {
  const query = "sprintId" in scope ? `sprintId=${encodeURIComponent(scope.sprintId)}` : `pbi=${encodeURIComponent(scope.pbiId)}`
  return `/api/projects/${projectId}/dev/claims?${query}`
}

/** "now", re-rendered every CLOCK_TICK_MS. */
export function useNow(tickMs: number = CLOCK_TICK_MS): Date {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), tickMs)
    return () => window.clearInterval(id)
  }, [tickMs])
  return now
}

/**
 * 担当中 of one sprint board (every claim of the sprint in ONE request — the cards
 * read it through WorkClaimsProvider) or of one PBI. Re-read every minute while the
 * tab is visible; `null` scope = no request.
 */
export function useWorkClaims(projectId: string, scope: WorkClaimScope | null) {
  const url = scope ? workClaimsUrl(projectId, scope) : null
  const query = useApiQuery<ScreenClaimList>(url, { parse: toClaimList })
  const { refetch } = query
  useEffect(() => {
    if (!url) return
    const id = window.setInterval(() => {
      if (document.visibilityState === "visible") refetch()
    }, CLAIM_REFRESH_MS)
    return () => window.clearInterval(id)
  }, [url, refetch])
  return query
}
