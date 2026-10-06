"use client"

import { useEffect, useMemo } from "react"
import { useApiQuery } from "@/hooks"
import { GIT_SYNCED_EVENT, gitApiBase, isGitKnownOff, rememberGitOff, toSummaries, type GitSummaries, type PbiGitSummary } from "./git-client-state"
import { useLiveRefetch } from "@/components/realtime/use-live-refetch"

/** PBIs per request (keeps the query string well under URL limits; later PBIs show no badge). */
export const MAX_SUMMARY_IDS = 200

const NONE: Record<string, PbiGitSummary> = {}

/**
 * Card badges for many PBIs in one request (`GET /git/summary?pbiIds=`).
 * No request for an empty list or when the integration is known to be off;
 * the order of `pbiIds` does not matter (no refetch on reorder).
 */
export function useGitSummaries(projectId: string, pbiIds: readonly string[]): GitSummaries {
  const key = useMemo(() => [...new Set(pbiIds)].slice(0, MAX_SUMMARY_IDS).sort().join(","), [pbiIds])
  const url = key && !isGitKnownOff(projectId) ? `${gitApiBase(projectId)}/summary?pbiIds=${encodeURIComponent(key)}` : null
  const { data, refetch } = useApiQuery<GitSummaries>(url, {
    parse: (raw) => {
      const result = toSummaries(raw)
      if (!result.enabled) rememberGitOff(projectId)
      return result
    },
  })
  const enabled = !!data?.enabled && url !== null

  useEffect(() => {
    if (!enabled) return
    window.addEventListener(GIT_SYNCED_EVENT, refetch)
    return () => window.removeEventListener(GIT_SYNCED_EVENT, refetch)
  }, [enabled, refetch])

  // A background GitLab sync changed links of this project: badges follow live.
  useLiveRefetch(refetch, { types: ["git"], projectId, enabled })

  return useMemo(() => ({ enabled, summaries: enabled && data ? data.summaries : NONE }), [enabled, data])
}
