import type { BadgeTone } from "@/components/ui"
import type { Language } from "@/lib/i18n"
import { pickText } from "@/lib/translation/pick-text"
import type { EntityI18n } from "@/lib/translation/types"
import type { PbiSummaryDto, PbiWithStatusDto } from "@/types/api"

export type PbItem = PbiWithStatusDto

export interface ReleaseItem {
  id: string
  pbItemId: string | null
  iceboxId: string | null
  initiative: string | null
  epic: string | null
  userStory: string | null
  assignedPo: string | null
  planVersion: string | null
  releaseVersion: string | null
  releaseDate: string | null
  releaseNote: string | null
  manualLink: string | null
  poNote: string | null
  status: string
  pbItem: PbItem | null
  i18n?: EntityI18n
}

export type CompletedPbi = PbiSummaryDto

/** Editable subset of a release item (what the PATCH endpoint accepts). */
export type ReleaseEditForm = Pick<
  ReleaseItem,
  | "initiative"
  | "epic"
  | "planVersion"
  | "releaseVersion"
  | "releaseDate"
  | "releaseNote"
  | "manualLink"
  | "poNote"
  | "assignedPo"
  | "status"
>

export const UNCATEGORIZED = "__uncategorized__"

export const RELEASE_STATUSES = ["staged", "ready", "released", "deferred"] as const

export const STATUS_TONE: Record<string, BadgeTone> = {
  staged: "neutral",
  ready: "primary",
  released: "success",
  deferred: "warning",
}

export function toEditForm(item: ReleaseItem): ReleaseEditForm {
  return {
    initiative: item.initiative,
    epic: item.epic,
    planVersion: item.planVersion,
    releaseVersion: item.releaseVersion,
    releaseDate: item.releaseDate,
    releaseNote: item.releaseNote,
    manualLink: item.manualLink,
    poNote: item.poNote,
    assignedPo: item.assignedPo,
    status: item.status,
  }
}

/** Group items by plan version, preserving the incoming order. */
export function groupByVersion(list: readonly ReleaseItem[]): Array<[string, ReleaseItem[]]> {
  const groups = new Map<string, ReleaseItem[]>()
  for (const item of list) {
    const key = item.planVersion ?? UNCATEGORIZED
    groups.set(key, [...(groups.get(key) ?? []), item])
  }
  return Array.from(groups.entries())
}

type Localized = { i18n?: EntityI18n } | null

/** Viewer-locale side of a text field (release row or its linked PBI). */
export function pickField(row: Localized, field: string, original: string | null | undefined, language: Language): string {
  return row ? pickText(row.i18n, field, original, language).text : original ?? ""
}

/** First non-null of userStory → epic → initiative, localized. */
export function pbiText(pb: CompletedPbi | PbItem, language: Language): string {
  if (pb.userStory != null) return pickField(pb, "userStory", pb.userStory, language)
  if (pb.epic != null) return pickField(pb, "epic", pb.epic, language)
  if (pb.initiative != null) return pickField(pb, "initiative", pb.initiative, language)
  return ""
}

/** Row label without the `#id` prefix (the id is rendered separately). */
export function releaseItemText(item: ReleaseItem, language: Language, fallback: string): string {
  if (item.pbItem) {
    const pb = item.pbItem
    if (pb.userStory != null) return pickField(pb, "userStory", pb.userStory, language)
    if (item.epic != null) return pickField(item, "epic", item.epic, language)
    if (item.initiative != null) return pickField(item, "initiative", item.initiative, language)
    return ""
  }
  if (item.userStory != null) return pickField(item, "userStory", item.userStory, language)
  if (item.epic != null) return pickField(item, "epic", item.epic, language)
  if (item.initiative != null) return pickField(item, "initiative", item.initiative, language)
  return fallback
}
