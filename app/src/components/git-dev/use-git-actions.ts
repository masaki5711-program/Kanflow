"use client"

import { useCallback, useState } from "react"
import { apiFetch, isApiError } from "@/hooks"
import { useToast } from "@/components/ui"
import { useLanguage } from "@/lib/language-context"
import { announceGitSynced, gitApiBase } from "./git-client-state"

interface SyncResponse {
  results?: Array<{ ok?: boolean } | null>
}

/**
 * 「今すぐ更新」: POST /git/sync, then every panel / badge of the project
 * refetches (GIT_SYNCED_EVENT). 429 (synced < 20 s ago) is a gentle note, not
 * an error; 409 (switched off meanwhile) just refetches so the panel disappears.
 */
export function useGitSync(projectId: string, refetch: () => void): { syncing: boolean; sync: () => Promise<void> } {
  const { t } = useLanguage()
  const toast = useToast()
  const [syncing, setSyncing] = useState(false)
  const sync = useCallback(async () => {
    setSyncing(true)
    try {
      const res = await apiFetch<SyncResponse>(`${gitApiBase(projectId)}/sync`, { method: "POST" })
      const failed = (res?.results ?? []).some((r) => r?.ok === false)
      if (failed) toast.error(t.gitDevSyncPartial)
      else toast.success(t.gitDevSynced)
      announceGitSynced(projectId)
    } catch (e) {
      if (isApiError(e) && e.status === 429) toast.info(t.gitDevSyncTooSoon)
      else if (isApiError(e) && e.status === 409) refetch()
      else toast.error(`${t.gitDevSyncFailed}: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setSyncing(false)
    }
  }, [projectId, refetch, t, toast])
  return { syncing, sync }
}

/** Copies `text` and confirms with a toast (the clipboard is otherwise invisible). */
export function useCopyText(): (text: string) => Promise<boolean> {
  const { t } = useLanguage()
  const toast = useToast()
  return useCallback(
    async (text: string) => {
      try {
        if (!navigator.clipboard) throw new Error("clipboard unavailable")
        await navigator.clipboard.writeText(text)
        toast.success(t.gitDevCopied)
        return true
      } catch {
        toast.error(t.gitDevCopyFailed)
        return false
      }
    },
    [t, toast],
  )
}
