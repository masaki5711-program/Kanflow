"use client"

import type { ComponentPropsWithRef } from "react"
import { cn } from "./cn"
import { useFieldControl } from "./field"

const CONTROL =
  "w-full rounded-ui-md border bg-surface text-body text-fg placeholder:text-fg-subtle " +
  "disabled:cursor-not-allowed disabled:bg-surface-sunken disabled:text-fg-subtle " +
  "focus:ring-2 focus:ring-primary/20"

type ControlSize = "sm" | "md" | "lg"

const CONTROL_SIZE: Record<ControlSize, string> = {
  sm: "min-h-8 px-2.5 py-1",
  md: "min-h-9 px-3 py-1.5",
  lg: "min-h-11 px-4 py-2.5",
}

function stateClass(invalid: boolean): string {
  return invalid ? "border-danger focus:ring-danger/20" : "border-border-strong"
}

interface AriaControlProps {
  id?: string
  "aria-describedby"?: string
  "aria-invalid"?: boolean | "true" | "false" | "grammar" | "spelling"
  "aria-required"?: boolean | "true" | "false"
}

/** Merge Field-provided id/aria attributes with explicit props (explicit props win). */
function useMergedControl<P extends AriaControlProps>(props: P): P {
  const field = useFieldControl()
  if (!field) return props
  const describedBy =
    [field["aria-describedby"], props["aria-describedby"]].filter(Boolean).join(" ") || undefined
  return {
    ...props,
    id: props.id ?? field.id,
    "aria-describedby": describedBy,
    "aria-invalid": props["aria-invalid"] ?? field["aria-invalid"],
    "aria-required": props["aria-required"] ?? field["aria-required"],
  }
}

function isInvalid(value: AriaControlProps["aria-invalid"]): boolean {
  return value === true || value === "true"
}

export type InputProps = ComponentPropsWithRef<"input"> & { inputSize?: ControlSize }

export function Input({ className, inputSize = "md", ...props }: InputProps) {
  const merged = useMergedControl(props)
  return (
    <input
      {...merged}
      className={cn(CONTROL, CONTROL_SIZE[inputSize], stateClass(isInvalid(merged["aria-invalid"])), className)}
    />
  )
}

export type TextareaProps = ComponentPropsWithRef<"textarea">

export function Textarea({ className, rows = 4, ...props }: TextareaProps) {
  const merged = useMergedControl(props)
  return (
    <textarea
      rows={rows}
      {...merged}
      className={cn(CONTROL, "px-3 py-2 leading-relaxed", stateClass(isInvalid(merged["aria-invalid"])), className)}
    />
  )
}

export type SelectProps = ComponentPropsWithRef<"select"> & { selectSize?: ControlSize }

export function Select({ className, selectSize = "md", children, ...props }: SelectProps) {
  const merged = useMergedControl(props)
  return (
    <select
      {...merged}
      className={cn(CONTROL, CONTROL_SIZE[selectSize], stateClass(isInvalid(merged["aria-invalid"])), className)}
    >
      {children}
    </select>
  )
}
