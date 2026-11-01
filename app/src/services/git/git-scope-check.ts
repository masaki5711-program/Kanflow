import { prisma } from "@/lib/prisma"
import { logger } from "@/lib/logger"
import { claimStaleHours, scopeOf, staleBefore } from "@/services/dev-work/dev-work.rules"
import { outsideScope, type ScopeEntry } from "@/services/dev-work/dev-work.scope"
import type { DevChangedPaths, DevSource } from "./dev-source"

/**
 * 触る範囲 at push time (W4): the sync compares the changed files of a merge request it
 * just read with the scope declared by the active work claims of the MR's PBI, and records
 * on the MR link how many files lie outside it (git_link.outsideScopeCount / Paths,
 * scopeCheckedAt). The PBI panel shows it as one line. A WARNING only: it never blocks,
 * never changes a task, and a failure here never fails the sync (logged, link unchanged).
 *
 * Which claims: the active claims (not released, heartbeat within DEV_CLAIM_STALE_HOURS) on
 * the PBI that declared a scope; those working on the MR's source branch when there are
 * any, else all of them (their scopes together).
 *
 * Cost: the source's changed-files listing (GitLab: up to 3 requests of 100 files, the diff
 * text included — GitLab has no paths-only listing) per checked MR, only for merge requests
 * that are new / updated in this sync (a push updates them), open, linked to a PBI with a
 * scoped active claim — at most MAX_SCOPE_CHECKS per repository and sync. No claim with a
 * scope = not one extra request.
 */
const log = logger.child({ module: "git-sync" })

/** Merge requests whose changed files are read per repository and sync (newest kept). */
export const MAX_SCOPE_CHECKS = 10
/** Outside-scope paths stored per link (the count is exact for what was read). */
export const OUTSIDE_PATHS_STORED = 20
/** Scoped active claims read for one sync's candidate PBIs. */
const SCOPED_CLAIMS_READ = 200

/** An open merge request (read in this sync) linked to a PBI. */
export interface ScopeCheckCandidate {
  ref: string
  sourceBranch: string | null
  backlogItemId: string
}

interface ScopedClaim {
  backlogItemId: string
  branch: string | null
  scopes: ReadonlyArray<{ kind: string; value: string }>
}

/** Pure: the scope an MR is compared with — the claims on its branch if any, else every scoped claim of the PBI. */
export function scopeForMergeRequest(claims: readonly ScopedClaim[], sourceBranch: string | null): ScopeEntry[] {
  const onBranch = sourceBranch ? claims.filter((c) => c.branch === sourceBranch) : []
  return (onBranch.length > 0 ? onBranch : claims).flatMap((c) => scopeOf(c))
}

const samePaths = (a: unknown, b: readonly string[]) => Array.isArray(a) && a.length === b.length && a.every((x, i) => x === b[i])

/** Compare and record; returns how many links changed (for the realtime refresh). Never throws. */
export async function checkMergeRequestScopes(
  source: Pick<DevSource, "changedPaths">,
  repositoryId: string,
  candidates: readonly ScopeCheckCandidate[],
  now: Date,
): Promise<number> {
  if (candidates.length === 0) return 0
  if (!source.changedPaths) return 0
  try {
    const pbiIds = [...new Set(candidates.map((c) => c.backlogItemId))]
    const claims = await prisma.workClaim.findMany({
      where: { backlogItemId: { in: pbiIds }, releasedAt: null, heartbeatAt: { gte: staleBefore(now, claimStaleHours()) }, scopes: { some: {} } },
      select: { backlogItemId: true, branch: true, scopes: { select: { kind: true, value: true } } },
      orderBy: [{ heartbeatAt: "desc" }, { id: "desc" }],
      take: SCOPED_CLAIMS_READ,
    })
    if (claims.length === 0) return 0
    const byPbi = new Map<string, ScopedClaim[]>()
    for (const c of claims) byPbi.set(c.backlogItemId, [...(byPbi.get(c.backlogItemId) ?? []), c])
    const due = candidates.filter((c) => byPbi.has(c.backlogItemId))
    const refs = [...new Set(due.map((c) => c.ref))]
    if (refs.length > MAX_SCOPE_CHECKS) log.info("git scope check bounded", { repositoryId, mergeRequests: refs.length, checked: MAX_SCOPE_CHECKS })
    const checked = new Set(refs.slice(-MAX_SCOPE_CHECKS))
    const changed = new Map<string, DevChangedPaths | null>()
    let updates = 0
    for (const c of due) {
      if (!checked.has(c.ref)) continue
      if (!changed.has(c.ref)) changed.set(c.ref, await readChangedPaths(source.changedPaths.bind(source), repositoryId, c.ref))
      const files = changed.get(c.ref)
      if (!files) continue
      const outside = outsideScope(files.paths, scopeForMergeRequest(byPbi.get(c.backlogItemId) ?? [], c.sourceBranch))
      const where = { repositoryId, kind: "mr", ref: c.ref, backlogItemId: c.backlogItemId }
      const before = await prisma.gitLink.findFirst({ where, select: { outsideScopeCount: true, outsideScopePaths: true } })
      if (!before) continue
      const paths = outside.slice(0, OUTSIDE_PATHS_STORED)
      await prisma.gitLink.updateMany({ where, data: { scopeCheckedAt: now, outsideScopeCount: outside.length, outsideScopePaths: paths } })
      if (before.outsideScopeCount !== outside.length || !samePaths(before.outsideScopePaths, paths)) updates++
    }
    return updates
  } catch (err) {
    log.warn("git scope check skipped", { repositoryId, error: err instanceof Error ? err.message : String(err) })
    return 0
  }
}

async function readChangedPaths(read: (ref: string) => Promise<DevChangedPaths>, repositoryId: string, ref: string): Promise<DevChangedPaths | null> {
  try {
    const files = await read(ref)
    if (!files.complete) log.info("git scope check read part of the changed files", { repositoryId, mr: ref, files: files.paths.length })
    return files
  } catch (err) {
    // A decoration: the link keeps its last check.
    log.warn("git changed-files lookup failed", { repositoryId, mr: ref, error: err instanceof Error ? err.message : String(err) })
    return null
  }
}
