import { describe, expect, it } from "vitest"
import type { ReactionSummary } from "@/services/reactions/reactions.schemas"
import { applyToggle, reactionTitle } from "./reaction-utils"

const s = (emoji: ReactionSummary["emoji"], count: number, mine: boolean, users: string[] = []): ReactionSummary => ({ emoji, count, mine, users })

describe("applyToggle", () => {
  it("adds a new emoji in palette order", () => {
    const out = applyToggle([s("👍", 1, false), s("👀", 2, false)], "🎉")
    expect(out.map((r) => r.emoji)).toEqual(["👍", "🎉", "👀"])
    expect(out[1]).toMatchObject({ count: 1, mine: true })
  })

  it("joins an existing emoji", () => {
    expect(applyToggle([s("👍", 2, false)], "👍")).toEqual([s("👍", 3, true)])
  })

  it("takes back my own reaction and drops the chip when it was the last one", () => {
    expect(applyToggle([s("👍", 3, true)], "👍")).toEqual([s("👍", 2, false)])
    expect(applyToggle([s("👍", 1, true), s("❤️", 1, false)], "👍")).toEqual([s("❤️", 1, false)])
  })

  it("does not change its input", () => {
    const input = Object.freeze([Object.freeze(s("👍", 1, false))])
    expect(() => applyToggle(input, "👍")).not.toThrow()
    expect(input[0].count).toBe(1)
  })
})

describe("reactionTitle", () => {
  const more = (n: number) => `+${n}`
  it("lists the names, and says how many more when the list is cut", () => {
    expect(reactionTitle(s("👍", 2, false, ["A", "B"]), more)).toBe("A, B")
    expect(reactionTitle(s("👍", 12, false, ["A", "B"]), more)).toBe("A, B, +10")
  })
})
