import { describe, expect, it } from "vitest"
import { parseCollapsed } from "../use-project-list-prefs"

describe("parseCollapsed", () => {
  it("returns an empty map for missing or malformed JSON", () => {
    expect(parseCollapsed(null)).toEqual({})
    expect(parseCollapsed("")).toEqual({})
    expect(parseCollapsed("{not json")).toEqual({})
  })

  it("rejects non-object values (arrays, primitives, null)", () => {
    expect(parseCollapsed("[true,false]")).toEqual({})
    expect(parseCollapsed("true")).toEqual({})
    expect(parseCollapsed("42")).toEqual({})
    expect(parseCollapsed("null")).toEqual({})
  })

  it("keeps boolean entries and drops every non-boolean value", () => {
    const raw = JSON.stringify({ a: true, b: false, c: "true", d: 1, e: null, f: { x: true } })
    expect(parseCollapsed(raw)).toEqual({ a: true, b: false })
  })
})
