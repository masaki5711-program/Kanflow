"use client"

import { useCallback, useState } from "react"
import { apiFetch, useApiQuery, versionConflictOf } from "@/hooks"
import { localizeApiError } from "@/hooks/api-client"
import { milestonesUrl } from "@/lib/milestones/constants"
import { useLanguage } from "@/lib/language-context"
import type { MilestoneBoard } from "./milestone-types"

/** Result of one write: ok (with the response body), or the localized error to announce. */
export type WriteResult = { ok: true; data: unknown } | { ok: false; message: string; conflict?: boolean }

export type WriteInit = { method: string; json?: unknown; body?: BodyInit }

/**
 * The board's server state plus two writers, each followed by a refetch
 * (every part feeds the summary strip): `write` for /milestones/** and
 * `patchPlanItem` for a stage's dates / status / 完了条件 through the plan
 * API (optimistic lock: a 409 reloads the board and says so).
 */
export function useMilestoneBoard(projectId: string) {
  const { t } = useLanguage()
  const query = useApiQuery<MilestoneBoard>(projectId ? milestonesUrl(projectId) : null, { toastOnError: () => t.releaseLoadFailed })
  const { refetch } = query
  const [pending, setPending] = useState(0)

  const send = useCallback(
    async (url: string, init: WriteInit): Promise<WriteResult> => {
      setPending((n) => n + 1)
      try {
        const data = await apiFetch(url, init)
        refetch()
        return { ok: true, data }
      } catch (err) {
        if (versionConflictOf(err)) {
          refetch()
          return { ok: false, message: t.msConflict, conflict: true }
        }
        return { ok: false, message: localizeApiError(err, t) }
      } finally {
        setPending((n) => n - 1)
      }
    },
    [refetch, t],
  )

  /** `path` is relative to /api/projects/<id>/milestones ("" = the board). */
  const write = useCallback((path: string, init: WriteInit) => send(`${milestonesUrl(projectId)}${path}`, init), [projectId, send])

  const patchPlanItem = useCallback(
    (itemId: string, body: Record<string, unknown>) => send(`/api/projects/${projectId}/plan/${itemId}`, { method: "PATCH", json: body }),
    [projectId, send],
  )

  return { ...query, write, patchPlanItem, busy: pending > 0 }
}

export type BoardWriter = ReturnType<typeof useMilestoneBoard>["write"]
export type PlanPatcher = ReturnType<typeof useMilestoneBoard>["patchPlanItem"]
