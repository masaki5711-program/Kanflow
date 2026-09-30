import type { ComponentPropsWithoutRef, ElementType } from "react"

type VisuallyHiddenProps<T extends ElementType> = {
  as?: T
} & ComponentPropsWithoutRef<T>

/**
 * Content read by screen readers but not shown visually (Tailwind `sr-only`).
 * Use for icon-only context, live-region text, table captions, etc.
 */
export function VisuallyHidden<T extends ElementType = "span">({
  as,
  className,
  ...rest
}: VisuallyHiddenProps<T>) {
  const Tag: ElementType = as ?? "span"
  return <Tag className={className ? `sr-only ${className}` : "sr-only"} {...rest} />
}
