import { describe, expect, it } from "vitest"
import { parseLinkable, sortLinkable } from "../hooks/use-plan-links"

describe("plan link picker ordering (A3-06)", () => {
  it("lists open PBIs by number first and done PBIs last, without mutating the input", () => {
    const input = [
      { displayId: 36, status: "done" },
      { displayId: 12, status: "ready" },
      { displayId: 8, status: "done" },
      { displayId: 1, status: "not_ready" },
    ]
    const copy = [...input]
    expect(sortLinkable(input).map((p) => p.displayId)).toEqual([1, 12, 8, 36])
    expect(input).toEqual(copy)
  })

  it("parses both response shapes", () => {
    expect(parseLinkable([{ id: "a" }])).toHaveLength(1)
    expect(parseLinkable({ pbis: [{ id: "a" }, { id: "b" }] })).toHaveLength(2)
    expect(parseLinkable(null)).toEqual([])
  })
})
