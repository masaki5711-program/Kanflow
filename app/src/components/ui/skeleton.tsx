import { cn } from "./cn"

export interface SkeletonProps {
  className?: string
}

/** A single shimmering block. Always decorative (aria-hidden). */
export function Skeleton({ className }: SkeletonProps) {
  return <div aria-hidden="true" className={cn("animate-pulse rounded-ui-sm bg-surface-sunken", className)} />
}

export interface SkeletonPresetProps {
  /** Screen-reader text announced while loading. Pass a localized string. */
  label?: string
  className?: string
}

function LoadingRegion({ label, className, children }: SkeletonPresetProps & { children: React.ReactNode }) {
  return (
    <div role="status" aria-busy="true" className={className}>
      {label && <span className="sr-only">{label}</span>}
      {children}
    </div>
  )
}

const LINE_WIDTHS = ["w-full", "w-11/12", "w-4/5", "w-2/3", "w-3/4"]

/** Paragraph-like placeholder. */
export function SkeletonLines({ lines = 3, label, className }: SkeletonPresetProps & { lines?: number }) {
  return (
    <LoadingRegion label={label} className={cn("space-y-2", className)}>
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton key={i} className={cn("h-3.5", i === lines - 1 ? "w-1/2" : LINE_WIDTHS[i % LINE_WIDTHS.length])} />
      ))}
    </LoadingRegion>
  )
}

/** Card placeholder: title bar + a few lines. Use in grids: render N of them. */
export function SkeletonCard({ label, className }: SkeletonPresetProps) {
  return (
    <LoadingRegion
      label={label}
      className={cn("rounded-ui-lg border border-border bg-surface p-4 shadow-ui-sm space-y-3", className)}
    >
      <Skeleton className="h-4 w-1/3" />
      <Skeleton className="h-3 w-full" />
      <Skeleton className="h-3 w-5/6" />
      <div className="flex gap-2 pt-1">
        <Skeleton className="h-5 w-14 rounded-full" />
        <Skeleton className="h-5 w-10 rounded-full" />
      </div>
    </LoadingRegion>
  )
}

/** Table placeholder with a header row and `rows` × `columns` cells. */
export function SkeletonTable({
  rows = 5,
  columns = 4,
  label,
  className,
}: SkeletonPresetProps & { rows?: number; columns?: number }) {
  return (
    <LoadingRegion label={label} className={cn("overflow-hidden rounded-ui-lg border border-border bg-surface", className)}>
      <div className="flex gap-4 border-b border-border bg-surface-muted px-4 py-3">
        {Array.from({ length: columns }, (_, c) => (
          <Skeleton key={c} className="h-3 flex-1" />
        ))}
      </div>
      {Array.from({ length: rows }, (_, r) => (
        <div key={r} className="flex gap-4 border-b border-border px-4 py-3 last:border-b-0">
          {Array.from({ length: columns }, (_, c) => (
            <Skeleton key={c} className={cn("h-3.5 flex-1", c === 0 && "max-w-[40%]")} />
          ))}
        </div>
      ))}
    </LoadingRegion>
  )
}
