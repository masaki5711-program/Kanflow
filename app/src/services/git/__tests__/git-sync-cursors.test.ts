import { describe, expect, it } from "vitest"
import {
  clampWidth,
  cursorsFromRow,
  cursorsToRow,
  growWidth,
  INITIAL_WINDOW_SEC,
  MAX_WINDOW_SEC,
  MIN_WINDOW_SEC,
  nextMrPage,
  pageOutOfOrder,
  positionAfter,
  resetForResync,
  shrinkWidth,
  TIE_BACKOFF,
  tieShrank,
} from "../git-sync-cursors"

const NOW = new Date("2026-10-01T00:00:00.000Z")
const DAY = 86_400_000
const at = (iso: string) => ({ updated_at: iso })

describe("cursorsFromRow / cursorsToRow", () => {
  it("a never-synced repository starts 30 days back with the initial window and no look-back", () => {
    const c = cursorsFromRow({}, NOW)
    const first = new Date(NOW.getTime() - 30 * DAY)
    expect(c).toEqual({ mr: { at: first, seen: 0 }, commit: { at: first, widthSec: INITIAL_WINDOW_SEC, skips: 0 }, lookback: { scan: null, startedAt: null } })
  })

  it("falls back to the old shared syncCursor for both kinds until the new columns are written", () => {
    const legacy = new Date("2026-09-20T00:00:00.000Z")
    const c = cursorsFromRow({ syncCursor: legacy }, NOW)
    expect(c.mr).toEqual({ at: legacy, seen: 0 })
    expect(c.commit.at).toEqual(legacy)
  })

  it("round-trips through the columns, and syncCursor keeps the earlier cursor (rollback re-reads, never skips)", () => {
    const c = {
      mr: { at: new Date("2026-09-30T10:00:00.000Z"), seen: 4 },
      commit: { at: new Date("2026-09-29T00:00:00.000Z"), widthSec: 3_600, skips: 2 },
      lookback: { scan: { at: new Date("2026-09-17T00:00:00.000Z"), widthSec: 7_200 }, startedAt: new Date("2026-09-30T23:00:00.000Z") },
    }
    const row = cursorsToRow(c)
    expect(row.syncCursor).toEqual(c.commit.at)
    expect(cursorsFromRow(row, NOW)).toEqual(c)
  })

  it("clamps a stored window width into [MIN, MAX] and replaces nonsense with the initial width", () => {
    expect(clampWidth(null)).toBe(INITIAL_WINDOW_SEC)
    expect(clampWidth(0)).toBe(INITIAL_WINDOW_SEC)
    expect(clampWidth(5)).toBe(MIN_WINDOW_SEC)
    expect(clampWidth(10 * MAX_WINDOW_SEC)).toBe(MAX_WINDOW_SEC)
    expect(cursorsFromRow({ commitWindowSec: -3, mrCursorAt: NOW, mrCursorSeen: -1 }, NOW)).toMatchObject({ mr: { seen: 0 }, commit: { widthSec: INITIAL_WINDOW_SEC } })
  })

  it("window width shrinks to a quarter (not below MIN) and doubles (not above MAX)", () => {
    expect(shrinkWidth(86_400)).toBe(21_600)
    expect(shrinkWidth(100)).toBe(MIN_WINDOW_SEC)
    expect(growWidth(3_600)).toBe(7_200)
    expect(growWidth(MAX_WINDOW_SEC)).toBe(MAX_WINDOW_SEC)
  })
})

describe("resetForResync", () => {
  it("restarts merge requests 90 days back and starts a 90-day commit look-back; the forward commit cursor stays", () => {
    const before = cursorsFromRow({ mrCursorAt: NOW, mrCursorSeen: 3, commitCursorAt: NOW, commitWindowSec: 600, commitSkips: 5 }, NOW)
    const from = new Date(NOW.getTime() - 90 * DAY)
    expect(resetForResync(before, NOW)).toEqual({
      mr: { at: from, seen: 0 },
      commit: { at: NOW, widthSec: 600, skips: 0 },
      lookback: { scan: { at: from, widthSec: INITIAL_WINDOW_SEC }, startedAt: NOW },
    })
  })
})

describe("nextMrPage", () => {
  const T = new Date("2026-09-30T00:00:00.000Z")

  it("a tie smaller than a page is re-read from offset 0", () => {
    expect(nextMrPage({ at: T, seen: 0 })).toEqual({ updatedAfter: T, page: 1, perPage: 100, offset: 0 })
    expect(nextMrPage({ at: T, seen: 2 })).toEqual({ updatedAfter: T, page: 1, perPage: 100, offset: 0 })
    expect(nextMrPage({ at: T, seen: 99 })).toEqual({ updatedAfter: T, page: 1, perPage: 100, offset: 0 })
  })

  it("a large tie always re-reads at least one already-read MR (so a shrunk tie is noticed), for every count", () => {
    for (let seen = 100; seen <= 5_000; seen++) {
      const r = nextMrPage({ at: T, seen })
      expect(r.offset).toBe((r.page - 1) * r.perPage)
      expect(seen - r.offset).toBeGreaterThanOrEqual(1)
      expect(seen - r.offset).toBeLessThanOrEqual(r.perPage - 1)
    }
  })

  it("a large tie: a page that starts a few already-read MRs early and still brings mostly unread ones", () => {
    for (const seen of [100, 150, 199, 200, 345, 501, 997, 4_999]) {
      const r = nextMrPage({ at: T, seen })
      expect(r.offset).toBe((r.page - 1) * r.perPage)
      expect(r.perPage).toBeLessThanOrEqual(100)
      // Starts at most `seen` (never skips an unread one) and brings at least one unread MR.
      expect(r.offset).toBeLessThanOrEqual(seen)
      expect(r.offset + r.perPage).toBeGreaterThan(seen)
      // Keeps the safety overlap and brings at least half a page of new MRs.
      expect(seen - r.offset).toBeGreaterThanOrEqual(TIE_BACKOFF)
      expect(r.offset + r.perPage - seen).toBeGreaterThanOrEqual(50)
    }
  })
})

describe("positionAfter", () => {
  const anchor = new Date("2026-09-30T00:00:00.000Z")

  it("moves to the last updated_at and counts the MRs with it at the end of the page", () => {
    const items = [at("2026-09-30T00:00:00.000Z"), at("2026-09-30T01:00:00.000Z"), at("2026-09-30T02:00:00.000Z"), at("2026-09-30T02:00:00.000Z")]
    expect(positionAfter({ updatedAfter: anchor, offset: 0 }, items)).toEqual({ at: new Date("2026-09-30T02:00:00.000Z"), seen: 2 })
  })

  it("a page entirely at the anchor's updated_at adds to the tie count from the page's offset", () => {
    const items = Array.from({ length: 97 }, () => at(anchor.toISOString()))
    expect(positionAfter({ updatedAfter: anchor, offset: 194 }, items)).toEqual({ at: anchor, seen: 291 })
  })

  it("proves nothing for an empty page or an unparsable date", () => {
    expect(positionAfter({ updatedAfter: anchor, offset: 0 }, [])).toBeNull()
    expect(positionAfter({ updatedAfter: anchor, offset: 0 }, [at("not a date")])).toBeNull()
  })
})

describe("tieShrank / pageOutOfOrder", () => {
  const T = new Date("2026-09-30T00:00:00.000Z")
  const tie = (n: number) => Array.from({ length: n }, () => at(T.toISOString()))
  const later = (n: number) => Array.from({ length: n }, (_, i) => at(new Date(T.getTime() + (i + 1) * 1000).toISOString()))

  it("a page continuing a large tie must start with the already-read MRs it was chosen to re-read", () => {
    const cursor = { at: T, seen: 200 }
    const req = { updatedAfter: T, offset: 194 }
    expect(tieShrank(cursor, req, [...tie(10), ...later(5)])).toBe(false)
    // 120 / 100 / 20: after MRs left the tie, the page starts beyond it.
    expect(tieShrank(cursor, req, later(97))).toBe(true)
    expect(tieShrank(cursor, req, [...tie(3), ...later(5)])).toBe(true)
    expect(tieShrank(cursor, req, [])).toBe(true)
    // Offset 0 re-reads the whole tie anyway.
    expect(tieShrank({ at: T, seen: 50 }, { updatedAfter: T, offset: 0 }, later(3))).toBe(false)
  })

  it("flags a page whose updated_at decreases, lies before updated_after or cannot be parsed", () => {
    const req = { updatedAfter: T }
    expect(pageOutOfOrder(req, [...tie(2), ...later(3)])).toBe(false)
    expect(pageOutOfOrder(req, [...later(2), ...tie(1)])).toBe(true)
    expect(pageOutOfOrder(req, [at(new Date(T.getTime() - 1).toISOString())])).toBe(true)
    expect(pageOutOfOrder(req, [at("not a date")])).toBe(true)
    expect(pageOutOfOrder(req, [])).toBe(false)
  })
})
