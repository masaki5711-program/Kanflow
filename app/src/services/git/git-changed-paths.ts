import { Prisma } from "@/generated/prisma/client"
import { prisma } from "@/lib/prisma"
import { logger } from "@/lib/logger"
import { claimStaleHours, staleBefore } from "@/services/dev-work/dev-work.rules"
import type { DevChangedPaths, DevSource } from "./dev-source"

/**
 * N6 (docs/integration/gitstation-operations-plan.md §4, step 1): the files each open merge request changes, kept on
 * its links (git_link.changedPaths / changedPathsComplete / changedPathsAt) so a work claim's declared scope can be
 * compared with other people's merge requests (dev-work.mr-overlap). A warning's data only: it never blocks, never
 * changes a task, never fails the sync.
 *
 * - Read only while the project has an active claim with a declared scope (nothing to compare with otherwise: one
 *   cheap query, no request).
 * - Which merge requests, at most MAX_PATH_READS per repository and sync (PATH_READ_BUDGET_MS): open ones read in this
 *   sync first, then open ones never read or changed since they were read (occurredAt later than changedPathsAt),
 *   newest change first. A read that failed is not tried again sooner than RETRY_AFTER_MS unless the MR changes.
 * - A read that fails CLEARS the stored paths (an old list is never shown as current). A merge request read in this
 *   sync that is no longer open has its paths cleared.
 * - Files withheld from the service account (GitStation's confidential marks) are never named by the source: such a
 *   listing is incomplete, and those files never reach Kanflow.
 *
 * The reads of this sync are returned, so the 触る範囲 check (git-scope-check) does not read the same MR twice.
 */
const log = logger.child({ module: "git-sync" })

/** Merge requests whose changed files are read per repository and sync. */
export const MAX_PATH_READS = 10
/** Paths stored per link (GitStation's context answer gives at most 300). */
export const CHANGED_PATHS_STORED = 300
/** No new read starts after this much time per repository and sync. */
export const PATH_READ_BUDGET_MS = 20_000
/** A failed read is not tried again sooner than this (unless the MR changes). */
export const RETRY_AFTER_MS = 60 * 60_000
/** Links read as candidates. */
const CANDIDATES_READ = 100

const OPEN = ["opened", "locked"]
const IID = /^[1-9][0-9]{0,9}$/

/** A merge request read in this sync (any state). */
export interface ChangedPathsCandidate {
  ref: string
  state: string | null
}

export interface ChangedPathsOptions {
  /** Milliseconds clock (tests). */
  clock?: () => number
}

export interface ChangedPathsResult {
  /** Links whose stored paths changed (realtime refresh). */
  changed: number
  /** What this sync read, by MR (null = the read failed). */
  read: Map<string, DevChangedPaths | null>
}

/** Pure: the read order — this sync's open MRs first, then the due ones; each once, at most `max`. */
export function changedPathsQueue(fresh: readonly string[], due: readonly string[], max = MAX_PATH_READS): string[] {
  const out: string[] = []
  for (const ref of [...fresh, ...due]) if (!out.includes(ref) && out.length < max) out.push(ref)
  return out
}

/** Pure: what is stored for a listing (at most CHANGED_PATHS_STORED paths, deduplicated, in the source's order). */
export function changedPathsValues(files: DevChangedPaths): { changedPaths: string[]; changedPathsComplete: boolean } {
  const unique = [...new Set(files.paths.filter((p) => typeof p === "string" && p.trim() !== ""))]
  return { changedPaths: unique.slice(0, CHANGED_PATHS_STORED), changedPathsComplete: files.complete && unique.length <= CHANGED_PATHS_STORED }
}

const CLEARED = { changedPaths: Prisma.DbNull, changedPathsComplete: null }

/** Read and store; never throws. */
export async function refreshChangedPaths(
  source: Pick<DevSource, "changedPaths">,
  repository: { id: string; projectId: string },
  fresh: readonly ChangedPathsCandidate[],
  now: Date,
  options: ChangedPathsOptions = {},
): Promise<ChangedPathsResult> {
  const result: ChangedPathsResult = { changed: 0, read: new Map() }
  const readPaths = source.changedPaths?.bind(source)
  if (!readPaths) return result
  const repositoryId = repository.id
  const clock = options.clock ?? Date.now
  const deadline = clock() + PATH_READ_BUDGET_MS
  const mr = { repositoryId, kind: "mr" }
  try {
    const valid = fresh.filter((c) => IID.test(c.ref))
    // Only a state the source reported and that is not open (an unknown state is not "closed").
    const closedRefs = [...new Set(valid.filter((c) => c.state !== null && !OPEN.includes(c.state)).map((c) => c.ref))]
    if (closedRefs.length > 0) {
      // changedPathsAt marks a read (successful or not): a JSON-null filter is not used (Prisma's NOT over a JSON
      // null does not match the stored rows).
      const cleared = await prisma.gitLink.updateMany({ where: { ...mr, ref: { in: closedRefs }, changedPathsAt: { not: null } }, data: { ...CLEARED, changedPathsAt: null } })
      result.changed += cleared.count
    }
    const scoped = await prisma.workClaim.count({
      where: { projectId: repository.projectId, releasedAt: null, heartbeatAt: { gte: staleBefore(now, claimStaleHours()) }, scopes: { some: {} } },
    })
    if (scoped === 0) return result

    const freshOpen = [...new Set([...valid].reverse().filter((c) => OPEN.includes(c.state ?? "")).map((c) => c.ref))]
    const dueRows = await prisma.gitLink.findMany({
      where: {
        ...mr,
        state: { in: OPEN },
        OR: [
          { changedPathsAt: null },
          // Changed since it was read — only for a change time not ahead of this sync (GitStation's clock running
          // ahead would make it due on every sync), as the merge-state step does.
          { changedPathsAt: { lt: prisma.gitLink.fields.occurredAt }, occurredAt: { lte: now } },
          { changedPaths: { equals: Prisma.DbNull }, changedPathsAt: { lt: new Date(now.getTime() - RETRY_AFTER_MS) } },
        ],
      },
      select: { ref: true },
      orderBy: [{ occurredAt: "desc" }, { id: "asc" }],
      take: CANDIDATES_READ,
    })
    const due = [...new Set(dueRows.map((r) => r.ref).filter((r) => IID.test(r)))]
    const queue = changedPathsQueue(freshOpen, due)
    const waiting = new Set([...freshOpen, ...due]).size - queue.length
    if (waiting > 0) log.info("git changed-files reads bounded", { repositoryId, read: queue.length, waiting })

    let failures = 0
    for (const ref of queue) {
      if (clock() >= deadline) {
        log.info("git changed-files time budget reached", { repositoryId, read: result.read.size, left: queue.length - result.read.size })
        break
      }
      const where = { ...mr, ref }
      const before = await prisma.gitLink.findFirst({ where, select: { changedPaths: true, changedPathsComplete: true } })
      if (!before) continue
      let files: DevChangedPaths
      try {
        files = await readPaths(ref)
      } catch (err) {
        failures++
        result.read.set(ref, null)
        log.warn("git changed-files lookup failed", { repositoryId, mr: ref, error: err instanceof Error ? err.message : String(err) })
        await prisma.gitLink.updateMany({ where, data: { ...CLEARED, changedPathsAt: now } })
        if (before.changedPaths !== null) result.changed++
        continue
      }
      result.read.set(ref, files)
      const values = changedPathsValues(files)
      if (!values.changedPathsComplete) log.info("git changed files read in part", { repositoryId, mr: ref, files: values.changedPaths.length })
      await prisma.gitLink.updateMany({ where, data: { ...values, changedPathsAt: now } })
      const same = Array.isArray(before.changedPaths) && before.changedPaths.length === values.changedPaths.length && before.changedPaths.every((p, i) => p === values.changedPaths[i])
      if (!same || before.changedPathsComplete !== values.changedPathsComplete) result.changed++
    }
    if (failures > 0 && failures === result.read.size) log.error("git changed-files: every read failed", { repositoryId, failures })
    return result
  } catch (err) {
    log.warn("git changed-files step stopped", { repositoryId, error: err instanceof Error ? err.message : String(err) })
    return result
  }
}
