"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { apiFetch, useApiQuery } from "@/hooks"
import type { EntityI18n } from "@/lib/translation/types"
import type { LinkablePbi, LinkedPbi } from "../lib/plan-types"

export const LINK_SEARCH_DEBOUNCE_MS = 250

/** Display data of a PBI in the link picker; `planItem` = where it is linked now. */
export interface LinkChoice {
  id: string
  displayId: number
  title: string
  status: string
  planItem: { id: string; name: string; i18n?: EntityI18n } | null
  /** `{ title }` translation. */
  i18n?: EntityI18n
}

const NO_LINKS: LinkedPbi[] = []
const NO_RESULTS: LinkablePbi[] = []

/** GET /plan/linkable-pbis answers `{ pbis: [...] }` (a bare array is accepted too). */
export function parseLinkable(raw: unknown): LinkablePbi[] {
  if (Array.isArray(raw)) return raw as LinkablePbi[]
  const pbis = raw && typeof raw === "object" ? (raw as { pbis?: unknown }).pbis : null
  return Array.isArray(pbis) ? (pbis as LinkablePbi[]) : []
}

/** Open PBIs first, done ones last; each group by number (A3-06: the list had no order). Pure. */
export function sortLinkable<T extends { displayId: number; status: string }>(pbis: readonly T[]): T[] {
  const rank = (p: T) => (p.status === "done" ? 1 : 0)
  return [...pbis].sort((a, b) => rank(a) - rank(b) || a.displayId - b.displayId)
}

function sameSet(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false
  const s = new Set(a)
  return b.every((x) => s.has(x))
}

/**
 * PBI links of one leaf plan item: the saved links, the local selection and a
 * debounced search over linkable PBIs. `save()` PUTs the whole selection.
 */
export function usePlanLinks(base: string, itemId: string | null, enabled: boolean) {
  const links = useApiQuery<{ pbis: LinkedPbi[] }>(enabled && itemId ? `${base}/${itemId}/links` : null, { toastOnError: true })
  const saved = links.data?.pbis ?? NO_LINKS
  const savedIds = useMemo(() => saved.map((p) => p.id), [saved])
  // null = untouched (the saved links); otherwise the chosen PBIs with their display data.
  const [selected, setSelected] = useState<ReadonlyMap<string, LinkChoice> | null>(null)

  const [query, setQuery] = useState("")
  const [debounced, setDebounced] = useState("")
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(query.trim()), LINK_SEARCH_DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [query])
  const search = useApiQuery<LinkablePbi[]>(enabled && itemId ? `${base}/linkable-pbis?q=${encodeURIComponent(debounced)}` : null, {
    parse: parseLinkable,
    toastOnError: true,
  })
  const results = useMemo(() => sortLinkable(search.data ?? NO_RESULTS), [search.data])

  const savedChoices = useMemo(
    () => new Map<string, LinkChoice>(saved.map((p) => [p.id, { ...p, planItem: itemId ? { id: itemId, name: "" } : null }])),
    [saved, itemId],
  )
  const current = selected ?? savedChoices
  const selectedIds = useMemo(() => [...current.keys()], [current])

  const toggle = useCallback(
    (choice: LinkChoice) =>
      setSelected((prev) => {
        const next = new Map(prev ?? savedChoices)
        if (next.has(choice.id)) next.delete(choice.id)
        else next.set(choice.id, choice)
        return next
      }),
    [savedChoices],
  )

  const chosen = [...current.values()]
  const moving = chosen.filter((c) => c.planItem && c.planItem.id !== itemId && !savedIds.includes(c.id))
  const isDirty = selected !== null && !sameSet(selectedIds, savedIds)

  const save = useCallback(async () => {
    if (!itemId) return
    await apiFetch(`${base}/${itemId}/links`, { method: "PUT", json: { pbiIds: selectedIds } })
    setSelected(null)
    links.refetch()
  }, [base, selectedIds, itemId, links])

  return {
    isLoading: links.isLoading,
    isSearching: search.isFetching,
    selectedIds,
    chosen,
    moving,
    results,
    query,
    setQuery,
    toggle,
    isDirty,
    save,
  }
}

export type PlanLinksState = ReturnType<typeof usePlanLinks>
