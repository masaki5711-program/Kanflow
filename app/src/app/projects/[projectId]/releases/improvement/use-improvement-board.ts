"use client"

import { useCallback, useMemo, useState } from "react"
import { apiFetch, useApiQuery } from "@/hooks"
import { localizeApiError } from "@/hooks/api-client"
import { improvementUrl, improvementsUrl } from "@/lib/improvement/constants"
import { useLanguage } from "@/lib/language-context"
import type { ImprovementBoard } from "./improvement-types"
import { useLiveRefetch } from "@/components/realtime/use-live-refetch"

/** Result of one write: ok, or the localized error message to announce. */
export type WriteResult = { ok: true } | { ok: false; message: string }

/**
 * The board's server state plus a generic writer: every write is a plain
 * request followed by a refetch (rollouts, checks and photos change the
 * summary too, so the board is simply reloaded). `status` is the latest
 * save / error message for the dialog's aria-live region.
 */
export function useImprovementBoard(projectId: string) {
  const { t } = useLanguage()
  const query = useApiQuery<ImprovementBoard>(projectId ? improvementsUrl(projectId) : null, {
    toastOnError: () => t.releaseLoadFailed,
  })
  const { refetch } = query
  const [pending, setPending] = useState(0)
  // Other people's board changes appear live (not while this tab's own write is in flight).
  useLiveRefetch(refetch, { types: ["activity"], projectId, entityTypes: ["release", "project"], paused: pending > 0 })

  /** Send a write to `/improvements/<itemId><path>`; refetches on success. */
  const write = useCallback(
    async (itemId: string, path: string, init: { method: string; json?: unknown; body?: BodyInit }): Promise<WriteResult> => {
      setPending((n) => n + 1)
      try {
        await apiFetch(`${improvementUrl(projectId, itemId)}${path}`, init)
        refetch()
        return { ok: true }
      } catch (err) {
        return { ok: false, message: localizeApiError(err, t) }
      } finally {
        setPending((n) => n - 1)
      }
    },
    [projectId, refetch, t],
  )

  const items = useMemo(() => query.data?.items ?? [], [query.data])
  return { ...query, items, write, busy: pending > 0 }
}

export type BoardWriter = ReturnType<typeof useImprovementBoard>["write"]
