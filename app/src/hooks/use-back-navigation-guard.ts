"use client"

import { useEffect } from "react"
import { registerPopstateGuard } from "./popstate-gate"
import { useStableCallback } from "./use-stable-callback"

/**
 * Browser Back / Forward while `isDirty`: the history move is undone right
 * away (the URL — and whatever it opens, e.g. a `?pbi=` modal — is put back
 * with pushState) and `ask()` decides. When the user agrees to discard, the
 * move is redone (`history.back()`) without asking again.
 *
 * The listener goes through the popstate gate (./popstate-gate), which is
 * installed before the Next.js router's own listener: a guard that keeps the
 * user on the page stops the event, so the router never re-renders for the
 * move (it used to unmount the modal first — F-02). The guarded entry's own
 * `history.state` (Next's `__NA` + tree) is re-pushed, so Next's patched
 * pushState passes it through untouched and the router state stays consistent.
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
    // The URL (and router state) of the dirty editor — the entry Back just left.
    const guardedUrl = window.location.href
    const guardedState: unknown = window.history.state
    let leaving = false
    let asking = false

    async function decide() {
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

    return registerPopstateGuard(() => {
      if (leaving) {
        // Our own history.back() after "discard": let the router handle it; guard again afterwards.
        leaving = false
        return false
      }
      // Stay: restore the entry first, so the page (and its modal) keep their state while asking.
      window.history.pushState(guardedState, "", guardedUrl)
      void decide()
      return true
    })
  }, [isDirty, askLatest])
}
