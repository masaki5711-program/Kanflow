"use client"

import { createContext, useContext, useId, type ReactNode } from "react"
import { cn } from "./cn"
import { useUiLabels } from "./labels"

export interface FieldControlProps {
  id: string
  "aria-describedby"?: string
  "aria-invalid"?: true
  "aria-required"?: true
}

const FieldContext = createContext<FieldControlProps | null>(null)

/**
 * Props the enclosing <Field> wants its control to carry. `Input`,
 * `Textarea` and `Select` consume this automatically; custom controls can
 * spread it: `<MyPicker {...(useFieldControl() ?? {})} />`.
 */
export function useFieldControl(): FieldControlProps | null {
  return useContext(FieldContext)
}

export interface FieldProps {
  label: ReactNode
  /** Help text under the control (linked via aria-describedby). */
  hint?: ReactNode
  /** Error message. Presence sets aria-invalid on the control and renders it with role="alert". */
  error?: ReactNode
  required?: boolean
  /** Explicit control id; generated with useId() when omitted. */
  id?: string
  /** Visually hide the label (still announced by screen readers). */
  hideLabel?: boolean
  className?: string
  /** A control (Input/Textarea/Select) or a render function receiving the control props. */
  children: ReactNode | ((control: FieldControlProps) => ReactNode)
}

export function Field({ label, hint, error, required, id, hideLabel, className, children }: FieldProps) {
  const autoId = useId()
  const labels = useUiLabels()
  const controlId = id ?? `field-${autoId}`
  const hintId = hint ? `${controlId}-hint` : undefined
  const errorId = error ? `${controlId}-error` : undefined
  const describedBy = [hintId, errorId].filter(Boolean).join(" ") || undefined

  const control: FieldControlProps = {
    id: controlId,
    "aria-describedby": describedBy,
    "aria-invalid": error ? true : undefined,
    "aria-required": required ? true : undefined,
  }

  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <label htmlFor={controlId} className={cn("text-body font-medium text-fg", hideLabel && "sr-only")}>
        {label}
        {required && (
          <>
            <span aria-hidden="true" className="ml-0.5 text-danger">
              *
            </span>
            <span className="sr-only"> ({labels.required})</span>
          </>
        )}
      </label>
      <FieldContext.Provider value={control}>
        {typeof children === "function" ? children(control) : children}
      </FieldContext.Provider>
      {hint && (
        <p id={hintId} className="text-caption text-fg-muted">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} role="alert" className="text-caption font-medium text-danger">
          {error}
        </p>
      )}
    </div>
  )
}
