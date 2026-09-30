import { describe, expect, it } from "vitest"
import { fakeDb } from "@/services/__tests__/fake-db"
import { encodeCursor } from "@/services/_shared/cursor"
import * as repo from "../comments.repository"

const AT = new Date("2026-10-01T09:00:00.000Z")

describe("comments.repository", () => {
  it("findComments: project + entity scoped, oldest first, cursor ascending, limit + 1", async () => {
    const db = fakeDb({ "comment.findMany": [] })
    const cursor = encodeCursor({ createdAt: AT, id: "c1" })
    await repo.findComments(db.client, "p1", "pbi", "b1", { cursor, limit: 20 })
    expect(db.fn("comment.findMany")).toHaveBeenCalledWith({
      where: {
        projectId: "p1",
        entityType: "pbi",
        entityId: "b1",
        OR: [{ createdAt: { gt: AT } }, { createdAt: AT, id: { gt: "c1" } }],
      },
      select: repo.COMMENT_SELECT,
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      take: 21,
    })
  })

  it("findComment is scoped to the project", async () => {
    const db = fakeDb()
    await repo.findComment(db.client, "p1", "c1")
    expect(db.fn("comment.findFirst")).toHaveBeenCalledWith({ where: { id: "c1", projectId: "p1" }, select: repo.COMMENT_SELECT })
  })

  it("countComments groups live comments by entity", async () => {
    const db = fakeDb({ "comment.groupBy": [{ entityId: "a", _count: { _all: 2 } }] })
    const counts = await repo.countComments(db.client, "p1", "sprint_task", ["a", "b"])
    expect(counts).toEqual(new Map([["a", 2]]))
    expect(db.fn("comment.groupBy")).toHaveBeenCalledWith({
      by: ["entityId"],
      where: { projectId: "p1", entityType: "sprint_task", entityId: { in: ["a", "b"] }, deletedAt: null },
      _count: { _all: true },
    })
  })

  it("create / update / soft delete", async () => {
    const db = fakeDb()
    const data = { projectId: "p1", entityType: "pbi" as const, entityId: "b1", authorId: "u1", body: "x" }
    await repo.createComment(db.client, data)
    expect(db.fn("comment.create")).toHaveBeenCalledWith({ data, select: { id: true } })
    await repo.updateCommentBody(db.client, "c1", "y", AT)
    expect(db.fn("comment.update")).toHaveBeenCalledWith({ where: { id: "c1" }, data: { body: "y", editedAt: AT }, select: { id: true } })
    await repo.softDeleteComment(db.client, "c1", AT)
    expect(db.fn("comment.update")).toHaveBeenLastCalledWith({ where: { id: "c1" }, data: { deletedAt: AT }, select: { id: true } })
  })

  it("replaceMentions deletes then inserts (nothing inserted for none)", async () => {
    const db = fakeDb()
    await repo.replaceMentions(db.client, "c1", ["u1", "u2"])
    expect(db.fn("commentMention.deleteMany")).toHaveBeenCalledWith({ where: { commentId: "c1" } })
    expect(db.fn("commentMention.createMany")).toHaveBeenCalledWith({
      data: [{ commentId: "c1", userId: "u1" }, { commentId: "c1", userId: "u2" }],
      skipDuplicates: true,
    })
    const empty = fakeDb()
    await repo.replaceMentions(empty.client, "c1", [])
    expect(empty.fn("commentMention.createMany")).not.toHaveBeenCalled()
  })

  it("findMentionCandidates maps members to { id, name }", async () => {
    const db = fakeDb({ "projectMember.findMany": [{ userId: "u1", user: { name: "Alice" } }] })
    expect(await repo.findMentionCandidates(db.client, "p1")).toEqual([{ id: "u1", name: "Alice" }])
    expect(db.fn("projectMember.findMany")).toHaveBeenCalledWith(expect.objectContaining({ where: { projectId: "p1" } }))
  })

  it("targets are live and project scoped", async () => {
    const db = fakeDb()
    await repo.findPbiTarget(db.client, "p1", "b1")
    expect(db.fn("productBacklogItem.findFirst")).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "b1", projectId: "p1", deletedAt: null } }),
    )
    await repo.findSprintTaskTarget(db.client, "p1", "t1")
    expect(db.fn("sprintBacklogItem.findFirst")).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "t1", sprint: { projectId: "p1" }, pbItem: { deletedAt: null } } }),
    )
    await repo.findIceboxTarget(db.client, "p1", "i1")
    expect(db.fn("iceboxItem.findFirst")).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "i1", projectId: "p1", deletedAt: null } }),
    )
  })
})
