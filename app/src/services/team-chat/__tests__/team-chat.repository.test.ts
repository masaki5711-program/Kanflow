import { describe, expect, it } from "vitest"
import { fakeDb } from "@/services/__tests__/fake-db"
import * as repo from "../team-chat.repository"

describe("concernsUser", () => {
  it("matches direct mentions, mirrored-comment mentions, or a reply from someone else to the user", () => {
    const where = repo.concernsUser("u1")
    expect(where).toEqual({
      OR: [
        { mentions: { some: { userId: "u1" } } },
        { comment: { mentions: { some: { userId: "u1" } } } },
        { replyTo: { authorId: "u1" }, authorId: { not: "u1" } },
      ],
    })
  })
})

describe("findMessages", () => {
  it("scopes to the project, visible rows only, newest first by default", async () => {
    const db = fakeDb({ "teamMessage.findMany": [] })
    await repo.findMessages(db.client, "p1", { take: 51 })
    expect(db.fn("teamMessage.findMany")).toHaveBeenCalledWith({
      where: { projectId: "p1", ...repo.VISIBLE_MESSAGE },
      include: repo.MESSAGE_INCLUDE,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 51,
    })
  })

  it("adds a createdAt lower bound (lt) when paging before a time", async () => {
    const db = fakeDb({ "teamMessage.findMany": [] })
    const before = new Date("2026-01-01T00:00:00Z")
    await repo.findMessages(db.client, "p1", { before, take: 10 })
    expect(db.fn("teamMessage.findMany")).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ createdAt: { lt: before } }) })
    )
  })

  it("polling with 'after' orders ascending and filters createdAt gte", async () => {
    const db = fakeDb({ "teamMessage.findMany": [] })
    const after = new Date("2026-01-01T00:00:00Z")
    await repo.findMessages(db.client, "p1", { after, take: 10 })
    expect(db.fn("teamMessage.findMany")).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ createdAt: { gte: after } }),
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      })
    )
  })

  it("onlyFor wraps concernsUser in an AND clause", async () => {
    const db = fakeDb({ "teamMessage.findMany": [] })
    await repo.findMessages(db.client, "p1", { take: 10, onlyFor: "u1" })
    const call = db.fn("teamMessage.findMany").mock.calls[0][0]
    expect(call.where.AND).toEqual([repo.concernsUser("u1")])
  })
})

describe("simple lookups and writes", () => {
  it("findMessage is scoped to id + project with the full include", async () => {
    const db = fakeDb()
    await repo.findMessage(db.client, "p1", "m1")
    expect(db.fn("teamMessage.findFirst")).toHaveBeenCalledWith({ where: { id: "m1", projectId: "p1" }, include: repo.MESSAGE_INCLUDE })
  })

  it("insertMessage passes data through, selecting only id", async () => {
    const db = fakeDb()
    const data = { projectId: "p1", authorId: "u1", body: "hi", replyToId: null }
    await repo.insertMessage(db.client, data)
    expect(db.fn("teamMessage.create")).toHaveBeenCalledWith({ data, select: { id: true } })
  })

  it("insertMirror stores a null body (its text is read from the comment)", async () => {
    const db = fakeDb()
    await repo.insertMirror(db.client, { projectId: "p1", authorId: "u1", commentId: "c1" })
    expect(db.fn("teamMessage.create")).toHaveBeenCalledWith({
      data: { projectId: "p1", authorId: "u1", commentId: "c1", body: null },
      select: { id: true },
    })
  })

  it("insertMentions is a no-op for an empty list, createMany with skipDuplicates otherwise", async () => {
    const db = fakeDb()
    await expect(repo.insertMentions(db.client, "m1", [])).resolves.toEqual({ count: 0 })
    expect(db.fn("teamMessageMention.createMany")).not.toHaveBeenCalled()
    await repo.insertMentions(db.client, "m1", ["u1", "u2"])
    expect(db.fn("teamMessageMention.createMany")).toHaveBeenCalledWith({
      data: [{ messageId: "m1", userId: "u1" }, { messageId: "m1", userId: "u2" }],
      skipDuplicates: true,
    })
  })

  it("insertAttachments is a no-op for an empty list, createMany otherwise", async () => {
    const db = fakeDb()
    await expect(repo.insertAttachments(db.client, "m1", [])).resolves.toEqual({ count: 0 })
    expect(db.fn("teamMessageAttachment.createMany")).not.toHaveBeenCalled()
    const f = { fileName: "f", originalName: "o", fileSize: 1, mimeType: "text/plain" }
    await repo.insertAttachments(db.client, "m1", [f])
    expect(db.fn("teamMessageAttachment.createMany")).toHaveBeenCalledWith({ data: [{ ...f, messageId: "m1" }] })
  })

  it("softDeleteMessage sets deletedAt", async () => {
    const db = fakeDb()
    const now = new Date("2026-01-01T00:00:00Z")
    await repo.softDeleteMessage(db.client, "m1", now)
    expect(db.fn("teamMessage.update")).toHaveBeenCalledWith({ where: { id: "m1" }, data: { deletedAt: now } })
  })

  it("findAttachmentFiles / deleteAttachmentRows are scoped to the message", async () => {
    const db = fakeDb()
    await repo.findAttachmentFiles(db.client, "m1")
    await repo.deleteAttachmentRows(db.client, "m1")
    expect(db.fn("teamMessageAttachment.findMany")).toHaveBeenCalledWith({ where: { messageId: "m1" }, select: { fileName: true } })
    expect(db.fn("teamMessageAttachment.deleteMany")).toHaveBeenCalledWith({ where: { messageId: "m1" } })
  })

  it("findAttachment requires a live message in the project", async () => {
    const db = fakeDb()
    await repo.findAttachment(db.client, "p1", "a1")
    expect(db.fn("teamMessageAttachment.findFirst")).toHaveBeenCalledWith({
      where: { id: "a1", message: { projectId: "p1", deletedAt: null } },
      select: { fileName: true, originalName: true, mimeType: true },
    })
  })

  it("findRead / upsertRead use the composite userId_projectId key", async () => {
    const db = fakeDb()
    const now = new Date("2026-01-01T00:00:00Z")
    await repo.findRead(db.client, "u1", "p1")
    await repo.upsertRead(db.client, "u1", "p1", now)
    expect(db.fn("teamChatRead.findUnique")).toHaveBeenCalledWith({ where: { userId_projectId: { userId: "u1", projectId: "p1" } }, select: { lastReadAt: true } })
    expect(db.fn("teamChatRead.upsert")).toHaveBeenCalledWith({
      where: { userId_projectId: { userId: "u1", projectId: "p1" } },
      create: { userId: "u1", projectId: "p1", lastReadAt: now },
      update: { lastReadAt: now },
    })
  })
})

describe("countUnread", () => {
  it("counts messages by others since a time, and how many of those concern the user", async () => {
    const db = fakeDb({ "teamMessage.count": 3 })
    const since = new Date("2026-01-01T00:00:00Z")
    const out = await repo.countUnread(db.client, "u1", "p1", since)
    expect(out).toEqual({ unread: 3, forYou: 3 })
    const calls = db.fn("teamMessage.count").mock.calls
    expect(calls[0][0]).toEqual({ where: { projectId: "p1", ...repo.VISIBLE_MESSAGE, createdAt: { gt: since }, authorId: { not: "u1" } } })
    expect(calls[1][0].where.AND).toEqual([repo.concernsUser("u1")])
  })
})

describe("findSourceLabels", () => {
  it("skips queries for entity types with no ids", async () => {
    const db = fakeDb()
    const out = await repo.findSourceLabels(db.client, "p1", { pbi: [], sprint_task: [], icebox: [] })
    expect(out).toEqual({ pbis: [], tasks: [], icebox: [] })
    expect(db.fn("productBacklogItem.findMany")).not.toHaveBeenCalled()
    expect(db.fn("sprintBacklogItem.findMany")).not.toHaveBeenCalled()
    expect(db.fn("iceboxItem.findMany")).not.toHaveBeenCalled()
  })

  it("queries each entity type scoped to the project when ids are given", async () => {
    const db = fakeDb({
      "productBacklogItem.findMany": [{ id: "p1item", displayId: 1, initiative: "x", userStory: null }],
      "sprintBacklogItem.findMany": [{ id: "t1", taskName: "Fix", sprintId: "s1", sprint: { sprintName: "S1" } }],
      "iceboxItem.findMany": [{ id: "i1", displayId: 2, request: "Please" }],
    })
    const out = await repo.findSourceLabels(db.client, "p1", { pbi: ["p1item"], sprint_task: ["t1"], icebox: ["i1"] })
    expect(out.pbis).toHaveLength(1)
    expect(out.tasks).toHaveLength(1)
    expect(out.icebox).toHaveLength(1)
    expect(db.fn("productBacklogItem.findMany")).toHaveBeenCalledWith({
      where: { projectId: "p1", id: { in: ["p1item"] } },
      select: { id: true, displayId: true, initiative: true, userStory: true },
    })
    expect(db.fn("sprintBacklogItem.findMany")).toHaveBeenCalledWith({
      where: { id: { in: ["t1"] }, sprint: { projectId: "p1" } },
      select: { id: true, taskName: true, sprintId: true, sprint: { select: { sprintName: true } } },
    })
    expect(db.fn("iceboxItem.findMany")).toHaveBeenCalledWith({
      where: { projectId: "p1", id: { in: ["i1"] } },
      select: { id: true, displayId: true, request: true },
    })
  })
})
