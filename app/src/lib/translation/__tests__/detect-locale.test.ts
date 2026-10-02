import { describe, expect, test } from "vitest"
import { detectJaOrId, detectLatinLocale, detectLocale, oppositeLocale, sourceHash, splitLegacyPairs, targetsFor } from "../detect-locale"

describe("detectLocale", () => {
  test("returns ja when Japanese characters exceed 15% of the text", () => {
    expect(detectLocale("改善提案を作成する")).toBe("ja")
    expect(detectLocale("SMT ラインの治具を交換")).toBe("ja")
  })

  test("returns id for Indonesian / Latin text", () => {
    expect(detectLocale("Mesin berhenti mendadak di line A")).toBe("id")
    expect(detectLocale("v2.0.1 release")).toBe("id")
  })

  test("returns id for a longer Indonesian sentence", () => {
    expect(detectLocale("Yang harus dilakukan adalah memeriksa mesin sebelum produksi dimulai")).toBe("id")
  })

  test("returns en for a clearly English sentence", () => {
    expect(detectLocale("The sprint review meeting is scheduled for tomorrow afternoon")).toBe("en")
  })

  test("returns en for a short English phrase with no Indonesian words", () => {
    expect(detectLocale("Open the gate")).toBe("en")
  })

  test("returns id for product codes / mixed text with no decisive function words", () => {
    expect(detectLocale("PN12345-REV03")).toBe("id")
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

describe("detectLatinLocale", () => {
  test("Indonesian sentence stays id even with a stray English-looking word", () => {
    expect(detectLatinLocale("Mesin berhenti mendadak di line A untuk is diperiksa")).toBe("id")
  })

  test("English sentence wins when its function words clearly outnumber Indonesian ones", () => {
    expect(detectLatinLocale("We should check this with the supervisor before we continue")).toBe("en")
  })

  test("short English phrase (<=6 words, no Indonesian words, at least one English word) → en", () => {
    expect(detectLatinLocale("Please check this now")).toBe("en")
    expect(detectLatinLocale("Open the gate")).toBe("en")
  })

  test("no decisive words (product codes) → id (factory floor default)", () => {
    expect(detectLatinLocale("PN12345-REV03")).toBe("id")
    expect(detectLatinLocale("")).toBe("id")
  })

  test("a long neutral Latin sentence with no clear winner stays id", () => {
    expect(detectLatinLocale("Line SMT 02 03 04 05 06")).toBe("id")
  })
})

describe("detectJaOrId", () => {
  test("Japanese text → ja", () => {
    expect(detectJaOrId("改善提案を作成する")).toBe("ja")
  })

  test("Indonesian text → id", () => {
    expect(detectJaOrId("Mesin berhenti mendadak di line A")).toBe("id")
  })

  test("English text collapses to id (glossary only knows ja/id)", () => {
    expect(detectJaOrId("The sprint review meeting is scheduled for tomorrow")).toBe("id")
  })
})

describe("targetsFor", () => {
  test("ja fills id then en", () => {
    expect(targetsFor("ja")).toEqual(["id", "en"])
  })

  test("id fills ja then en", () => {
    expect(targetsFor("id")).toEqual(["ja", "en"])
  })

  test("en fills ja then id (English is last when it is the source)", () => {
    expect(targetsFor("en")).toEqual(["ja", "id"])
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
