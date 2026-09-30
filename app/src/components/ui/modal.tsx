"use client"

import {
  createContext,
  useCallback,
  useContext,
  useId,
  useRef,
  useSyncExternalStore,
  type ReactNode,
  type RefObject,
} from "react"
import { createPortal } from "react-dom"
import { useOptionalConfirm } from "@/components/confirm-dialog"
import { useFocusTrap } from "@/hooks/use-focus-trap"
import { useBodyScrollLock } from "@/hooks/use-body-scroll-lock"
import { cn } from "./cn"
import { useUiLabels } from "./labels"

export type ModalSize = "sm" | "md" | "lg" | "xl" | "full"
export type ModalCloseReason = "escape" | "overlay" | "close-button" | "request"

const SIZE: Record<ModalSize, string> = {
  sm: "sm:max-w-sm",
  md: "sm:max-w-lg",
  lg: "sm:max-w-2xl",
  xl: "sm:max-w-4xl",
  full: "sm:max-w-none sm:w-[calc(100vw-2rem)] sm:h-[calc(100dvh-2rem)]",
}

export interface ModalProps {
  open: boolean
  /**
   * Called once the close has been confirmed (after the unsaved-changes
   * prompt when `isDirty`). Set `open` to false here.
   */
  onClose: (reason: ModalCloseReason) => void
  /** Dialog title — also the accessible name (aria-labelledby). */
  title: ReactNode
  /** Optional subtitle, linked via aria-describedby. */
  description?: ReactNode
  children: ReactNode
  /** Sticky footer (action buttons). Use `useModalClose()` inside for a guarded Cancel. */
  footer?: ReactNode
  /** Extra controls rendered in the header, left of the close button. */
  headerActions?: ReactNode
  size?: ModalSize
  /** Close when the backdrop is clicked. Default false (drag-selecting text out of a dialog must not close it). */
  closeOnOverlayClick?: boolean
  /** Close on Escape. Default true. */
  closeOnEsc?: boolean
  /** When true, closing asks for confirmation first (unsaved-changes guard). */
  isDirty?: boolean
  /** Override the unsaved-changes prompt texts. */
  dirtyConfirm?: { title?: string; message?: string; confirmLabel?: string; cancelLabel?: string }
  /** Element to focus on open. Default: `[data-autofocus]`, else first focusable in the body. */
  initialFocusRef?: RefObject<HTMLElement | null>
  hideCloseButton?: boolean
  /** Accessible label for the ✕ button. Default: localized "Close". */
  closeLabel?: string
  className?: string
  bodyClassName?: string
}

interface ModalContextValue {
  /** Guarded close — honours `isDirty`. Use for footer Cancel buttons. */
  requestClose: () => void
  titleId: string
}

const ModalContext = createContext<ModalContextValue | null>(null)

/** Guarded close function of the enclosing Modal (runs the unsaved-changes check). */
export function useModalClose(): () => void {
  const ctx = useContext(ModalContext)
  if (!ctx) throw new Error("useModalClose must be used inside <Modal>")
  return ctx.requestClose
}

const noopSubscribe = () => () => {}

/**
 * Accessible dialog: portal to <body>, role="dialog" + aria-modal, labelled
 * by its title, focus trapped and restored, Escape to close, body scroll
 * locked, full-screen below the `sm` breakpoint.
 */
export function Modal(props: ModalProps) {
  const isClient = useSyncExternalStore(noopSubscribe, () => true, () => false)
  if (!props.open || !isClient) return null
  return createPortal(<ModalPanel {...props} />, document.body)
}

function ModalPanel({
  onClose,
  title,
  description,
  children,
  footer,
  headerActions,
  size = "md",
  closeOnOverlayClick = false,
  closeOnEsc = true,
  isDirty = false,
  dirtyConfirm,
  initialFocusRef,
  hideCloseButton = false,
  closeLabel,
  className,
  bodyClassName,
}: Omit<ModalProps, "open">) {
  const labels = useUiLabels()
  const confirm = useOptionalConfirm()
  const panelRef = useRef<HTMLDivElement>(null)
  const bodyRef = useRef<HTMLDivElement>(null)
  const overlayPressRef = useRef(false)
  const confirmingRef = useRef(false)
  const titleId = useId()
  const descriptionId = useId()

  const requestClose = useCallback(
    async (reason: ModalCloseReason) => {
      if (confirmingRef.current) return
      if (isDirty) {
        confirmingRef.current = true
        const options = {
          title: dirtyConfirm?.title ?? labels.unsavedTitle,
          message: dirtyConfirm?.message ?? labels.unsavedMessage,
          confirmLabel: dirtyConfirm?.confirmLabel ?? labels.discard,
          cancelLabel: dirtyConfirm?.cancelLabel ?? labels.cancel,
          variant: "warning" as const,
        }
        const ok = confirm ? await confirm(options) : window.confirm(options.message)
        confirmingRef.current = false
        if (!ok) return
      }
      onClose(reason)
    },
    [isDirty, dirtyConfirm, labels, confirm, onClose],
  )

  useFocusTrap(panelRef, true, {
    initialFocus: () =>
      initialFocusRef?.current ??
      panelRef.current?.querySelector<HTMLElement>("[data-autofocus]") ??
      firstFocusable(bodyRef.current) ??
      panelRef.current,
    onEscape: closeOnEsc ? () => void requestClose("escape") : undefined,
  })
  useBodyScrollLock(true)

  const ctx: ModalContextValue = { requestClose: () => void requestClose("request"), titleId }

  return (
    <div
      className="fixed inset-0 z-[100] flex items-stretch justify-center bg-black/40 backdrop-blur-[2px] animate-fade-in sm:items-center sm:p-4"
      onMouseDown={(e) => {
        overlayPressRef.current = e.target === e.currentTarget
      }}
      onMouseUp={(e) => {
        const pressedOnOverlay = overlayPressRef.current
        overlayPressRef.current = false
        // Require press AND release on the backdrop so text-selection drags never close.
        if (closeOnOverlayClick && pressedOnOverlay && e.target === e.currentTarget) {
          void requestClose("overlay")
        }
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        tabIndex={-1}
        className={cn(
          "flex w-full flex-col overflow-hidden bg-surface shadow-ui-overlay animate-in outline-none",
          "h-full max-h-dvh sm:h-auto sm:max-h-[calc(100dvh-2rem)] sm:rounded-ui-lg",
          SIZE[size],
          className,
        )}
      >
        <ModalContext.Provider value={ctx}>
          <header className="flex shrink-0 items-start gap-3 border-b border-border px-5 py-4">
            <div className="min-w-0 flex-1">
              <h2 id={titleId} className="text-title font-semibold text-fg break-words">
                {title}
              </h2>
              {description && (
                <p id={descriptionId} className="mt-0.5 text-body text-fg-muted">
                  {description}
                </p>
              )}
            </div>
            {headerActions && <div className="flex shrink-0 items-center gap-1">{headerActions}</div>}
            {!hideCloseButton && (
              <button
                type="button"
                onClick={() => void requestClose("close-button")}
                aria-label={closeLabel ?? labels.close}
                title={closeLabel ?? labels.close}
                className="-mr-1 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-ui-sm text-fg-subtle hover:bg-surface-sunken hover:text-fg"
              >
                <svg aria-hidden="true" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                  <path
                    fillRule="evenodd"
                    d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                    clipRule="evenodd"
                  />
                </svg>
              </button>
            )}
          </header>
          <div ref={bodyRef} className={cn("min-h-0 flex-1 overflow-y-auto px-5 py-4", bodyClassName)}>
            {children}
          </div>
          {footer && (
            <footer className="flex shrink-0 flex-wrap items-center justify-end gap-2 border-t border-border bg-surface-muted px-5 py-3">
              {footer}
            </footer>
          )}
        </ModalContext.Provider>
      </div>
    </div>
  )
}

function firstFocusable(root: HTMLElement | null): HTMLElement | null {
  if (!root) return null
  return root.querySelector<HTMLElement>(
    "input:not([type='hidden']):not([disabled]), textarea:not([disabled]), select:not([disabled]), button:not([disabled]), a[href], [tabindex]:not([tabindex='-1'])",
  )
}
