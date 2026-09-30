"use client"

import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef, useState, type ReactNode } from "react"
import { cn } from "./cn"
import { useUiLabels } from "./labels"
import {
  ACTION_DURATION,
  DEFAULT_DURATION,
  MAX_TOASTS,
  toastReducer,
  type ToastActionButton,
  type ToastItem,
  type ToastKind,
} from "./toast-state"

export type { ToastActionButton }

export interface ToastOptions {
  title?: string
  /** Override auto-dismiss delay (ms). 0 = sticky until dismissed. Default with an `action`: 8s. */
  duration?: number
  /** Inline button (e.g. "Undo"); clicking runs `onClick` once and dismisses the toast. */
  action?: ToastActionButton
}

export interface ToastApi {
  success(message: string, options?: ToastOptions): number
  error(message: string, options?: ToastOptions): number
  info(message: string, options?: ToastOptions): number
  dismiss(id: number): void
}

const ToastContext = createContext<ToastApi | null>(null)

/** Toast API. Throws when used outside <ToastProvider>. */
export function useToast(): ToastApi {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error("useToast must be used within ToastProvider")
  return ctx
}

/** Like useToast but returns null outside the provider (for optional integrations). */
export function useOptionalToast(): ToastApi | null {
  return useContext(ToastContext)
}

let nextToastId = 1

export function ToastProvider({ children, max = MAX_TOASTS }: { children: ReactNode; max?: number }) {
  const [toasts, dispatch] = useReducer(toastReducer, [])

  const push = useCallback(
    (kind: ToastKind, message: string, options: ToastOptions = {}) => {
      const id = nextToastId++
      dispatch({
        type: "add",
        max,
        toast: {
          id,
          kind,
          message,
          title: options.title,
          action: options.action,
          duration: options.duration ?? (options.action ? Math.max(ACTION_DURATION, DEFAULT_DURATION[kind]) : DEFAULT_DURATION[kind]),
        },
      })
      return id
    },
    [max],
  )

  const api = useMemo<ToastApi>(
    () => ({
      success: (m, o) => push("success", m, o),
      error: (m, o) => push("error", m, o),
      info: (m, o) => push("info", m, o),
      dismiss: (id) => dispatch({ type: "remove", id }),
    }),
    [push],
  )

  return (
    <ToastContext.Provider value={api}>
      {children}
      <ToastViewport toasts={toasts} onDismiss={api.dismiss} />
    </ToastContext.Provider>
  )
}

/**
 * Top offset of the toast stack. Phones: app header (h-14 = 56px) + 8px gap.
 * From md: also below the page header (title + description, P-11) so toasts
 * cover neither the header actions nor the page subtitle.
 */
export const TOAST_TOP_OFFSET = "top-16 md:top-40"

/** Key that jumps keyboard focus to the newest toast (and back again). */
export const TOAST_FOCUS_KEY = "F6"

function ToastViewport({ toasts, onDismiss }: { toasts: readonly ToastItem[]; onDismiss: (id: number) => void }) {
  const labels = useUiLabels()
  const regionRef = useRef<HTMLElement>(null)
  const returnFocusRef = useRef<HTMLElement | null>(null)
  const polite = toasts.filter((t) => t.kind !== "error")
  const assertive = toasts.filter((t) => t.kind === "error")
  const hasToasts = toasts.length > 0

  // F6 toggles focus between the page and the newest toast's dismiss button.
  // Nothing is trapped: Tab leaves the region normally.
  useEffect(() => {
    if (!hasToasts) return
    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== TOAST_FOCUS_KEY || e.altKey || e.ctrlKey || e.metaKey) return
      const region = regionRef.current
      if (!region) return
      const active = document.activeElement instanceof HTMLElement ? document.activeElement : null
      if (active && region.contains(active)) {
        e.preventDefault()
        const back = returnFocusRef.current
        returnFocusRef.current = null
        if (back?.isConnected) back.focus()
        else active.blur()
        return
      }
      const buttons = region.querySelectorAll<HTMLElement>("[data-toast-dismiss]")
      const target = buttons[buttons.length - 1]
      if (!target) return
      e.preventDefault()
      returnFocusRef.current = active
      target.focus()
    }
    document.addEventListener("keydown", onKeyDown)
    return () => document.removeEventListener("keydown", onKeyDown)
  }, [hasToasts])

  const dismissAndRestore = useCallback(
    (id: number) => {
      const region = regionRef.current
      const hadFocus = !!region && region.contains(document.activeElement)
      onDismiss(id)
      if (hadFocus) {
        const back = returnFocusRef.current
        returnFocusRef.current = null
        if (back?.isConnected) back.focus()
      }
    },
    [onDismiss],
  )

  // Live regions must exist before content is injected, so both are always rendered.
  // Placed at the TOP, below the sticky 56px app header at every width (so the
  // ☰ / search / bell stay usable) and, from md, below the page header too; never
  // over modal footers / sticky action bars at the bottom. Narrow (w-80) on the
  // right. Keep TOAST_TOP_OFFSET in sync with the header heights.
  return (
    <section
      ref={regionRef}
      aria-label={labels.notifications}
      aria-keyshortcuts={TOAST_FOCUS_KEY}
      data-toast-region=""
      className={cn("pointer-events-none fixed inset-x-4 z-[200] flex flex-col items-stretch gap-2 sm:inset-x-auto sm:right-4 sm:w-80", TOAST_TOP_OFFSET)}
    >
      <div role="alert" aria-live="assertive" aria-atomic="false" className="flex flex-col gap-2">
        {assertive.map((t) => (
          <Toast key={t.id} toast={t} onDismiss={dismissAndRestore} dismissLabel={labels.dismiss} />
        ))}
      </div>
      <div role="status" aria-live="polite" aria-atomic="false" className="flex flex-col gap-2">
        {polite.map((t) => (
          <Toast key={t.id} toast={t} onDismiss={dismissAndRestore} dismissLabel={labels.dismiss} />
        ))}
      </div>
    </section>
  )
}

const KIND_STYLE: Record<ToastKind, { box: string; icon: string; path: string }> = {
  success: {
    box: "border-success/30",
    icon: "text-success",
    path: "M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z",
  },
  error: {
    box: "border-danger/40",
    icon: "text-danger",
    path: "M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z",
  },
  info: {
    box: "border-primary/30",
    icon: "text-primary",
    path: "M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z",
  },
}

function Toast({
  toast,
  onDismiss,
  dismissLabel,
}: {
  toast: ToastItem
  onDismiss: (id: number) => void
  dismissLabel: string
}) {
  // Pause auto-dismiss while hovered or focused so the text can be read.
  const [paused, setPaused] = useState(false)
  const onDismissRef = useRef(onDismiss)
  useEffect(() => {
    onDismissRef.current = onDismiss
  })

  useEffect(() => {
    if (paused || toast.duration <= 0) return
    const timer = window.setTimeout(() => onDismissRef.current(toast.id), toast.duration)
    return () => window.clearTimeout(timer)
  }, [paused, toast.duration, toast.id])

  const style = KIND_STYLE[toast.kind]
  return (
    <div
      className={cn(
        "pointer-events-auto flex items-start gap-3 rounded-ui-md border bg-surface p-3 pr-2 shadow-ui-lg animate-toast-in",
        style.box,
      )}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
      onKeyDown={(e) => {
        // Esc dismisses the focused toast only — stop it from also closing an open modal.
        if (e.key !== "Escape") return
        e.preventDefault()
        e.stopPropagation()
        onDismiss(toast.id)
      }}
    >
      <svg aria-hidden="true" className={cn("mt-0.5 h-5 w-5 shrink-0", style.icon)} viewBox="0 0 20 20" fill="currentColor">
        <path fillRule="evenodd" d={style.path} clipRule="evenodd" />
      </svg>
      <div className="min-w-0 flex-1 text-body">
        {toast.title && <p className="font-semibold text-fg">{toast.title}</p>}
        <p className="break-words text-fg-muted">{toast.message}</p>
      </div>
      {toast.action && (
        <button
          type="button"
          onClick={() => {
            onDismiss(toast.id)
            toast.action?.onClick()
          }}
          className="inline-flex min-h-8 shrink-0 items-center rounded-ui-sm px-2 text-body font-semibold text-primary-strong hover:bg-primary-soft"
        >
          {toast.action.label}
        </button>
      )}
      <button
        type="button"
        onClick={() => onDismiss(toast.id)}
        aria-label={dismissLabel}
        title={dismissLabel}
        data-toast-dismiss=""
        className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-ui-sm text-fg-subtle hover:bg-surface-sunken hover:text-fg"
      >
        <svg aria-hidden="true" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
          <path
            fillRule="evenodd"
            d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
            clipRule="evenodd"
          />
        </svg>
      </button>
    </div>
  )
}
