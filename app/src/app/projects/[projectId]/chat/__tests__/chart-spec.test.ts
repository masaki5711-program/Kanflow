import { describe, expect, it } from "vitest"
import { parseChartSpec } from "../chart-spec"

const valid = {
  type: "bar",
  title: "Velocity",
  x: "sprint",
  series: [{ key: "pts", label: "Points" }],
  data: [{ sprint: "S1", pts: 8 }],
}

describe("parseChartSpec", () => {
  it("parses a valid spec", () => {
    expect(parseChartSpec(JSON.stringify(valid))).toEqual(valid)
  })

  it("returns null for invalid / incomplete JSON", () => {
    expect(parseChartSpec('{"type": "bar", "x":')).toBeNull()
    expect(parseChartSpec("null")).toBeNull()
    expect(parseChartSpec("42")).toBeNull()
  })

  it.each([
    ["unknown type", { ...valid, type: "scatter" }],
    ["missing x", { ...valid, x: "" }],
    ["non-string x", { ...valid, x: 3 }],
    ["empty data", { ...valid, data: [] }],
    ["non-array data", { ...valid, data: {} }],
    ["empty series", { ...valid, series: [] }],
    ["series without keys", { ...valid, series: [{ label: "x" }, null, 3] }],
    ["data of primitives only", { ...valid, data: [1, null, "a"] }],
  ])("rejects %s", (_name, spec) => {
    expect(parseChartSpec(JSON.stringify(spec))).toBeNull()
  })

  it("drops invalid entries, non-string labels/titles and caps series and points", () => {
    const spec = parseChartSpec(
      JSON.stringify({
        type: "line",
        title: 5,
        x: "k",
        series: [{ key: "a", label: 1 }, { nope: true }, { key: "b" }, { key: "c" }, { key: "d" }, { key: "e" }, { key: "f" }],
        data: [...Array.from({ length: 60 }, (_, i) => ({ k: i })), null],
      }),
    )
    expect(spec).not.toBeNull()
    expect(spec!.title).toBeUndefined()
    expect(spec!.series).toEqual([{ key: "a", label: undefined }, { key: "b", label: undefined }, { key: "c", label: undefined }, { key: "d", label: undefined }])
    expect(spec!.data).toHaveLength(50)
  })
})
