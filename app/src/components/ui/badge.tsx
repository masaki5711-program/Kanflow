import type { HTMLAttributes } from "react"
import { cn } from "./cn"

export type BadgeTone = "neutral" | "primary" | "success" | "warning" | "danger" | "info"

const TONE: Record<BadgeTone, string> = {
  neutral: "bg-surface-sunken text-fg-muted ring-border",
  primary: "bg-primary-soft text-primary-active ring-primary/20",
  success: "bg-success-soft text-success-hover ring-success/20",
  warning: "bg-warning-soft text-warning-hover ring-warning/20",
  danger: "bg-danger-soft text-danger-hover ring-danger/20",
  info: "bg-info-soft text-info ring-info/20",
}

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: BadgeTone
  size?: "sm" | "md"
  /** Leading dot (status indicator). Color is never the only signal — keep text. */
  dot?: boolean
}

export function Badge({ tone = "neutral", size = "sm", dot, className, children, ...rest }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 whitespace-nowrap rounded-full font-medium ring-1 ring-inset",
        size === "sm" ? "px-2 py-0.5 text-caption" : "px-2.5 py-1 text-body",
        TONE[tone],
        className,
      )}
      {...rest}
    >
      {dot && <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-current" />}
      {children}
    </span>
  )
}
