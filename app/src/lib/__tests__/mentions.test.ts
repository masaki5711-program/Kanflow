import { describe, expect, it } from "vitest"
import {
  activeMentionQuery,
  commentExcerpt,
  extractMentionNames,
  mentionToken,
  mentionsToPlainText,
  resolveMentionUserIds,
  splitMentionSegments,
} from "@/lib/mentions"

const MEMBERS = [
  { id: "u1", name: "Taro Yamada" },
  { id: "u2", name: "Hanako" },
  { id: "u3", name: "山田 花子" },
  { id: "u4", name: "Kenji" },
  { id: "u5", name: "kenji" },
]

describe("splitMentionSegments", () => {
  it("splits bracket and bare mentions and keeps the text lossless", () => {
    const body = "Hi @[Taro Yamada] and @Hanako, see this."
    const segs = splitMentionSegments(body)
    expect(segs).toEqual([
      { type: "text", text: "Hi " },
      { type: "mention", name: "Taro Yamada", raw: "@[Taro Yamada]", bracket: true },
      { type: "text", text: " and " },
      { type: "mention", name: "Hanako", raw: "@Hanako", bracket: false },
      { type: "text", text: ", see this." },
    ])
    expect(segs.map((s) => (s.type === "text" ? s.text : s.raw)).join("")).toBe(body)
  })

  it("ignores e-mail addresses and a lone @", () => {
    expect(splitMentionSegments("mail taro@example.com @ now")).toEqual([
      { type: "text", text: "mail taro@example.com @ now" },
    ])
  })

  it("strips trailing punctuation (incl. Japanese) from bare tokens", () => {
    expect(extractMentionNames("@Hanako。ありがとう @Kenji!")).toEqual(["Hanako", "Kenji"])
  })

  it("handles mentions at the start, after Japanese text and on new lines", () => {
    expect(extractMentionNames("@[山田 花子]さん\n確認お願いします @Kenji")).toEqual(["山田 花子", "Kenji"])
  })

  it("keeps text made only of punctuation after @ as text", () => {
    expect(splitMentionSegments("x @!!")).toEqual([{ type: "text", text: "x @!!" }])
  })

  it("extractMentionNames de-duplicates", () => {
    expect(extractMentionNames("@Hanako @Hanako @[Hanako]")).toEqual(["Hanako"])
  })
})

describe("resolveMentionUserIds", () => {
  it("resolves names with spaces via the bracket form and bare names", () => {
    expect(resolveMentionUserIds("@[Taro Yamada] @Hanako @[山田 花子]", MEMBERS)).toEqual(["u1", "u2", "u3"])
  })

  it("matches case-insensitively and ignoring spaces, once per user", () => {
    expect(resolveMentionUserIds("@hanako @TaroYamada @[taro yamada]", MEMBERS)).toEqual(["u2", "u1"])
  })

  it("drops unknown and ambiguous names", () => {
    // "KENJI" is ambiguous (Kenji / kenji at the case-insensitive tier)
    expect(resolveMentionUserIds("@Nobody @KENJI", MEMBERS)).toEqual([])
    // exact tier decides first
    expect(resolveMentionUserIds("@Kenji", MEMBERS)).toEqual(["u4"])
  })
})

describe("helpers", () => {
  it("mentionToken drops closing brackets and line breaks", () => {
    expect(mentionToken("Taro Yamada")).toBe("@[Taro Yamada]")
    expect(mentionToken(" a]b\n ")).toBe("@[ab]")
  })

  it("mentionsToPlainText flattens bracket tokens", () => {
    expect(mentionsToPlainText("cc @[Taro Yamada], @Hanako")).toBe("cc @Taro Yamada, @Hanako")
  })

  it("commentExcerpt collapses whitespace and cuts to max chars", () => {
    expect(commentExcerpt("a\n\n  b @[Taro Yamada]")).toBe("a b @Taro Yamada")
    const long = commentExcerpt("x".repeat(200))
    expect(long).toHaveLength(120)
    expect(long.endsWith("…")).toBe(true)
    expect(commentExcerpt("abcdef", 4)).toBe("abc…")
  })
})

describe("activeMentionQuery", () => {
  it("finds the query being typed after @", () => {
    expect(activeMentionQuery("hello @Ta", 9)).toEqual({ start: 6, query: "Ta" })
    expect(activeMentionQuery("@", 1)).toEqual({ start: 0, query: "" })
    expect(activeMentionQuery("(@ha", 4)).toEqual({ start: 1, query: "ha" })
    expect(activeMentionQuery("@Taro Ya", 8)).toEqual({ start: 0, query: "Taro Ya" })
  })

  it("returns null outside a mention query", () => {
    expect(activeMentionQuery("no mention", 10)).toBeNull()
    expect(activeMentionQuery("taro@exa", 8)).toBeNull()
    expect(activeMentionQuery("@[Taro] x", 9)).toBeNull()
    expect(activeMentionQuery("@ta\nx", 5)).toBeNull()
    expect(activeMentionQuery("@a b c d", 8)).toBeNull()
    expect(activeMentionQuery("@" + "x".repeat(101), 102)).toBeNull()
  })
})
