import { CircleDashed, ClipboardCheck, FileCheck, FlaskConical, Ruler, type LucideIcon } from "lucide-react"
import { cn } from "@/components/ui"
import type { Translations } from "@/lib/i18n"

/** How a criterion is proven (W12). Mirrors EVIDENCE_KINDS of the service (kept here: client code must not import server modules). */
export const AC_EVIDENCE_KINDS = ["test", "inspection", "measurement", "approval"] as const
export type AcEvidenceKind = (typeof AC_EVIDENCE_KINDS)[number]

const ICON: Record<AcEvidenceKind, LucideIcon> = {
  test: FlaskConical,
  inspection: ClipboardCheck,
  measurement: Ruler,
  approval: FileCheck,
}

export function evidenceLabel(t: Translations, kind: string | null): string {
  switch (kind) {
    case "test":
      return t.pbiAcEvidenceTest
    case "inspection":
      return t.pbiAcEvidenceInspection
    case "measurement":
      return t.pbiAcEvidenceMeasurement
    case "approval":
      return t.pbiAcEvidenceApproval
    default:
      return t.pbiAcEvidenceNone
  }
}

/** Evidence icon AND its text label (the icon alone is never the signal); gray when the kind is not decided. */
export function EvidenceMark({ kind, t, className }: { kind: string | null; t: Translations; className?: string }) {
  const known = (AC_EVIDENCE_KINDS as readonly string[]).includes(kind ?? "")
  const Icon = known ? ICON[kind as AcEvidenceKind] : CircleDashed
  return (
    <span
      className={cn("inline-flex items-center gap-1 text-caption", known ? "text-fg-muted" : "text-fg-subtle", className)}
      data-evidence={known ? kind : "none"}
      title={known ? undefined : t.pbiAcEvidenceNotSet}
    >
      <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      <span>{evidenceLabel(t, known ? kind : null)}</span>
    </span>
  )
}
