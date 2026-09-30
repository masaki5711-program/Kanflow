"use client"

import { createContext, useContext, useState, useCallback, useId, useRef, useSyncExternalStore } from "react"
import { createPortal } from "react-dom"
import { AlertTriangle, Info } from "lucide-react"
import { useUiLabels } from "@/components/ui/labels"
import { Button } from "@/components/ui/button"
import { useFocusTrap } from "@/hooks/use-focus-trap"
import { useBodyScrollLock } from "@/hooks/use-body-scroll-lock"

interface ConfirmOptions {
  title?: string
  message: string
  confirmLabel?: string
  cancelLabel?: string
  variant?: "danger" | "warning" | "info"
}

interface ConfirmContextValue {
  confirm: (options: ConfirmOptions) => Promise<boolean>
}

const ConfirmContext = createContext<ConfirmContextValue | null>(null)

export function useConfirm() {
  const ctx = useContext(ConfirmContext)
  if (!ctx) throw new Error("useConfirm must be used within ConfirmProvider")
  return ctx.confirm
}

/** Like useConfirm but returns null outside <ConfirmProvider> (for optional integrations). */
export function useOptionalConfirm(): ((options: ConfirmOptions) => Promise<boolean>) | null {
  return useContext(ConfirmContext)?.confirm ?? null
}

export type { ConfirmOptions }

interface DialogState extends ConfirmOptions {
  resolve: (value: boolean) => void
}

export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [dialog, setDialog] = useState<DialogState | null>(null)

  const confirm = useCallback((options: ConfirmOptions): Promise<boolean> => {
    return new Promise((resolve) => {
      setDialog((prev) => {
        // A newer request supersedes a pending one — resolve the old as cancelled.
        prev?.resolve(false)
        return { ...options, resolve }
      })
    })
  }, [])

  const close = useCallback((result: boolean) => {
    setDialog((prev) => {
      prev?.resolve(result)
      return null
    })
  }, [])

  return (
    <ConfirmContext.Provider value={{ confirm }}>
      {children}
      {dialog && <ConfirmDialog dialog={dialog} onClose={close} />}
    </ConfirmContext.Provider>
  )
}

const VARIANT_STYLES = {
  danger: { Icon: AlertTriangle, iconClass: "bg-danger-soft text-danger-strong", button: "danger" },
  // The kit has no amber button; the icon carries the warning tone.
  warning: { Icon: AlertTriangle, iconClass: "bg-warning-soft text-warning-strong", button: "primary" },
  info: { Icon: Info, iconClass: "bg-primary-soft text-primary-strong", button: "primary" },
} as const

const noopSubscribe = () => () => {}

interface ConfirmDialogProps {
  dialog: DialogState
  onClose: (result: boolean) => void
}

function ConfirmDialog(props: ConfirmDialogProps) {
  // Portals need document; render nothing during SSR/hydration.
  const isClient = useSyncExternalStore(noopSubscribe, () => true, () => false)
  return isClient ? createPortal(<ConfirmDialogPanel {...props} />, document.body) : null
}

function ConfirmDialogPanel({ dialog, onClose }: ConfirmDialogProps) {
  const labels = useUiLabels()
  const panelRef = useRef<HTMLDivElement>(null)
  const cancelRef = useRef<HTMLButtonElement>(null)
  const titleId = useId()
  const messageId = useId()

  // Focus lands on Cancel (the safe choice for destructive confirmations),
  // Tab stays inside, Escape cancels, focus returns to the trigger on close.
  // Enter is NOT intercepted: the focused button activates natively, so
  // pressing Enter on Cancel can never trigger the confirm action.
  useFocusTrap(panelRef, true, { initialFocus: cancelRef, onEscape: () => onClose(false) })
  useBodyScrollLock(true)

  const style = VARIANT_STYLES[dialog.variant ?? "danger"]

  const { Icon } = style

  return (
    <div className="fixed inset-0 z-[150] flex items-center justify-center bg-black/40 backdrop-blur-[2px] animate-fade-in">
      <div
        ref={panelRef}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={dialog.title ? titleId : messageId}
        aria-describedby={dialog.title ? messageId : undefined}
        tabIndex={-1}
        className="mx-4 w-full max-w-sm overflow-hidden rounded-ui-lg bg-surface shadow-ui-overlay animate-in"
      >
        <div className="p-6">
          <div className="flex items-start gap-4">
            <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${style.iconClass}`}>
              <Icon aria-hidden="true" className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              {dialog.title && (
                <h2 id={titleId} className="mb-1 text-body-lg font-semibold text-fg">
                  {dialog.title}
                </h2>
              )}
              <p id={messageId} className="whitespace-pre-line text-body text-fg-muted">
                {dialog.message}
              </p>
            </div>
          </div>
        </div>
        <div className="flex justify-end gap-3 px-6 pb-6">
          <Button ref={cancelRef} variant="secondary" onClick={() => onClose(false)}>
            {dialog.cancelLabel ?? labels.cancel}
          </Button>
          <Button variant={style.button} onClick={() => onClose(true)}>
            {dialog.confirmLabel ?? labels.ok}
          </Button>
        </div>
      </div>
    </div>
  )
}
