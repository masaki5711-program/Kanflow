import { describe, expect, test } from "vitest"
import { detectLocale, oppositeLocale, sourceHash, splitLegacyPairs } from "../detect-locale"

describe("detectLocale", () => {
  test("returns ja when Japanese characters exceed 15% of the text", () => {
    expect(detectLocale("改善提案を作成する")).toBe("ja")
    expect(detectLocale("SMT ラインの治具を交換")).toBe("ja")
  })

  test("returns id for Indonesian / Latin text", () => {
    expect(detectLocale("Mesin berhenti mendadak di line A")).toBe("id")
    expect(detectLocale("v2.0.1 release")).toBe("id")
  })

  test("returns id for empty text", () => {
    expect(detectLocale("")).toBe("id")
    expect(detectLocale("   ")).toBe("id")
  })

  test("a lone Japanese character in long Latin text stays id", () => {
    expect(detectLocale("Ganti part nomor 12345 sesuai standar 済")).toBe("id")
  })
})

describe("sourceHash", () => {
  test("is stable and ignores surrounding whitespace", () => {
    expect(sourceHash("hello")).toBe(sourceHash("  hello \n"))
    expect(sourceHash("hello")).toHaveLength(64)
  })

  test("changes when the text changes", () => {
    expect(sourceHash("hello")).not.toBe(sourceHash("hello!"))
  })
})

describe("oppositeLocale", () => {
  test("flips ja and id", () => {
    expect(oppositeLocale("ja")).toBe("id")
    expect(oppositeLocale("id")).toBe("ja")
  })
})

describe("splitLegacyPairs", () => {
  test("splits alternating ID / JA lines into both sides", () => {
    const text = "Ganti jig di line SMT\nSMT ラインの治具を交換する\n\nPeriksa hasil OQC\nOQC の結果を確認する"
    expect(splitLegacyPairs(text)).toEqual({
      ja: "SMT ラインの治具を交換する\nOQC の結果を確認する",
      id: "Ganti jig di line SMT\nPeriksa hasil OQC",
    })
  })

  test("returns null for single-language text", () => {
    expect(splitLegacyPairs("改善提案を作成する\n期限は来週")).toBeNull()
    expect(splitLegacyPairs("Buat proposal kaizen")).toBeNull()
  })
})
