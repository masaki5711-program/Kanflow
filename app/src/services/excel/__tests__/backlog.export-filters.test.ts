import { describe, expect, it } from "vitest"
import {
  EXPORT_FILTER_NONE,
  NO_EXPORT_FILTERS,
  hasExportFilters,
  matchesExportFilters,
  parseBacklogExportFilters,
  type FilterableBacklogRow,
} from "../backlog.export-filters"

const row = (over: Partial<FilterableBacklogRow> = {}): FilterableBacklogRow => ({
  displayId: 38,
  status: "ready",
  initiative: "OLE table",
  epic: "Auth",
  userStory: "As a user",
  acceptanceCriteria: null,
  assignedPo: "Hanako",
  workloadScore: 5,
  productGoalId: "g1",
  planItemId: "pl1",
  ...over,
})

describe("backlog export filters (F-09)", () => {
  it("parses the page's URL params; invalid status / points are ignored", () => {
    const f = parseBacklogExportFilters(new URLSearchParams("q=%20Login%20&status=done&points=-1&goal=g1&epic=__none&po=Hanako&plan=pl1&lang=ja"))
    expect(f).toEqual({ q: "login", status: "", goal: "g1", epic: EXPORT_FILTER_NONE, points: "", po: "Hanako", plan: "pl1" })
    expect(hasExportFilters(f)).toBe(true)
    expect(hasExportFilters(parseBacklogExportFilters(new URLSearchParams("lang=en")))).toBe(false)
  })

  it("no filters keeps every row", () => {
    expect(matchesExportFilters(row(), NO_EXPORT_FILTERS)).toBe(true)
  })

  it.each([
    [{ status: "ready" }, true],
    [{ status: "completed" }, false],
    [{ q: "ole" }, true],
    [{ q: "38" }, true],
    [{ q: "billing" }, false],
    [{ goal: "g1" }, true],
    [{ goal: EXPORT_FILTER_NONE }, false],
    [{ epic: "Auth" }, true],
    [{ po: EXPORT_FILTER_NONE }, false],
    [{ points: "5" }, true],
    [{ points: "3" }, false],
    [{ plan: "pl1" }, true],
    [{ plan: "pl2" }, false],
  ])("%o → %s", (patch, expected) => {
    expect(matchesExportFilters(row(), { ...NO_EXPORT_FILTERS, ...patch })).toBe(expected)
  })

  it("FILTER_NONE matches empty fields", () => {
    const empty = row({ productGoalId: null, epic: null, assignedPo: "" })
    expect(matchesExportFilters(empty, { ...NO_EXPORT_FILTERS, goal: EXPORT_FILTER_NONE, epic: EXPORT_FILTER_NONE, po: EXPORT_FILTER_NONE })).toBe(true)
  })
})
