import type { ReactNode } from "react"
import { cn } from "./cn"

export interface PageHeaderProps {
  /** Page title — rendered as the page's single <h1>. */
  title: ReactNode
  /** Short explanation under the title. */
  description?: ReactNode
  /** Buttons / controls aligned to the right (wrap under the title on small screens). */
  actions?: ReactNode
  /** Small label above the title (e.g. context, date). */
  eyebrow?: ReactNode
  /** Leading decorative visual next to the title block (rendered aria-hidden). */
  icon?: ReactNode
  /** Extra content under the title row (tabs, filters, stats). */
  children?: ReactNode
  /** id for the <h1> (e.g. for aria-labelledby on the page region). */
  headingId?: string
  className?: string
  /** Extra classes for the <h1>. */
  titleClassName?: string
}

/**
 * Consistent page heading: one <h1> (`text-heading`), optional description,
 * and a right-aligned action area that wraps under the title on small screens.
 * Use exactly once per page.
 */
export function PageHeader({
  title,
  description,
  actions,
  eyebrow,
  icon,
  children,
  headingId,
  className,
  titleClassName,
}: PageHeaderProps) {
  return (
    <header className={cn("mb-6", className)}>
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
        <div className="flex min-w-0 flex-1 items-start gap-3">
          {icon && (
            <span aria-hidden="true" className="mt-0.5 shrink-0">
              {icon}
            </span>
          )}
          <div className="min-w-0">
            {eyebrow && <div className="mb-0.5 text-caption font-medium text-fg-muted">{eyebrow}</div>}
            <h1 id={headingId} className={cn("text-heading font-semibold tracking-tight text-fg", titleClassName)}>
              {title}
            </h1>
            {description && <div className="mt-1 text-body text-fg-muted">{description}</div>}
          </div>
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2 sm:justify-end">{actions}</div>}
      </div>
      {children && <div className="mt-4">{children}</div>}
    </header>
  )
}
