/**
 * Pure helpers behind `useFocusTrap`. Kept DOM-light so they can be unit
 * tested in a node environment.
 */

export const TABBABLE_SELECTOR = [
  "a[href]",
  "area[href]",
  "button",
  "input:not([type='hidden'])",
  "select",
  "textarea",
  "iframe",
  "audio[controls]",
  "video[controls]",
  "summary",
  "[contenteditable='true']",
  "[tabindex]",
].join(",")

/** Minimal element shape needed to decide tabbability. */
export interface TabbableCandidate {
  tabIndex: number
  disabled?: boolean
  hidden?: boolean
  getAttribute(name: string): string | null
}

/**
 * Whether an element matched by TABBABLE_SELECTOR can receive Tab focus.
 * `isVisible` is passed in so the DOM-dependent layout check stays outside.
 */
export function isTabbable(el: TabbableCandidate, isVisible: boolean): boolean {
  if (!isVisible) return false
  if (el.hidden) return false
  if (el.disabled) return false
  if (el.tabIndex < 0) return false
  if (el.getAttribute("aria-hidden") === "true") return false
  if (el.getAttribute("inert") !== null) return false
  return true
}

/**
 * Given the ordered tabbables of a trap, the currently focused element and the
 * Tab direction, return the element that must receive focus to keep it
 * trapped — or null when the browser's default Tab movement is fine.
 */
export function nextTrappedFocus<T>(tabbables: readonly T[], active: T | null, shiftKey: boolean): T | null {
  if (tabbables.length === 0) return null
  const first = tabbables[0]
  const last = tabbables[tabbables.length - 1]
  const index = active === null ? -1 : tabbables.indexOf(active)
  if (index === -1) return shiftKey ? last : first
  if (shiftKey && index === 0) return last
  if (!shiftKey && index === tabbables.length - 1) return first
  return null
}

/** Collect tabbable descendants in DOM order (browser only). */
export function getTabbables(container: HTMLElement): HTMLElement[] {
  const nodes = Array.from(container.querySelectorAll<HTMLElement>(TABBABLE_SELECTOR))
  return nodes.filter((el) => {
    const visible = el.getClientRects().length > 0
    const disabled = "disabled" in el ? Boolean((el as HTMLButtonElement).disabled) : false
    return isTabbable({ tabIndex: el.tabIndex, disabled, hidden: el.hidden, getAttribute: (n) => el.getAttribute(n) }, visible)
  })
}

/**
 * Ordered stack of active overlay layers (modals, confirm dialogs). Only the
 * top layer handles Escape / Tab so stacked dialogs don't fight each other.
 */
export interface LayerStack {
  push(id: string): void
  remove(id: string): void
  isTop(id: string): boolean
  size(): number
}

export function createLayerStack(): LayerStack {
  let layers: readonly string[] = []
  return {
    push(id) {
      layers = [...layers.filter((l) => l !== id), id]
    },
    remove(id) {
      layers = layers.filter((l) => l !== id)
    },
    isTop(id) {
      return layers.length > 0 && layers[layers.length - 1] === id
    },
    size() {
      return layers.length
    },
  }
}
