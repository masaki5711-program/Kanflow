"use client"

import { useMemo } from "react"
import { useSession } from "next-auth/react"
import { apiFetch, useApiMutation, useApiQuery } from "@/hooks"
import { useLanguage } from "@/lib/language-context"
import {
  LIST_KEY,
  type BacklogItem,
  type BacklogResponse,
  type BacklogStatus,
  type IceboxOption,
  type IceboxResponse,
  type ProductGoal,
  type ProjectMember,
} from "./types"

interface ReorderVars {
  status: BacklogStatus
  ordered: BacklogItem[]
}

interface StatusVars {
  item: BacklogItem
  from: BacklogStatus
  to: BacklogStatus
}

/**
 * All server state of the backlog page. The five independent GETs run in
 * parallel; write actions update the cached lists optimistically and roll
 * back (with an error toast) when the request fails.
 */
export function useBacklogData(projectId: string) {
  const { t } = useLanguage()
  const { data: session } = useSession()
  const base = `/api/projects/${projectId}`

  const backlog = useApiQuery<BacklogResponse>(`${base}/backlog`, {
    toastOnError: (e) => `${t.backlogLoadFailed}: ${e.message}`,
  })
  const icebox = useApiQuery<IceboxResponse>(`${base}/icebox`, { toastOnError: true })
  const goals = useApiQuery<ProductGoal[]>(`${base}/goals`, { toastOnError: true })
  const members = useApiQuery<ProjectMember[]>(`${base}/members`, { toastOnError: true })
  const project = useApiQuery<{ pointUnit?: string }>(base, { toastOnError: true })

  // System admins bypass project membership and get PO-equivalent edit rights
  // (matches the requireProjectMember admin synthesis on the server side).
  const isAdmin = (session?.user as { role?: string } | undefined)?.role === "admin"
  const uid = session?.user?.id
  const myRole = uid ? (members.data?.find((m) => m.user.id === uid)?.role ?? null) : null
  const canEdit = isAdmin || myRole === "po" || myRole === "sm"
  // A failed member lookup must not silently look like "no permission".
  const roleError = !isAdmin && !members.data && members.error !== null

  const iceboxOptions: IceboxOption[] = useMemo(
    () => (icebox.data ? [...icebox.data.unreviewed, ...icebox.data.reviewed] : []),
    [icebox.data],
  )

  const setBacklog = backlog.mutate
  const refetchBacklog = backlog.refetch

  const reorder = useApiMutation(
    ({ ordered }: ReorderVars) =>
      apiFetch(`${base}/backlog/reorder`, { method: "PUT", json: { orderedIds: ordered.map((i) => i.id) } }),
    {
      onMutate: ({ status, ordered }) => {
        const prev = backlog.data
        setBacklog((d) => (d ? { ...d, [LIST_KEY[status]]: ordered } : d))
        return prev
      },
      rollback: (prev) => {
        setBacklog(prev)
        refetchBacklog()
      },
      toastOnError: () => t.backlogReorderFailed,
    },
  )

  const changeStatus = useApiMutation(
    ({ item, to }: StatusVars) =>
      apiFetch(`${base}/backlog/${item.id}`, { method: "PATCH", json: { status: to } }),
    {
      onMutate: ({ item, from, to }) => {
        const prev = backlog.data
        setBacklog((d) => {
          if (!d) return d
          const source = (d[LIST_KEY[from]] ?? []).filter((i) => i.id !== item.id)
          const target = [...(d[LIST_KEY[to]] ?? []), { ...item, status: to }]
          return { ...d, [LIST_KEY[from]]: source, [LIST_KEY[to]]: target }
        })
        return prev
      },
      rollback: (prev) => setBacklog(prev),
      // Server recomputes sort order, completedAt and the workload total.
      onSuccess: () => refetchBacklog(),
      toastOnError: (e) => `${t.backlogStatusChangeFailed}: ${e.message}`,
    },
  )

  const remove = useApiMutation(
    (itemId: string) => apiFetch(`${base}/backlog/${itemId}`, { method: "DELETE" }),
    {
      onMutate: (itemId) => {
        const prev = backlog.data
        setBacklog((d) =>
          d
            ? {
                ...d,
                readyItems: d.readyItems.filter((i) => i.id !== itemId),
                notReadyItems: d.notReadyItems.filter((i) => i.id !== itemId),
                completedItems: (d.completedItems ?? []).filter((i) => i.id !== itemId),
              }
            : d,
        )
        return prev
      },
      rollback: (prev) => setBacklog(prev),
      onSuccess: () => refetchBacklog(),
      toastOnError: (e) => `${t.backlogDeleteFailed}: ${e.message}`,
      toastOnSuccess: t.backlogDeleted,
    },
  )

  return {
    backlog,
    goals: goals.data ?? [],
    iceboxOptions,
    pointUnit: project.data?.pointUnit ?? "SP",
    canEdit,
    roleError,
    retryRole: members.refetch,
    reorder,
    changeStatus,
    remove,
  }
}
