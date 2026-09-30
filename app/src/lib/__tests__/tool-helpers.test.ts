import { describe, expect, it } from "vitest"
import {
  daysBetween, findSimilarPairs, intArg, mostSimilar, normalizeTitle, parseDisplayId, pct, strArg, titleSimilarity, trunc,
} from "@/lib/tool-helpers"

describe("argument helpers", () => {
  it("clamps integer args with a fallback", () => {
    expect(intArg(undefined, 7, 1, 30)).toBe(7)
    expect(intArg("abc", 7, 1, 30)).toBe(7)
    expect(intArg(99, 7, 1, 30)).toBe(30)
    expect(intArg("0", 7, 1, 30)).toBe(1)
    expect(intArg(3.9, 7, 1, 30)).toBe(3)
  })

  it("trims string args and rejects blanks / non-strings", () => {
    expect(strArg("  x  ")).toBe("x")
    expect(strArg("   ")).toBeUndefined()
    expect(strArg(5)).toBeUndefined()
    expect(strArg("abcdef", 3)).toBe("abc")
  })

  it("parses display ids", () => {
    expect(parseDisplayId("#12")).toBe(12)
    expect(parseDisplayId(" 7 ")).toBe(7)
    expect(parseDisplayId(3)).toBe(3)
    expect(parseDisplayId("PBI-3")).toBeNull()
    expect(parseDisplayId(0)).toBeNull()
    expect(parseDisplayId(null)).toBeNull()
  })

  it("formats numbers and text", () => {
    expect(pct(1, 3)).toBe(33)
    expect(pct(1, 0)).toBeNull()
    expect(trunc("  a   b  ", 10)).toBe("a b")
    expect(trunc("abcdef", 3)).toBe("abc…")
    expect(daysBetween(new Date("2026-01-01"), new Date("2026-01-11"))).toBe(10)
  })
})

describe("title similarity", () => {
  it("normalizes width, case, spaces and punctuation", () => {
    expect(normalizeTitle("Ｌｏｇｉｎ  画面！")).toBe("login画面")
  })

  it("scores identical / similar / unrelated titles", () => {
    expect(titleSimilarity("ログイン画面の改善", "ログイン画面の改善")).toBe(1)
    expect(titleSimilarity("ログイン画面の改善", "ログイン画面を改善する")).toBeGreaterThan(0.6)
    expect(titleSimilarity("Export to Excel", "Login with SSO")).toBeLessThan(0.3)
    expect(titleSimilarity("", "x")).toBe(0)
  })

  it("finds similar pairs, most similar first", () => {
    const pairs = findSimilarPairs([
      { key: "a", title: "CSV export of backlog" },
      { key: "b", title: "Backlog CSV export" },
      { key: "c", title: "Dark mode" },
      { key: "d", title: "CSV export of the backlog" },
    ])
    expect(pairs.map((p) => `${p.a}-${p.b}`)).toEqual(expect.arrayContaining(["a-b", "a-d"]))
    expect(pairs[0].similarity).toBeGreaterThanOrEqual(pairs[pairs.length - 1].similarity)
    expect(pairs.some((p) => p.a === "c" || p.b === "c")).toBe(false)
  })

  it("returns the most similar items above the threshold", () => {
    const out = mostSimilar("SSO login", [
      { key: "1", title: "SSO login support" },
      { key: "2", title: "Gantt colors" },
    ])
    expect(out.map((o) => o.key)).toEqual(["1"])
  })
})
