"use client"

import { useEffect } from "react"
import { useApiQuery } from "@/hooks"
import { GIT_SYNCED_EVENT, gitApiBase, isGitKnownOff, rememberGitOff, toPanel, type PbiGitPanelDto } from "./git-client-state"

export interface PbiGitPanelState {
  /** The panel data; null while loading, on error and when the integration is off. */
  panel: PbiGitPanelDto | null
  refetch: () => void
}

/**
 * The 開発 panel data of one PBI (`GET /git/links?pbiId=`). No request when the
 * project is already known to have the integration off.
 */
export function usePbiGitPanel(projectId: string, pbiId: string | null | undefined): PbiGitPanelState {
  const url = pbiId && !isGitKnownOff(projectId) ? `${gitApiBase(projectId)}/links?pbiId=${encodeURIComponent(pbiId)}` : null
  const { data, refetch } = useApiQuery<PbiGitPanelDto>(url, {
    parse: (raw) => {
      const panel = toPanel(raw)
      if (!panel.enabled) rememberGitOff(projectId)
      return panel
    },
  })
  const enabled = !!data?.enabled && url !== null

  // A sync elsewhere (another panel, the Git page) brings new links.
  useEffect(() => {
    if (!enabled) return
    window.addEventListener(GIT_SYNCED_EVENT, refetch)
    return () => window.removeEventListener(GIT_SYNCED_EVENT, refetch)
  }, [enabled, refetch])

  return { panel: enabled && data ? data : null, refetch }
}
