"use client"

import { useEffect } from "react"
import { useStableCallback } from "./use-stable-callback"

/**
 * Browser Back / Forward while `isDirty`: the history move is undone right
 * away (the URL — and whatever it opens, e.g. a `?pbi=` modal — is put back
 * with pushState) and `ask()` decides. When the user agrees to discard, the
 * move is redone (`history.back()`) without asking again.
 *
 * Complements `useUnsavedChangesGuard` (tab close / reload) and `<Modal
 * isDirty>` (✕ / Esc / Cancel), which cannot see in-app history moves.
 *
 *   const confirm = useConfirm()
 *   useBackNavigationGuard(isDirty, () => confirm({ title: ui.unsavedTitle, message: ui.unsavedMessage, … }))
 */
export function useBackNavigationGuard(isDirty: boolean, ask: () => Promise<boolean>): void {
  const askLatest = useStableCallback(ask)

  useEffect(() => {
    if (!isDirty) return
    // The URL of the dirty editor (the entry Back just left).
    const guardedUrl = window.location.href
    let leaving = false
    let asking = false

    async function onPopState() {
      if (leaving) return
      // Stay: restore the entry first, so the page (and its modal) keep their state while asking.
      window.history.pushState(null, "", guardedUrl)
      if (asking) return
      asking = true
      try {
        if (!(await askLatest())) return
      } finally {
        asking = false
      }
      leaving = true
      window.history.back()
    }

    window.addEventListener("popstate", onPopState)
    return () => window.removeEventListener("popstate", onPopState)
  }, [isDirty, askLatest])
}
