import { describe, expect, it } from "vitest"
import { linkifyParts } from "../linkify"
import { formatFullDateTime, formatRelativeTime, localeOf } from "../relative-time"
import { asPage } from "../types"
import { toCounts, toMentionMembers } from "../use-comment-thread"
import { filterMembers } from "../comment-composer"

const NOW = new Date("2026-10-10T12:00:00.000Z")
const ago = (ms: number) => new Date(NOW.getTime() - ms).toISOString()

describe("formatRelativeTime", () => {
  it("uses seconds / minutes / hours / days, then a date", () => {
    expect(formatRelativeTime(ago(10_000), NOW, "en")).toBe("now")
    expect(formatRelativeTime(ago(5 * 60_000), NOW, "en")).toBe("5 minutes ago")
    expect(formatRelativeTime(ago(3 * 3_600_000), NOW, "en")).toBe("3 hours ago")
    expect(formatRelativeTime(ago(2 * 86_400_000), NOW, "en")).toBe("2 days ago")
    expect(formatRelativeTime(ago(20 * 86_400_000), NOW, "en")).toBe("Sep 20")
    expect(formatRelativeTime("2025-01-02T00:00:00.000Z", NOW, "en")).toMatch(/2025/)
    expect(formatRelativeTime(ago(5 * 60_000), NOW, "ja")).toBe("5 分前")
  })

  it("empty for invalid dates; locale mapping", () => {
    expect(formatRelativeTime("nope", NOW, "en")).toBe("")
    expect(formatFullDateTime("nope", "en")).toBe("")
    expect(formatFullDateTime(NOW.toISOString(), "en")).toMatch(/2026/)
    expect(localeOf("id")).toBe("id-ID")
    expect(localeOf("fr")).toBe("fr")
  })
})

describe("linkifyParts", () => {
  it("links http(s) URLs only and keeps trailing punctuation as text", () => {
    expect(linkifyParts("see https://example.com/a?b=1. ok")).toEqual([
      { type: "text", text: "see " },
      { type: "url", href: "https://example.com/a?b=1" },
      { type: "text", text: ". ok" },
    ])
    expect(linkifyParts("javascript:alert(1) ftp://x")).toEqual([{ type: "text", text: "javascript:alert(1) ftp://x" }])
    expect(linkifyParts("http://a.jp")).toEqual([{ type: "url", href: "http://a.jp" }])
  })
})

describe("parsers", () => {
  it("asPage tolerates malformed input", () => {
    expect(asPage({ items: [1], nextCursor: "c" })).toEqual({ items: [1], nextCursor: "c" })
    expect(asPage({ items: [], nextCursor: 5 })).toEqual({ items: [], nextCursor: null })
    expect(asPage(null)).toEqual({ items: [], nextCursor: null })
    expect(asPage({ id: "x" })).toEqual({ items: [], nextCursor: null })
  })

  it("toMentionMembers maps members API rows and skips junk", () => {
    expect(toMentionMembers([{ userId: "u1", user: { name: "A" } }, { userId: 1 }, null])).toEqual([{ id: "u1", name: "A" }])
    expect(toMentionMembers({})).toEqual([])
  })

  it("toCounts keeps numeric counts", () => {
    expect(toCounts({ counts: { a: 1, b: "x" } })).toEqual({ a: 1 })
    expect(toCounts({ id: "pbi" })).toEqual({})
    expect(toCounts(null)).toEqual({})
  })

  it("filterMembers: prefix matches first, case / space insensitive, max 8", () => {
    const members = [
      { id: "1", name: "Bob Taro" },
      { id: "2", name: "Taro Yamada" },
      ...Array.from({ length: 10 }, (_, i) => ({ id: `x${i}`, name: `User ${i}` })),
    ]
    expect(filterMembers(members, "taro").map((m) => m.id)).toEqual(["2", "1"])
    expect(filterMembers(members, "tarоx")).toEqual([])
    expect(filterMembers(members, "BobT").map((m) => m.id)).toEqual(["1"])
    expect(filterMembers(members, "")).toHaveLength(8)
  })
})

describe("comments deep link", () => {
  it("targets the item of ?task= / ?item= only with tab=comments", async () => {
    const { commentsDeepLinkTarget, withoutTabParam } = await import("../comments-deep-link")
    expect(commentsDeepLinkTarget("?task=t1&tab=comments", "sprint_task")).toBe("t1")
    expect(commentsDeepLinkTarget("?item=i1&tab=comments", "icebox")).toBe("i1")
    expect(commentsDeepLinkTarget("?task=t1", "sprint_task")).toBeNull()
    expect(commentsDeepLinkTarget("?tab=comments", "sprint_task")).toBeNull()
    expect(commentsDeepLinkTarget("?pbi=1&tab=comments", "pbi")).toBeNull()
    expect(withoutTabParam("?task=t1&tab=comments")).toBe("?task=t1")
    expect(withoutTabParam("?tab=comments")).toBe("")
  })
})
