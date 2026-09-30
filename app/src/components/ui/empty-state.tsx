import type { ReactNode } from "react"
import { cn } from "./cn"

export interface EmptyStateProps {
  title: ReactNode
  description?: ReactNode
  /** Decorative icon (rendered aria-hidden). */
  icon?: ReactNode
  /** Primary call to action, e.g. <Button>Create</Button>. */
  action?: ReactNode
  /** Compact variant for use inside cards/columns. */
  compact?: boolean
  className?: string
  /** Heading level of the title. Default 3. */
  headingLevel?: 2 | 3 | 4
}

export function EmptyState({
  title,
  description,
  icon,
  action,
  compact = false,
  className,
  headingLevel = 3,
}: EmptyStateProps) {
  const Heading = `h${headingLevel}` as "h2" | "h3" | "h4"
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center text-center",
        compact ? "gap-2 px-4 py-6" : "gap-3 px-6 py-12",
        className,
      )}
    >
      {icon && (
        <div
          aria-hidden="true"
          className={cn(
            "flex items-center justify-center rounded-ui-lg bg-surface-sunken text-fg-subtle",
            compact ? "h-10 w-10" : "h-14 w-14",
          )}
        >
          {icon}
        </div>
      )}
      <Heading className={cn("font-semibold text-fg", compact ? "text-body" : "text-title")}>{title}</Heading>
      {description && <p className="max-w-md text-body text-fg-muted">{description}</p>}
      {action && <div className="mt-1">{action}</div>}
    </div>
  )
}
