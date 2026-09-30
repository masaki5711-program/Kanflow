"use client"

import { useEffect, useRef } from "react"

/**
 * Global keyboard shortcuts (one document keydown listener):
 *
 *   ?            open the shortcuts help
 *   /  Ctrl+K ⌘K open search / command palette
 *   g then b|s|p|d|i   go to backlog / sprints / plan / dashboard / icebox
 *                      of the current project
 *
 * Single-key shortcuts are ignored while the user types (input, textarea,
 * select, contenteditable), during IME composition, with Ctrl/Alt/Meta held,
 * and whenever a modal dialog is open. Ctrl+K / ⌘K also works from a text
 * field (it is not typing) but not over a modal.
 */

export const GO_KEYS = ["d", "b", "i", "s", "p"] as const
export type GoKey = (typeof GO_KEYS)[number]

/** Project sub-path per `g` + key ("" = the dashboard, the project root). */
export const GO_PATHS: Record<GoKey, string> = { d: "", b: "/backlog", i: "/icebox", s: "/sprints", p: "/plan" }

/** How long `g` waits for its second key. */
export const GO_SEQUENCE_TIMEOUT_MS = 1500

export interface ShortcutHandlers {
  onOpenSearch: () => void
  onOpenHelp: () => void
  /** Called with the target path (only when a project is open). */
  onNavigate: (href: string) => void
}

export interface UseShortcutsOptions extends ShortcutHandlers {
  /** Current project (from the URL); `g` sequences need one. */
  projectId: string | null
  enabled?: boolean
}

export function projectGoHref(projectId: string, key: GoKey): string {
  return `/projects/${encodeURIComponent(projectId)}${GO_PATHS[key]}`
}

function isGoKey(key: string): key is GoKey {
  return (GO_KEYS as readonly string[]).includes(key)
}

/** True when keystrokes on `target` are text entry. */
export function isTypingTarget(target: EventTarget | null): boolean {
  if (!target || typeof (target as Element).closest !== "function") return false
  const el = target as HTMLElement
  if (el.isContentEditable) return true
  const editable = el.closest("input, textarea, select, [contenteditable]:not([contenteditable='false'])")
  if (!editable) return false
  if (editable instanceof HTMLInputElement) {
    return !["button", "checkbox", "radio", "range", "color", "file", "submit", "reset", "image"].includes(editable.type)
  }
  return true
}

/** True while any modal dialog (kit Modal, confirm, drawer, palette) is open. */
export function isModalOpen(doc: Document = document): boolean {
  return doc.querySelector('[aria-modal="true"]') !== null
}

function isPaletteCombo(e: KeyboardEvent): boolean {
  return (e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && e.key.toLowerCase() === "k"
}

export function useShortcuts(options: UseShortcutsOptions): void {
  const latest = useRef(options)
  useEffect(() => {
    latest.current = options
  })
  const enabled = options.enabled ?? true

  useEffect(() => {
    if (!enabled) return
    let goPendingAt: number | null = null

    function onKeyDown(e: KeyboardEvent) {
      if (e.defaultPrevented || e.isComposing || e.repeat) return
      const opts = latest.current
      if (isPaletteCombo(e)) {
        if (isModalOpen()) return
        e.preventDefault()
        goPendingAt = null
        opts.onOpenSearch()
        return
      }
      if (e.ctrlKey || e.metaKey || e.altKey) return
      if (isTypingTarget(e.target) || isModalOpen()) {
        goPendingAt = null
        return
      }

      const pending = goPendingAt !== null && Date.now() - goPendingAt <= GO_SEQUENCE_TIMEOUT_MS
      goPendingAt = null
      const key = e.key.length === 1 ? e.key.toLowerCase() : e.key
      if (pending && isGoKey(key) && opts.projectId) {
        e.preventDefault()
        opts.onNavigate(projectGoHref(opts.projectId, key))
        return
      }
      if (e.key === "?") {
        e.preventDefault()
        opts.onOpenHelp()
      } else if (e.key === "/") {
        e.preventDefault()
        opts.onOpenSearch()
      } else if (key === "g" && !e.shiftKey && opts.projectId) {
        goPendingAt = Date.now()
      }
    }

    document.addEventListener("keydown", onKeyDown)
    return () => document.removeEventListener("keydown", onKeyDown)
  }, [enabled])
}
