import { prisma } from "@/lib/prisma"
import { logger } from "@/lib/logger"
import { claimStaleHours, scopeDeclaredAt, scopeOf, staleBefore } from "@/services/dev-work/dev-work.rules"
import { outsideScope, type ScopeEntry } from "@/services/dev-work/dev-work.scope"
import type { DevChangedPaths, DevSource } from "./dev-source"

/**
 * 触る範囲 at push time (W4): the sync compares the changed files of a merge request with
 * the scope declared by the active work claims of the MR's PBI, and records on the MR link
 * how many files lie outside it (git_link.outsideScopeCount / Paths, scopeCheckedAt). The
 * PBI panel shows it as one line. A WARNING only: it never blocks, never changes a task,
 * and a failure here never fails the sync (logged).
 *
 * Which claims: the active claims (not released, heartbeat within DEV_CLAIM_STALE_HOURS) of
 * the project that declared a scope; for one MR, those on the MR's source branch when there
 * are any, else all of the PBI's (their scopes together).
 *
 * Which MRs, newest first, at most MAX_SCOPE_CHECKS per repository and sync:
 * 1. open MRs read in this sync (new / updated: a push updates them) of a PBI with such a claim;
 * 2. open MR links of such PBIs never checked, or checked before the PBI's current scope was
 *    declared (a scope change is rechecked without waiting for a push).
 * A lookup that fails CLEARS the link's result (scopeCheckedAt null): an old answer is never
 * shown as current, and the link is retried by (2) in the next sync.
 *
 * Cost: the source's changed-files listing (GitLab: up to 3 requests of 100 files, the diff
 * text included — GitLab has no paths-only listing) per checked MR, within SCOPE_CHECK_BUDGET_MS
 * per repository and sync. No scoped active claim in the project = one cheap query, no request.
 */
const log = logger.child({ module: "git-sync" })

/** Merge requests whose changed files are read per repository and sync. */
export const MAX_SCOPE_CHECKS = 10
/** Outside-scope paths stored per link (the count is exact for what was read). */
export const OUTSIDE_PATHS_STORED = 20
/** Wall-clock budget of the changed-files lookups per repository and sync. */
export const SCOPE_CHECK_BUDGET_MS = 20_000
/** Scoped active claims read per project. */
const SCOPED_CLAIMS_READ = 200
/** Links read for a recheck per sync. */
const RECHECK_READ = 50

/** An open merge request linked to a PBI. */
export interface ScopeCheckCandidate {
  ref: string
  sourceBranch: string | null
  backlogItemId: string
}

interface ScopedClaim {
  backlogItemId: string
  branch: string | null
  scopes: ReadonlyArray<{ kind: string; value: string; createdAt?: Date }>
}

/** Pure: the scope an MR is compared with — the claims on its branch if any, else every scoped claim of the PBI. */
export function scopeForMergeRequest(claims: readonly ScopedClaim[], sourceBranch: string | null): ScopeEntry[] {
  const onBranch = sourceBranch ? claims.filter((c) => c.branch === sourceBranch) : []
  return (onBranch.length > 0 ? onBranch : claims).flatMap((c) => scopeOf(c))
}

const samePaths = (a: unknown, b: readonly string[]) => Array.isArray(a) && a.length === b.length && a.every((x, i) => x === b[i])

export interface ScopeCheckOptions {
  budgetMs?: number
  /** Milliseconds clock (tests). */
  clock?: () => number
}

/** Compare and record; returns how many links changed (for the realtime refresh), also after a mid-way failure. Never throws. */
export async function checkMergeRequestScopes(
  source: Pick<DevSource, "changedPaths">,
  repository: { id: string; projectId: string },
  fresh: readonly ScopeCheckCandidate[],
  now: Date,
  options: ScopeCheckOptions = {},
): Promise<number> {
  const read = source.changedPaths?.bind(source)
  if (!read) return 0
  const repositoryId = repository.id
  const clock = options.clock ?? Date.now
  const deadline = clock() + (options.budgetMs ?? SCOPE_CHECK_BUDGET_MS)
  let updates = 0
  try {
    const claims = await prisma.workClaim.findMany({
      where: { projectId: repository.projectId, releasedAt: null, heartbeatAt: { gte: staleBefore(now, claimStaleHours()) }, scopes: { some: {} } },
      select: { backlogItemId: true, branch: true, scopes: { select: { kind: true, value: true, createdAt: true } } },
      orderBy: [{ heartbeatAt: "desc" }, { id: "desc" }],
      take: SCOPED_CLAIMS_READ,
    })
    if (claims.length === 0) return 0
    const byPbi = new Map<string, ScopedClaim[]>()
    const declaredAt = new Map<string, Date>()
    for (const c of claims) {
      byPbi.set(c.backlogItemId, [...(byPbi.get(c.backlogItemId) ?? []), c])
      const at = scopeDeclaredAt(c)
      const prev = declaredAt.get(c.backlogItemId)
      if (at && (!prev || at > prev)) declaredAt.set(c.backlogItemId, at)
    }

    const due = [...fresh].reverse().filter((c) => byPbi.has(c.backlogItemId))
    const rechecks = declaredAt.size === 0 ? [] : await prisma.gitLink.findMany({
      where: {
        repositoryId,
        kind: "mr",
        state: { in: ["opened", "locked"] },
        OR: [...declaredAt].map(([backlogItemId, at]) => ({ backlogItemId, OR: [{ scopeCheckedAt: null }, { scopeCheckedAt: { lt: at } }] })),
      },
      select: { ref: true, sourceBranch: true, backlogItemId: true },
      orderBy: [{ occurredAt: "desc" }, { id: "desc" }],
      take: RECHECK_READ,
    })
    const queue: ScopeCheckCandidate[] = []
    const queued = new Set<string>()
    for (const c of [...due, ...rechecks]) {
      const key = `${c.ref}|${c.backlogItemId}`
      if (queued.has(key)) continue
      queued.add(key)
      queue.push(c)
    }
    const refs = new Set<string>()
    const changed = new Map<string, DevChangedPaths | null>()
    let budgetLogged = false
    for (const c of queue) {
      if (!changed.has(c.ref)) {
        if (refs.size >= MAX_SCOPE_CHECKS || clock() >= deadline) {
          if (!budgetLogged) log.info("git scope check bounded", { repositoryId, queued: queue.length, checked: refs.size, timeBudgetReached: clock() >= deadline })
          budgetLogged = true
          continue
        }
        refs.add(c.ref)
        changed.set(c.ref, await readChangedPaths(read, repositoryId, c.ref))
      }
      const files = changed.get(c.ref)
      if (files === undefined) continue
      const where = { repositoryId, kind: "mr", ref: c.ref, backlogItemId: c.backlogItemId }
      const before = await prisma.gitLink.findFirst({ where, select: { outsideScopeCount: true, outsideScopePaths: true, scopeCheckedAt: true } })
      if (!before) continue
      if (files === null) {
        // Never show an old answer as current: clear it (retried next sync as never checked).
        if (before.scopeCheckedAt === null && before.outsideScopeCount === null) continue
        await prisma.gitLink.updateMany({ where, data: { scopeCheckedAt: null, outsideScopeCount: null, outsideScopePaths: [] } })
        updates++
        continue
      }
      const { outside, unusable } = outsideScope(files.paths, scopeForMergeRequest(byPbi.get(c.backlogItemId) ?? [], c.sourceBranch))
      if (unusable.length > 0) log.info("git scope check skipped unusable changed paths", { repositoryId, mr: c.ref, count: unusable.length })
      const paths = outside.slice(0, OUTSIDE_PATHS_STORED)
      await prisma.gitLink.updateMany({ where, data: { scopeCheckedAt: now, outsideScopeCount: outside.length, outsideScopePaths: paths } })
      if (before.outsideScopeCount !== outside.length || !samePaths(before.outsideScopePaths, paths)) updates++
    }
    return updates
  } catch (err) {
    log.warn("git scope check stopped", { repositoryId, linksChanged: updates, error: err instanceof Error ? err.message : String(err) })
    return updates
  }
}

async function readChangedPaths(read: (ref: string) => Promise<DevChangedPaths>, repositoryId: string, ref: string): Promise<DevChangedPaths | null> {
  try {
    const files = await read(ref)
    if (!files.complete) log.info("git scope check read part of the changed files", { repositoryId, mr: ref, files: files.paths.length })
    return files
  } catch (err) {
    log.warn("git changed-files lookup failed", { repositoryId, mr: ref, error: err instanceof Error ? err.message : String(err) })
    return null
  }
}
