"use client"

import { useEffect, useRef } from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { useStableCallback } from "./use-stable-callback"

/** Attribute set on the highlighted element (styled in globals.css). */
export const HIGHLIGHT_ATTR = "data-deep-link-highlight"
export const HIGHLIGHT_MS = 2400
/** How long to wait for the target element to render after `reveal`. */
const DEFAULT_TIMEOUT_MS = 2000
const POLL_MS = 50

/** Query string (without "?") with `name` removed. */
export function withoutParam(search: string, name: string): string {
  const next = new URLSearchParams(search)
  next.delete(name)
  return next.toString()
}

export function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches
}

/**
 * Scroll `el` into view, move focus to it and highlight it for `highlightMs`.
 * A non-focusable element gets a temporary `tabindex="-1"`, removed once focus
 * leaves. Returns a cleanup that removes the highlight immediately.
 */
export function focusAndHighlight(el: HTMLElement, opts: { reduceMotion: boolean; highlightMs: number }): () => void {
  el.scrollIntoView?.({ block: "center", behavior: opts.reduceMotion ? "auto" : "smooth" })
  if (!el.hasAttribute("tabindex")) {
    el.setAttribute("tabindex", "-1")
    el.addEventListener("blur", () => el.removeAttribute("tabindex"), { once: true })
  }
  el.focus({ preventScroll: true })
  el.setAttribute(HIGHLIGHT_ATTR, "")
  const timer = setTimeout(() => el.removeAttribute(HIGHLIGHT_ATTR), opts.highlightMs)
  return () => {
    clearTimeout(timer)
    el.removeAttribute(HIGHLIGHT_ATTR)
  }
}

export interface UseDeepLinkHighlightOptions {
  /** The data needed to resolve the target has loaded; nothing happens before. */
  isReady: boolean
  /**
   * Make the target renderable (expand its sprint, clear hiding filters…).
   * Return false when the target does not exist. Called once per value.
   */
  reveal?: (value: string) => boolean
  /** The target does not exist or never rendered (e.g. show a toast). */
  onNotFound?: (value: string) => void
  timeoutMs?: number
}

/**
 * Deep link to an element of the page: `?<paramName>=<value>` scrolls to
 * `#<getElementId(value)>`, focuses and briefly highlights it, then removes
 * the param from the URL (so reloads / back do not repeat it).
 * Returns the value being handled (null when there is none).
 */
export function useDeepLinkHighlight(
  paramName: string,
  getElementId: (value: string) => string,
  { isReady, reveal, onNotFound, timeoutMs = DEFAULT_TIMEOUT_MS }: UseDeepLinkHighlightOptions,
): string | null {
  const searchParams = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()
  const value = searchParams?.get(paramName) || null

  const handledRef = useRef<string | null>(null)
  const cleanupHighlightRef = useRef<(() => void) | null>(null)

  const dropParam = useStableCallback(() => {
    const qs = withoutParam(searchParams?.toString() ?? "", paramName)
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false })
  })
  const resolveId = useStableCallback(getElementId)
  const revealTarget = useStableCallback((v: string) => (reveal ? reveal(v) : true))
  const notFound = useStableCallback((v: string) => onNotFound?.(v))

  useEffect(() => {
    if (!value) {
      handledRef.current = null
      return
    }
    if (!isReady || handledRef.current === value) return
    handledRef.current = value

    if (!revealTarget(value)) {
      notFound(value)
      dropParam()
      return
    }

    const deadline = Date.now() + timeoutMs
    let timer: ReturnType<typeof setTimeout> | undefined
    const attempt = () => {
      const el = document.getElementById(resolveId(value))
      if (el) {
        cleanupHighlightRef.current?.()
        cleanupHighlightRef.current = focusAndHighlight(el, { reduceMotion: prefersReducedMotion(), highlightMs: HIGHLIGHT_MS })
        dropParam()
        return
      }
      if (Date.now() >= deadline) {
        notFound(value)
        dropParam()
        return
      }
      timer = setTimeout(attempt, POLL_MS)
    }
    // Let the reveal's state update render before looking for the element.
    timer = setTimeout(attempt, 0)
    return () => {
      if (timer !== undefined) clearTimeout(timer)
    }
  }, [value, isReady, timeoutMs, revealTarget, notFound, dropParam, resolveId])

  useEffect(() => () => cleanupHighlightRef.current?.(), [])

  return value
}
