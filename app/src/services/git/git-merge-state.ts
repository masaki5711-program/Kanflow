import { Prisma } from "@/generated/prisma/client"
import { prisma } from "@/lib/prisma"
import { logger } from "@/lib/logger"
import { canonicalJson } from "@/lib/plan-schedule/schedule-source"
import type { DevMergeState, DevSource } from "./dev-source"

/**
 * N4 / N5 (docs/integration/gitstation-operations-plan.md §5.2, §5.3, §4): why an open merge request cannot merge
 * yet, and which other merge requests it is predicted to conflict with — read by the sync from the source
 * (GitStation's `/status` and `/conflicts` with the service account) and stored on every link of the merge request
 * (git_link.mergeBlockers / mergeable / conflictPrediction / mergeStatusAt / mergeStatusTriedAt). The PBI panel and
 * the card show it. A display only: it never blocks anything, never changes a task, never fails the sync.
 *
 * Which merge requests, at most MAX_MERGE_STATE_READS per repository and sync (MERGE_STATE_BUDGET_MS between reads):
 * 1. open ones whose stored prediction names a merge request read in this sync (GitStation sends no event when a
 *    prediction clears: a push / close / merge of the other side is the cue to read it again);
 * 2. open ones read in this sync (every merge request event, a check result, a push can change why it is blocked);
 * 3. DUE ones — never read, changed since they were read (a merge request event that did not fit in its own sync),
 *    or read more than RECHECK_AFTER_MS ago (a target branch that moved changes conflicts without any event) —
 *    least recently TRIED first, and not retried within RETRY_AFTER_MS of a failed try. At least RESERVED_FOR_DUE
 *    reads are kept for them, so a busy repository still catches up.
 * A merge request read in this sync that is no longer open has its state cleared (no call). A read that fails CLEARS
 * the stored state (an old answer is never shown as current). GitStation refusing the service account (401 / 403),
 * or being busy / unreachable, stops the step for the repository at once (logged with its status); every read
 * failing in one sync is logged as an error.
 */
const log = logger.child({ module: "git-sync" })

/** Merge requests whose state is read per repository and sync (2 requests each). */
export const MAX_MERGE_STATE_READS = 15
/** Reads kept for due merge requests (3) when there are any. */
export const RESERVED_FOR_DUE = 4
/** No new read starts after this much time per repository and sync. */
export const MERGE_STATE_BUDGET_MS = 20_000
/** A stored state older than this is due (no event says a target branch moved). */
export const RECHECK_AFTER_MS = 60 * 60_000
/** A merge request whose read failed is not tried again sooner than this. */
export const RETRY_AFTER_MS = 10 * 60_000
/** Links read per query for (1) and (3). */
const CANDIDATES_READ = 200

const OPEN = ["opened", "locked"]
const IID = /^[1-9][0-9]{0,9}$/

/** A merge request read in this sync (any state). */
export interface MergeStateCandidate {
  ref: string
  state: string | null
}

export interface MergeStateOptions {
  /** Milliseconds clock (tests). */
  clock?: () => number
}

/** Pure: the peer numbers of a stored conflict prediction (anything malformed: none). */
export function predictedPeers(stored: unknown): number[] {
  if (!stored || typeof stored !== "object" || !Array.isArray((stored as { peers?: unknown }).peers)) return []
  return (stored as { peers: unknown[] }).peers
    .map((p) => (p && typeof p === "object" ? (p as { iid?: unknown }).iid : null))
    .filter((iid): iid is number => typeof iid === "number" && Number.isSafeInteger(iid))
}

/** The state columns emptied (a JSON column takes the database NULL). */
const CLEARED = { mergeBlockers: Prisma.DbNull, mergeable: null, mergeStatusAt: null, conflictPrediction: Prisma.DbNull }

/** A prediction GitStation did not give this time: shown as "not checked", never as "no conflict". */
const UNAVAILABLE = { status: "unavailable", reason: null, stale: false, scannedAt: null, peers: [] }

/** Pure: what is stored for a state read (JSON values). */
export function mergeStateValues(state: DevMergeState) {
  return {
    mergeBlockers: state.blockers.map((b) => ({ reason: b.reason, detail: b.detail })),
    mergeable: state.mergeable,
    conflictPrediction:
      state.conflicts === null
        ? UNAVAILABLE
        : {
            status: state.conflicts.status,
            reason: state.conflicts.reason,
            stale: state.conflicts.stale,
            scannedAt: state.conflicts.scannedAt,
            peers: state.conflicts.peers.map((p) => ({ iid: p.iid, draft: p.draft, outcome: p.outcome, files: p.files, truncated: p.truncated })),
          },
  }
}

/** jsonb reorders object keys: compare canonical forms, never JSON.stringify. */
const same = (a: unknown, b: unknown) => canonicalJson(a ?? null) === canonicalJson(b ?? null)

/** Pure: the read order — (1) predicted peers, (2) this sync's, then (3) due ones with a reserved share. */
export function mergeStateQueue(peers: readonly string[], fresh: readonly string[], due: readonly string[], max = MAX_MERGE_STATE_READS): string[] {
  const out: string[] = []
  const add = (ref: string) => {
    if (!out.includes(ref)) out.push(ref)
  }
  const dueLeft = due.filter((r) => !peers.includes(r) && !fresh.includes(r))
  const firstPart = Math.max(0, max - Math.min(RESERVED_FOR_DUE, dueLeft.length))
  for (const ref of [...peers, ...fresh]) if (out.length < firstPart) add(ref)
  for (const ref of dueLeft) if (out.length < max) add(ref)
  return out
}

type Stop = "auth" | "busy" | null

/** Read and store; returns how many merge requests' shown state changed (for the realtime refresh). Never throws. */
export async function refreshMergeStates(
  source: Pick<DevSource, "mergeState" | "describeError">,
  repositoryId: string,
  fresh: readonly MergeStateCandidate[],
  now: Date,
  options: MergeStateOptions = {},
): Promise<number> {
  const read = source.mergeState?.bind(source)
  if (!read) return 0
  const clock = options.clock ?? Date.now
  const deadline = clock() + MERGE_STATE_BUDGET_MS
  const mr = { repositoryId, kind: "mr" }
  const valid = fresh.filter((c) => IID.test(c.ref))
  let changed = 0
  try {
    // No longer open: nothing blocks a closed / merged merge request — clear what was stored.
    const closedRefs = [...new Set(valid.filter((c) => !OPEN.includes(c.state ?? "")).map((c) => c.ref))]
    if (closedRefs.length > 0) {
      const cleared = await prisma.gitLink.updateMany({ where: { ...mr, ref: { in: closedRefs }, mergeStatusAt: { not: null } }, data: CLEARED })
      changed += cleared.count > 0 ? closedRefs.length : 0
    }

    const freshOpen = [...new Set([...valid].reverse().filter((c) => OPEN.includes(c.state ?? "")).map((c) => c.ref))]
    const freshIids = new Set(valid.map((c) => Number(c.ref)))
    const peers: string[] = []
    if (freshIids.size > 0) {
      const predicted = await prisma.gitLink.findMany({
        where: { ...mr, state: { in: OPEN }, NOT: { conflictPrediction: { equals: Prisma.DbNull } } },
        select: { ref: true, conflictPrediction: true },
        orderBy: [{ occurredAt: "desc" }, { id: "asc" }],
        take: CANDIDATES_READ,
      })
      for (const p of predicted) if (IID.test(p.ref) && predictedPeers(p.conflictPrediction).some((iid) => freshIids.has(iid))) peers.push(p.ref)
    }
    const dueRows = await prisma.gitLink.findMany({
      where: {
        ...mr,
        state: { in: OPEN },
        AND: [
          {
            OR: [
              { mergeStatusAt: null },
              // Changed since it was read — only for a change time not ahead of this sync (GitStation's clock running
              // ahead would make it due on every sync); such a merge request is still read by the hourly recheck.
              { mergeStatusAt: { lt: prisma.gitLink.fields.occurredAt }, occurredAt: { lte: now } },
              { mergeStatusAt: { lt: new Date(now.getTime() - RECHECK_AFTER_MS) } },
            ],
          },
          { OR: [{ mergeStatusTriedAt: null }, { mergeStatusTriedAt: { lt: new Date(now.getTime() - RETRY_AFTER_MS) } }, { mergeStatusAt: { not: null } }] },
        ],
      },
      select: { ref: true },
      orderBy: [{ mergeStatusTriedAt: { sort: "asc", nulls: "first" } }, { id: "asc" }],
      take: CANDIDATES_READ,
    })
    const due = [...new Set(dueRows.map((d) => d.ref).filter((r) => IID.test(r)))]
    const queue = mergeStateQueue(peers, freshOpen, due)
    const skipped = new Set([...peers, ...freshOpen, ...due]).size - queue.length
    if (skipped > 0) log.info("git merge state reads bounded", { repositoryId, read: queue.length, waiting: skipped })

    let reads = 0
    let failures = 0
    let stop: Stop = null
    for (const ref of queue) {
      if (clock() >= deadline) {
        log.info("git merge state time budget reached", { repositoryId, read: reads, left: queue.length - reads })
        break
      }
      const where = { ...mr, ref }
      const before = await prisma.gitLink.findMany({ where, select: { mergeBlockers: true, mergeable: true, conflictPrediction: true, mergeStatusAt: true } })
      if (before.length === 0) continue
      reads++
      let state: DevMergeState
      try {
        state = await read(ref)
      } catch (err) {
        failures++
        const info = source.describeError(err)
        log.warn("git merge state not read", { repositoryId, mr: ref, errorKind: info.kind, status: info.status })
        const wasShown = before.some((b) => b.mergeStatusAt !== null)
        await prisma.gitLink.updateMany({ where, data: { ...CLEARED, mergeStatusTriedAt: now } })
        if (wasShown) changed++
        stop = info.kind === "auth" || info.kind === "forbidden" ? "auth" : info.kind === "rate_limited" || info.kind === "unavailable" || info.kind === "network" ? "busy" : null
        if (stop) break
        continue
      }
      const values = mergeStateValues(state)
      await prisma.gitLink.updateMany({
        where,
        data: { mergeBlockers: values.mergeBlockers, mergeable: values.mergeable, mergeStatusAt: now, mergeStatusTriedAt: now, conflictPrediction: values.conflictPrediction },
      })
      if (before.some((b) => !same(b.mergeBlockers, values.mergeBlockers) || b.mergeable !== values.mergeable || !same(b.conflictPrediction, values.conflictPrediction))) changed++
    }
    // A refused service account is a setting to fix, and every read failing is not a blip: both at error level.
    if (stop === "auth") log.error("git merge state refused: the service account may not read merge status", { repositoryId })
    else if (stop === "busy") log.warn("git merge state stopped: GitStation busy or unreachable", { repositoryId, read: reads })
    else if (reads > 0 && failures === reads) log.error("git merge state: every read failed", { repositoryId, failures })
    return changed
  } catch (err) {
    log.warn("git merge state stopped", { repositoryId, changed, error: err instanceof Error ? err.message : String(err) })
    return changed
  }
}
