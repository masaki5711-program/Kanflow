"use client"

import { useEffect, useId, useRef, type RefObject } from "react"
import { createLayerStack, getTabbables, nextTrappedFocus } from "./focus-trap-utils"

/** Shared across every trap in the app so stacked dialogs cooperate. */
const layerStack = createLayerStack()

export interface FocusTrapOptions {
  /**
   * Element to focus on activation. Either a ref or a function evaluated
   * after mount. Falls back to `[data-autofocus]`, then the first tabbable
   * element, then the container itself (give it tabIndex={-1}).
   */
  initialFocus?: RefObject<HTMLElement | null> | (() => HTMLElement | null)
  /** Return focus to the previously focused element on deactivate. Default true. */
  restoreFocus?: boolean
  /** Called on Escape — only when this trap is the top-most active layer. */
  onEscape?: () => void
}

function resolveInitial(container: HTMLElement, initial: FocusTrapOptions["initialFocus"]): HTMLElement {
  const explicit = typeof initial === "function" ? initial() : initial?.current
  if (explicit) return explicit
  const auto = container.querySelector<HTMLElement>("[data-autofocus]")
  if (auto) return auto
  return getTabbables(container)[0] ?? container
}

/**
 * Keep keyboard focus inside `ref` while `active`:
 *  - moves focus in on activation, restores it on deactivation;
 *  - wraps Tab / Shift+Tab at the edges (and pulls stray focus back in);
 *  - handles Escape via `onEscape` for the top-most layer only.
 */
export function useFocusTrap(
  ref: RefObject<HTMLElement | null>,
  active: boolean,
  options: FocusTrapOptions = {},
): void {
  const layerId = useId()
  const optionsRef = useRef(options)

  useEffect(() => {
    optionsRef.current = options
  })

  useEffect(() => {
    if (!active) return
    const container = ref.current
    if (!container) return

    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null
    layerStack.push(layerId)

    const focusTimer = window.setTimeout(() => {
      if (!container.contains(document.activeElement)) {
        resolveInitial(container, optionsRef.current.initialFocus).focus({ preventScroll: true })
      }
    }, 0)

    function onKeyDown(e: KeyboardEvent) {
      if (!layerStack.isTop(layerId) || !container) return
      if (e.key === "Escape" && optionsRef.current.onEscape) {
        e.preventDefault()
        e.stopPropagation()
        optionsRef.current.onEscape()
        return
      }
      if (e.key !== "Tab") return
      const active = document.activeElement instanceof HTMLElement ? document.activeElement : null
      const target = nextTrappedFocus(getTabbables(container), active, e.shiftKey)
      if (target) {
        e.preventDefault()
        target.focus()
      } else if (!active || !container.contains(active)) {
        e.preventDefault()
        container.focus()
      }
    }

    document.addEventListener("keydown", onKeyDown)
    return () => {
      window.clearTimeout(focusTimer)
      document.removeEventListener("keydown", onKeyDown)
      layerStack.remove(layerId)
      if (optionsRef.current.restoreFocus !== false && previouslyFocused?.isConnected) {
        previouslyFocused.focus({ preventScroll: true })
      }
    }
  }, [active, ref, layerId])
}
