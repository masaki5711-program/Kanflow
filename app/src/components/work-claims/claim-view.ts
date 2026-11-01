/**
 * 担当中 (work claims) on the screens — pure view rules shared by the board marks
 * and the PBI panel. The data is the session route's BoardClaimDto
 * (GET /api/projects/:projectId/dev/claims).
 */

/** What GET /api/projects/:projectId/dev/claims answers per claim (services/dev-work BoardClaimDto). */
export interface ScreenClaim {
  id: string
  pbi: { id: string; displayId: number }
  /** null = the claim covers the whole PBI. */
  task: { id: string; name: string | null } | null
  user: { id: string; name: string }
  ai: boolean
  branch: string | null
  startedAt: string
  heartbeatAt: string
  staleAt: string
  stale: boolean
  /** 触る範囲 (W4): the first declared entries (`scopeCount` = all of them). Absent = none. */
  scope?: ScreenScopeEntry[]
  scopeCount?: number
  /** Other active claims whose scope overlaps this one (W4 warning). Absent = none. */
  overlaps?: ScreenOverlap[]
}

export interface ScreenScopeEntry {
  kind: "path" | "module"
  value: string
}

/** Another claim whose declared scope shares files with this one (services/dev-work BoardOverlapDto). */
export interface ScreenOverlap {
  claimId: string
  user: { id: string; name: string }
  ai: boolean
  pbi: { id: string; displayId: number }
  paths: string[]
  pathCount: number
}

/** An open MR of the PBI that changes files outside the declared scope (Git sync, W4). */
export interface ScreenOutsideScope {
  linkId: string
  ref: string
  title: string
  url: string
  repository: string
  count: number
  paths: string[]
  checkedAt: string | null
}

export interface ScreenClaimList {
  data: ScreenClaim[]
  staleAfterHours: number
  /** PO / SM / admin: the PBI panel offers the release action. */
  canModerate: boolean
  truncated?: boolean
  limit?: number
  /** PBI panel only. */
  outsideScope: ScreenOutsideScope[]
}

/** Paths shown in one warning line before "+n more". */
export const PATHS_PER_LINE = 3

/** The first PATHS_PER_LINE paths and how many more there are (`total` may exceed the paths sent). */
export function shownPaths(paths: readonly string[], total: number = paths.length): { shown: string[]; rest: number } {
  const shown = paths.slice(0, PATHS_PER_LINE)
  return { shown, rest: Math.max(total, paths.length) - shown.length }
}

/** The overlap warnings a card or panel row shows: active claims only (a stale claim neither warns nor is warned about). */
export function overlapsOf(claim: Pick<ScreenClaim, "stale" | "overlaps">): ScreenOverlap[] {
  return claim.stale ? [] : (claim.overlaps ?? [])
}

/** active = working; staleSoon = at most 30 minutes left without a new 最後の確認; stale = no longer counts. */
export type ClaimState = "active" | "staleSoon" | "stale"

export const STALE_SOON_MS = 30 * 60_000

export function claimState(claim: Pick<ScreenClaim, "stale" | "staleAt">, now: Date): ClaimState {
  const left = Date.parse(claim.staleAt) - now.getTime()
  if (claim.stale || !(left > 0)) return "stale"
  return left <= STALE_SOON_MS ? "staleSoon" : "active"
}

/** Up to two letters for the avatar circle ("Dev One" → "DO", "山田" → "山田"). */
export function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean)
  if (words.length === 0) return "?"
  if (words.length === 1) return [...words[0]].slice(0, 2).join("").toUpperCase()
  return words.slice(0, 2).map((w) => [...w][0]).join("").toUpperCase()
}

export interface ClaimIndex {
  /** Claims on one task, by task id. */
  byTask: ReadonlyMap<string, readonly ScreenClaim[]>
  /** Whole-PBI claims, by PBI id (shown on every card of that PBI). */
  wholePbi: ReadonlyMap<string, readonly ScreenClaim[]>
}

function push(map: Map<string, ScreenClaim[]>, key: string, claim: ScreenClaim) {
  const list = map.get(key)
  if (list) list.push(claim)
  else map.set(key, [claim])
}

/** One pass over a board's claims (input order kept: newest 最後の確認 first). */
export function indexClaims(claims: readonly ScreenClaim[]): ClaimIndex {
  const byTask = new Map<string, ScreenClaim[]>()
  const wholePbi = new Map<string, ScreenClaim[]>()
  for (const c of claims) {
    if (c.task) push(byTask, c.task.id, c)
    else push(wholePbi, c.pbi.id, c)
  }
  return { byTask, wholePbi }
}

/** The claims a task card shows: its own first, then the whole-PBI ones. */
export function claimsForCard(index: ClaimIndex, taskId: string, pbiId: string): Array<{ claim: ScreenClaim; wholePbi: boolean }> {
  return [
    ...(index.byTask.get(taskId) ?? []).map((claim) => ({ claim, wholePbi: false })),
    ...(index.wholePbi.get(pbiId) ?? []).map((claim) => ({ claim, wholePbi: true })),
  ]
}

/** The answer of the claims route, checked (anything else is an error, never a half-drawn list). */
export function toClaimList(raw: unknown): ScreenClaimList {
  const body = raw as Partial<ScreenClaimList> | null
  if (!body || typeof body !== "object" || !Array.isArray(body.data)) throw new Error("Unexpected work-claims answer")
  return {
    ...body,
    data: body.data,
    staleAfterHours: Number(body.staleAfterHours) || 0,
    canModerate: body.canModerate === true,
    outsideScope: Array.isArray(body.outsideScope) ? body.outsideScope : [],
  }
}
