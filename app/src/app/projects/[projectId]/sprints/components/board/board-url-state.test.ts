import { describe, expect, it } from "vitest"
import { parseBoardParams, parseStoredView, storedViewKey, withBoardParams } from "./board-url-state"

const params = (qs: string) => new URLSearchParams(qs)

describe("parseBoardParams", () => {
  it("returns defaults (no explicit view) for an empty query", () => {
    expect(parseBoardParams(params(""))).toEqual({ view: null, swimlane: "none", filter: { assignee: "", query: "" } })
  })

  it("reads view, swimlane, assignee and text", () => {
    expect(parseBoardParams(params("view=board&swim=pbi&assignee=me&q=login"))).toEqual({
      view: "board", swimlane: "pbi", filter: { assignee: "me", query: "login" },
    })
    expect(parseBoardParams(params("view=list&assignee=unassigned")).filter.assignee).toBe("unassigned")
    expect(parseBoardParams(params("assignee=cmf1a2b3c4d5e6")).filter.assignee).toBe("cmf1a2b3c4d5e6")
  })

  it("ignores invalid or oversized values (URL is untrusted)", () => {
    const parsed = parseBoardParams(params(`view=grid&swim=x&assignee=${encodeURIComponent("<script>")}&q=${"a".repeat(300)}`))
    expect(parsed.view).toBeNull()
    expect(parsed.swimlane).toBe("none")
    expect(parsed.filter.assignee).toBe("")
    expect(parsed.filter.query).toHaveLength(100)
  })
})

describe("withBoardParams", () => {
  it("sets the board view and keeps unrelated params (e.g. a PBI deep link)", () => {
    expect(withBoardParams("pbi=42", { view: "board" })).toBe("pbi=42&view=board")
  })

  it("drops default values so URLs stay short", () => {
    expect(withBoardParams("view=board&swim=pbi&assignee=me&q=x", { view: "list", swimlane: "none", assignee: "", query: "  " })).toBe("")
  })

  it("updates only the patched keys", () => {
    expect(withBoardParams("view=board&assignee=me", { query: "api" })).toBe("view=board&assignee=me&q=api")
    expect(withBoardParams("view=board&assignee=me", { assignee: "u2" })).toBe("view=board&assignee=u2")
  })
})

describe("stored view preference", () => {
  it("is keyed per user", () => {
    expect(storedViewKey("u1")).toBe("kanflow:sprintView:u1")
    expect(storedViewKey(null)).toBe("kanflow:sprintView:anonymous")
  })

  it("accepts only known values", () => {
    expect(parseStoredView("board")).toBe("board")
    expect(parseStoredView("list")).toBe("list")
    expect(parseStoredView("nope")).toBeNull()
    expect(parseStoredView(null)).toBeNull()
  })
})
