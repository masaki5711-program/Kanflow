import { describe, expect, it } from "vitest"
import { fakeDb } from "@/services/__tests__/fake-db"
import * as repo from "../attachments.repository"

describe("attachments.repository", () => {
  it("findFolderInProject / findAttachment never match another project's rows", async () => {
    const db = fakeDb()
    await repo.findFolderInProject(db.client, "p1", "f1")
    await repo.findAttachment(db.client, "p1", "a1")
    expect(db.fn("attachmentFolder.findFirst")).toHaveBeenCalledWith({ where: { id: "f1", projectId: "p1" }, select: { id: true } })
    expect(db.fn("projectAttachment.findFirst")).toHaveBeenCalledWith({ where: { id: "a1", projectId: "p1" } })
  })

  it("insertAttachment passes data through", async () => {
    const db = fakeDb()
    const data = {
      projectId: "p1",
      folderId: null,
      fileName: "x.pdf",
      originalName: "X.pdf",
      fileSize: 1,
      mimeType: "application/pdf",
      uploadedBy: "u1",
    }
    await repo.insertAttachment(db.client, data)
    expect(db.fn("projectAttachment.create")).toHaveBeenCalledWith({ data })
  })

  it("updateAttachment is project-scoped; deleteAttachment by id", async () => {
    const db = fakeDb()
    await repo.updateAttachment(db.client, "p1", "a1", { folderId: null, sortOrder: 2 })
    await repo.deleteAttachment(db.client, "a1")
    expect(db.fn("projectAttachment.update")).toHaveBeenCalledWith({
      where: { id: "a1", projectId: "p1" },
      data: { folderId: null, sortOrder: 2 },
    })
    expect(db.fn("projectAttachment.delete")).toHaveBeenCalledWith({ where: { id: "a1" } })
  })

  it("nextFolderSortOrder aggregates within project and parent", async () => {
    const db = fakeDb({ "attachmentFolder.aggregate": { _max: { sortOrder: 4 } } })
    await expect(repo.nextFolderSortOrder(db.client, "p1", null)).resolves.toBe(5)
    expect(db.fn("attachmentFolder.aggregate")).toHaveBeenCalledWith({
      where: { projectId: "p1", parentId: null },
      _max: { sortOrder: true },
    })
  })

  it("nextFolderSortOrder starts at 1", async () => {
    const db = fakeDb({ "attachmentFolder.aggregate": { _max: { sortOrder: null } } })
    await expect(repo.nextFolderSortOrder(db.client, "p1", "f0")).resolves.toBe(1)
  })

  it("folder writes are project-scoped", async () => {
    const db = fakeDb()
    await repo.insertFolder(db.client, { projectId: "p1", name: "n", parentId: null, sortOrder: 1 })
    await repo.findFolderTree(db.client, "p1")
    await repo.updateFolder(db.client, "p1", "f1", { name: "m" })
    await repo.detachFolderAttachments(db.client, "p1", "f1")
    await repo.deleteFolder(db.client, "p1", "f1")
    expect(db.fn("attachmentFolder.create")).toHaveBeenCalledWith({
      data: { projectId: "p1", name: "n", parentId: null, sortOrder: 1 },
      include: { attachments: true },
    })
    expect(db.fn("attachmentFolder.findMany")).toHaveBeenCalledWith({ where: { projectId: "p1" }, select: { id: true, parentId: true } })
    expect(db.fn("attachmentFolder.update")).toHaveBeenCalledWith({ where: { id: "f1", projectId: "p1" }, data: { name: "m" } })
    expect(db.fn("projectAttachment.updateMany")).toHaveBeenCalledWith({
      where: { folderId: "f1", projectId: "p1" },
      data: { folderId: null },
    })
    expect(db.fn("attachmentFolder.delete")).toHaveBeenCalledWith({ where: { id: "f1", projectId: "p1" } })
  })
})
