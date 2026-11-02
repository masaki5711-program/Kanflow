import { describe, expect, it } from "vitest"
import { compareKeys, compareSortedStreams, type KeyedRow } from "../verify"

async function* rows(list: KeyedRow[]): AsyncIterable<KeyedRow> {
  for (const r of list) yield r
}

const r = (id: string, canon = `["${id}"]`): KeyedRow => ({ key: [id], canon })

describe("compareKeys", () => {
  it("orders text keys by UTF-8 bytes (= MySQL BINARY = PostgreSQL COLLATE \"C\"), not UTF-16 units", () => {
    // U+FF21 (fullwidth A, 3 UTF-8 bytes) sorts before U+1F680 (4 bytes) by bytes and by code point,
    // but after it by UTF-16 code units (0xD83D < 0xFF21).
    expect(compareKeys(["Ａ"], ["\u{1F680}"], ["text"])).toBeLessThan(0)
    expect(compareKeys(["B"], ["a"], ["text"])).toBeLessThan(0)
    expect(compareKeys(["a"], ["a "], ["text"])).toBeLessThan(0)
  })
  it("orders integer keys numerically and compares composite keys left to right", () => {
    expect(compareKeys(["9"], ["10"], ["integer"])).toBeLessThan(0)
    expect(compareKeys(["x", "2"], ["x", "10"], ["text", "integer"])).toBeLessThan(0)
    expect(compareKeys(["x", "2"], ["x", "2"], ["text", "integer"])).toBe(0)
  })
})

describe("compareSortedStreams", () => {
  it("matches identical streams with equal counts and hashes", async () => {
    const list = [r("a"), r("b"), r("c")]
    const c = await compareSortedStreams("T", rows(list), rows([...list]), ["text"])
    expect(c).toMatchObject({ table: "T", sourceRows: 3, targetRows: 3, match: true, differences: [] })
    expect(c.sourceHash).toBe(c.targetHash)
    expect(c.sourceHash).toMatch(/^[0-9a-f]{64}$/)
  })

  it("detects a changed row and names its key", async () => {
    const c = await compareSortedStreams("T", rows([r("a"), r("b"), r("c")]), rows([r("a"), r("b", '["B"]'), r("c")]), ["text"])
    expect(c.match).toBe(false)
    expect(c.sourceRows).toBe(c.targetRows)
    expect(c.sourceHash).not.toBe(c.targetHash)
    expect(c.differences).toEqual([{ kind: "content-differs", key: "b" }])
  })

  it("detects missing and extra rows", async () => {
    const c = await compareSortedStreams("T", rows([r("a"), r("b"), r("d")]), rows([r("a"), r("c"), r("d"), r("e")]), ["text"])
    expect(c.match).toBe(false)
    expect(c.differences).toEqual([
      { kind: "missing-in-target", key: "b" },
      { kind: "extra-in-target", key: "c" },
      { kind: "extra-in-target", key: "e" },
    ])
  })

  it("caps the difference list but keeps counting", async () => {
    const src = Array.from({ length: 50 }, (_, i) => r(String(i).padStart(3, "0")))
    const c = await compareSortedStreams("T", rows(src), rows([]), ["text"], 5)
    expect(c.differences).toHaveLength(5)
    expect(c.differenceCount).toBe(50)
    expect(c.sourceRows).toBe(50)
    expect(c.targetRows).toBe(0)
  })

  it("an empty table on both sides matches", async () => {
    const c = await compareSortedStreams("T", rows([]), rows([]), ["text"])
    expect(c.match).toBe(true)
    expect(c.sourceRows).toBe(0)
  })
})
