"use client"

import { useEffect } from "react"

/**
 * Warn before the tab is closed / reloaded / navigated away (full page loads)
 * while `isDirty` is true. Browsers show their own generic text; the message
 * cannot be customised.
 *
 * For in-app dialogs use `<Modal isDirty>` which asks via the confirm dialog.
 */
export function useUnsavedChangesGuard(isDirty: boolean): void {
  useEffect(() => {
    if (!isDirty) return
    function onBeforeUnload(e: BeforeUnloadEvent) {
      e.preventDefault()
      // Legacy browsers require returnValue to be set.
      e.returnValue = ""
    }
    window.addEventListener("beforeunload", onBeforeUnload)
    return () => window.removeEventListener("beforeunload", onBeforeUnload)
  }, [isDirty])
}
