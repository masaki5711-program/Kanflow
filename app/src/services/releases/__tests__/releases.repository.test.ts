import { describe, expect, it } from "vitest"
import { fakeDb } from "@/services/__tests__/fake-db"
import { LIST_LIMITS } from "@/services/_shared/limits"
import * as repo from "../releases.repository"

describe("releases.repository", () => {
  it("findReleaseItems is project-scoped and bounded", async () => {
    const db = fakeDb()
    await repo.findReleaseItems(db.client, "p1")
    const arg = db.fn("releaseBacklogItem.findMany").mock.calls[0][0]
    expect(arg.where).toEqual({ projectId: "p1" })
    expect(arg.take).toBe(LIST_LIMITS.releaseItems)
    expect(arg.orderBy).toEqual([{ planVersion: "asc" }, { createdAt: "asc" }])
    expect(arg.include.pbItem.select.id).toBe(true)
    expect(arg.include.pbItem.select.deletedAt).toBe(true)
  })

  it("update / delete require the projectId", async () => {
    const db = fakeDb()
    await repo.updateReleaseItem(db.client, "p1", "r1", { status: "ready" })
    await repo.deleteReleaseItem(db.client, "p1", "r1")
    expect(db.fn("releaseBacklogItem.update")).toHaveBeenCalledWith({ where: { id: "r1", projectId: "p1" }, data: { status: "ready" } })
    expect(db.fn("releaseBacklogItem.delete")).toHaveBeenCalledWith({ where: { id: "r1", projectId: "p1" } })
  })

  it("findPbisForRelease only reads PBIs of the project", async () => {
    const db = fakeDb()
    await repo.findPbisForRelease(db.client, "p1", ["b1", "b2"])
    expect(db.fn("productBacklogItem.findMany")).toHaveBeenCalledWith({
      where: { id: { in: ["b1", "b2"] }, projectId: "p1", deletedAt: null },
      select: { id: true, initiative: true, epic: true, userStory: true, assignedPo: true, poNote: true },
    })
  })

  it("insertReleaseItem passes data through", async () => {
    const db = fakeDb()
    const data = { projectId: "p1", pbItemId: "b1" } as never
    await repo.insertReleaseItem(db.client, data)
    expect(db.fn("releaseBacklogItem.create")).toHaveBeenCalledWith({ data })
  })
})
