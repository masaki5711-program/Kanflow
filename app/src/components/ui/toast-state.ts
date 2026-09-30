export type ToastKind = "success" | "error" | "info"

/** Optional inline action of a toast (e.g. "Undo"). Runs once, then the toast closes. */
export interface ToastActionButton {
  label: string
  onClick: () => void
}

export interface ToastItem {
  id: number
  kind: ToastKind
  message: string
  title?: string
  action?: ToastActionButton
  /** Auto-dismiss delay in ms; 0 keeps the toast until dismissed. */
  duration: number
}

export const MAX_TOASTS = 4

export const DEFAULT_DURATION: Record<ToastKind, number> = {
  success: 4000,
  info: 5000,
  // Errors stay longer so they can actually be read.
  error: 8000,
}

/** Default delay of a toast that offers an action: long enough to reach the button. */
export const ACTION_DURATION = 8000

export type ToastAction =
  | { type: "add"; toast: ToastItem; max?: number }
  | { type: "remove"; id: number }
  | { type: "clear" }

/** Pure reducer: newest last, oldest dropped once `max` is exceeded. */
export function toastReducer(state: readonly ToastItem[], action: ToastAction): readonly ToastItem[] {
  switch (action.type) {
    case "add": {
      const max = action.max ?? MAX_TOASTS
      // Collapse exact duplicates (e.g. the same error fired by a retry loop).
      const withoutDup = state.filter((t) => !(t.kind === action.toast.kind && t.message === action.toast.message))
      const next = [...withoutDup, action.toast]
      return next.length > max ? next.slice(next.length - max) : next
    }
    case "remove":
      return state.filter((t) => t.id !== action.id)
    case "clear":
      return []
  }
}
