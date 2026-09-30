import { describe, expect, it } from "vitest"
import { isSearchChange, pagerInfo, resolveTotal } from "./glossary-paging"

describe("glossary paging helpers", () => {
  it("resolveTotal keeps the last known total of the same result set while loading", () => {
    expect(resolveTotal(120, null, "ja|")).toBe(120)
    expect(resolveTotal(undefined, { key: "ja|", total: 120 }, "ja|")).toBe(120)
    expect(resolveTotal(undefined, { key: "ja|", total: 120 }, "id|")).toBe(0)
    expect(resolveTotal(undefined, null, "ja|")).toBe(0)
  })

  it("pagerInfo computes page / pages and clamps", () => {
    expect(pagerInfo(0, 120, 50)).toEqual({ page: 1, pages: 3, hasPrev: false, hasNext: true })
    expect(pagerInfo(50, 120, 50)).toEqual({ page: 2, pages: 3, hasPrev: true, hasNext: true })
    expect(pagerInfo(100, 120, 50)).toEqual({ page: 3, pages: 3, hasPrev: true, hasNext: false })
    expect(pagerInfo(0, 0, 50)).toEqual({ page: 1, pages: 1, hasPrev: false, hasNext: false })
    expect(pagerInfo(500, 120, 50).page).toBe(3)
  })

  it("isSearchChange ignores unchanged / whitespace-only differences", () => {
    expect(isSearchChange("", "")).toBe(false)
    expect(isSearchChange("  kai ", "kai")).toBe(false)
    expect(isSearchChange("kaiz", "kai")).toBe(true)
    expect(isSearchChange("", "kai")).toBe(true)
  })
})
