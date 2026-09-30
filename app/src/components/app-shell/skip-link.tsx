"use client"

import type { MouseEvent } from "react"
import { useLanguage } from "@/lib/language-context"

export const MAIN_CONTENT_ID = "main-content"

/**
 * Resolve the page's main landmark: an element with id="main-content", else the
 * first <main>. Pages render their own <main>, so the target is found at click time.
 */
export function findMainContent(doc: Document): HTMLElement | null {
  return doc.getElementById(MAIN_CONTENT_ID) ?? doc.querySelector<HTMLElement>("main")
}

/** Move keyboard focus to the main landmark (made programmatically focusable). */
export function focusMainContent(doc: Document): boolean {
  const main = findMainContent(doc)
  if (!main) return false
  if (!main.hasAttribute("tabindex")) main.setAttribute("tabindex", "-1")
  main.focus({ preventScroll: false })
  main.scrollIntoView?.({ block: "start" })
  return true
}

/** "Skip to main content" link — first focusable element of every page (WCAG 2.4.1). */
export function SkipLink() {
  const { t } = useLanguage()
  const onClick = (e: MouseEvent<HTMLAnchorElement>) => {
    if (focusMainContent(document)) e.preventDefault()
  }
  return (
    <a
      href={`#${MAIN_CONTENT_ID}`}
      onClick={onClick}
      className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-2 focus:z-[100] focus:rounded-ui-sm focus:bg-surface focus:px-4 focus:py-2 focus:text-body focus:font-medium focus:text-primary-strong focus:shadow-ui-lg"
    >
      {t.skipToMain}
    </a>
  )
}
