import type { GitLabClient, GitLabCommit, GitLabMergeRequest } from "@/lib/git/gitlab-client"
import { logger } from "@/lib/logger"
import { growWidth, laterMr, MIN_WINDOW_SEC, nextMrPage, pageOutOfOrder, positionAfter, shrinkWidth, tieShrank, type CommitScan, type MrCursor, type MrPageRequest } from "./git-sync-cursors"

/**
 * The two cursor-driven listings of a sync. Neither throws: a failed request
 * ends the listing with `error` set and the cursor at the last completed step,
 * so what was read before the failure is kept and the next sync continues
 * from there (never past anything unread).
 */
const log = logger.child({ module: "git-sync" })

/** Re-read this much before the merge request cursor (one page): an MR saved in a slow transaction becomes visible late. */
export const MR_OVERLAP_MS = 5 * 60_000
/** Merge request pages per sync after the overlap page (100 each); a larger backlog continues next sync. */
export const MAX_MR_REQUESTS = 5
/** The commit cursor stays this far behind GitLab's clock: the newest minutes are re-read every sync (push latency). */
export const COMMIT_LAG_MS = 10 * 60_000
/** Commit listings per sync (each up to 3 pages) for the forward pass and for the look-back pass. */
export const MAX_COMMIT_LISTINGS = 4
export const MAX_LOOKBACK_LISTINGS = 3
/** Consecutive skipped windows after which a skip is logged as an error, not a warning. */
export const SKIP_ESCALATE_AT = 3

export interface MrListing {
  items: GitLabMergeRequest[]
  cursor: MrCursor
  /** Latest GitLab clock seen (response Date header). */
  serverTime: Date | null
  /** Every MR up to now was read (false = budget used up or failed; the cursor shows how far). */
  complete: boolean
  requests: number
  error?: unknown
}

/**
 * Merge requests changed since `start`: one overlap page from MR_OVERLAP_MS
 * before the cursor, then pages anchored at the cursor's updated_at (keyset by
 * filter: an MR changed during the read moves behind the anchor instead of
 * shifting the page boundary) until GitLab has no more or the budget is used.
 * The anchored pages replace the cursor (so a tie that shrank also lowers its
 * count); a tie that shrank under a large-tie offset, or a page out of order,
 * restarts the tie from offset 0 instead of moving the cursor.
 */
export async function readMergeRequests(client: GitLabClient, externalId: number, repositoryId: string, start: MrCursor): Promise<MrListing> {
  const byIid = new Map<number, GitLabMergeRequest>()
  let cursor = start
  let serverTime: Date | null = null
  let requests = 0
  let req: MrPageRequest = { updatedAfter: new Date(start.at.getTime() - MR_OVERLAP_MS), page: 1, perPage: 100, offset: 0 }
  let anchored = false
  let warnedOrder = false
  try {
    while (requests <= MAX_MR_REQUESTS) {
      const r = await client.listMergeRequestPage(externalId, { updatedAfter: req.updatedAfter, page: req.page, perPage: req.perPage })
      requests++
      if (r.serverTime && (!serverTime || r.serverTime > serverTime)) serverTime = r.serverTime
      for (const mr of r.items) byIid.set(mr.iid, mr)
      let restarted = false
      if (pageOutOfOrder(req, r.items)) {
        // GitLab did not keep the order this paging relies on: never move the cursor by such a page.
        if (!warnedOrder) log.warn("git sync merge request order unexpected", { repositoryId, updatedAfter: req.updatedAfter.toISOString(), page: req.page, perPage: req.perPage })
        warnedOrder = true
        if (anchored) {
          cursor = { at: cursor.at, seen: 0 }
          restarted = true
        }
      } else if (anchored && tieShrank(cursor, req, r.items)) {
        log.info("git sync merge request tie changed", { repositoryId, cursorAt: cursor.at.toISOString(), seen: cursor.seen, offset: req.offset })
        cursor = { at: cursor.at, seen: 0 }
        restarted = true
      } else {
        const reached = positionAfter(req, r.items)
        if (reached) cursor = anchored ? reached : laterMr(cursor, reached)
      }
      if (!r.hasMore && !restarted) return { items: [...byIid.values()], cursor, serverTime, complete: true, requests }
      req = nextMrPage(cursor)
      anchored = true
    }
  } catch (error) {
    return { items: [...byIid.values()], cursor, serverTime, complete: false, requests, error }
  }
  // A backlog, not a stall: the cursor moved and the next sync continues from it.
  const moved = cursor.at.getTime() !== start.at.getTime() || cursor.seen !== start.seen
  if (moved) log.info("git sync backlog", { repositoryId, kind: "mr", cursorAt: cursor.at.toISOString(), seen: cursor.seen, requests })
  else log.error("git sync stalled", { repositoryId, kind: "mr", cursorAt: cursor.at.toISOString(), seen: cursor.seen, requests })
  return { items: [...byIid.values()], cursor, serverTime, complete: false, requests }
}

export type CommitPass = "commit" | "commit-lookback"

export interface CommitScanResult {
  items: GitLabCommit[]
  scan: CommitScan
  /** Consecutive windows skipped (carried across syncs; reset by a window read completely). */
  skips: number
  /** Windows skipped by this scan. */
  skipped: number
  /** The scan reached `until`. */
  done: boolean
  listings: number
  error?: unknown
}

export interface CommitScanInput {
  repositoryId: string
  pass: CommitPass
  scan: CommitScan
  skips: number
  /** The cursor never passes this. */
  until: Date
  /** No window reaches beyond this (GitLab's clock). */
  readTo: Date
  budget: number
}

/**
 * Commit windows from `scan.at` up to `until`. A window [at, at + width]
 * (capped at `readTo`) read completely moves the cursor to its end and doubles
 * the width; a cut-off one is retried at a quarter of the width; one still cut
 * off at MIN_WINDOW_SEC is skipped (what it returned is kept) so the scan can
 * never stall. Every listing therefore moves the cursor or narrows the window,
 * and the width is persisted, so a scan stopped by the budget resumes exactly
 * where it stopped.
 */
export async function scanCommits(client: GitLabClient, externalId: number, input: CommitScanInput): Promise<CommitScanResult> {
  const byId = new Map<string, GitLabCommit>()
  let { at, widthSec } = input.scan
  let skips = input.skips
  let skipped = 0
  let listings = 0
  const result = (done: boolean, error?: unknown): CommitScanResult => ({ items: [...byId.values()], scan: { at, widthSec }, skips, skipped, done, listings, ...(error !== undefined ? { error } : {}) })
  try {
    while (at.getTime() < input.until.getTime()) {
      if (listings >= input.budget) return result(false)
      const end = new Date(Math.min(at.getTime() + widthSec * 1000, input.readTo.getTime()))
      const r = await client.listCommits(externalId, at, end)
      listings++
      // Keep what a cut-off read returned too (writes are idempotent).
      for (const c of r.items) byId.set(c.id, c)
      if (r.truncated && widthSec > MIN_WINDOW_SEC) {
        widthSec = shrinkWidth(widthSec)
        continue
      }
      if (r.truncated) {
        skips++
        skipped++
        logSkip(input, at, end, skips, r.pages)
      } else {
        skips = 0
        widthSec = growWidth(widthSec)
      }
      at = new Date(Math.min(end.getTime(), input.until.getTime()))
    }
  } catch (error) {
    return result(false, error)
  }
  return result(true)
}

/**
 * A skipped window is a warning; from SKIP_ESCALATE_AT skips in a row (across
 * syncs) of the forward pass it is an error: no longer a one-off rebase but a
 * repository committing faster than one listing can read.
 */
function logSkip(input: CommitScanInput, start: Date, end: Date, consecutive: number, pages: number): void {
  const fields = { repositoryId: input.repositoryId, kind: input.pass, windowStart: start.toISOString(), windowEnd: end.toISOString(), pages, consecutive }
  if (input.pass === "commit" && consecutive >= SKIP_ESCALATE_AT) log.error("git sync commit window skipped repeatedly", fields)
  else log.warn("git sync commit window skipped", fields)
}
