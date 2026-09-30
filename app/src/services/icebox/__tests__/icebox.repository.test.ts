import { describe, expect, it } from "vitest"
import { fakeDb } from "@/services/__tests__/fake-db"
import { LIST_LIMITS } from "@/services/_shared/limits"
import * as repo from "../icebox.repository"

describe("icebox.repository", () => {
  it("findIceboxItems is project-scoped and bounded", async () => {
    const db = fakeDb()
    await repo.findIceboxItems(db.client, "p1")
    expect(db.fn("iceboxItem.findMany")).toHaveBeenCalledWith({
      where: { projectId: "p1", deletedAt: null },
      include: { attachments: true },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
      take: LIST_LIMITS.iceboxItems,
    })
  })

  it("nextIceboxDisplayId = max + 1 (1 when empty)", async () => {
    const db = fakeDb({ "iceboxItem.aggregate": { _max: { displayId: 41 } } })
    await expect(repo.nextIceboxDisplayId(db.client, "p1")).resolves.toBe(42)
    expect(db.fn("iceboxItem.aggregate")).toHaveBeenCalledWith({ where: { projectId: "p1" }, _max: { displayId: true } })
    const empty = fakeDb({ "iceboxItem.aggregate": { _max: { displayId: null } } })
    await expect(repo.nextIceboxDisplayId(empty.client, "p1")).resolves.toBe(1)
  })

  it("item writes are project-scoped (update / id lookup skip the trash)", async () => {
    const db = fakeDb()
    const data = { projectId: "p1", request: "r" } as never
    await repo.insertIceboxItem(db.client, data)
    await repo.updateIceboxItem(db.client, "p1", "i1", { request: "x" })
    await repo.deleteIceboxItem(db.client, "p1", "i1")
    await repo.findIceboxItemId(db.client, "p1", "i1")
    expect(db.fn("iceboxItem.create")).toHaveBeenCalledWith({ data, include: { attachments: true } })
    expect(db.fn("iceboxItem.update")).toHaveBeenCalledWith({
      where: { id: "i1", projectId: "p1", deletedAt: null },
      data: { request: "x" },
      include: { attachments: true },
    })
    expect(db.fn("iceboxItem.delete")).toHaveBeenCalledWith({ where: { id: "i1", projectId: "p1" } })
    expect(db.fn("iceboxItem.findFirst")).toHaveBeenCalledWith({
      where: { id: "i1", projectId: "p1", deletedAt: null },
      select: { id: true },
    })
  })

  it("attachment lookups go through item -> project", async () => {
    const db = fakeDb()
    await repo.findAttachmentFileNames(db.client, "i1")
    await repo.findIceboxAttachment(db.client, "p1", "i1", "a1")
    await repo.deleteIceboxAttachment(db.client, "a1")
    const data = { iceboxItemId: "i1", fileName: "f", originalName: "o", fileSize: 1, mimeType: "image/png" }
    await repo.insertIceboxAttachment(db.client, data)
    expect(db.fn("iceboxAttachment.findMany")).toHaveBeenCalledWith({ where: { iceboxItemId: "i1" }, select: { fileName: true } })
    expect(db.fn("iceboxAttachment.findFirst")).toHaveBeenCalledWith({
      where: { id: "a1", iceboxItemId: "i1", iceboxItem: { projectId: "p1", deletedAt: null } },
    })
    expect(db.fn("iceboxAttachment.delete")).toHaveBeenCalledWith({ where: { id: "a1" } })
    expect(db.fn("iceboxAttachment.create")).toHaveBeenCalledWith({ data })
  })
})

describe("icebox.repository trash", () => {
  it("softDeleteIceboxItem stamps a live row of the project only", async () => {
    const db = fakeDb({ "iceboxItem.updateMany": { count: 1 } })
    const now = new Date("2026-10-01T00:00:00Z")
    await expect(repo.softDeleteIceboxItem(db.client, "p1", "i1", "u1", now)).resolves.toBe(true)
    expect(db.fn("iceboxItem.updateMany")).toHaveBeenCalledWith({
      where: { id: "i1", projectId: "p1", deletedAt: null },
      data: { deletedAt: now, deletedById: "u1" },
    })
    const none = fakeDb({ "iceboxItem.updateMany": { count: 0 } })
    await expect(repo.softDeleteIceboxItem(none.client, "p1", "i1", "u1")).resolves.toBe(false)
  })

  it("restoreIceboxItemRow clears the columns of a trashed row only", async () => {
    const db = fakeDb({ "iceboxItem.updateMany": { count: 1 } })
    await expect(repo.restoreIceboxItemRow(db.client, "p1", "i1")).resolves.toBe(true)
    expect(db.fn("iceboxItem.updateMany")).toHaveBeenCalledWith({
      where: { id: "i1", projectId: "p1", deletedAt: { not: null } },
      data: { deletedAt: null, deletedById: null },
    })
  })

  it("trash lookups only see trashed rows, newest first", async () => {
    const db = fakeDb({ "iceboxItem.findMany": [] })
    await repo.findTrashedIceboxItem(db.client, "p1", "i1")
    await repo.findTrashedIceboxItems(db.client, "p1")
    expect(db.fn("iceboxItem.findFirst").mock.calls[0][0].where).toEqual({ id: "i1", projectId: "p1", deletedAt: { not: null } })
    const list = db.fn("iceboxItem.findMany").mock.calls[0][0]
    expect(list.where).toEqual({ projectId: "p1", deletedAt: { not: null } })
    expect(list.orderBy).toEqual({ deletedAt: "desc" })
  })

  it("findExpiredTrashedIceboxItems selects rows trashed before the cutoff", async () => {
    const db = fakeDb({ "iceboxItem.findMany": [] })
    const cutoff = new Date("2026-09-01T00:00:00Z")
    await repo.findExpiredTrashedIceboxItems(db.client, cutoff, 10)
    expect(db.fn("iceboxItem.findMany")).toHaveBeenCalledWith({
      where: { deletedAt: { lt: cutoff } },
      select: { id: true, projectId: true },
      orderBy: { deletedAt: "asc" },
      take: 10,
    })
  })

  it("nextIceboxDisplayId counts trashed rows (displayId never reused)", async () => {
    const db = fakeDb({ "iceboxItem.aggregate": { _max: { displayId: 3 } } })
    await repo.nextIceboxDisplayId(db.client, "p1")
    expect(db.fn("iceboxItem.aggregate").mock.calls[0][0].where).toEqual({ projectId: "p1" })
  })
})
