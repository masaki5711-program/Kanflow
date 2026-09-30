import { cn } from "./cn"

export type SpinnerSize = "xs" | "sm" | "md" | "lg"

const SIZE: Record<SpinnerSize, string> = {
  xs: "h-3 w-3 border-[1.5px]",
  sm: "h-4 w-4 border-2",
  md: "h-6 w-6 border-2",
  lg: "h-10 w-10 border-[3px]",
}

export interface SpinnerProps {
  size?: SpinnerSize
  /**
   * Accessible label. When omitted the spinner is decorative (aria-hidden) —
   * use that when the surrounding element already announces the busy state
   * (e.g. a Button with aria-busy).
   */
  label?: string
  className?: string
}

export function Spinner({ size = "sm", label, className }: SpinnerProps) {
  const circle = (
    <span
      aria-hidden="true"
      // Kept animating (slower) under prefers-reduced-motion by a globals.css
      // exception, so a loading state never looks frozen.
      data-spinner=""
      className={cn(
        "inline-block shrink-0 animate-spin rounded-full border-current border-r-transparent align-[-0.125em]",
        SIZE[size],
        className,
      )}
    />
  )
  if (!label) return circle
  return (
    <span role="status" className="inline-flex items-center">
      {circle}
      <span className="sr-only">{label}</span>
    </span>
  )
}
