"use client"

import { useEffect } from "react"
import { formatDocumentTitle } from "@/lib/i18n/document-title"

/**
 * Set `document.title` to "<part> · <part> · Kanflow" (WCAG 2.4.2) while the
 * calling component is mounted. Empty parts are skipped. The previous title is
 * restored on unmount so a page never leaves a stale title behind.
 */
export function useDocumentTitle(parts: ReadonlyArray<string | null | undefined>): string {
  const title = formatDocumentTitle(parts)

  useEffect(() => {
    const previous = document.title
    document.title = title
    return () => {
      document.title = previous
    }
  }, [title])

  return title
}
