import { describe, expect, it } from "vitest"
import { formatKey, TableVerifier, type VerifyRow } from "../verify"

const r = (id: string, canon = `["${id}"]`): VerifyRow => ({ key: id, canon })
const map = (rows: VerifyRow[]): Map<string, string> => new Map(rows.map((x) => [x.key, x.canon]))

describe("TableVerifier (source chunks in key order, target rows looked up by key)", () => {
  it("matches identical data with equal counts and hashes, across chunks", () => {
    const v = new TableVerifier("T")
    v.addChunk([r("a"), r("b")], map([r("a"), r("b")]))
    v.addChunk([r("c")], map([r("c")]))
    const c = v.result(3, 3)
    expect(c).toMatchObject({ table: "T", sourceRows: 3, targetRows: 3, match: true, differences: [], differenceCount: 0 })
    expect(c.sourceHash).toBe(c.targetHash)
    expect(c.sourceHash).toMatch(/^[0-9a-f]{64}$/)
  })

  it("names a changed row", () => {
    const v = new TableVerifier("T")
    v.addChunk([r("a"), r("b"), r("c")], map([r("a"), r("b", '["B"]'), r("c")]))
    const c = v.result(3, 3)
    expect(c.match).toBe(false)
    expect(c.sourceHash).not.toBe(c.targetHash)
    expect(c.differences).toEqual([{ kind: "content-differs", key: "b" }])
  })

  it("names missing rows and the extra rows reported by the extra-key pass", () => {
    const v = new TableVerifier("T")
    v.addChunk([r("a"), r("b"), r("d")], map([r("a"), r("d")]))
    expect(v.matched).toBe(2)
    v.addExtras(["c", "e"])
    const c = v.result(3, 4)
    expect(c.match).toBe(false)
    expect(c.differences).toEqual([
      { kind: "missing-in-target", key: "b" },
      { kind: "extra-in-target", key: "c" },
      { kind: "extra-in-target", key: "e" },
    ])
    expect(c.differenceCount).toBe(3)
  })

  it("a count difference alone is a mismatch", () => {
    const v = new TableVerifier("T")
    v.addChunk([r("a")], map([r("a")]))
    expect(v.result(1, 2).match).toBe(false)
  })

  it("caps the difference list but keeps counting", () => {
    const v = new TableVerifier("T", 5)
    v.addChunk(
      Array.from({ length: 50 }, (_, i) => r(String(i))),
      new Map(),
    )
    const c = v.result(50, 0)
    expect(c.differences).toHaveLength(5)
    expect(c.differenceCount).toBe(50)
  })

  it("an empty table on both sides matches", () => {
    expect(new TableVerifier("T").result(0, 0).match).toBe(true)
  })
})

describe("formatKey", () => {
  it("prints single keys bare and composite keys as JSON", () => {
    expect(formatKey(["a"])).toBe("a")
    expect(formatKey(["a", "1"])).toBe('["a","1"]')
  })
})
