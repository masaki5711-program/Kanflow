import { describe, expect, it } from "vitest"
import {
  EMPTY_FILTERS,
  FILTER_NONE,
  facetOptions,
  filtersToParams,
  hasActiveFilters,
  matchesFilters,
  parseFilters,
  pbiIdForRef,
  withPbiParam,
} from "../url-state"
import { pbiDeepLink } from "@/components/pbi-form/use-copy-link"
import { pbi } from "./fixtures"

describe("parseFilters", () => {
  it("returns the empty filter set for an empty query", () => {
    expect(parseFilters(new URLSearchParams(""))).toEqual(EMPTY_FILTERS)
  })

  it("reads every facet and the showDone flag", () => {
    const sp = new URLSearchParams("q=login&status=ready&goal=g1&epic=Auth&points=5&po=Hanako&showDone=1&pbi=12")
    expect(parseFilters(sp)).toEqual({
      q: "login",
      status: "ready",
      goal: "g1",
      epic: "Auth",
      points: "5",
      po: "Hanako",
      showDone: true,
    })
  })

  it("drops invalid status / points values instead of failing", () => {
    const f = parseFilters(new URLSearchParams("status=done&points=abc&showDone=yes"))
    expect(f.status).toBe("")
    expect(f.points).toBe("")
    expect(f.showDone).toBe(false)
  })
})

describe("filtersToParams", () => {
  it("applies a patch, removes empty values and keeps unrelated keys (pbi, others)", () => {
    const current = new URLSearchParams("pbi=12&status=ready&foo=bar")
    const next = filtersToParams(current, { status: "", q: "abc", showDone: true })
    expect(next.toString()).toBe("pbi=12&foo=bar&q=abc&showDone=1")
    // input untouched
    expect(current.toString()).toBe("pbi=12&status=ready&foo=bar")
  })

  it("round-trips through parseFilters", () => {
    const f = { ...EMPTY_FILTERS, goal: FILTER_NONE, points: "8", po: "A B" }
    expect(parseFilters(filtersToParams(new URLSearchParams(), f))).toEqual(f)
  })
})

describe("withPbiParam", () => {
  it("sets and removes the pbi param without touching filters", () => {
    const base = new URLSearchParams("q=x")
    expect(withPbiParam(base, "12").toString()).toBe("q=x&pbi=12")
    expect(withPbiParam(new URLSearchParams("q=x&pbi=12"), null).toString()).toBe("q=x")
  })
})

describe("matchesFilters / hasActiveFilters", () => {
  const item = pbi("a", 7, {
    epic: "Auth",
    workloadScore: 5,
    assignedPo: "Hanako",
    productGoalId: "g1",
    status: "ready",
    userStory: "Log in with SSO",
  })

  it("matches every facet", () => {
    expect(matchesFilters(item, EMPTY_FILTERS)).toBe(true)
    expect(matchesFilters(item, { ...EMPTY_FILTERS, q: "sso" })).toBe(true)
    expect(matchesFilters(item, { ...EMPTY_FILTERS, q: "7" })).toBe(true)
    expect(matchesFilters(item, { ...EMPTY_FILTERS, status: "ready", goal: "g1", epic: "Auth", points: "5", po: "Hanako" })).toBe(true)
  })

  it("rejects on any failing facet", () => {
    expect(matchesFilters(item, { ...EMPTY_FILTERS, status: "not_ready" })).toBe(false)
    expect(matchesFilters(item, { ...EMPTY_FILTERS, goal: "g2" })).toBe(false)
    expect(matchesFilters(item, { ...EMPTY_FILTERS, epic: "Billing" })).toBe(false)
    expect(matchesFilters(item, { ...EMPTY_FILTERS, points: "3" })).toBe(false)
    expect(matchesFilters(item, { ...EMPTY_FILTERS, po: "Taro" })).toBe(false)
    expect(matchesFilters(item, { ...EMPTY_FILTERS, q: "billing" })).toBe(false)
  })

  it("supports 'not set' for goal, epic and PO", () => {
    const bare = pbi("b", 8)
    const none = { ...EMPTY_FILTERS, goal: FILTER_NONE, epic: FILTER_NONE, po: FILTER_NONE }
    expect(matchesFilters(bare, none)).toBe(true)
    expect(matchesFilters(item, { ...EMPTY_FILTERS, goal: FILTER_NONE })).toBe(false)
  })

  it("reports active filters (showDone alone is not a filter)", () => {
    expect(hasActiveFilters(EMPTY_FILTERS)).toBe(false)
    expect(hasActiveFilters({ ...EMPTY_FILTERS, showDone: true })).toBe(false)
    expect(hasActiveFilters({ ...EMPTY_FILTERS, q: " " })).toBe(false)
    expect(hasActiveFilters({ ...EMPTY_FILTERS, points: "3" })).toBe(true)
  })
})

describe("facetOptions", () => {
  it("collects distinct sorted goals, epics, points and POs and flags missing values", () => {
    const items = [
      pbi("a", 1, { epic: "B", workloadScore: 8, assignedPo: "Zed", productGoalId: "g2", productGoal: { id: "g2", title: "Two" } }),
      pbi("b", 2, { epic: "A", workloadScore: 3, assignedPo: "Ann", productGoalId: "g1", productGoal: { id: "g1", title: "One" } }),
      pbi("c", 3, { epic: "A", workloadScore: 8 }),
    ]
    const f = facetOptions(items)
    expect(f.goals.map((g) => g.id)).toEqual(["g1", "g2"])
    expect(f.epics).toEqual(["A", "B"])
    expect(f.points).toEqual([3, 8])
    expect(f.pos).toEqual(["Ann", "Zed"])
    expect(f.hasMissing).toEqual({ goal: true, epic: false, po: true })
  })
})

describe("pbiIdForRef", () => {
  const items = [pbi("cku1", 12), pbi("cku2", 13)]

  it("resolves an id, a displayId and #displayId", () => {
    expect(pbiIdForRef("cku2", items)).toBe("cku2")
    expect(pbiIdForRef("12", items)).toBe("cku1")
    expect(pbiIdForRef("#13", items)).toBe("cku2")
  })

  it("passes an unknown id through (the modal reports missing ones) but not an unknown number", () => {
    expect(pbiIdForRef("ckx9", items)).toBe("ckx9")
    expect(pbiIdForRef("99", items)).toBeNull()
    expect(pbiIdForRef("  ", items)).toBeNull()
  })
})

describe("pbiDeepLink", () => {
  it("builds an absolute deep link by displayId", () => {
    expect(pbiDeepLink("http://host:3000", "p1", 12)).toBe("http://host:3000/projects/p1/backlog?pbi=12")
  })
})
