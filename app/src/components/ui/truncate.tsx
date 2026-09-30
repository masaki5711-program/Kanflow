import type { ElementType } from "react"
import { cn } from "./cn"

const CLAMP: Record<1 | 2 | 3 | 4, string> = {
  1: "line-clamp-1",
  2: "line-clamp-2",
  3: "line-clamp-3",
  4: "line-clamp-4",
}

export interface TruncateProps {
  /** Full text. Always present in the DOM, so screen readers read all of it. */
  text: string
  /** Visible line count before clamping. Default 2. */
  lines?: 1 | 2 | 3 | 4
  as?: ElementType
  className?: string
}

/**
 * Multi-line clamp. The complete text stays in the DOM (assistive tech reads
 * it in full) and is exposed to mouse users through the native `title`
 * tooltip. Use for PBI titles, descriptions in cards and table cells.
 */
export function Truncate({ text, lines = 2, as, className }: TruncateProps) {
  const Tag: ElementType = as ?? "span"
  return (
    <Tag title={text} className={cn(Tag === "span" && "block", "break-words", CLAMP[lines], className)}>
      {text}
    </Tag>
  )
}
