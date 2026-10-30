/**
 * Per-kind sync positions of one repository (pure; persisted on git_repository).
 *
 * Each listing has its own cursor so a slow or stuck one never holds back the
 * other (one shared watermark did — review of 30d63ab, HIGH-2):
 *
 * - merge requests: GitLab's own updated_at of the last MR read plus a
 *   tie-breaker (how many MRs with exactly that updated_at were read), so a
 *   backlog changed in the same instant still advances, and Kanflow's clock
 *   never enters the cursor;
 * - commits: start and width of the next time window, carried over between
 *   syncs, so a busy range is narrowed down across ticks instead of being
 *   re-read from scratch;
 * - look-back: a second commit pass over recent days (late pushes) or the last
 *   90 days (過去分を再同期), with its own position.
 *
 * `SyncCursors` is plain data on purpose: K4 (DevSource) can serialise it into
 * one opaque cursor string without changing the sync logic.
 */

export const DAY_MS = 86_400_000
/** First sync looks this far back. */
export const FIRST_SYNC_DAYS = 30
/** 過去分を再同期 re-reads this far back. */
export const RESYNC_DAYS = 90
/** Commit windows: start width, bounds. */
export const INITIAL_WINDOW_SEC = 86_400
export const MIN_WINDOW_SEC = 60
export const MAX_WINDOW_SEC = 7 * 86_400
/** GitLab's maximum page size. */
export const PER_PAGE = 100
/** In tie mode, re-read this many already-read MRs (an MR leaving the tie shifts the offsets by one). */
export const TIE_BACKOFF = 5

/** Every MR updated before `at` was read, plus the first `seen` (in GitLab's order) updated exactly at `at`. */
export interface MrCursor {
  at: Date
  seen: number
}

/** The next commit window starts at `at` and is `widthSec` wide. */
export interface CommitScan {
  at: Date
  widthSec: number
}

export interface SyncCursors {
  mr: MrCursor
  /** `skips`: consecutive windows skipped because even the smallest window was cut off. */
  commit: CommitScan & { skips: number }
  /** `scan`: a pass in progress (null = none); `startedAt`: when the last pass started. */
  lookback: { scan: CommitScan | null; startedAt: Date | null }
}

/** The git_repository columns that hold the cursors. */
export interface CursorColumns {
  syncCursor: Date | null
  mrCursorAt: Date | null
  mrCursorSeen: number | null
  commitCursorAt: Date | null
  commitWindowSec: number | null
  commitSkips: number | null
  lookbackCursorAt: Date | null
  lookbackWindowSec: number | null
  lookbackAt: Date | null
}

export const clampWidth = (sec: number | null | undefined): number =>
  Number.isFinite(sec) && (sec as number) > 0 ? Math.min(MAX_WINDOW_SEC, Math.max(MIN_WINDOW_SEC, Math.floor(sec as number))) : INITIAL_WINDOW_SEC

/** A cut-off window is retried at a quarter of its width (1 day → 60 s in 6 steps). */
export const shrinkWidth = (sec: number): number => Math.max(MIN_WINDOW_SEC, Math.floor(sec / 4))
/** A window read completely lets the next one be twice as wide. */
export const growWidth = (sec: number): number => Math.min(MAX_WINDOW_SEC, sec * 2)

const daysBefore = (now: Date, days: number) => new Date(now.getTime() - days * DAY_MS)

/**
 * Cursors of a repository row. A row the new code has not written yet falls back to
 * the old shared watermark (`syncCursor`), and a never-synced one to 30 days back.
 */
export function cursorsFromRow(row: Partial<CursorColumns>, now: Date): SyncCursors {
  const legacy = row.syncCursor ?? null
  const first = daysBefore(now, FIRST_SYNC_DAYS)
  return {
    mr: row.mrCursorAt ? { at: row.mrCursorAt, seen: Math.max(0, row.mrCursorSeen ?? 0) } : { at: legacy ?? first, seen: 0 },
    commit: { at: row.commitCursorAt ?? legacy ?? first, widthSec: clampWidth(row.commitWindowSec), skips: Math.max(0, row.commitSkips ?? 0) },
    lookback: {
      scan: row.lookbackCursorAt ? { at: row.lookbackCursorAt, widthSec: clampWidth(row.lookbackWindowSec) } : null,
      startedAt: row.lookbackAt ?? null,
    },
  }
}

/** Columns to store. `syncCursor` (deprecated) gets the earlier cursor so a rollback re-reads rather than skips. */
export function cursorsToRow(c: SyncCursors): CursorColumns {
  return {
    syncCursor: c.mr.at.getTime() <= c.commit.at.getTime() ? c.mr.at : c.commit.at,
    mrCursorAt: c.mr.at,
    mrCursorSeen: c.mr.seen,
    commitCursorAt: c.commit.at,
    commitWindowSec: c.commit.widthSec,
    commitSkips: c.commit.skips,
    lookbackCursorAt: c.lookback.scan?.at ?? null,
    lookbackWindowSec: c.lookback.scan?.widthSec ?? null,
    lookbackAt: c.lookback.startedAt,
  }
}

/**
 * 過去分を再同期: merge requests are listed again from 90 days back (the cursor
 * restarts there), and the commits of those 90 days are re-read by a look-back
 * pass, so new commits keep arriving meanwhile. Writes are idempotent, so
 * re-reading what is already linked costs only the requests.
 */
export function resetForResync(c: SyncCursors, now: Date): SyncCursors {
  const from = daysBefore(now, RESYNC_DAYS)
  return {
    mr: { at: from, seen: 0 },
    commit: { ...c.commit, skips: 0 },
    lookback: { scan: { at: from, widthSec: INITIAL_WINDOW_SEC }, startedAt: now },
  }
}

const compareMr = (a: MrCursor, b: MrCursor) => a.at.getTime() - b.at.getTime() || a.seen - b.seen
export const laterMr = (a: MrCursor, b: MrCursor): MrCursor => (compareMr(b, a) > 0 ? b : a)

/** One merge request page to ask for: `updated_after`, page number, page size; `offset` = items before the page. */
export interface MrPageRequest {
  updatedAfter: Date
  page: number
  perPage: number
  offset: number
}

/**
 * The page that continues after `cursor`: anchored at its updated_at (keyset by
 * filter, so changes to earlier MRs cannot shift it), skipping the `seen` MRs
 * of the tie with page arithmetic. When the tie is large, the page size is
 * chosen so the page starts TIE_BACKOFF items before the unread ones (an MR
 * that left the tie meanwhile shifts the rest by one) while still bringing as
 * many unread MRs as possible; always at least one.
 */
export function nextMrPage(cursor: MrCursor): MrPageRequest {
  const seen = Math.max(0, Math.floor(cursor.seen))
  const from = Math.max(0, seen - TIE_BACKOFF)
  let best = { perPage: PER_PAGE, start: Math.floor(seen / PER_PAGE) * PER_PAGE }
  let bestGain = best.start + PER_PAGE - seen
  let backedOff = best.start <= from
  for (let perPage = PER_PAGE; perPage >= 10; perPage--) {
    const start = Math.floor(from / perPage) * perPage
    const gain = start + perPage - seen
    // Prefer pages that keep the safety overlap; among them the one bringing the most unread MRs.
    if (gain > 0 && (!backedOff || gain > bestGain)) {
      best = { perPage, start }
      bestGain = gain
      backedOff = true
    }
  }
  return { updatedAfter: cursor.at, page: best.start / best.perPage + 1, perPage: best.perPage, offset: best.start }
}

const updatedMs = (mr: { updated_at: string }) => new Date(mr.updated_at).getTime()

/**
 * How far one page (ascending updated_at) carries the cursor, or null when it
 * proves nothing (empty, or an unparsable date). If the whole page has the
 * anchor's updated_at, the tie count grows; otherwise the cursor moves to the
 * last updated_at and counts the MRs with it at the page's end (the tie starts
 * inside this page: everything before the page has the anchor's updated_at).
 */
export function positionAfter(req: Pick<MrPageRequest, "updatedAfter" | "offset">, items: ReadonlyArray<{ updated_at: string }>): MrCursor | null {
  const last = items.at(-1)
  if (!last) return null
  const lastMs = updatedMs(last)
  if (Number.isNaN(lastMs)) return null
  if (lastMs <= req.updatedAfter.getTime()) return { at: req.updatedAfter, seen: req.offset + items.length }
  let tail = 0
  for (let i = items.length - 1; i >= 0 && updatedMs(items[i]) === lastMs; i--) tail++
  return { at: new Date(lastMs), seen: tail }
}
