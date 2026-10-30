import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/services/_shared/db", async () => (await import("@/services/__tests__/support")).dbMock())
vi.mock("@/services/_shared/activity", async () => (await import("@/services/__tests__/support")).activityMock())
vi.mock("@/services/_shared/notifications", async () => (await import("@/services/__tests__/support")).notificationsMock())
vi.mock("@/services/_shared/translations", async () => (await import("@/services/__tests__/support")).translationMock())
vi.mock("../comments.repository")
vi.mock("@/services/team-chat/team-chat.repository", () => ({ insertMirror: vi.fn() }))
const publishAfterCommit = vi.fn()
vi.mock("@/lib/realtime/after-commit", () => ({ publishAfterCommit: (...a: unknown[]) => publishAfterCommit(...a) }))

const repo = await import("../comments.repository")
const teamChatRepo = await import("@/services/team-chat/team-chat.repository")
const svc = await import("../comments.service")
const activity = await import("@/services/_shared/activity")
const tr = await import("@/services/_shared/translations")
const notifications = await import("@/services/_shared/notifications")
const { ACTOR, DEFAULT_DB, TX } = await import("@/services/__tests__/support")
const { ForbiddenError, NotFoundError } = await import("@/services/_shared/errors")
const { decodeCursor } = await import("@/services/_shared/cursor")

const AT = new Date("2026-10-01T09:00:00.000Z")
const MEMBERS = [
  { id: "u1", name: "Alice" },
  { id: "u2", name: "Taro Yamada" },
  { id: "u3", name: "Hanako" },
  { id: "u4", name: "Kenji" },
]

function row(id: string, over: Record<string, unknown> = {}) {
  return {
    id,
    projectId: "p1",
    entityType: "pbi",
    entityId: "b1",
    authorId: "u1",
    body: "Hello",
    createdAt: AT,
    editedAt: null,
    deletedAt: null,
    author: { id: "u1", name: "Alice" },
    mentions: [] as { user: { id: string; name: string } }[],
    ...over,
  }
}

const PBI = { id: "b1", displayId: 7, initiative: "Faster login", userStory: "As a user", assignedPo: "Hanako" }

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(repo.findMentionCandidates).mockResolvedValue(MEMBERS)
  vi.mocked(repo.findPbiTarget).mockResolvedValue(PBI as never)
  vi.mocked(repo.createComment).mockResolvedValue({ id: "c1" } as never)
  vi.mocked(repo.findComment).mockResolvedValue(row("c1") as never)
})

describe("toCommentDto", () => {
  it("maps a live comment with permissions for the author", () => {
    const dto = svc.toCommentDto(row("c1", { mentions: [{ user: { id: "u2", name: "Taro Yamada" } }] }), {
      userId: "u1",
      canModerate: false,
    })
    expect(dto).toEqual({
      id: "c1",
      entityType: "pbi",
      entityId: "b1",
      author: { id: "u1", name: "Alice" },
      body: "Hello",
      deleted: false,
      mentions: [{ id: "u2", name: "Taro Yamada" }],
      createdAt: AT.toISOString(),
      editedAt: null,
      canEdit: true,
      canDelete: true,
      i18n: {},
      via: null,
    })
  })

  it("carries how a token-made comment arrived (api / mcp); anything else is the UI", () => {
    const viewer = { userId: "u1", canModerate: false }
    expect(svc.toCommentDto(row("c1", { via: "mcp" }), viewer).via).toBe("mcp")
    expect(svc.toCommentDto(row("c1", { via: "api" }), viewer).via).toBe("api")
    expect(svc.toCommentDto(row("c1", { via: "other" }), viewer).via).toBeNull()
  })

  it("hides the body of a deleted comment and allows nothing", () => {
    const dto = svc.toCommentDto(row("c1", { deletedAt: AT, mentions: [{ user: { id: "u2", name: "T" } }] }), {
      userId: "u1",
      canModerate: true,
    })
    expect(dto).toMatchObject({ body: null, deleted: true, mentions: [], canEdit: false, canDelete: false })
  })

  it("others can delete only as moderators, never edit", () => {
    expect(svc.toCommentDto(row("c1", { editedAt: AT }), { userId: "u9", canModerate: false })).toMatchObject({
      canEdit: false,
      canDelete: false,
      editedAt: AT.toISOString(),
    })
    expect(svc.toCommentDto(row("c1"), { userId: "u9", canModerate: true })).toMatchObject({ canEdit: false, canDelete: true })
  })
})

describe("loadTarget", () => {
  it("pbi: label from displayId + initiative, PO resolved to a user", async () => {
    const target = await svc.loadTarget(TX as never, "p1", "pbi", "b1", MEMBERS)
    expect(repo.findPbiTarget).toHaveBeenCalledWith(TX, "p1", "b1")
    expect(target).toEqual({
      entityType: "pbi",
      entityId: "b1",
      label: "#7 Faster login",
      recipientIds: ["u3"],
      meta: { displayId: 7 },
    })
  })

  it("pbi: falls back to the user story, then to the bare id", async () => {
    vi.mocked(repo.findPbiTarget).mockResolvedValueOnce({ ...PBI, initiative: null, userStory: "Line 1\nLine 2" } as never)
    expect((await svc.loadTarget(TX as never, "p1", "pbi", "b1")).label).toBe("#7 Line 1")
    vi.mocked(repo.findPbiTarget).mockResolvedValueOnce({ ...PBI, initiative: null, userStory: "  " } as never)
    expect((await svc.loadTarget(TX as never, "p1", "pbi", "b1")).label).toBe("#7")
  })

  it("sprint_task: union of normalized and legacy assignees, sprintId in meta", async () => {
    vi.mocked(repo.findSprintTaskTarget).mockResolvedValue({
      id: "t1",
      sprintId: "s1",
      taskName: "x".repeat(200),
      assignee: "Kenji, Hanako",
      assignees: [{ userId: "u3" }, { userId: "u9" }],
    } as never)
    const target = await svc.loadTarget(TX as never, "p1", "sprint_task", "t1", MEMBERS)
    expect(target.recipientIds).toEqual(["u3", "u9", "u4"])
    expect(target.meta).toEqual({ sprintId: "s1" })
    expect(target.label).toHaveLength(120)
  })

  it("icebox: author and PO", async () => {
    vi.mocked(repo.findIceboxTarget).mockResolvedValue({
      id: "i1",
      displayId: 3,
      request: "Idea",
      author: "Taro Yamada",
      assignedPo: "Hanako",
    } as never)
    expect(await svc.loadTarget(TX as never, "p1", "icebox", "i1", MEMBERS)).toMatchObject({
      label: "#3 Idea",
      recipientIds: ["u2", "u3"],
    })
  })

  it.each([
    ["pbi", "findPbiTarget"],
    ["sprint_task", "findSprintTaskTarget"],
    ["icebox", "findIceboxTarget"],
  ] as const)("%s: 404 when missing / trashed / in another project", async (type, fn) => {
    vi.mocked(repo[fn]).mockResolvedValueOnce(null as never)
    await expect(svc.loadTarget(TX as never, "p1", type, "x")).rejects.toBeInstanceOf(NotFoundError)
  })
})

describe("listComments", () => {
  it("checks the target, pages oldest first and maps for the viewer", async () => {
    vi.mocked(repo.findComments).mockResolvedValue([row("a"), row("b", { authorId: "u2" }), row("c")] as never)
    const page = await svc.listComments("p1", { entityType: "pbi", entityId: "b1", limit: 2 }, { userId: "u1", canModerate: false })
    expect(repo.findPbiTarget).toHaveBeenCalledWith(DEFAULT_DB, "p1", "b1")
    expect(repo.findComments).toHaveBeenCalledWith(DEFAULT_DB, "p1", "pbi", "b1", { entityType: "pbi", entityId: "b1", limit: 2 })
    expect(page.items.map((i) => [i.id, i.canEdit])).toEqual([["a", true], ["b", false]])
    expect(decodeCursor(page.nextCursor!)).toEqual({ createdAt: AT, id: "b" })
  })

  it("404 for a trashed entity (no thread read)", async () => {
    vi.mocked(repo.findPbiTarget).mockResolvedValue(null as never)
    await expect(
      svc.listComments("p1", { entityType: "pbi", entityId: "b1", limit: 50 }, { userId: "u1", canModerate: false }),
    ).rejects.toBeInstanceOf(NotFoundError)
    expect(repo.findComments).not.toHaveBeenCalled()
  })
})

describe("getCommentCounts", () => {
  it("fills zero for ids without comments", async () => {
    vi.mocked(repo.countComments).mockResolvedValue(new Map([["a", 3]]))
    expect(await svc.getCommentCounts("p1", { entityType: "sprint_task", ids: ["a", "b"] })).toEqual({ counts: { a: 3, b: 0 }, unread: {} })
    expect(repo.countComments).toHaveBeenCalledWith(DEFAULT_DB, "p1", "sprint_task", ["a", "b"])
  })
})

describe("createComment", () => {
  const input = { entityType: "pbi" as const, entityId: "b1", body: "cc @[Taro Yamada] @Nobody\nplease check" }

  it("records via on the comment row when the actor came through a token (progress comments of write:dev)", async () => {
    vi.mocked(repo.findComment).mockResolvedValue(row("c1", { body: input.body, via: "mcp" }) as never)
    const dto = await svc.createComment("p1", input, { ...ACTOR, via: "mcp" })
    expect(repo.createComment).toHaveBeenCalledWith(TX, expect.objectContaining({ authorId: "u1", via: "mcp" }))
    expect(dto.via).toBe("mcp")
  })

  it("stores the comment + mentions, logs activity and notifies in one transaction", async () => {
    vi.mocked(repo.findComment).mockResolvedValue(row("c1", { body: input.body, mentions: [{ user: { id: "u2", name: "Taro Yamada" } }] }) as never)
    const dto = await svc.createComment("p1", input, ACTOR, true)

    expect(repo.createComment).toHaveBeenCalledWith(TX, { projectId: "p1", entityType: "pbi", entityId: "b1", authorId: "u1", body: input.body })
    expect(repo.replaceMentions).toHaveBeenCalledWith(TX, "c1", ["u2"])
    expect(teamChatRepo.insertMirror).toHaveBeenCalledWith(TX, { projectId: "p1", authorId: "u1", commentId: "c1" })
    expect(activity.logActivity).toHaveBeenCalledWith(TX, {
      projectId: "p1",
      entityType: "pbi",
      entityId: "b1",
      action: "comment",
      actor: ACTOR,
      diff: { label: "#7 Faster login", meta: { commentId: "c1" } },
    })
    const payload = {
      displayId: 7,
      entityLabel: "#7 Faster login",
      actorName: "Alice",
      excerpt: "cc @Taro Yamada @Nobody please check",
      entityType: "pbi",
      entityId: "b1",
      commentId: "c1",
    }
    expect(notifications.notify).toHaveBeenCalledWith(TX, {
      recipientIds: ["u2"],
      actorId: "u1",
      type: "mentioned",
      projectId: "p1",
      entityType: "pbi",
      entityId: "b1",
      payload,
      dedupeKey: "comment:c1:mentioned",
    })
    expect(notifications.notify).toHaveBeenCalledWith(TX, expect.objectContaining({
      recipientIds: ["u3"],
      type: "comment",
      dedupeKey: "comment:c1",
      payload,
    }))
    expect(dto).toMatchObject({ id: "c1", mentions: [{ id: "u2", name: "Taro Yamada" }], canDelete: true })
  })

  it("does not send a 'comment' notification to users already mentioned", async () => {
    await svc.createComment("p1", { ...input, body: "@Hanako look" }, ACTOR)
    expect(notifications.notify).toHaveBeenCalledTimes(1)
    expect(notifications.notify).toHaveBeenCalledWith(TX, expect.objectContaining({ type: "mentioned", recipientIds: ["u3"] }))
  })

  it("skips notifications when nobody is mentioned or responsible", async () => {
    vi.mocked(repo.findPbiTarget).mockResolvedValue({ ...PBI, assignedPo: null } as never)
    await svc.createComment("p1", { ...input, body: "plain" }, ACTOR)
    expect(repo.replaceMentions).toHaveBeenCalledWith(TX, "c1", [])
    expect(notifications.notify).not.toHaveBeenCalled()
  })

  it("404 (nothing written) when the target is gone", async () => {
    vi.mocked(repo.findPbiTarget).mockResolvedValue(null as never)
    await expect(svc.createComment("p1", input, ACTOR)).rejects.toBeInstanceOf(NotFoundError)
    expect(repo.createComment).not.toHaveBeenCalled()
  })

  it("404 when the created row cannot be re-read", async () => {
    vi.mocked(repo.findComment).mockResolvedValue(null as never)
    await expect(svc.createComment("p1", input, ACTOR)).rejects.toBeInstanceOf(NotFoundError)
  })

  it("mirrors into team chat by default, but not when options.mirror is false (a chat reply links the comment itself)", async () => {
    await svc.createComment("p1", input, ACTOR)
    expect(teamChatRepo.insertMirror).toHaveBeenCalledTimes(1)
    vi.mocked(teamChatRepo.insertMirror).mockClear()
    await svc.createComment("p1", input, ACTOR, false, { mirror: false })
    expect(teamChatRepo.insertMirror).not.toHaveBeenCalled()
  })
})

describe("updateComment", () => {
  const NOW = new Date("2026-10-02T00:00:00.000Z")

  it("author edits: body + editedAt, mentions replaced, only newly mentioned notified", async () => {
    vi.mocked(repo.findComment)
      .mockResolvedValueOnce(row("c1", { body: "@Hanako", mentions: [{ user: { id: "u3", name: "Hanako" } }] }) as never)
      .mockResolvedValueOnce(row("c1", { body: "@Hanako @Kenji", editedAt: NOW }) as never)
    const dto = await svc.updateComment("p1", "c1", { body: "@Hanako @Kenji" }, ACTOR, false, NOW)
    expect(repo.updateCommentBody).toHaveBeenCalledWith(TX, "c1", "@Hanako @Kenji", NOW)
    expect(repo.replaceMentions).toHaveBeenCalledWith(TX, "c1", ["u3", "u4"])
    expect(notifications.notify).toHaveBeenCalledTimes(1)
    expect(notifications.notify).toHaveBeenCalledWith(TX, expect.objectContaining({ type: "mentioned", recipientIds: ["u4"] }))
    expect(dto.editedAt).toBe(NOW.toISOString())
  })

  it("unchanged body is a no-op", async () => {
    const dto = await svc.updateComment("p1", "c1", { body: "Hello" }, ACTOR)
    expect(repo.updateCommentBody).not.toHaveBeenCalled()
    expect(dto.body).toBe("Hello")
  })

  it("403 for someone else's comment, even for a moderator", async () => {
    vi.mocked(repo.findComment).mockResolvedValue(row("c1", { authorId: "u2" }) as never)
    await expect(svc.updateComment("p1", "c1", { body: "x" }, ACTOR, true)).rejects.toBeInstanceOf(ForbiddenError)
    expect(repo.updateCommentBody).not.toHaveBeenCalled()
  })

  it("404 for a missing or deleted comment", async () => {
    vi.mocked(repo.findComment).mockResolvedValueOnce(null as never)
    await expect(svc.updateComment("p1", "c1", { body: "x" }, ACTOR)).rejects.toBeInstanceOf(NotFoundError)
    vi.mocked(repo.findComment).mockResolvedValueOnce(row("c1", { deletedAt: AT }) as never)
    await expect(svc.updateComment("p1", "c1", { body: "x" }, ACTOR)).rejects.toBeInstanceOf(NotFoundError)
  })
})

describe("deleteComment", () => {
  const NOW = new Date("2026-10-02T00:00:00.000Z")

  it("author soft-deletes", async () => {
    await svc.deleteComment("p1", "c1", ACTOR, false, NOW)
    expect(repo.softDeleteComment).toHaveBeenCalledWith(TX, "c1", NOW)
  })

  it("moderator deletes someone else's comment; others get 403", async () => {
    vi.mocked(repo.findComment).mockResolvedValue(row("c1", { authorId: "u2" }) as never)
    await svc.deleteComment("p1", "c1", ACTOR, true, NOW)
    expect(repo.softDeleteComment).toHaveBeenCalledTimes(1)
    await expect(svc.deleteComment("p1", "c1", ACTOR, false)).rejects.toBeInstanceOf(ForbiddenError)
    expect(repo.softDeleteComment).toHaveBeenCalledTimes(1)
  })

  it("404 when already deleted", async () => {
    vi.mocked(repo.findComment).mockResolvedValue(row("c1", { deletedAt: AT }) as never)
    await expect(svc.deleteComment("p1", "c1", ACTOR)).rejects.toBeInstanceOf(NotFoundError)
  })
})

describe("A3-03: comment translation", () => {
  const I18N = { body: { ja: "こんにちは", id: "Halo", source: "ja" as const, status: "done" as const } }

  it("enqueues the (glossary-cleaned) body on create, inside the transaction", async () => {
    vi.mocked(tr.prepareText).mockResolvedValueOnce({ body: "SMT 確認 @[Taro Yamada]" })
    await svc.createComment("p1", { entityType: "pbi", entityId: "b1", body: "SMT<<SMT>> 確認 @[Taro Yamada]" }, ACTOR)
    expect(tr.prepareText).toHaveBeenCalledWith({ body: "SMT<<SMT>> 確認 @[Taro Yamada]" }, ACTOR.userId)
    expect(repo.createComment).toHaveBeenCalledWith(TX, expect.objectContaining({ body: "SMT 確認 @[Taro Yamada]" }))
    expect(tr.enqueueIn).toHaveBeenCalledWith(TX, "comment", "c1", { body: "SMT 確認 @[Taro Yamada]" })
    expect(repo.replaceMentions).toHaveBeenCalledWith(TX, "c1", ["u2"])
  })

  it("re-enqueues on edit and not when the body is unchanged", async () => {
    vi.mocked(repo.findComment).mockResolvedValue(row("c1") as never)
    await svc.updateComment("p1", "c1", { body: "Hello" }, ACTOR)
    expect(tr.enqueueIn).not.toHaveBeenCalled()
    await svc.updateComment("p1", "c1", { body: "Halo semua" }, ACTOR)
    expect(tr.enqueueIn).toHaveBeenCalledWith(TX, "comment", "c1", { body: "Halo semua" })
  })

  it("purges the translation when the comment is deleted", async () => {
    await svc.deleteComment("p1", "c1", ACTOR)
    expect(tr.purgeIn).toHaveBeenCalledWith(TX, { comment: ["c1"] })
  })

  it("attaches i18n to live comments of a thread (one query) and never to tombstones", async () => {
    vi.mocked(repo.findComments).mockResolvedValue([row("a"), row("b", { deletedAt: AT })] as never)
    vi.mocked(tr.getI18nFor).mockResolvedValue(new Map([["a", I18N], ["b", I18N]]))
    const page = await svc.listComments("p1", { entityType: "pbi", entityId: "b1", limit: 10 }, { userId: "u1", canModerate: false })
    expect(tr.getI18nFor).toHaveBeenCalledWith("comment", ["a"])
    expect(page.items[0].i18n).toEqual(I18N)
    expect(page.items[1].i18n).toEqual({})
  })

  it("returns i18n on the created comment DTO", async () => {
    vi.mocked(tr.getI18nFor).mockResolvedValue(new Map([["c1", I18N]]))
    const dto = await svc.createComment("p1", { entityType: "pbi", entityId: "b1", body: "こんにちは" }, ACTOR)
    expect(dto.i18n).toEqual(I18N)
  })
})

describe("unread mentions / comments per item", () => {
  it("returns the viewer's unread notification counts next to the comment counts", async () => {
    vi.mocked(repo.countComments).mockResolvedValue(new Map([["a", 3]]) as never)
    vi.mocked(repo.countUnreadForUser).mockResolvedValue(new Map([["a", 2], ["b", 0]]) as never)
    const out = await svc.getCommentCounts("p1", { entityType: "sprint_task", ids: ["a", "b"] }, "u1")
    expect(out).toEqual({ counts: { a: 3, b: 0 }, unread: { a: 2 } })
    expect(repo.countUnreadForUser).toHaveBeenCalledWith(DEFAULT_DB, "u1", "p1", "sprint_task", ["a", "b"])
  })

  it("marks the viewer's notifications of the opened thread read", async () => {
    vi.mocked(repo.markEntityNotificationsRead).mockResolvedValue({ count: 2 } as never)
    const now = new Date("2026-10-02T00:00:00Z")
    await expect(svc.markThreadRead("p1", "sprint_task", "t1", "u1", now)).resolves.toEqual({ updated: 2 })
    expect(repo.markEntityNotificationsRead).toHaveBeenCalledWith(DEFAULT_DB, "u1", "p1", "sprint_task", "t1", now)
  })
})


describe("real-time 'comment' events (ids only, after the commit)", () => {
  const event = (action: string) => ({ type: "comment", projectId: "p1", entityType: "pbi", entityId: "b1", subjectId: "c1", action, actorId: "u1" })

  it("create / edit / delete each publish one event for the commented entity", async () => {
    await svc.createComment("p1", { entityType: "pbi", entityId: "b1", body: "hi" }, ACTOR)
    expect(publishAfterCommit).toHaveBeenLastCalledWith(event("create"))
    vi.mocked(repo.findComment).mockResolvedValueOnce(row("c1") as never).mockResolvedValueOnce(row("c1", { body: "edited" }) as never)
    await svc.updateComment("p1", "c1", { body: "edited" }, ACTOR)
    expect(publishAfterCommit).toHaveBeenLastCalledWith(event("update"))
    await svc.deleteComment("p1", "c1", ACTOR)
    expect(publishAfterCommit).toHaveBeenLastCalledWith(event("delete"))
    expect(publishAfterCommit).toHaveBeenCalledTimes(3)
  })

  it("an unchanged edit or a refused delete publishes nothing", async () => {
    await svc.updateComment("p1", "c1", { body: "Hello" }, ACTOR)
    vi.mocked(repo.findComment).mockResolvedValue(row("c1", { authorId: "u2" }) as never)
    await expect(svc.deleteComment("p1", "c1", ACTOR)).rejects.toBeInstanceOf(ForbiddenError)
    expect(publishAfterCommit).not.toHaveBeenCalled()
  })
})
