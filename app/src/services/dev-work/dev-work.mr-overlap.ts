/**
 * N6 (docs/integration/gitstation-operations-plan.md §4, steps 2–3) — pure rules, no I/O: a work claim's declared
 * scope against what the Git sync knows about OTHER open merge requests.
 *
 * Three sources of an overlap warning, kept apart in every answer:
 * - `declared` (intent): other claims' declared scopes (dev-work.scope scopeOverlaps — unchanged);
 * - `mr_paths` (fact): another open MR already changes files the scope covers (git_link.changedPaths);
 * - `predicted` (GitStation's trial merge): an open MR of the claim's PBI is predicted to conflict with another MR.
 *
 * Warnings only: nothing here refuses a claim. "No prediction" never means "no conflict": a prediction that was not
 * scanned completely is reported as unchecked. Changed files are compared literally (dev-work.scope changedFilePath);
 * a listing that was cut short says so (`complete: false`).
 *
 * Which MRs are "other": not linked to the claim's PBI and not on the claim's branch (one MR can be linked to several
 * PBIs: it is one MR here, with every PBI it is linked to). Token surfaces (MCP, /api/v1) pass hideConfidential: an MR
 * linked to a confidential PBI is left out, and a predicted conflict with such an MR names no MR (D-5).
 */
import { changedFilePath, coversPath, type ScopeEntry } from "./dev-work.scope"

/** Paths shown per MR overlap (the count is exact for what was stored). */
export const OVERLAP_PATHS_SHOWN = 20
/** MR overlaps / predicted conflicts answered per claim. */
export const MR_WARNINGS_MAX = 20

/** An open MR link as the overlap check reads it (git_link + its PBI and repository). */
export interface MrLinkForOverlap {
  repositoryId: string
  repository: string
  ref: string
  title: string
  url: string
  author: string | null
  sourceBranch: string | null
  backlogItemId: string
  pbiDisplayId: number
  confidential: boolean
  changedPaths: unknown
  changedPathsComplete: boolean | null
  conflictPrediction: unknown
  mergeStatusAt: Date | null
}

/** One open merge request (all its links together). */
interface MrGroup {
  repositoryId: string
  repository: string
  ref: string
  title: string
  url: string
  author: string | null
  sourceBranch: string | null
  pbiIds: Set<string>
  pbis: number[]
  confidential: boolean
  paths: string[] | null
  complete: boolean
  prediction: unknown
  checkedAt: Date | null
}

export interface MrPathOverlapDto {
  source: "mr_paths"
  repository: string
  ref: string
  title: string
  url: string
  author: string | null
  branch: string | null
  /** PBI numbers the MR is linked to. */
  pbis: number[]
  /** How many of the MR's changed files the scope covers, and the first of them. */
  count: number
  paths: string[]
  /** false = the MR's file list was cut short: more files may overlap. */
  complete: boolean
}

export interface PredictedConflictDto {
  source: "predicted"
  repository: string
  /** The claim's PBI's MR. */
  ref: string
  title: string
  url: string
  /** The other MR; null = linked to a PBI this answer may not show (or not known to Kanflow beyond its number). */
  peer: { ref: string; title: string | null; url: string | null; pbis: number[] } | null
  /** Files that would conflict (count only: GitStation does not withhold confidential paths there). */
  files: number
  /** When the prediction was read. */
  checkedAt: string | null
}

export interface MrWarnings {
  mergeRequestOverlaps: MrPathOverlapDto[]
  predictedConflicts: PredictedConflictDto[]
  /** The claim's PBI's MRs whose prediction was not scanned completely (not "no conflict"): their numbers. */
  predictionUnchecked: string[]
}

/** The warnings of one claim as answered, with the caveats that apply. */
export type ClaimMrWarnings = MrWarnings & {
  /** More open MRs than one check reads: the warnings may be incomplete. */
  mergeRequestsTruncated?: true
  /** Other PBIs' open MRs whose changed files the sync has not read yet (only with a declared scope). */
  changedPathsPending?: number
  /** The MR data could not be read this time (logged): no MR warning means "unknown", not "none". */
  mergeRequestsUnavailable?: true
}

const key = (repositoryId: string, ref: string) => `${repositoryId}\n${ref}`
const strings = (v: unknown): string[] | null => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : null)
const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v)

/** Pure: links → one group per MR (input order of first appearance). */
export function groupMergeRequests(links: readonly MrLinkForOverlap[]): MrGroup[] {
  const groups = new Map<string, MrGroup>()
  for (const l of links) {
    const k = key(l.repositoryId, l.ref)
    const g = groups.get(k)
    if (g) {
      g.pbiIds.add(l.backlogItemId)
      if (!g.pbis.includes(l.pbiDisplayId)) g.pbis.push(l.pbiDisplayId)
      g.confidential ||= l.confidential
      continue
    }
    groups.set(k, {
      repositoryId: l.repositoryId,
      repository: l.repository,
      ref: l.ref,
      title: l.title,
      url: l.url,
      author: l.author,
      sourceBranch: l.sourceBranch,
      pbiIds: new Set([l.backlogItemId]),
      pbis: [l.pbiDisplayId],
      confidential: l.confidential,
      paths: strings(l.changedPaths),
      complete: l.changedPathsComplete !== false,
      prediction: l.conflictPrediction,
      checkedAt: l.mergeStatusAt,
    })
  }
  for (const g of groups.values()) g.pbis.sort((a, b) => a - b)
  return [...groups.values()]
}

/** The claim a warning is computed for. */
export interface ClaimForMrWarnings {
  backlogItemId: string
  branch: string | null
  scope: readonly ScopeEntry[]
}

/** Pure: other open MRs whose changed files the claim's scope covers (most covered files first). */
export function mrPathOverlaps(claim: ClaimForMrWarnings, groups: readonly MrGroup[], hideConfidential: boolean): MrPathOverlapDto[] {
  if (claim.scope.length === 0) return []
  const out: MrPathOverlapDto[] = []
  for (const g of groups) {
    if (g.paths === null || g.pbiIds.has(claim.backlogItemId) || (claim.branch !== null && g.sourceBranch === claim.branch)) continue
    if (hideConfidential && g.confidential) continue
    const covered = g.paths.filter((raw) => {
      const path = changedFilePath(raw)
      return path !== null && claim.scope.some((entry) => coversPath(entry, path))
    })
    if (covered.length === 0) continue
    out.push({
      source: "mr_paths",
      repository: g.repository,
      ref: g.ref,
      title: g.title,
      url: g.url,
      author: g.author,
      branch: g.sourceBranch,
      pbis: g.pbis,
      count: covered.length,
      paths: covered.slice(0, OVERLAP_PATHS_SHOWN),
      complete: g.complete,
    })
  }
  return out.sort((a, b) => b.count - a.count || a.repository.localeCompare(b.repository) || Number(a.ref) - Number(b.ref)).slice(0, MR_WARNINGS_MAX)
}

/** Pure: predicted conflicts of the claim's PBI's open MRs with other MRs, and the MRs not completely scanned. */
export function predictedConflicts(claim: Pick<ClaimForMrWarnings, "backlogItemId">, groups: readonly MrGroup[], hideConfidential: boolean): Omit<MrWarnings, "mergeRequestOverlaps"> {
  const byKey = new Map(groups.map((g) => [key(g.repositoryId, g.ref), g]))
  const conflicts: PredictedConflictDto[] = []
  const unchecked: string[] = []
  for (const own of groups) {
    if (!own.pbiIds.has(claim.backlogItemId) || !isRecord(own.prediction)) continue
    if (hideConfidential && own.confidential) continue
    const p = own.prediction
    if (p.status !== "scanned" || p.stale === true) unchecked.push(own.ref)
    for (const peer of Array.isArray(p.peers) ? p.peers : []) {
      if (!isRecord(peer) || typeof peer.iid !== "number" || !Number.isSafeInteger(peer.iid) || peer.outcome !== "conflict") continue
      const ref = String(peer.iid)
      const other = byKey.get(key(own.repositoryId, ref))
      // Token surfaces name a peer only when it is KNOWN to be on a non-confidential PBI (an MR not read yet, or past
      // the read bound, may be a confidential PBI's).
      const hidden = hideConfidential && (other === undefined || other.confidential)
      conflicts.push({
        source: "predicted",
        repository: own.repository,
        ref: own.ref,
        title: own.title,
        url: own.url,
        peer: hidden ? null : { ref, title: other?.title ?? null, url: other?.url ?? null, pbis: other?.pbis ?? [] },
        files: typeof peer.files === "number" && Number.isSafeInteger(peer.files) && peer.files >= 0 ? peer.files : 0,
        checkedAt: own.checkedAt?.toISOString() ?? null,
      })
    }
  }
  return { predictedConflicts: conflicts.slice(0, MR_WARNINGS_MAX), predictionUnchecked: [...new Set(unchecked)] }
}

/** Pure: every warning of one claim. */
export function mrWarnings(claim: ClaimForMrWarnings, links: readonly MrLinkForOverlap[], hideConfidential: boolean): MrWarnings {
  const groups = groupMergeRequests(links)
  return { mergeRequestOverlaps: mrPathOverlaps(claim, groups, hideConfidential), ...predictedConflicts(claim, groups, hideConfidential) }
}

/** Pure: nothing to report. */
export const isEmptyWarnings = (w: MrWarnings): boolean => w.mergeRequestOverlaps.length === 0 && w.predictedConflicts.length === 0 && w.predictionUnchecked.length === 0
