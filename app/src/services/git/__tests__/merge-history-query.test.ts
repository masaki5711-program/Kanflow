import { describe, expect, it, vi } from "vitest"

// No database here: the query against real PostgreSQL is merge-history.db.test.ts.
vi.mock("@/lib/prisma", () => ({ prisma: {} }))
vi.mock("../git.service", () => ({ isGitEnabled: vi.fn() }))

const { MERGE_HISTORY_LIMIT_DEFAULT, MERGE_HISTORY_LIMIT_MAX, decodeMergeHistoryCursor, encodeMergeHistoryCursor, mergeHistoryQuerySchema } = await import(
  "../merge-history.service"
)

const encode = (value: unknown) => Buffer.from(JSON.stringify(value), "utf8").toString("base64url")

describe("mergeHistoryQuerySchema", () => {
  it("defaults to the first page of everything", () => {
    expect(mergeHistoryQuerySchema.parse({})).toEqual({ limit: MERGE_HISTORY_LIMIT_DEFAULT })
  })

  it("reads the limit from the query string and bounds it", () => {
    expect(mergeHistoryQuerySchema.parse({ limit: "20" }).limit).toBe(20)
    expect(mergeHistoryQuerySchema.parse({ limit: String(MERGE_HISTORY_LIMIT_MAX) }).limit).toBe(MERGE_HISTORY_LIMIT_MAX)
    for (const limit of ["0", "-1", String(MERGE_HISTORY_LIMIT_MAX + 1), "2.5", "many"]) {
      expect(mergeHistoryQuerySchema.safeParse({ limit }).success, limit).toBe(false)
    }
  })

  it("takes instants with a zone only", () => {
    expect(mergeHistoryQuerySchema.safeParse({ from: "2026-11-01T00:00:00.000Z", to: "2026-11-10T09:00:00+09:00" }).success).toBe(true)
    for (const from of ["2026-11-01", "2026-11-01T00:00:00", "yesterday", ""]) {
      expect(mergeHistoryQuerySchema.safeParse({ from }).success, from).toBe(false)
      expect(mergeHistoryQuerySchema.safeParse({ to: from }).success, from).toBe(false)
    }
  })

  it("bounds the repository id and the cursor", () => {
    expect(mergeHistoryQuerySchema.safeParse({ repositoryId: "" }).success).toBe(false)
    expect(mergeHistoryQuerySchema.safeParse({ repositoryId: "r".repeat(65) }).success).toBe(false)
    expect(mergeHistoryQuerySchema.safeParse({ cursor: "" }).success).toBe(false)
    expect(mergeHistoryQuerySchema.safeParse({ cursor: "c".repeat(1025) }).success).toBe(false)
    expect(mergeHistoryQuerySchema.safeParse({ repositoryId: "r1", cursor: "c" }).success).toBe(true)
  })
})

describe("merge history cursor", () => {
  it("round-trips a position", () => {
    const position = { t: new Date("2026-11-09T01:02:03.456Z"), r: "repo-1", f: "42" }
    const cursor = encodeMergeHistoryCursor(position)
    expect(cursor).toMatch(/^[A-Za-z0-9_-]+$/)
    expect(decodeMergeHistoryCursor(cursor)).toEqual(position)
  })

  it("rejects what it did not issue with a 400", () => {
    const bad = [
      "not-a-cursor",
      "",
      encode("text"),
      encode(null),
      encode({ t: "2026-11-09T01:02:03.456Z", r: "repo-1" }),
      encode({ t: "yesterday", r: "repo-1", f: "42" }),
      encode({ t: "2026-11-09T01:02:03.456Z", r: "", f: "42" }),
      encode({ t: "2026-11-09T01:02:03.456Z", r: "r".repeat(65), f: "42" }),
      encode({ t: "2026-11-09T01:02:03.456Z", r: "repo-1", f: 42 }),
    ]
    for (const cursor of bad) {
      expect(() => decodeMergeHistoryCursor(cursor), cursor).toThrowError(expect.objectContaining({ status: 400, code: "VALIDATION" }))
    }
  })
})
