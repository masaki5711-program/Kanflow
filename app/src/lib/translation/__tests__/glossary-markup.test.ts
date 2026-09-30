import { describe, expect, test } from "vitest"
import {
  containsTranslation,
  extractGlossaryMarkers,
  glossaryMisses,
  matchGlossary,
  normalizeTerm,
} from "../glossary-markup"

describe("extractGlossaryMarkers — basic form", () => {
  test("Japanese term: same-script run before <<", () => {
    const r = extractGlossaryMarkers("この改善<<KAIZEN>>を進める")
    expect(r.cleaned).toBe("この改善を進める")
    expect(r.entries).toEqual([{ term: "改善", translation: "KAIZEN" }])
  })

  test("Latin term: up to the previous whitespace / punctuation", () => {
    const r = extractGlossaryMarkers("Periksa hasil dekok<<デコック>> segera.")
    expect(r.cleaned).toBe("Periksa hasil dekok segera.")
    expect(r.entries).toEqual([{ term: "dekok", translation: "デコック" }])
  })

  test("katakana term does not swallow preceding kanji", () => {
    const r = extractGlossaryMarkers("治具ライン<<jig line>>")
    expect(r.cleaned).toBe("治具ライン")
    expect(r.entries).toEqual([{ term: "ライン", translation: "jig line" }])
  })
})

describe("extractGlossaryMarkers — explicit form", () => {
  test("<<term|translation>> keeps the term in the text", () => {
    const r = extractGlossaryMarkers("<<生産技術|Teknik Produksi>>の担当")
    expect(r.cleaned).toBe("生産技術の担当")
    expect(r.entries).toEqual([{ term: "生産技術", translation: "Teknik Produksi" }])
  })

  test("empty side is left untouched", () => {
    const r = extractGlossaryMarkers("<<用語|>>のまま")
    expect(r.cleaned).toBe("<<用語|>>のまま")
    expect(r.entries).toEqual([])
  })
})

describe("extractGlossaryMarkers — not markup", () => {
  test("unclosed << is kept", () => {
    const r = extractGlossaryMarkers("a << b")
    expect(r.cleaned).toBe("a << b")
    expect(r.entries).toEqual([])
  })

  test("empty <<>> is kept", () => {
    expect(extractGlossaryMarkers("x<<>>y").cleaned).toBe("x<<>>y")
  })

  test("nested markers are kept verbatim", () => {
    const r = extractGlossaryMarkers("a<<b<<c>>>>")
    expect(r.cleaned).toBe("a<<b<<c>>>>")
    expect(r.entries).toEqual([])
  })

  test("<< right after whitespace has no term", () => {
    const r = extractGlossaryMarkers("word <<x>>")
    expect(r.cleaned).toBe("word <<x>>")
    expect(r.entries).toEqual([])
  })

  test("text without markers is returned unchanged", () => {
    const text = "plain text, no markup >> here"
    expect(extractGlossaryMarkers(text)).toEqual({ cleaned: text, entries: [] })
  })

  test("the same term twice: the later translation wins", () => {
    const r = extractGlossaryMarkers("改善<<A>> と 改善<<B>>")
    expect(r.entries).toEqual([{ term: "改善", translation: "B" }])
    expect(r.cleaned).toBe("改善 と 改善")
  })
})

describe("normalizeTerm", () => {
  test("lowercases Latin, trims Japanese", () => {
    expect(normalizeTerm("  Dekok ")).toBe("dekok")
    expect(normalizeTerm(" 改善 ")).toBe("改善")
  })
})

describe("matchGlossary", () => {
  const candidates = [
    { term: "改善", termNorm: "改善", translation: "KAIZEN" },
    { term: "改善提案", termNorm: "改善提案", translation: "usulan KAIZEN" },
    { term: "Dekok", termNorm: "dekok", translation: "デコック" },
    { term: "OQC", termNorm: "oqc", translation: "OQC" },
  ]

  test("returns contained terms longest first, Latin case-insensitive", () => {
    const r = matchGlossary("この改善提案は dekok に関する", candidates)
    expect(r.map((c) => c.term)).toEqual(["Dekok", "改善提案", "改善"])
  })

  test("honors the limit", () => {
    expect(matchGlossary("改善提案 dekok OQC", candidates, 2)).toHaveLength(2)
  })
})

describe("glossaryMisses / containsTranslation", () => {
  test("Latin translation matches case-insensitively, Japanese exactly", () => {
    expect(containsTranslation("Lakukan kaizen sekarang", "KAIZEN")).toBe(true)
    expect(containsTranslation("改善する", "改善")).toBe(true)
    expect(containsTranslation("かいぜんする", "改善")).toBe(false)
  })

  test("reports the terms whose translation is missing", () => {
    const misses = glossaryMisses("Lakukan kaizen", [
      { term: "改善", translation: "KAIZEN" },
      { term: "治具", translation: "jig" },
    ])
    expect(misses).toEqual(["治具"])
  })
})
