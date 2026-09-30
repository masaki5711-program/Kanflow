"use client"

import type { LostEdit } from "@/hooks/version-conflict"
import { useLanguage } from "@/lib/language-context"
import { VersionConflictNotice } from "@/components/version-conflict-notice"
import { formatShortDate } from "../lib/date-format"
import type { PlanForm } from "../lib/plan-form"
import type { PlanStatus } from "../lib/plan-types"
import { statusLabel } from "../lib/status"

export type PlanLostEdit = LostEdit<Extract<keyof PlanForm, string>>

interface Props {
  lost: readonly PlanLostEdit[]
  members: readonly { id: string; name: string }[]
  parentOptions: readonly { id: string; name: string }[]
  onRestore: () => void
  onDismiss: () => void
}

const DATE_FIELDS = new Set(["plannedStart", "plannedEnd", "actualStart", "actualEnd"])

/**
 * Plan editor after a 409: the server's copy is loaded; the values the user
 * had typed are listed with the editor's own labels and can be restored.
 */
export function PlanConflictNotice({ lost, members, parentOptions, onRestore, onDismiss }: Props) {
  const { t, language } = useLanguage()
  const labels: Record<Extract<keyof PlanForm, string>, string> = {
    name: t.planColName,
    description: t.planDescription,
    plannedStart: t.planPlannedStart,
    plannedEnd: t.planPlannedEnd,
    actualStart: t.planActualStart,
    actualEnd: t.planActualEnd,
    status: t.planStatus,
    parentId: t.planParent,
    isMilestone: t.planIsMilestone,
    notes: t.planNotes,
    ownerId: t.planOwner,
    progressMode: t.planProgressMode,
  }
  const format = (field: string, value: unknown): string => {
    if (typeof value === "boolean") return value ? "✓" : "—"
    const text = typeof value === "string" ? value : ""
    if (!text) return ""
    if (DATE_FIELDS.has(field)) return formatShortDate(text, language)
    if (field === "status") return statusLabel(t, text as PlanStatus)
    if (field === "ownerId") return members.find((m) => m.id === text)?.name ?? text
    if (field === "parentId") return parentOptions.find((p) => p.id === text)?.name ?? text
    if (field === "progressMode") return text === "linked" ? t.planProgressLinked : t.planProgressManual
    return text
  }
  return <VersionConflictNotice lost={lost} labels={labels} formatValue={format} onRestore={lost.length > 0 ? onRestore : undefined} onDismiss={onDismiss} />
}
