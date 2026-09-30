import { describe, expect, it } from "vitest"
import { fakeDb } from "@/services/__tests__/fake-db"
import { ConflictError, NotFoundError } from "../errors"
import {
  LIVE_PBI,
  LIVE_PROJECT,
  NOT_DELETED,
  assertNotDeleted,
  isDeleted,
  notDeleted,
  softDeleteData,
  RESTORE_DATA,
  purgeCutoff,
  DEFAULT_PURGE_TRASH_AFTER_DAYS,
  resolvePurgeTrashAfterDays,
  assertProjectLive,
  hideTrashed,
} from "../soft-delete"

describe("soft-delete where fragments", () => {
  it("NOT_DELETED matches live rows only", () => {
    expect(NOT_DELETED).toEqual({ deletedAt: null })
  })

  it("notDeleted adds the live filter without mutating the input", () => {
    const where = { projectId: "p1", status: "ready" }
    const out = notDeleted(where)
    expect(out).toEqual({ projectId: "p1", status: "ready", deletedAt: null })
    expect(where).toEqual({ projectId: "p1", status: "ready" })
  })

  it("relation fragments filter through the parent PBI / project", () => {
    expect(LIVE_PBI).toEqual({ pbItem: { deletedAt: null } })
    expect(LIVE_PROJECT).toEqual({ project: { deletedAt: null } })
  })
})

describe("isDeleted / assertNotDeleted", () => {
  it("isDeleted is true only for rows with a deletedAt", () => {
    expect(isDeleted({ deletedAt: new Date() })).toBe(true)
    expect(isDeleted({ deletedAt: null })).toBe(false)
    expect(isDeleted(null)).toBe(false)
  })

  it("passes a live row through", () => {
    const row = { id: "x", deletedAt: null }
    expect(() => assertNotDeleted(row)).not.toThrow()
  })

  it("throws NotFoundError (with the given code) for a missing or trashed row", () => {
    expect(() => assertNotDeleted(null)).toThrow(NotFoundError)
    try {
      assertNotDeleted({ deletedAt: new Date() }, "PBI missing", "PBI_NOT_FOUND")
      expect.unreachable()
    } catch (err) {
      expect(err).toBeInstanceOf(NotFoundError)
      expect((err as NotFoundError).message).toBe("PBI missing")
      expect((err as NotFoundError).code).toBe("PBI_NOT_FOUND")
    }
  })
})

describe("mutation payloads", () => {
  it("softDeleteData stamps time and actor", () => {
    const now = new Date("2026-10-01T00:00:00Z")
    expect(softDeleteData("u1", now)).toEqual({ deletedAt: now, deletedById: "u1" })
  })

  it("RESTORE_DATA clears both columns", () => {
    expect(RESTORE_DATA).toEqual({ deletedAt: null, deletedById: null })
  })
})

describe("purge retention", () => {
  it("defaults to 30 days and accepts positive integers only", () => {
    expect(DEFAULT_PURGE_TRASH_AFTER_DAYS).toBe(30)
    expect(resolvePurgeTrashAfterDays(undefined)).toBe(30)
    expect(resolvePurgeTrashAfterDays("")).toBe(30)
    expect(resolvePurgeTrashAfterDays("7")).toBe(7)
    expect(resolvePurgeTrashAfterDays("0")).toBe(30)
    expect(resolvePurgeTrashAfterDays("-3")).toBe(30)
    expect(resolvePurgeTrashAfterDays("abc")).toBe(30)
    expect(resolvePurgeTrashAfterDays("2.5")).toBe(30)
  })

  it("purgeCutoff is `days` before now", () => {
    const now = new Date("2026-10-31T12:00:00Z")
    expect(purgeCutoff(now, 30).toISOString()).toBe("2026-10-01T12:00:00.000Z")
  })
})

describe("hideTrashed", () => {
  it("maps a trashed linked row to null and keeps live / missing ones", () => {
    expect(hideTrashed({ id: "i1", deletedAt: new Date() })).toBeNull()
    expect(hideTrashed({ id: "i1", deletedAt: null })).toEqual({ id: "i1", deletedAt: null })
    expect(hideTrashed(null)).toBeNull()
    expect(hideTrashed(undefined)).toBeNull()
  })
})

describe("assertProjectLive", () => {
  it("passes for a live project", async () => {
    const db = fakeDb({ "project.findUnique": { deletedAt: null } })
    await expect(assertProjectLive(db.client, "p1")).resolves.toBeUndefined()
    expect(db.fn("project.findUnique")).toHaveBeenCalledWith({ where: { id: "p1" }, select: { deletedAt: true } })
  })

  it("409 PROJECT_IN_TRASH for a trashed project, 404 for a missing one", async () => {
    const trashed = fakeDb({ "project.findUnique": { deletedAt: new Date() } })
    await expect(assertProjectLive(trashed.client, "p1")).rejects.toBeInstanceOf(ConflictError)
    await expect(assertProjectLive(trashed.client, "p1")).rejects.toMatchObject({ code: "PROJECT_IN_TRASH" })
    const missing = fakeDb({ "project.findUnique": null })
    await expect(assertProjectLive(missing.client, "p1")).rejects.toBeInstanceOf(NotFoundError)
  })
})
