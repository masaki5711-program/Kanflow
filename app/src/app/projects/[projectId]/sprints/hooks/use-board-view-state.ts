"use client"

import { useCallback, useMemo, useSyncExternalStore } from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import {
  parseBoardParams,
  parseStoredView,
  storedViewKey,
  withBoardParams,
  type BoardParamsPatch,
  type SprintView,
} from "../components/board/board-url-state"
import type { SwimlaneMode, TaskFilter } from "../components/board/board-model"

/** Same-tab change notification (the native `storage` event only fires in other tabs). */
const VIEW_PREF_EVENT = "kanflow:sprint-view-pref"

function readStored(key: string): string | null {
  try {
    return window.localStorage.getItem(key)
  } catch {
    // Storage blocked (private mode / policy): the view is simply not remembered.
    return null
  }
}

function writeStored(key: string, value: SprintView): void {
  try {
    window.localStorage.setItem(key, value)
  } catch {
    // Storage blocked: non-critical convenience, the URL still carries the view.
  }
  window.dispatchEvent(new Event(VIEW_PREF_EVENT))
}

function subscribe(onChange: () => void): () => void {
  window.addEventListener("storage", onChange)
  window.addEventListener(VIEW_PREF_EVENT, onChange)
  return () => {
    window.removeEventListener("storage", onChange)
    window.removeEventListener(VIEW_PREF_EVENT, onChange)
  }
}

export interface BoardViewState {
  view: SprintView
  swimlane: SwimlaneMode
  filter: TaskFilter
  setView: (view: SprintView) => void
  setSwimlane: (mode: SwimlaneMode) => void
  setAssignee: (assignee: string) => void
  setQuery: (query: string) => void
  clearFilters: () => void
}

/**
 * Sprint view (list / board), swimlanes and filters, kept in the URL
 * (`?view=board&swim=pbi&assignee=me&q=…`) so a view can be shared and
 * survives reloads. Without `view` in the URL the user's last choice
 * (localStorage, per user) is used.
 */
export function useBoardViewState(userId: string | null | undefined): BoardViewState {
  const searchParams = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()
  const search = searchParams?.toString() ?? ""
  const parsed = useMemo(() => parseBoardParams(new URLSearchParams(search)), [search])

  const key = storedViewKey(userId)
  const storedRaw = useSyncExternalStore(subscribe, () => readStored(key), () => null)
  const view = parsed.view ?? parseStoredView(storedRaw) ?? "list"

  const replace = useCallback(
    (patch: BoardParamsPatch) => {
      const qs = withBoardParams(search, patch)
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false })
    },
    [router, pathname, search],
  )

  const setView = useCallback(
    (next: SprintView) => {
      writeStored(key, next)
      replace({ view: next })
    },
    [key, replace],
  )

  return {
    view,
    swimlane: parsed.swimlane,
    filter: parsed.filter,
    setView,
    setSwimlane: useCallback((swimlane: SwimlaneMode) => replace({ swimlane }), [replace]),
    setAssignee: useCallback((assignee: string) => replace({ assignee }), [replace]),
    setQuery: useCallback((query: string) => replace({ query }), [replace]),
    clearFilters: useCallback(() => replace({ assignee: "", query: "" }), [replace]),
  }
}
