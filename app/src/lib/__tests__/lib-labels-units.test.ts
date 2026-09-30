import { describe, expect, it } from "vitest"
import { getProjectTypeLabels, projectTypeOptions, type ProjectType } from "@/lib/project-type-labels"
import { DEFAULT_POINT_UNIT, POINT_UNIT_OPTIONS, formatPointUnit, getPointScale } from "@/lib/i18n/point-units"
import { hasJapanese, isBilingualText, looksEnglish } from "@/lib/bilingual-detect"
import { projectRoleLabel, projectRoleShortLabel } from "@/lib/project-roles"
import { getTranslations } from "@/lib/i18n"

const pick = (l: { rolePO: string; roleSM: string; roleDev: string }) => [l.rolePO, l.roleSM, l.roleDev]

describe("project-type-labels", () => {
  const types: ProjectType[] = ["software", "process_improvement", "general"]

  it("provides a full, non-empty label set for every language and type", () => {
    const reference = Object.keys(getProjectTypeLabels("software", "ja")).sort()
    for (const lang of ["ja", "en", "id"] as const) {
      for (const type of types) {
        const labels = getProjectTypeLabels(type, lang)
        expect(Object.keys(labels).sort()).toEqual(reference)
        for (const v of Object.values(labels)) expect(typeof v === "string" && v.length > 0).toBe(true)
      }
    }
    expect(getProjectTypeLabels("general", "en")).not.toEqual(getProjectTypeLabels("general", "ja"))
  })

  it("names the PO role in the UI language, not in English, for ja / id (F-13)", () => {
    expect(getProjectTypeLabels("software", "ja").rolePO).toBe("プロダクトオーナー")
    expect(getProjectTypeLabels("software", "id").rolePO).toBe("Pemilik Produk")
    expect(getProjectTypeLabels("software", "en").rolePO).toBe("Product Owner")
  })

  it("localizes every project role; the ja UI never shows English role names (A3-07)", () => {
    expect(pick(getProjectTypeLabels("software", "ja"))).toEqual(["プロダクトオーナー", "スクラムマスター", "開発者"])
    expect(pick(getProjectTypeLabels("software", "id"))).toEqual(["Pemilik Produk", "Scrum Master", "Pengembang"])
    expect(pick(getProjectTypeLabels("software", "en"))).toEqual(["Product Owner", "Scrum Master", "Developer"])
    for (const type of types) {
      for (const role of pick(getProjectTypeLabels(type, "ja"))) expect(role).not.toMatch(/^[A-Za-z ]+$/)
    }
    // Shared (non project-type) fallbacks follow the same wording.
    for (const lang of ["ja", "id", "en"] as const) {
      expect(pick(getTranslations(lang))).toEqual(pick(getProjectTypeLabels("software", lang)))
    }
  })

  it("projectRoleLabel / projectRoleShortLabel map po / sm / dev per language (A3-07)", () => {
    const ja = getProjectTypeLabels("software", "ja")
    expect(["po", "sm", "dev", "guest"].map((r) => projectRoleLabel(r, ja))).toEqual(["プロダクトオーナー", "スクラムマスター", "開発者", "guest"])
    expect(projectRoleLabel("dev", getProjectTypeLabels("process_improvement", "id"))).toBe("Anggota Tim Perbaikan")
    expect(["po", "sm", "dev"].map((r) => projectRoleShortLabel(r, "ja"))).toEqual(["PO", "SM", "Dev"])
    expect(projectRoleShortLabel("dev", "en")).toBe("Dev")
    expect(projectRoleShortLabel("x", "id")).toBe("x")
    expect(["po", "sm", "dev"].map((r) => projectRoleShortLabel(r, "ja", "general"))).toEqual(["オーナー", "ファシリ", "メンバー"])
    expect(["po", "sm", "dev"].map((r) => projectRoleShortLabel(r, "id", "process_improvement"))).toEqual(["Pemilik", "Fasilitator", "Anggota"])
    expect(projectRoleShortLabel("po", "ja", "unknown-type")).toBe("PO")
  })

  it("keeps each short role set in one script, for every project type and language (A3-07)", () => {
    const JA = /[぀-ヿ㐀-鿿]/
    for (const type of ["software", "process_improvement", "general"]) {
      for (const lang of ["ja", "en", "id"] as const) {
        const set = ["po", "sm", "dev"].map((r) => projectRoleShortLabel(r, lang, type))
        const scripts = new Set(set.map((s) => JA.test(s)))
        expect(scripts.size, `${type}/${lang}: ${set.join(",")}`).toBe(1)
        if (lang !== "ja") expect(set.some((s) => JA.test(s))).toBe(false)
      }
    }
  })

  it("names the release import after the backlog, not 'PB' (A3-15)", () => {
    expect(getProjectTypeLabels("software", "ja").releaseImportTitle).toBe("バックログから取り込み")
  })

  it("falls back to ja/software for unknown values", () => {
    const fallback = getProjectTypeLabels("software", "ja")
    expect(getProjectTypeLabels("bogus" as ProjectType, "en")).toBe(fallback)
    expect(getProjectTypeLabels("software", "xx" as "ja")).toBe(fallback)
  })

  it("lists one option per type", () => {
    expect(projectTypeOptions.map((o) => o.value)).toEqual(types)
  })
})

describe("point-units", () => {
  it("returns the scale for each unit with a Fibonacci default", () => {
    expect(getPointScale("SP")).toEqual([0, 1, 2, 3, 5, 8, 13, 21])
    expect(getPointScale("ポイント")).toEqual([0, 1, 2, 3, 5, 8, 13, 21])
    expect(getPointScale("人日")).toEqual([0, 1, 2, 3, 5, 8, 13])
    expect(getPointScale("人時")).toEqual([0, 1, 2, 4, 8, 16, 24])
    expect(getPointScale(null)).toEqual([0, 1, 2, 3, 5, 8, 13, 21])
    expect(POINT_UNIT_OPTIONS).toContain(DEFAULT_POINT_UNIT)
  })

  it("formats known units via translations and passes unknown through", () => {
    const t = { pointUnitManDay: "MD", pointUnitManHour: "MH", pointUnitPoints: "PT", pointUnitSP: "SPx" }
    expect(formatPointUnit("人日", t)).toBe("MD")
    expect(formatPointUnit("人時", t)).toBe("MH")
    expect(formatPointUnit("ポイント", t)).toBe("PT")
    expect(formatPointUnit("SP", t)).toBe("SPx")
    expect(formatPointUnit("hours", t)).toBe("hours")
    expect(formatPointUnit(undefined, t)).toBe("")
  })
})

describe("bilingual-detect", () => {
  it("detects Japanese characters", () => {
    expect(hasJapanese("こんにちは")).toBe(true)
    expect(hasJapanese("カタカナ")).toBe(true)
    expect(hasJapanese("漢字")).toBe(true)
    expect(hasJapanese("Halo dunia")).toBe(false)
  })

  it("separates English from Indonesian", () => {
    expect(looksEnglish("The sprint is behind and tasks are overdue")).toBe(true)
    expect(looksEnglish("Tugas yang belum selesai harus segera ditindaklanjuti")).toBe(false)
    expect(looksEnglish("日本語 the and")).toBe(false)
    expect(looksEnglish("the")).toBe(false)
  })

  it("recognizes JA/ID line pairs", () => {
    expect(isBilingualText("Tugas tertunda\nタスクが遅延\nTim perlu bantuan\nチームに支援が必要")).toBe(true)
  })

  it("rejects single-language, sparse or metadata-only text", () => {
    expect(isBilingualText(null)).toBe(false)
    expect(isBilingualText("")).toBe(false)
    expect(isBilingualText("日本語だけ")).toBe(false)
    expect(isBilingualText("一行目\n二行目")).toBe(false)
    expect(isBilingualText("Satu baris\nDua baris")).toBe(false)
    // Trailing URL / version / short token are not translations.
    expect(isBilingualText("仕様を参照\nhttps://example.com/spec")).toBe(false)
    expect(isBilingualText("リリース\nv2.0.1")).toBe(false)
    // A long single word counts as a candidate.
    expect(isBilingualText("完了しました\nPenyelesaiannya")).toBe(true)
    // Minority side below 30%.
    expect(isBilingualText("一\n二\n三\n四\nsatu dua")).toBe(false)
    // Balanced but grouped (few mixed adjacent pairs).
    expect(isBilingualText("一\n二\n三\nsatu dua\ntiga empat\nlima enam")).toBe(false)
  })
})
