import {
  ChevronDown,
  ChevronRight,
  Circle,
  CircleCheck,
  CirclePlay,
  Archive,
  Eye,
  File as FileIcon,
  FileImage,
  FileSpreadsheet,
  FileText,
  Paperclip,
  Pencil,
  Play,
  Presentation,
  type LucideIcon,
} from "lucide-react"
import { cn } from "./cn"

/*
 * Composite / app-specific icons built on lucide-react. Plain one-off icons
 * should be imported straight from "lucide-react" (decorative by default:
 * lucide sets aria-hidden="true" when no accessible prop is passed).
 * Everything here is decorative too — the surrounding control carries the
 * accessible name.
 */

export type { LucideIcon }

export interface DisclosureChevronProps {
  open: boolean
  /** "right" rotates 90° when open (tree rows), "down" flips 180° (accordions). */
  variant?: "right" | "down"
  className?: string
}

/** Chevron for expand/collapse toggles; rotates when `open`. */
export function DisclosureChevron({ open, variant = "right", className }: DisclosureChevronProps) {
  const Icon = variant === "down" ? ChevronDown : ChevronRight
  return (
    <Icon
      aria-hidden="true"
      className={cn(
        "shrink-0 transition-transform duration-200",
        open && (variant === "down" ? "rotate-180" : "rotate-90"),
        className ?? "h-5 w-5",
      )}
    />
  )
}

const TASK_STATUS_ICON: Record<string, LucideIcon> = {
  done: CircleCheck,
  in_progress: CirclePlay,
}

/** Sprint task status: done / in progress / todo (fallback). */
export function TaskStatusIcon({ status, className = "h-5 w-5" }: { status: string; className?: string }) {
  const Icon = TASK_STATUS_ICON[status] ?? Circle
  return <Icon aria-hidden="true" className={className} />
}

const SPRINT_STATUS_ICON: Record<string, LucideIcon> = {
  planning: Pencil,
  active: Play,
  review: Eye,
  done: CircleCheck,
  archived: Archive,
}

/** Sprint lifecycle status icon; renders nothing for unknown statuses. */
export function SprintStatusIcon({ status, className = "h-3.5 w-3.5" }: { status: string; className?: string }) {
  const Icon = SPRINT_STATUS_ICON[status]
  if (!Icon) return null
  return <Icon aria-hidden="true" className={className} />
}

function fileTypeIcon(mimeType: string): { Icon: LucideIcon; tone: string } {
  if (mimeType.startsWith("image/")) return { Icon: FileImage, tone: "text-pink-600" }
  if (mimeType === "application/pdf") return { Icon: FileText, tone: "text-danger" }
  if (mimeType.includes("spreadsheet") || mimeType.includes("excel")) return { Icon: FileSpreadsheet, tone: "text-success" }
  if (mimeType.includes("presentation") || mimeType.includes("powerpoint")) return { Icon: Presentation, tone: "text-orange-600" }
  if (mimeType.includes("word") || mimeType.includes("document")) return { Icon: FileIcon, tone: "text-primary" }
  return { Icon: Paperclip, tone: "text-fg-subtle" }
}

/** Coloured file-type icon for an attachment row. */
export function FileTypeIcon({ mimeType, className = "h-5 w-5" }: { mimeType: string; className?: string }) {
  const { Icon, tone } = fileTypeIcon(mimeType)
  return <Icon aria-hidden="true" className={cn(className, tone)} />
}
