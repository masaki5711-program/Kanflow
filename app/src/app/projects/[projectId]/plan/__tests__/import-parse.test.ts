import { describe, expect, it } from "vitest"
import { parseImportText } from "../lib/import-parse"

const TODAY = "2026-10-14"
const MEMBERS = [
  { id: "u1", name: "山田 太郎" },
  { id: "u2", name: "Suzuki" },
]
const parse = (text: string) => parseImportText(text, TODAY, MEMBERS)

describe("parseImportText", () => {
  it("reads tab-separated rows with dates and owners, skipping a header", () => {
    const { rows } = parse("項目名\t開始\t終了\t担当者\n設計\t10/20\t10/31\t山田\n実装\t2026-11-02\t2026-11-13\tSuzuki")
    expect(rows.map((r) => [r.name, r.start, r.end, r.ownerId, r.error])).toEqual([
      ["設計", "2026-10-20", "2026-10-31", "u1", null],
      ["実装", "2026-11-02", "2026-11-13", "u2", null],
    ])
  })

  it("derives the level from indentation", () => {
    const { rows } = parse("親\n  子\n    孫\n  兄弟\n　全角")
    expect(rows.map((r) => [r.name, r.depth, r.error])).toEqual([
      ["親", 0, null],
      ["子", 1, null],
      ["孫", 2, null],
      ["兄弟", 1, null],
      ["全角", 1, null],
    ])
  })

  it("prefers an explicit level column", () => {
    const { rows } = parse("A\t\t\t\t0\nB\t\t\t\t1\nC\t\t\t\t1")
    expect(rows.map((r) => r.depth)).toEqual([0, 1, 1])
  })

  it("flags bad rows without dropping them", () => {
    const { rows } = parse("\t10/1\t10/2\nX\t10/5\t10/1\nY\t10/5\t\nZ\t\t\tnobody\n    深すぎる")
    expect(rows.map((r) => r.error)).toEqual(["name", "order", "dates", "owner", "depth"])
  })

  it("treats a milestone-style single date and undated rows as valid", () => {
    const { rows } = parse("M\t11/1\t11/1\nU")
    expect(rows.map((r) => r.error)).toEqual([null, null])
    expect(rows[1].start).toBeNull()
  })

  it("keeps commas inside a single-column paste", () => {
    const { rows } = parse("Design, review\nBuild")
    expect(rows.map((r) => [r.name, r.error])).toEqual([["Design, review", null], ["Build", null]])
  })

  it("accepts comma text when there is no tab and keeps blank lines out", () => {
    const { rows } = parse("名前,開始,終了\n\nA,10/20,10/22")
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ name: "A", line: 3, start: "2026-10-20", end: "2026-10-22" })
  })
})
