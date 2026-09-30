"use client"

import { useCallback } from "react"
import { useToast } from "@/components/ui"
import { useLanguage } from "@/lib/language-context"

/** Absolute, shareable deep link to a PBI on the backlog page (by displayId: short and stable). */
export function pbiDeepLink(origin: string, projectId: string, displayId: number): string {
  return `${origin}/projects/${projectId}/backlog?pbi=${displayId}`
}

/** Copies `text` to the clipboard and confirms with a toast (the result is otherwise invisible). */
export function useCopyLink(): (text: string) => Promise<boolean> {
  const { t } = useLanguage()
  const toast = useToast()
  return useCallback(
    async (text: string) => {
      try {
        if (!navigator.clipboard) throw new Error("clipboard unavailable")
        await navigator.clipboard.writeText(text)
        toast.success(t.backlogLinkCopied)
        return true
      } catch {
        toast.error(t.backlogLinkCopyFailed)
        return false
      }
    },
    [t, toast],
  )
}
