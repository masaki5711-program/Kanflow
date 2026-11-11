import type { GitLinkDto, GitMergeStateDto, PbiGitPanelDto, PbiGitSummary } from "@/services/git/git.service"

export type { GitLinkDto, GitMergeStateDto, PbiGitPanelDto, PbiGitSummary }

/**
 * Client-side state shared by the Git hooks.
 *
 * Most projects (process-improvement teams) never switch the integration on,
 * so once any Git request says `enabled: false` the other hooks of that
 * project skip their requests for a while instead of asking again per modal /
 * board. A reload, the TTL or `forgetGitState` (e.g. after the settings
 * switch) asks again.
 */
const OFF_TTL_MS = 5 * 60_000
const offUntil = new Map<string, number>()

export function isGitKnownOff(projectId: string, now: number = Date.now()): boolean {
  return (offUntil.get(projectId) ?? 0) > now
}

export function rememberGitOff(projectId: string, now: number = Date.now()): void {
  offUntil.set(projectId, now + OFF_TTL_MS)
}

/** Forget the cached "off" (one project, or all when omitted). */
export function forgetGitState(projectId?: string): void {
  if (projectId) offUntil.delete(projectId)
  else offUntil.clear()
}

/** Fired after a manual sync so every badge / panel of the project refetches. */
export const GIT_SYNCED_EVENT = "kanflow:git-synced"

export function announceGitSynced(projectId: string): void {
  window.dispatchEvent(new CustomEvent(GIT_SYNCED_EVENT, { detail: { projectId } }))
}

export function gitApiBase(projectId: string): string {
  return `/api/projects/${encodeURIComponent(projectId)}/git`
}

// ---------------------------------------------------------------- parsing

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null
}

const str = (v: unknown): string | null => (typeof v === "string" ? v : null)

function toLink(raw: unknown): GitLinkDto[] {
  if (!isRecord(raw) || !isRecord(raw.repository)) return []
  const { id, kind, ref, title, url, occurredAt } = raw
  if (typeof id !== "string" || typeof kind !== "string" || typeof url !== "string" || typeof occurredAt !== "string") return []
  return [{
    id,
    kind,
    ref: str(ref) ?? "",
    title: str(title) ?? "",
    url,
    state: str(raw.state),
    pipeline: str(raw.pipeline),
    author: str(raw.author),
    sourceBranch: str(raw.sourceBranch),
    occurredAt,
    mergedAt: str(raw.mergedAt),
    goneAt: str(raw.goneAt),
    declared: raw.declared === true,
    repository: { id: str(raw.repository.id) ?? "", name: str(raw.repository.name) ?? "" },
    merge: toMergeState(raw.merge),
  }]
}

const nonNegative = (v: unknown): number => (typeof v === "number" && Number.isSafeInteger(v) && v >= 0 ? v : 0)

/** Pure (N4 / N5): a link's `merge` → state, anything unexpected → null (the panel then shows nothing for it). */
export function toMergeState(raw: unknown): GitMergeStateDto | null {
  if (!isRecord(raw) || typeof raw.checkedAt !== "string") return null
  const blockers = Array.isArray(raw.blockers)
    ? raw.blockers.flatMap((b) => (isRecord(b) && typeof b.reason === "string" && b.reason ? [{ reason: b.reason, detail: str(b.detail) }] : []))
    : []
  const c = raw.conflicts
  const conflicts =
    isRecord(c) && typeof c.status === "string"
      ? {
          status: c.status,
          stale: c.stale === true,
          scannedAt: str(c.scannedAt),
          peers: (Array.isArray(c.peers) ? c.peers : []).flatMap((p) =>
            isRecord(p) && typeof p.iid === "number" && Number.isSafeInteger(p.iid)
              ? [{ iid: p.iid, draft: p.draft === true, outcome: str(p.outcome) ?? "conflict", files: nonNegative(p.files), truncated: p.truncated === true }]
              : [],
          ),
        }
      : null
  return { mergeable: typeof raw.mergeable === "boolean" ? raw.mergeable : null, blockers, conflicts, checkedAt: raw.checkedAt }
}

/** Pure: `/git/links` body → panel DTO (anything unexpected → off). */
export function toPanel(raw: unknown): PbiGitPanelDto {
  if (!isRecord(raw) || raw.enabled !== true) return { enabled: false }
  return {
    enabled: true,
    pbiKey: str(raw.pbiKey) ?? undefined,
    branchSuggestion: str(raw.branchSuggestion) ?? undefined,
    hasRepositories: raw.hasRepositories === true,
    links: Array.isArray(raw.links) ? raw.links.flatMap(toLink) : [],
  }
}

export interface GitSummaries {
  enabled: boolean
  summaries: Record<string, PbiGitSummary>
}

const num = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? v : 0)

/** Pure: `/git/summary` body → summaries (malformed rows skipped, anything unexpected → off). */
export function toSummaries(raw: unknown): GitSummaries {
  if (!isRecord(raw) || raw.enabled !== true) return { enabled: false, summaries: {} }
  const rows = isRecord(raw.summaries) ? Object.entries(raw.summaries) : []
  const summaries = Object.fromEntries(
    rows.flatMap(([id, s]) =>
      isRecord(s)
        ? [[id, { openMrs: num(s.openMrs), mergedMrs: num(s.mergedMrs), branches: num(s.branches), pipeline: str(s.pipeline), blockedMrs: num(s.blockedMrs), conflictMrs: num(s.conflictMrs) }]]
        : [],
    ),
  )
  return { enabled: true, summaries }
}
