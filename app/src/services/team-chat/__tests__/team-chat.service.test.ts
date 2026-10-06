import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/services/_shared/db", async () => (await import("@/services/__tests__/support")).dbMock())
vi.mock("@/services/_shared/notifications", async () => (await import("@/services/__tests__/support")).notificationsMock())
vi.mock("@/services/_shared/translations", async () => (await import("@/services/__tests__/support")).translationMock())
vi.mock("@/lib/logger", () => ({ logger: { child: () => ({ warn: vi.fn(), error: vi.fn(), info: vi.fn() }) } }))
vi.mock("@/lib/api-helpers", () => ({
  saveUploadedFile: vi.fn(),
  deleteUploadedFile: vi.fn(async () => undefined),
}))
vi.mock("@/services/attachments/storage-quota", () => ({ assertStorageQuota: vi.fn(async () => undefined) }))
vi.mock("@/services/comments/comments.service", () => ({ createComment: vi.fn() }))
vi.mock("@/services/comments/comments.repository", () => ({ findMentionCandidates: vi.fn() }))
vi.mock("../team-chat.repository")
const publishAfterCommit = vi.fn()
vi.mock("@/lib/realtime/after-commit", () => ({ publishAfterCommit: (...a: unknown[]) => publishAfterCommit(...a) }))

const repo = await import("../team-chat.repository")
const files = await import("@/lib/api-helpers")
const { assertStorageQuota } = await import("@/services/attachments/storage-quota")
const { createComment } = await import("@/services/comments/comments.service")
const { findMentionCandidates } = await import("@/services/comments/comments.repository")
const { notify } = await import("@/services/_shared/notifications")
const { ACTOR, TX, DEFAULT_DB } = await import("@/services/__tests__/support")
const tr = await import("@/services/_shared/translations")
const svc = await import("../team-chat.service")
const { NotFoundError, ForbiddenError, StatusError } = await import("@/services/_shared/errors")

const MEMBERS = [{ id: "u1", name: "Alice" }, { id: "u2", name: "Bob" }]

function messageRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "m1",
    body: "hi",
    createdAt: new Date("2026-01-01T00:00:00Z"),
    authorId: "u1",
    author: { id: "u1", name: "Alice" },
    attachments: [],
    mentions: [],
    comment: null,
    commentId: null,
    replyTo: null,
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(repo.findMessages).mockResolvedValue([])
  vi.mocked(repo.findSourceLabels).mockResolvedValue({ pbis: [], tasks: [], icebox: [] })
  vi.mocked(repo.insertMessage).mockResolvedValue({ id: "new1" } as never)
  vi.mocked(repo.findMessage).mockResolvedValue(messageRow() as never)
  vi.mocked(findMentionCandidates).mockResolvedValue(MEMBERS as never)
  vi.mocked(repo.findAttachmentFiles).mockResolvedValue([])
})

describe("listMessages", () => {
  it("default/before page: reverses rows to oldest-first and flags hasMore", async () => {
    const rows = Array.from({ length: 3 }, (_, i) => messageRow({ id: `m${i}` }))
    vi.mocked(repo.findMessages).mockResolvedValueOnce(rows as never)
    const out = await svc.listMessages("p1", { userId: "u1", canModerate: false })
    expect(out.items.map((m) => m.id)).toEqual(["m2", "m1", "m0"])
    expect(out.hasMore).toBe(false)
    expect(repo.findMessages).toHaveBeenCalledWith(DEFAULT_DB, "p1", { before: undefined, after: undefined, take: 51, onlyFor: undefined })
  })

  it("after (poll): keeps ascending order as returned", async () => {
    const rows = [messageRow({ id: "a" }), messageRow({ id: "b" })]
    vi.mocked(repo.findMessages).mockResolvedValueOnce(rows as never)
    const after = new Date("2026-01-01T00:00:00Z")
    const out = await svc.listMessages("p1", { userId: "u1", canModerate: false }, { after })
    expect(out.items.map((m) => m.id)).toEqual(["a", "b"])
    expect(repo.findMessages).toHaveBeenCalledWith(DEFAULT_DB, "p1", { before: undefined, after, take: 51, onlyFor: undefined })
  })

  it("hasMore is true when more than the page size comes back, trimmed to the page", async () => {
    const rows = Array.from({ length: 51 }, (_, i) => messageRow({ id: `m${i}` }))
    vi.mocked(repo.findMessages).mockResolvedValueOnce(rows as never)
    const out = await svc.listMessages("p1", { userId: "u1", canModerate: false })
    expect(out.items).toHaveLength(50)
    expect(out.hasMore).toBe(true)
  })

  it("forMe passes the viewer id through as onlyFor", async () => {
    await svc.listMessages("p1", { userId: "u9", canModerate: false }, { forMe: true })
    expect(repo.findMessages).toHaveBeenCalledWith(DEFAULT_DB, "p1", expect.objectContaining({ onlyFor: "u9" }))
  })
})

describe("createMessage", () => {
  const base = { body: "hello", replyToId: null, files: [] as File[] }

  it("rejects an empty message with no files (TEAM_CHAT_EMPTY)", async () => {
    await expect(svc.createMessage("p1", { ...base, body: "  " }, ACTOR)).rejects.toMatchObject({ code: "TEAM_CHAT_EMPTY", status: 400 })
    expect(repo.insertMessage).not.toHaveBeenCalled()
  })

  it("allows an empty body when files are attached", async () => {
    vi.mocked(files.saveUploadedFile).mockResolvedValue({ ok: true, fileName: "f", originalName: "a.txt", fileSize: 1, mimeType: "text/plain" })
    await svc.createMessage("p1", { ...base, body: "", files: [new File(["x"], "a.txt")] }, ACTOR)
    expect(repo.insertMessage).toHaveBeenCalled()
  })

  it("rejects a message over TEAM_CHAT_BODY_MAX (TEAM_CHAT_TOO_LONG)", async () => {
    await expect(svc.createMessage("p1", { ...base, body: "x".repeat(10_001) }, ACTOR)).rejects.toMatchObject({ code: "TEAM_CHAT_TOO_LONG", status: 400 })
  })

  it("rejects too many files (TEAM_CHAT_TOO_MANY_FILES)", async () => {
    const files6 = Array.from({ length: 6 }, (_, i) => new File(["x"], `f${i}.txt`))
    await expect(svc.createMessage("p1", { ...base, files: files6 }, ACTOR)).rejects.toMatchObject({ code: "TEAM_CHAT_TOO_MANY_FILES" })
    expect(repo.insertMessage).not.toHaveBeenCalled()
  })

  it("rejects an oversized file (413 TEAM_CHAT_FILE_TOO_LARGE)", async () => {
    const big = new File([new Uint8Array(1)], "big.zip")
    Object.defineProperty(big, "size", { value: 21 * 1024 * 1024 })
    await expect(svc.createMessage("p1", { ...base, files: [big] }, ACTOR)).rejects.toMatchObject({ status: 413, code: "TEAM_CHAT_FILE_TOO_LARGE" })
    expect(files.saveUploadedFile).not.toHaveBeenCalled()
  })

  it("404 when replying to a missing or already-deleted message", async () => {
    vi.mocked(repo.findMessage).mockResolvedValueOnce(null as never)
    await expect(svc.createMessage("p1", { ...base, replyToId: "gone" }, ACTOR)).rejects.toMatchObject({ status: 404, code: "TEAM_CHAT_MESSAGE_NOT_FOUND" })
    vi.mocked(repo.findMessage).mockResolvedValueOnce(messageRow({ deletedAt: new Date() }) as never)
    await expect(svc.createMessage("p1", { ...base, replyToId: "deleted" }, ACTOR)).rejects.toMatchObject({ code: "TEAM_CHAT_MESSAGE_NOT_FOUND" })
  })

  it("checks the storage quota against the combined file size before uploading", async () => {
    vi.mocked(assertStorageQuota).mockRejectedValueOnce(new StatusError(413, "quota", {}, "STORAGE_QUOTA_EXCEEDED"))
    const f = new File(["x"], "a.txt")
    await expect(svc.createMessage("p1", { ...base, files: [f] }, ACTOR)).rejects.toMatchObject({ code: "STORAGE_QUOTA_EXCEEDED" })
    expect(assertStorageQuota).toHaveBeenCalledWith("p1", f.size)
    expect(files.saveUploadedFile).not.toHaveBeenCalled()
  })

  it("does not check the quota when no files are attached", async () => {
    await svc.createMessage("p1", base, ACTOR)
    expect(assertStorageQuota).not.toHaveBeenCalled()
  })

  it("inserts the message, mentions and attachments inside one transaction", async () => {
    vi.mocked(files.saveUploadedFile).mockResolvedValue({ ok: true, fileName: "stored.txt", originalName: "a.txt", fileSize: 3, mimeType: "text/plain" })
    const f = new File(["abc"], "a.txt")
    await svc.createMessage("p1", { body: "hi @Bob", replyToId: null, files: [f] }, ACTOR)
    expect(repo.insertMessage).toHaveBeenCalledWith(TX, { projectId: "p1", authorId: "u1", body: "hi @Bob", replyToId: null, commentId: null })
    expect(repo.insertMentions).toHaveBeenCalledWith(TX, "new1", ["u2"])
    expect(repo.insertAttachments).toHaveBeenCalledWith(TX, "new1", [{ fileName: "stored.txt", originalName: "a.txt", fileSize: 3, mimeType: "text/plain" }])
  })

  it("a reply to a mirrored comment also posts to that comment's thread with mirror:false, and links the resulting commentId", async () => {
    vi.mocked(repo.findMessage).mockResolvedValueOnce(
      messageRow({ id: "r1", authorId: "replyAuthor", comment: { id: "c1", entityType: "pbi", entityId: "pb1", deletedAt: null } }) as never
    )
    vi.mocked(createComment).mockResolvedValueOnce({ id: "threadComment1" } as never)
    await svc.createMessage("p1", { body: "answer", replyToId: "r1", files: [] }, ACTOR, true)
    expect(createComment).toHaveBeenCalledWith(
      "p1",
      { entityType: "pbi", entityId: "pb1", body: "answer" },
      ACTOR,
      true,
      { mirror: false },
    )
    expect(repo.insertMessage).toHaveBeenCalledWith(TX, expect.objectContaining({ replyToId: "r1", commentId: "threadComment1" }))
  })

  it("does not post to the thread when the replied-to message is not a mirrored comment", async () => {
    vi.mocked(repo.findMessage).mockResolvedValueOnce(messageRow({ id: "r1", comment: null }) as never)
    await svc.createMessage("p1", { body: "answer", replyToId: "r1", files: [] }, ACTOR)
    expect(createComment).not.toHaveBeenCalled()
    expect(repo.insertMessage).toHaveBeenCalledWith(TX, expect.objectContaining({ commentId: null }))
  })

  it("does not post to the thread when the source comment is already deleted", async () => {
    vi.mocked(repo.findMessage).mockResolvedValueOnce(messageRow({ id: "r1", comment: { id: "c1", entityType: "pbi", entityId: "pb1", deletedAt: new Date() } }) as never)
    await svc.createMessage("p1", { body: "answer", replyToId: "r1", files: [] }, ACTOR)
    expect(createComment).not.toHaveBeenCalled()
  })

  it("logs and continues when posting to the thread fails; the chat message is still created", async () => {
    vi.mocked(repo.findMessage).mockResolvedValueOnce(messageRow({ id: "r1", comment: { id: "c1", entityType: "pbi", entityId: "pb1", deletedAt: null } }) as never)
    vi.mocked(createComment).mockRejectedValueOnce(new Error("target gone"))
    const out = await svc.createMessage("p1", { body: "answer", replyToId: "r1", files: [] }, ACTOR)
    expect(out).toBeTruthy()
    expect(repo.insertMessage).toHaveBeenCalledWith(TX, expect.objectContaining({ commentId: null }))
  })

  it("notifies mentioned users and the replied-to author (deduped) via notify", async () => {
    vi.mocked(repo.findMessage).mockResolvedValueOnce(messageRow({ id: "r1", authorId: "u2", comment: null }) as never)
    await svc.createMessage("p1", { body: "hi @Bob", replyToId: "r1", files: [] }, ACTOR)
    expect(notify).toHaveBeenCalledWith(TX, expect.objectContaining({ type: "mentioned", recipientIds: ["u2"] }))
    expect(notify).toHaveBeenCalledTimes(1) // replyAuthorId (u2) already in mentionIds => deduped, no second notify

    vi.mocked(notify as ReturnType<typeof vi.fn>).mockClear()
    vi.mocked(repo.findMessage).mockResolvedValueOnce(messageRow({ id: "r2", authorId: "u9", comment: null }) as never)
    await svc.createMessage("p1", { body: "no mention here", replyToId: "r2", files: [] }, ACTOR)
    // One "mentioned" notify with an empty recipient list, plus one "comment" notify to the reply author.
    expect(notify).toHaveBeenCalledTimes(2)
    expect(notify).toHaveBeenCalledWith(TX, expect.objectContaining({ type: "mentioned", recipientIds: [] }))
    expect(notify).toHaveBeenCalledWith(TX, expect.objectContaining({ type: "comment", recipientIds: ["u9"] }))
  })

  it("deletes already-saved files when the transaction fails", async () => {
    vi.mocked(files.saveUploadedFile).mockResolvedValue({ ok: true, fileName: "stored.txt", originalName: "a.txt", fileSize: 1, mimeType: "text/plain" })
    vi.mocked(repo.insertMessage).mockRejectedValueOnce(new Error("db down"))
    const f = new File(["x"], "a.txt")
    await expect(svc.createMessage("p1", { body: "hi", replyToId: null, files: [f] }, ACTOR)).rejects.toThrow("db down")
    expect(files.deleteUploadedFile).toHaveBeenCalledWith("p1", "stored.txt")
  })

  it("deletes already-saved files and rethrows when a later file in the batch fails to save", async () => {
    vi.mocked(files.saveUploadedFile)
      .mockResolvedValueOnce({ ok: true, fileName: "ok.txt", originalName: "ok.txt", fileSize: 1, mimeType: "text/plain" })
      .mockResolvedValueOnce({ ok: false, status: 415, error: "bad type", code: "UNSUPPORTED_MEDIA" })
    const f1 = new File(["x"], "ok.txt")
    const f2 = new File(["y"], "bad.exe")
    await expect(svc.createMessage("p1", { body: "hi", replyToId: null, files: [f1, f2] }, ACTOR)).rejects.toMatchObject({ status: 415 })
    expect(files.deleteUploadedFile).toHaveBeenCalledWith("p1", "ok.txt")
    expect(repo.insertMessage).not.toHaveBeenCalled()
  })
})

describe("threadBody", () => {
  it("joins the trimmed body with an attachment note when files are present", () => {
    expect(svc.threadBody("  hello  ", 2)).toBe("hello\n\n📎 チームチャットに添付ファイル 2 件")
  })

  it("is just the trimmed body when there are no files", () => {
    expect(svc.threadBody("  hello  ", 0)).toBe("hello")
  })

  it("is just the attachment note when the body is empty", () => {
    expect(svc.threadBody("   ", 3)).toBe("📎 チームチャットに添付ファイル 3 件")
  })
})

describe("deleteMessage", () => {
  it("404 for a missing or already-deleted message", async () => {
    vi.mocked(repo.findMessage).mockResolvedValueOnce(null as never)
    await expect(svc.deleteMessage("p1", "m1", ACTOR)).rejects.toBeInstanceOf(NotFoundError)
    vi.mocked(repo.findMessage).mockResolvedValueOnce(messageRow({ deletedAt: new Date() }) as never)
    await expect(svc.deleteMessage("p1", "m1", ACTOR)).rejects.toBeInstanceOf(NotFoundError)
  })

  it("refuses to delete a mirror row (read-only, delete via the source thread instead)", async () => {
    vi.mocked(repo.findMessage).mockResolvedValueOnce(messageRow({ body: null }) as never)
    await expect(svc.deleteMessage("p1", "m1", ACTOR)).rejects.toMatchObject({ code: "TEAM_CHAT_MIRROR_READONLY" })
  })

  it("403 for someone else's message without moderation rights", async () => {
    vi.mocked(repo.findMessage).mockResolvedValueOnce(messageRow({ authorId: "other" }) as never)
    await expect(svc.deleteMessage("p1", "m1", ACTOR)).rejects.toBeInstanceOf(ForbiddenError)
  })

  it("a moderator can delete someone else's message", async () => {
    vi.mocked(repo.findMessage).mockResolvedValueOnce(messageRow({ authorId: "other" }) as never)
    await svc.deleteMessage("p1", "m1", ACTOR, true)
    expect(repo.softDeleteMessage).toHaveBeenCalled()
  })

  it("soft-deletes, drops attachment rows, and removes the stored files", async () => {
    vi.mocked(repo.findAttachmentFiles).mockResolvedValueOnce([{ fileName: "a.txt" }, { fileName: "b.txt" }] as never)
    const now = new Date("2026-05-01T00:00:00Z")
    await svc.deleteMessage("p1", "m1", ACTOR, false, now)
    expect(repo.softDeleteMessage).toHaveBeenCalledWith(TX, "m1", now)
    expect(repo.deleteAttachmentRows).toHaveBeenCalledWith(TX, "m1")
    expect(files.deleteUploadedFile).toHaveBeenCalledWith("p1", "a.txt")
    expect(files.deleteUploadedFile).toHaveBeenCalledWith("p1", "b.txt")
  })
})

describe("getAttachment", () => {
  it("404 when the attachment is outside the project / message deleted", async () => {
    vi.mocked(repo.findAttachment).mockResolvedValueOnce(null)
    await expect(svc.getAttachment("p1", "a1")).rejects.toBeInstanceOf(NotFoundError)
  })

  it("returns the stored file info", async () => {
    vi.mocked(repo.findAttachment).mockResolvedValueOnce({ fileName: "f", originalName: "o", mimeType: "text/plain" })
    await expect(svc.getAttachment("p1", "a1")).resolves.toEqual({ fileName: "f", originalName: "o", mimeType: "text/plain" })
  })
})

describe("getChatSummary / markChatRead", () => {
  it("never read: counts unread since a week before now", async () => {
    vi.mocked(repo.findRead).mockResolvedValueOnce(null)
    vi.mocked(repo.countUnread).mockResolvedValueOnce({ unread: 5, forYou: 2 })
    const now = new Date("2026-03-10T00:00:00Z")
    const out = await svc.getChatSummary("u1", "p1", now)
    expect(out).toEqual({ unread: 5, forYou: 2, lastReadAt: null })
    const since = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
    expect(repo.countUnread).toHaveBeenCalledWith(DEFAULT_DB, "u1", "p1", since)
  })

  it("previously read: counts unread since the stored lastReadAt", async () => {
    const lastReadAt = new Date("2026-03-09T00:00:00Z")
    vi.mocked(repo.findRead).mockResolvedValueOnce({ lastReadAt })
    vi.mocked(repo.countUnread).mockResolvedValueOnce({ unread: 1, forYou: 0 })
    const out = await svc.getChatSummary("u1", "p1", new Date("2026-03-10T00:00:00Z"))
    expect(out).toEqual({ unread: 1, forYou: 0, lastReadAt: lastReadAt.toISOString() })
    expect(repo.countUnread).toHaveBeenCalledWith(DEFAULT_DB, "u1", "p1", lastReadAt)
  })

  it("markChatRead upserts the read marker and echoes the time", async () => {
    const now = new Date("2026-03-10T00:00:00Z")
    const out = await svc.markChatRead("u1", "p1", now)
    expect(repo.upsertRead).toHaveBeenCalledWith(DEFAULT_DB, "u1", "p1", now)
    expect(out).toEqual({ lastReadAt: now.toISOString() })
  })
})

describe("translation of chat messages", () => {
  it("queues a new message body for JA ⇄ ID translation inside the transaction", async () => {
    await svc.createMessage("p1", { body: "こんにちは", replyToId: null, files: [] }, ACTOR)
    expect(tr.enqueueIn).toHaveBeenCalledWith(TX, "team_message", expect.any(String), { body: "こんにちは" })
  })

  it("does not queue a files-only message (no text)", async () => {
    vi.mocked(files.saveUploadedFile).mockResolvedValue({ ok: true, fileName: "f", originalName: "a.txt", fileSize: 1, mimeType: "text/plain" })
    await svc.createMessage("p1", { body: "", replyToId: null, files: [new File(["x"], "a.txt")] }, ACTOR)
    expect(tr.enqueueIn).not.toHaveBeenCalledWith(TX, "team_message", expect.anything(), expect.anything())
  })

  it("drops the translation when the message is deleted", async () => {
    vi.mocked(repo.findMessage).mockResolvedValueOnce(messageRow() as never)
    await svc.deleteMessage("p1", "m1", ACTOR)
    expect(tr.purgeIn).toHaveBeenCalledWith(TX, { team_message: ["m1"] })
  })
})

describe("markChatRead", () => {
  it("also marks the viewer's team chat notifications of the project read", async () => {
    const now = new Date("2026-10-02T00:00:00Z")
    await svc.markChatRead("u1", "p1", now)
    expect(repo.markChatNotificationsRead).toHaveBeenCalledWith(expect.anything(), "u1", "p1", now)
  })
})


describe("real-time 'team-message' events (ids only, after the commit)", () => {
  it("a new message publishes one event with the message id, never its body", async () => {
    await svc.createMessage("p1", { body: "secret text", replyToId: null, files: [] }, ACTOR)
    expect(publishAfterCommit).toHaveBeenCalledTimes(1)
    expect(publishAfterCommit).toHaveBeenCalledWith({ type: "team-message", projectId: "p1", entityType: "team_message", entityId: "new1", action: "create", actorId: "u1" })
    expect(JSON.stringify(publishAfterCommit.mock.calls)).not.toContain("secret")
  })

  it("a delete publishes a delete event; a refused delete publishes nothing", async () => {
    await svc.deleteMessage("p1", "m1", ACTOR)
    expect(publishAfterCommit).toHaveBeenCalledWith(expect.objectContaining({ type: "team-message", entityId: "m1", action: "delete" }))
    publishAfterCommit.mockClear()
    vi.mocked(repo.findMessage).mockResolvedValueOnce(messageRow({ authorId: "other" }) as never)
    await expect(svc.deleteMessage("p1", "m2", ACTOR)).rejects.toBeInstanceOf(ForbiddenError)
    expect(publishAfterCommit).not.toHaveBeenCalled()
  })
})
