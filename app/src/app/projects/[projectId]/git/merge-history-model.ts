import type { MergeHistoryDto, MergeHistoryItemDto } from "@/services/git/merge-history.service"

/**
 * Pure helpers of the マージの履歴 section (N11): the request URL, a tolerant
 * reader of the response and the "opened → merged" duration. Wire types are
 * type-only imports from the service (no server code in the bundle).
 */
export type { MergeHistoryDto, MergeHistoryItemDto }

export const MERGE_HISTORY_PAGE_SIZE = 20

/** Period presets: the last N days, or everything Kanflow has recorded. */
export const MERGE_PERIODS = ["all", "30", "90", "365"] as const
export type MergePeriod = (typeof MERGE_PERIODS)[number]

export function isMergePeriod(value: string): value is MergePeriod {
  return (MERGE_PERIODS as readonly string[]).includes(value)
}

const DAY_MS = 86_400_000

/** Start of the period (inclusive) as an ISO instant; null = no lower bound. */
export function periodFrom(period: MergePeriod, now: Date): string | null {
  return period === "all" ? null : new Date(now.getTime() - Number(period) * DAY_MS).toISOString()
}

export interface MergeHistoryRequest {
  period: MergePeriod
  /** "" = every repository of the project. */
  repositoryId: string
  /** Where the previous page ended; null = the newest page. */
  cursor: string | null
}

export function mergeHistoryUrl(projectId: string, request: MergeHistoryRequest, now: Date): string {
  const params = new URLSearchParams({ limit: String(MERGE_HISTORY_PAGE_SIZE) })
  const from = periodFrom(request.period, now)
  if (from) params.set("from", from)
  if (request.repositoryId) params.set("repositoryId", request.repositoryId)
  if (request.cursor) params.set("cursor", request.cursor)
  return `/api/projects/${encodeURIComponent(projectId)}/git/merge-history?${params.toString()}`
}

const text = (v: unknown): string | null => (typeof v === "string" && v !== "" ? v : null)
const instant = (v: unknown): string | null => (typeof v === "string" && !Number.isNaN(Date.parse(v)) ? v : null)
const record = (v: unknown): Record<string, unknown> | null => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null)

/** Only a web address is ever put in an `href` (the URL was written by a Git server, not by Kanflow). */
export function isWebUrl(url: string): boolean {
  return /^https?:\/\//i.test(url)
}

function toItem(raw: unknown): MergeHistoryItemDto | null {
  const r = record(raw)
  const repository = record(r?.repository)
  const id = text(r?.id)
  const ref = text(r?.ref)
  const mergedAt = instant(r?.mergedAt)
  const repositoryId = text(repository?.id)
  if (!r || !id || !ref || !mergedAt || !repositoryId) return null
  const pbis = (Array.isArray(r.pbis) ? r.pbis : []).flatMap((p): MergeHistoryItemDto["pbis"] => {
    const pbi = record(p)
    const pbiId = text(pbi?.id)
    const displayId = pbi?.displayId
    if (!pbiId || typeof displayId !== "number" || !Number.isInteger(displayId)) return []
    return [{ id: pbiId, displayId, title: text(pbi?.title) ?? "" }]
  })
  return {
    id,
    ref,
    title: text(r.title) ?? "",
    url: text(r.url) ?? "",
    mergedAt,
    openedAt: instant(r.openedAt),
    author: text(r.author),
    mergedBy: text(r.mergedBy),
    sourceBranch: text(r.sourceBranch),
    targetBranch: text(r.targetBranch),
    repository: { id: repositoryId, name: text(repository?.name) ?? "" },
    pbis,
  }
}

/**
 * Response → history. Only an explicit `enabled: false` hides the section (the
 * integration is off); any other body that is not a history is an error, so a
 * broken endpoint never looks like "off". A row that is not a merge is left out
 * rather than half-drawn.
 */
export function toMergeHistory(raw: unknown): MergeHistoryDto {
  const r = record(raw)
  if (r?.enabled === false) return { enabled: false, items: [], nextCursor: null }
  if (r?.enabled !== true || !Array.isArray(r.items)) throw new Error("unexpected merge history response")
  return {
    enabled: true,
    items: r.items.flatMap((item) => toItem(item) ?? []),
    nextCursor: text(r.nextCursor),
  }
}

export type LeadTime = { unit: "underHour" } | { unit: "hours" | "days"; n: number }

const HOUR_MS = 3_600_000

/** Time from opening to merging; null when either end is unknown or they are out of order. */
export function leadTime(openedAt: string | null, mergedAt: string): LeadTime | null {
  if (!openedAt) return null
  const ms = Date.parse(mergedAt) - Date.parse(openedAt)
  if (!Number.isFinite(ms) || ms < 0) return null
  if (ms < HOUR_MS) return { unit: "underHour" }
  if (ms < 2 * DAY_MS) return { unit: "hours", n: Math.round(ms / HOUR_MS) }
  return { unit: "days", n: Math.round(ms / DAY_MS) }
}
