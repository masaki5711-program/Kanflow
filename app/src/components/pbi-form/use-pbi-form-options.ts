"use client"

import { useMemo } from "react"
import { useApiQuery } from "@/hooks"
import type { IceboxItemDto, ProductGoalDto } from "@/types/api"

export type PbiIceboxOption = Pick<IceboxItemDto, "id" | "displayId" | "request" | "author" | "i18n">
export type PbiGoalOption = Pick<ProductGoalDto, "id" | "title" | "i18n">

/** A PBI that already references an IceBox request (reuse warning). */
export interface IceboxUsage {
  pbiId: string
  displayId: number
  label: string
}

/** Choices the PBI form offers. Pages that already hold them pass them in; otherwise they are fetched. */
export interface PbiFormOptions {
  iceboxOptions: readonly PbiIceboxOption[]
  goals: readonly PbiGoalOption[]
  pointUnit: string
  /** iceboxItemId → the PBI using it (may include the edited PBI itself; the form skips it). */
  iceboxUsage: ReadonlyMap<string, IceboxUsage>
}

interface IceboxResponse {
  unreviewed: PbiIceboxOption[]
  reviewed: PbiIceboxOption[]
}

const NO_USAGE: ReadonlyMap<string, IceboxUsage> = new Map()

/**
 * The form's choices: `provided` when the caller has them (backlog page),
 * else loaded lazily once `enabled` (edit / create mode) — the read-only
 * detail view never pays for these requests.
 */
export function usePbiFormOptions(projectId: string, enabled: boolean, provided?: PbiFormOptions): PbiFormOptions {
  const fetchOwn = enabled && !provided
  const base = `/api/projects/${projectId}`
  const icebox = useApiQuery<IceboxResponse>(fetchOwn ? `${base}/icebox` : null, { toastOnError: true })
  const goals = useApiQuery<PbiGoalOption[]>(fetchOwn ? `${base}/goals` : null, { toastOnError: true })
  const project = useApiQuery<{ pointUnit?: string }>(fetchOwn ? base : null, { toastOnError: true })

  const fetched = useMemo<PbiFormOptions>(
    () => ({
      iceboxOptions: icebox.data ? [...icebox.data.unreviewed, ...icebox.data.reviewed] : [],
      goals: goals.data ?? [],
      pointUnit: project.data?.pointUnit ?? "SP",
      iceboxUsage: NO_USAGE,
    }),
    [icebox.data, goals.data, project.data],
  )
  return provided ?? fetched
}
