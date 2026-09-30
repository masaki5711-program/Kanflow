"use client"

import { useMemo } from "react"
import type { IceboxUsage } from "@/components/pbi-form/use-pbi-form-options"
import { facetOptions, matchesFilters, type BacklogFilters, type FacetOptions } from "./url-state"
import type { BacklogItem, BacklogResponse, BacklogStatus } from "./types"

/** Completed items shown at first / added per "show more". */
export const DONE_PAGE_SIZE = 20

export type SectionLists = Record<BacklogStatus, BacklogItem[]>

export interface BacklogView {
  /** Full (unfiltered) lists in server order. */
  lists: SectionLists
  /** Every loaded PBI (all sections). */
  all: BacklogItem[]
  /** Filtered lists; `completed` is newest-first and cut to `doneLimit`. */
  visible: SectionLists
  /** Filtered completed items before the cut. */
  doneMatches: number
  /** Whether the completed section is rendered (showDone or a completed status filter). */
  showDone: boolean
  facets: FacetOptions
  iceboxUsage: ReadonlyMap<string, IceboxUsage>
  /** On-screen order across sections (selection ranges). */
  orderedIds: string[]
  total: number
  shown: number
}

const EMPTY: BacklogItem[] = []

function newestDoneFirst(a: BacklogItem, b: BacklogItem): number {
  return (b.completedAt ?? "").localeCompare(a.completedAt ?? "")
}

/** Everything the backlog page derives from the loaded lists and the URL filters. */
export function useBacklogView(data: BacklogResponse | null | undefined, filters: BacklogFilters, doneLimit: number): BacklogView {
  const lists = useMemo<SectionLists>(
    () => ({
      ready: data?.readyItems ?? EMPTY,
      not_ready: data?.notReadyItems ?? EMPTY,
      completed: data?.completedItems ?? EMPTY,
    }),
    [data],
  )
  const all = useMemo(() => [...lists.ready, ...lists.not_ready, ...lists.completed], [lists])

  const derived = useMemo(() => {
    const match = (i: BacklogItem) => matchesFilters(i, filters)
    const done = lists.completed.filter(match).sort(newestDoneFirst)
    const showDone = filters.showDone || filters.status === "completed"
    const visible: SectionLists = {
      ready: lists.ready.filter(match),
      not_ready: lists.not_ready.filter(match),
      completed: done.slice(0, doneLimit),
    }
    const orderedIds = [...visible.ready, ...visible.not_ready, ...(showDone ? visible.completed : [])].map((i) => i.id)
    return {
      visible,
      doneMatches: done.length,
      showDone,
      orderedIds,
      shown: visible.ready.length + visible.not_ready.length + done.length,
    }
  }, [lists, filters, doneLimit])

  const facets = useMemo(() => facetOptions(all), [all])

  // "Which IceBox requests are already referenced by a PBI?" (reuse warning in the form).
  const iceboxUsage = useMemo(() => {
    const map = new Map<string, IceboxUsage>()
    for (const pbi of all) {
      if (!pbi.iceboxItemId) continue
      map.set(pbi.iceboxItemId, { pbiId: pbi.id, displayId: pbi.displayId, label: pbi.initiative || pbi.userStory || `#${pbi.displayId}` })
    }
    return map
  }, [all])

  return { lists, all, facets, iceboxUsage, total: all.length, ...derived }
}
