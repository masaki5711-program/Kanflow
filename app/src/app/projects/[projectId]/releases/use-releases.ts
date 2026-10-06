"use client"

import { useCallback } from "react"
import { useToast } from "@/components/ui"
import { apiFetch, useApiMutation, useApiQuery } from "@/hooks"
import { useLanguage } from "@/lib/language-context"
import { UNCATEGORIZED, type ReleaseEditForm, type ReleaseItem } from "./release-types"
import { useLiveRefetch } from "@/components/realtime/use-live-refetch"

interface SaveVars {
  id: string
  form: ReleaseEditForm
}

interface ImportVars {
  pbItemIds: string[]
  planVersion: string
}

/** Release items of a project plus all write operations on them. */
export function useReleases(projectId: string) {
  const { t } = useLanguage()
  const toast = useToast()
  const baseUrl = `/api/projects/${projectId}/releases`

  const query = useApiQuery<ReleaseItem[]>(projectId ? baseUrl : null, {
    toastOnError: () => t.releaseLoadFailed,
  })
  const { data: items, mutate: setItems, refetch } = query
  // Other people's release changes appear live.
  useLiveRefetch(refetch, { types: ["activity"], projectId, entityTypes: ["release"] })

  const save = useApiMutation(
    ({ id, form }: SaveVars) => apiFetch(`${baseUrl}/${id}`, { method: "PATCH", json: form }),
    { onSuccess: () => refetch(), toastOnError: () => t.releaseSaveFailed },
  )

  const remove = useApiMutation(
    (id: string) => apiFetch(`${baseUrl}/${id}`, { method: "DELETE" }),
    {
      onMutate: (id) => {
        const prev = items
        setItems((list) => list?.filter((i) => i.id !== id))
        return prev
      },
      rollback: (prev) => setItems(prev),
      onSuccess: () => refetch(),
      toastOnError: () => t.releaseDeleteFailed,
    },
  )

  const importItems = useApiMutation(
    ({ pbItemIds, planVersion }: ImportVars) =>
      apiFetch(`${baseUrl}/import`, {
        method: "POST",
        json: { pbItemIds, planVersion: planVersion || undefined },
      }),
    {
      onSuccess: (_r, vars) => {
        toast.success(t.releaseImported.replace("{count}", String(vars.pbItemIds.length)))
        refetch()
      },
      toastOnError: () => t.releaseImportFailed,
    },
  )

  /** Mark every non-released item of a version as released (optimistic, partial failures rolled back via refetch). */
  const bulkRelease = useCallback(
    async (version: string) => {
      const targets = (items ?? []).filter(
        (i) => (i.planVersion ?? UNCATEGORIZED) === version && i.status !== "released",
      )
      if (targets.length === 0) return
      const releaseDate = new Date().toISOString()
      const ids = new Set(targets.map((i) => i.id))
      setItems((list) => list?.map((i) => (ids.has(i.id) ? { ...i, status: "released", releaseDate } : i)))

      const results = await Promise.allSettled(
        targets.map((item) =>
          apiFetch(`${baseUrl}/${item.id}`, { method: "PATCH", json: { status: "released", releaseDate } }),
        ),
      )
      const failed = results.filter((r) => r.status === "rejected").length
      if (failed > 0) toast.error(`${failed} ${t.releaseUpdateFailed}`)
      else toast.success(t.releaseBulkDone.replace("{count}", String(targets.length)))
      refetch()
    },
    [items, setItems, baseUrl, toast, t, refetch],
  )

  return { ...query, items: items ?? [], save, remove, importItems, bulkRelease }
}
