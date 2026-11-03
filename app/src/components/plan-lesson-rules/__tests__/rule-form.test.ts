import { describe, expect, it } from "vitest"
import { toRuleContent, valuesFromParams } from "../rule-form"

describe("rule editor form model", () => {
  it("turns typed text into the params the server validates", () => {
    expect(toRuleContent("add_buffer", { afterKey: " accept ", days: "3" })).toEqual({ ok: true, kind: "add_buffer", params: { afterKey: "accept", days: 3 } })
    // A decimal comma (id) is read as a decimal point.
    expect(toRuleContent("scale_duration", { key: "test", factor: "1,5" })).toEqual({ ok: true, kind: "scale_duration", params: { key: "test", factor: 1.5 } })
  })

  it("leaves the optional role out of add_prerequisite, but requires it for cap_parallel", () => {
    const pre = toRuleContent("add_prerequisite", { beforeKey: "b", newKey: "n", name: "N", durationDays: "2", role: "" })
    expect(pre).toEqual({ ok: true, kind: "add_prerequisite", params: { beforeKey: "b", newKey: "n", name: "N", durationDays: 2 } })
    expect(toRuleContent("cap_parallel", { role: "", max: "2" })).toEqual({ ok: false, field: "role" })
  })

  it("names the first offending field (out of bounds, empty, not a number)", () => {
    expect(toRuleContent("add_buffer", { afterKey: "a", days: "31" })).toEqual({ ok: false, field: "days" })
    expect(toRuleContent("split", { key: "a", parts: "" })).toEqual({ ok: false, field: "parts" })
    expect(toRuleContent("add_dependency", { from: "a b", to: "c" })).toEqual({ ok: false, field: "from" })
  })

  it("round-trips stored params into form values", () => {
    expect(valuesFromParams({ afterKey: "a", days: 3, junk: { x: 1 } })).toEqual({ afterKey: "a", days: "3" })
  })
})
