import { describe, expect, it } from "vitest"
import { draftWindowHours, formatDailyScrumDraft, formatReleaseNote, reportLang } from "../git-reports"

describe("git-reports", () => {
  it("a Monday (JST) looks back over the weekend", () => {
    expect(draftWindowHours(new Date("2026-10-19T01:00:00Z"))).toBe(72)
    expect(draftWindowHours(new Date("2026-10-20T01:00:00Z"))).toBe(24)
  })

  it("builds one line per active PBI and says so when nothing happened", () => {
    const pbi = { displayId: 12, title: "Login", merged: [{ ref: "34", title: "PBI-12 form", author: "Yamada" }], opened: [], commits: 2 }
    const text = formatDailyScrumDraft([pbi, { displayId: 3, title: "Idle", merged: [], opened: [], commits: 0 }], 24, "ja")
    expect(text).toBe("【Git の動き（直近 24 時間）】\n- PBI-12 Login: マージ !34 PBI-12 form (Yamada) / コミット 2 件")
    expect(formatDailyScrumDraft([], 24, "en")).toContain("No Git activity")
  })

  it("release note groups merged MRs by PBI and links them", () => {
    const note = formatReleaseNote({ name: "S1", from: "2026-10-01", to: "2026-10-14" },
      [{ displayId: 1, title: "A", mrs: [{ ref: "5", title: "do A", url: "https://g/5", author: null }] }, { displayId: 2, title: "B", mrs: [] }], "en")
    expect(note).toContain("# S1 release notes")
    expect(note).toContain("Merged MRs: 1 / PBIs: 1")
    expect(note).toContain("- [!5](https://g/5) do A")
    expect(note).not.toContain("PBI-2")
  })

  it("release note of a sprint without merges says so; unknown language falls back to ja", () => {
    expect(formatReleaseNote({ name: "S", from: "a", to: "b" }, [], "ja")).toContain("マージされた MR はありません")
    expect(reportLang("zz")).toBe("ja")
    expect(reportLang("id")).toBe("id")
  })
})
