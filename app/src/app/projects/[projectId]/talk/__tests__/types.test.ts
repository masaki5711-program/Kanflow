import { describe, expect, it } from "vitest"
import { tr } from "@/app/__tests__/test-utils"
import { firstUnreadIndex, isImage, sourceHref, sourceText, type TeamMessage } from "../types"

const t = tr("ja")

function msg(id: string, overrides: Partial<TeamMessage> = {}): TeamMessage {
  return {
    id,
    author: { id: "u1", name: "Alice" },
    body: "hi",
    createdAt: "2026-01-01T00:00:00.000Z",
    editedAt: null,
    mentions: [],
    mentionsMe: false,
    repliesToMe: false,
    attachments: [],
    source: null,
    replyTo: null,
    postedToThread: false,
    canDelete: false,
    ...overrides,
  }
}

describe("sourceText", () => {
  it.each([
    ["pbi", t.talkSourcePbi],
    ["sprint_task", t.talkSourceTask],
    ["icebox", t.talkSourceIcebox],
  ] as const)("formats a %s source with its label", (entityType, template) => {
    expect(sourceText(t, { entityType, label: "#5 Login" })).toBe(template.replace("{label}", "#5 Login"))
  })

  it("uses an em dash placeholder when the label is null", () => {
    expect(sourceText(t, { entityType: "pbi", label: null })).toBe(t.talkSourcePbi.replace("{label}", "—"))
  })
})

describe("sourceHref", () => {
  it("links a PBI to the backlog comments tab", () => {
    expect(sourceHref("p1", { entityType: "pbi", entityId: "pb1" })).toBe("/projects/p1/backlog?pbi=pb1&tab=comments")
  })

  it("links a sprint task to the sprints comments tab", () => {
    expect(sourceHref("p1", { entityType: "sprint_task", entityId: "t1" })).toBe("/projects/p1/sprints?task=t1&tab=comments")
  })

  it("links an IceBox item to the icebox comments tab", () => {
    expect(sourceHref("p1", { entityType: "icebox", entityId: "i1" })).toBe("/projects/p1/icebox?item=i1&tab=comments")
  })

  it("URL-encodes the project id and entity id", () => {
    expect(sourceHref("p 1", { entityType: "pbi", entityId: "pb/1" })).toBe("/projects/p%201/backlog?pbi=pb%2F1&tab=comments")
  })
})

describe("isImage", () => {
  it("is true only for image/* mime types", () => {
    expect(isImage("image/png")).toBe(true)
    expect(isImage("application/pdf")).toBe(false)
    expect(isImage("imagex/png")).toBe(false)
  })
})

describe("firstUnreadIndex", () => {
  const messages = [
    msg("a", { author: { id: "u1", name: "Me" }, createdAt: "2026-01-01T00:00:00.000Z" }),
    msg("b", { author: { id: "u2", name: "Other" }, createdAt: "2026-01-02T00:00:00.000Z" }),
    msg("c", { author: { id: "u2", name: "Other" }, createdAt: "2026-01-03T00:00:00.000Z" }),
  ]

  it("returns -1 while the read mark has not loaded yet (undefined)", () => {
    expect(firstUnreadIndex(messages, undefined, "u1")).toBe(-1)
  })

  it("never-read (null mark): the first message from someone else is unread", () => {
    expect(firstUnreadIndex(messages, null, "u1")).toBe(1)
  })

  it("returns the first message from someone else created after the read mark", () => {
    expect(firstUnreadIndex(messages, "2026-01-02T00:00:00.000Z", "u1")).toBe(2)
  })

  it("returns -1 when every message after the read mark is the viewer's own", () => {
    expect(firstUnreadIndex(messages, "2026-01-03T00:00:00.000Z", "u1")).toBe(-1)
  })

  it("with no selfId, every authored message counts (nothing is 'mine')", () => {
    expect(firstUnreadIndex(messages, null, null)).toBe(0)
  })

  it("skips the viewer's own messages even if they are the newest", () => {
    const ownLatest = [...messages, msg("d", { author: { id: "u1", name: "Me" }, createdAt: "2026-01-04T00:00:00.000Z" })]
    expect(firstUnreadIndex(ownLatest, "2026-01-03T00:00:00.000Z", "u1")).toBe(-1)
  })

  it("treats a message with no author as not the viewer's own", () => {
    const withGhost = [msg("g", { author: null, createdAt: "2026-01-05T00:00:00.000Z" })]
    expect(firstUnreadIndex(withGhost, null, "u1")).toBe(0)
  })
})
