"use client"

import { useCallback, useEffect, useRef } from "react"
import { ruleHeadingId } from "./rule-card"

interface Pending {
  /** The rule whose card heading should get focus (null = none, use the fallbacks). */
  ruleId: string | null
  /** Element id tried when the card is gone (e.g. the section heading). */
  fallbackId: string | null
  /** List data newer than the request has rendered. */
  arrived: boolean
}

function focusElement(el: HTMLElement | null): boolean {
  if (!el || !el.isConnected) return false
  if (!el.hasAttribute("tabindex")) el.setAttribute("tabindex", "-1")
  el.focus()
  return true
}

/**
 * Keyboard focus after an action whose button may unmount (the card moves to another section or leaves the list).
 * Call `request(ruleId, fallbackId)` when the action finished, then reload the list. Focus moves only once list data
 * NEWER than the request has rendered and no dialog is open (`blocked`) — so it lands on the card as it is now,
 * never on a node about to be replaced and never behind an open dialog. Fallbacks: `fallbackId`, then the page h1.
 */
export function useFocusAfterReload(
  data: unknown,
  blocked: boolean,
  /** Element id of an item's heading (lesson-rule cards by default; the actuals screen passes its own). */
  headingIdOf: (id: string) => string = ruleHeadingId,
): (ruleId: string | null, fallbackId?: string | null) => void {
  const pending = useRef<Pending | null>(null)
  const lastData = useRef<unknown>(data)
  const mounted = useRef(true)

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])

  useEffect(() => {
    if (data !== lastData.current) {
      lastData.current = data
      if (pending.current) pending.current.arrived = true
    }
    const target = pending.current
    if (!target || !target.arrived || blocked) return
    pending.current = null
    // After paint, so a closing Modal's own focus restore (on unmount) has already run.
    requestAnimationFrame(() => {
      if (!mounted.current) return
      if (target.ruleId && focusElement(document.getElementById(headingIdOf(target.ruleId)))) return
      if (target.fallbackId && focusElement(document.getElementById(target.fallbackId))) return
      focusElement(document.querySelector<HTMLElement>("h1"))
    })
  }, [data, blocked, headingIdOf])

  return useCallback((ruleId: string | null, fallbackId: string | null = null) => {
    pending.current = { ruleId, fallbackId, arrived: false }
  }, [])
}
