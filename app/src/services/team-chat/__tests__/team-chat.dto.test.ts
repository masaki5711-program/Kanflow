import { describe, expect, it } from "vitest"
import { sourceIds, sourceLabelMap, toMessageDto, type Viewer } from "../team-chat.dto"
import type { MessageRow } from "../team-chat.repository"

const VIEWER: Viewer = { userId: "u1", canModerate: false }
const MOD: Viewer = { userId: "mod1", canModerate: true }

/** Minimal row matching MESSAGE_INCLUDE; cast through unknown for test fixtures. */
function row(overrides: Partial<MessageRow> = {}): MessageRow {
  return {
    id: "m1",
    body: "Hello team",
    createdAt: new Date("2026-01-01T00:00:00Z"),
    authorId: "author1",
    author: { id: "author1", name: "Alice" },
    attachments: [],
    mentions: [],
    comment: null,
    commentId: null,
    replyTo: null,
    ...overrides,
  } as unknown as MessageRow
}

describe("toMessageDto", () => {
  it("maps a plain chat message", () => {
    const dto = toMessageDto(row(), VIEWER, new Map())
    expect(dto).toMatchObject({
      id: "m1",
      author: { id: "author1", name: "Alice" },
      body: "Hello team",
      createdAt: "2026-01-01T00:00:00.000Z",
      editedAt: null,
      mentions: [],
      mentionsMe: false,
      repliesToMe: false,
      attachments: [],
      source: null,
      replyTo: null,
      postedToThread: false,
    })
  })

  it("canDelete: true for the author, false for someone else, true for a moderator", () => {
    expect(toMessageDto(row({ authorId: "u1" }), VIEWER, new Map()).canDelete).toBe(true)
    expect(toMessageDto(row({ authorId: "other" }), VIEWER, new Map()).canDelete).toBe(false)
    expect(toMessageDto(row({ authorId: "other" }), MOD, new Map()).canDelete).toBe(true)
  })

  it("mentionsMe is true only when the viewer is among the message mentions", () => {
    const withMention = row({ mentions: [{ user: { id: "u1", name: "Me" } }, { user: { id: "u2", name: "Other" } }] as never })
    expect(toMessageDto(withMention, VIEWER, new Map()).mentionsMe).toBe(true)
    expect(toMessageDto(withMention, { userId: "u9", canModerate: false }, new Map()).mentionsMe).toBe(false)
    expect(toMessageDto(withMention, VIEWER, new Map()).mentions).toEqual([{ id: "u1", name: "Me" }, { id: "u2", name: "Other" }])
  })

  it("a mirror row (body null, has a comment) reads body/mentions/editedAt from the comment", () => {
    const mirror = row({
      body: null,
      authorId: "commenter",
      commentId: "c1",
      comment: {
        id: "c1",
        body: "Mirrored comment text",
        entityType: "pbi",
        entityId: "pb1",
        deletedAt: null,
        editedAt: new Date("2026-01-02T00:00:00Z"),
        mentions: [{ user: { id: "u1", name: "Me" } }],
      } as never,
    })
    const dto = toMessageDto(mirror, VIEWER, new Map([["pb1", { label: "#5 Login" }]]))
    expect(dto.body).toBe("Mirrored comment text")
    expect(dto.editedAt).toBe("2026-01-02T00:00:00.000Z")
    expect(dto.mentions).toEqual([{ id: "u1", name: "Me" }])
    expect(dto.mentionsMe).toBe(true)
    expect(dto.source).toEqual({ entityType: "pbi", entityId: "pb1", label: "#5 Login" })
    // Mirrors are read-only even for their own author or a moderator.
    expect(toMessageDto(mirror, { userId: "commenter", canModerate: false }, new Map()).canDelete).toBe(false)
    expect(toMessageDto(mirror, MOD, new Map()).canDelete).toBe(false)
  })

  it("a mirror whose comment has no editedAt reports editedAt null", () => {
    const mirror = row({
      body: null,
      commentId: "c1",
      comment: { id: "c1", body: "x", entityType: "pbi", entityId: "pb1", deletedAt: null, editedAt: null, mentions: [] } as never,
    })
    expect(toMessageDto(mirror, VIEWER, new Map()).editedAt).toBeNull()
  })

  it("source falls back to a null label when the entity is missing from the label map", () => {
    const withComment = row({ comment: { id: "c1", body: "x", entityType: "icebox", entityId: "ice1", deletedAt: null, editedAt: null, mentions: [] } as never })
    expect(toMessageDto(withComment, VIEWER, new Map()).source).toEqual({ entityType: "icebox", entityId: "ice1", label: null })
  })

  it("postedToThread is true for an own chat reply linked to a comment, false for a mirror", () => {
    const linkedReply = row({ body: "Also posted to the thread", commentId: "c1", comment: { id: "c1", body: "y", entityType: "pbi", entityId: "p1", deletedAt: null, editedAt: null, mentions: [] } as never })
    expect(toMessageDto(linkedReply, VIEWER, new Map()).postedToThread).toBe(true)
    const mirror = row({ body: null, commentId: "c1", comment: { id: "c1", body: "y", entityType: "pbi", entityId: "p1", deletedAt: null, editedAt: null, mentions: [] } as never })
    expect(toMessageDto(mirror, VIEWER, new Map()).postedToThread).toBe(false)
  })

  describe("replyTo", () => {
    it("repliesToMe is true when someone else replied to the viewer's own message", () => {
      const reply = row({ authorId: "other", replyTo: { id: "r1", body: "original", deletedAt: null, author: { id: "u1", name: "Me" }, comment: null, _count: { attachments: 0 } } as never })
      expect(toMessageDto(reply, VIEWER, new Map()).repliesToMe).toBe(true)
    })

    it("repliesToMe is false when the viewer replies to their own message", () => {
      const reply = row({ authorId: "u1", replyTo: { id: "r1", body: "original", deletedAt: null, author: { id: "u1", name: "Me" }, comment: null, _count: { attachments: 0 } } as never })
      expect(toMessageDto(reply, VIEWER, new Map()).repliesToMe).toBe(false)
    })

    it("repliesToMe is false when the replied-to message has no author (deleted account)", () => {
      const reply = row({ authorId: "other", replyTo: { id: "r1", body: "original", deletedAt: null, author: null, comment: null, _count: { attachments: 0 } } as never })
      expect(toMessageDto(reply, VIEWER, new Map()).repliesToMe).toBe(false)
    })

    it("builds an excerpt from the replied message's own body when present", () => {
      const reply = row({ replyTo: { id: "r1", body: "A fairly long original message body", deletedAt: null, author: { id: "a", name: "A" }, comment: null, _count: { attachments: 2 } } as never })
      const dto = toMessageDto(reply, VIEWER, new Map())
      expect(dto.replyTo).toMatchObject({ id: "r1", authorName: "A", excerpt: "A fairly long original message body", attachmentCount: 2, deleted: false, source: null })
    })

    it("falls back to the comment body for a replied-to mirror row (body null)", () => {
      const reply = row({
        replyTo: {
          id: "r1",
          body: null,
          deletedAt: null,
          author: { id: "a", name: "A" },
          comment: { body: "Original comment text", deletedAt: null, entityType: "pbi", entityId: "pb9" },
          _count: { attachments: 0 },
        } as never,
      })
      const dto = toMessageDto(reply, VIEWER, new Map())
      expect(dto.replyTo).toMatchObject({ excerpt: "Original comment text", deleted: false, source: { entityType: "pbi", entityId: "pb9" } })
    })

    it("marks replyTo deleted when the message itself was deleted", () => {
      const reply = row({ replyTo: { id: "r1", body: "gone", deletedAt: new Date(), author: { id: "a", name: "A" }, comment: null, _count: { attachments: 0 } } as never })
      expect(toMessageDto(reply, VIEWER, new Map()).replyTo?.deleted).toBe(true)
    })

    it("marks a replied-to mirror deleted when its comment is gone/deleted", () => {
      const reply = row({
        replyTo: { id: "r1", body: null, deletedAt: null, author: { id: "a", name: "A" }, comment: { body: "x", deletedAt: new Date(), entityType: "pbi", entityId: "p1" }, _count: { attachments: 0 } } as never,
      })
      expect(toMessageDto(reply, VIEWER, new Map()).replyTo?.deleted).toBe(true)
      const replyNoComment = row({ replyTo: { id: "r1", body: null, deletedAt: null, author: { id: "a", name: "A" }, comment: null, _count: { attachments: 0 } } as never })
      expect(toMessageDto(replyNoComment, VIEWER, new Map()).replyTo?.deleted).toBe(true)
    })

    it("replyTo authorName is null when the author is gone", () => {
      const reply = row({ replyTo: { id: "r1", body: "x", deletedAt: null, author: null, comment: null, _count: { attachments: 0 } } as never })
      expect(toMessageDto(reply, VIEWER, new Map()).replyTo?.authorName).toBeNull()
    })
  })
})

describe("sourceLabelMap", () => {
  it("maps PBIs to '#displayId title' preferring initiative over userStory", () => {
    const map = sourceLabelMap({
      pbis: [{ id: "p1", displayId: 7, initiative: "Dark mode", userStory: "As a user..." }],
      tasks: [],
      icebox: [],
    })
    expect(map.get("p1")).toEqual({ label: "#7 Dark mode" })
  })

  it("falls back to the user story when a PBI has no initiative", () => {
    const map = sourceLabelMap({ pbis: [{ id: "p1", displayId: 7, initiative: null, userStory: "As a user, I want X" }], tasks: [], icebox: [] })
    expect(map.get("p1")).toEqual({ label: "#7 As a user, I want X" })
  })

  it("only takes the first line of a multi-line initiative/userStory", () => {
    const map = sourceLabelMap({ pbis: [{ id: "p1", displayId: 1, initiative: "Line one\nLine two", userStory: null }], tasks: [], icebox: [] })
    expect(map.get("p1")).toEqual({ label: "#1 Line one" })
  })

  it("maps sprint tasks to their task name plus sprint id/name, null label when unnamed", () => {
    const map = sourceLabelMap({ pbis: [], tasks: [{ id: "t1", taskName: "Fix bug", sprintId: "s1", sprint: { sprintName: "Sprint 3" } }], icebox: [] })
    expect(map.get("t1")).toEqual({ label: "Fix bug", sprintId: "s1", sprintName: "Sprint 3" })
    const mapUnnamed = sourceLabelMap({ pbis: [], tasks: [{ id: "t2", taskName: null, sprintId: "s1", sprint: { sprintName: "Sprint 3" } }], icebox: [] })
    expect(mapUnnamed.get("t2")).toEqual({ label: null, sprintId: "s1", sprintName: "Sprint 3" })
  })

  it("maps IceBox items to '#displayId request'", () => {
    const map = sourceLabelMap({ pbis: [], tasks: [], icebox: [{ id: "i1", displayId: 3, request: "Please add X" }] })
    expect(map.get("i1")).toEqual({ label: "#3 Please add X" })
  })
})

describe("sourceIds", () => {
  it("collects unique entity ids grouped by entity type across rows", () => {
    const rows = [
      row({ comment: { id: "c1", entityType: "pbi", entityId: "p1" } as never }),
      row({ comment: { id: "c2", entityType: "pbi", entityId: "p1" } as never }),
      row({ comment: { id: "c3", entityType: "sprint_task", entityId: "t1" } as never }),
      row({ comment: { id: "c4", entityType: "icebox", entityId: "i1" } as never }),
      row({ comment: null }),
    ]
    expect(sourceIds(rows)).toEqual({ pbi: ["p1"], sprint_task: ["t1"], icebox: ["i1"] })
  })

  it("returns empty arrays when no row has a comment", () => {
    expect(sourceIds([row(), row()])).toEqual({ pbi: [], sprint_task: [], icebox: [] })
  })
})
