import { describe, expect, it } from "vitest"
import { MERGE_HISTORY_PAGE_SIZE, isMergePeriod, isWebUrl, leadTime, mergeHistoryUrl, periodFrom, toMergeHistory } from "./merge-history-model"

const NOW = new Date("2026-11-10T03:00:00.000Z")

const ITEM = {
  id: "r1:42",
  ref: "42",
  title: "PBI-12 ログイン画面",
  url: "https://git.example.test/-/projects/7/pull/42",
  mergedAt: "2026-11-09T01:00:00.000Z",
  openedAt: "2026-11-07T01:00:00.000Z",
  author: "Sato",
  mergedBy: "Suzuki",
  sourceBranch: "feat/PBI-12-login",
  targetBranch: "main",
  repository: { id: "r1", name: "生産管理 API" },
  pbis: [{ id: "b12", displayId: 12, title: "ログインできる" }],
}

describe("merge history request", () => {
  it("knows the period presets", () => {
    expect(isMergePeriod("all")).toBe(true)
    expect(isMergePeriod("90")).toBe(true)
    expect(isMergePeriod("7")).toBe(false)
    expect(isMergePeriod("")).toBe(false)
  })

  it("starts a period N days before now; 'all' has no start", () => {
    expect(periodFrom("all", NOW)).toBeNull()
    expect(periodFrom("30", NOW)).toBe("2026-10-11T03:00:00.000Z")
    expect(periodFrom("365", NOW)).toBe("2025-11-10T03:00:00.000Z")
  })

  it("asks for the newest page of everything by default", () => {
    expect(mergeHistoryUrl("p1", { period: "all", repositoryId: "", cursor: null }, NOW)).toBe(`/api/projects/p1/git/merge-history?limit=${MERGE_HISTORY_PAGE_SIZE}`)
  })

  it("carries the period, the repository and the cursor, encoded", () => {
    const url = mergeHistoryUrl("p 1", { period: "90", repositoryId: "r&1", cursor: "abc=" }, NOW)
    const [path, search] = url.split("?")
    expect(path).toBe("/api/projects/p%201/git/merge-history")
    const params = new URLSearchParams(search)
    expect(params.get("from")).toBe("2026-08-12T03:00:00.000Z")
    expect(params.get("repositoryId")).toBe("r&1")
    expect(params.get("cursor")).toBe("abc=")
    expect(params.get("limit")).toBe(String(MERGE_HISTORY_PAGE_SIZE))
  })
})

describe("isWebUrl", () => {
  it("accepts only http(s) addresses", () => {
    expect(isWebUrl("https://git.example.test/x")).toBe(true)
    expect(isWebUrl("HTTP://git.example.test/x")).toBe(true)
    expect(isWebUrl("javascript:alert(1)")).toBe(false)
    expect(isWebUrl("data:text/html,x")).toBe(false)
    expect(isWebUrl("//git.example.test/x")).toBe(false)
    expect(isWebUrl("")).toBe(false)
  })
})

describe("toMergeHistory", () => {
  it("reads a history as it is", () => {
    expect(toMergeHistory({ enabled: true, items: [ITEM], nextCursor: "c1" })).toEqual({ enabled: true, items: [ITEM], nextCursor: "c1" })
  })

  it("reads an explicit 'off' as off, whatever else the body says", () => {
    expect(toMergeHistory({ enabled: false })).toEqual({ enabled: false, items: [], nextCursor: null })
    expect(toMergeHistory({ enabled: false, items: [ITEM], nextCursor: "c" })).toEqual({ enabled: false, items: [], nextCursor: null })
  })

  it("refuses anything that is not a history (a broken endpoint is not 'off')", () => {
    for (const body of [{}, null, "x", [ITEM], { enabled: "true", items: [ITEM] }, { enabled: true }, { enabled: true, items: "x" }, { error: "x" }]) {
      expect(() => toMergeHistory(body), JSON.stringify(body)).toThrow()
    }
  })

  it("leaves out rows that are not a merge and keeps the rest", () => {
    const history = toMergeHistory({
      enabled: true,
      items: [ITEM, null, { ...ITEM, id: "" }, { ...ITEM, ref: 42 }, { ...ITEM, mergedAt: "yesterday" }, { ...ITEM, mergedAt: null }, { ...ITEM, repository: { name: "x" } }, { ...ITEM, id: "r1:43", ref: "43" }],
      nextCursor: 5,
    })
    expect(history.items.map((i) => i.id)).toEqual(["r1:42", "r1:43"])
    expect(history.nextCursor).toBeNull()
  })

  it("reads unknown values as null and drops PBIs it cannot link", () => {
    const [item] = toMergeHistory({
      enabled: true,
      items: [
        {
          ...ITEM,
          title: null,
          url: 3,
          openedAt: "not a date",
          author: "",
          mergedBy: undefined,
          sourceBranch: 1,
          targetBranch: null,
          repository: { id: "r1" },
          pbis: [{ id: "b1", displayId: 1 }, { id: "b2", displayId: "2", title: "x" }, { displayId: 3 }, { id: "b4", displayId: 4.5 }, "x"],
        },
      ],
    }).items
    expect(item).toEqual({
      ...ITEM,
      title: "",
      url: "",
      openedAt: null,
      author: null,
      mergedBy: null,
      sourceBranch: null,
      targetBranch: null,
      repository: { id: "r1", name: "" },
      pbis: [{ id: "b1", displayId: 1, title: "" }],
    })
  })

  it("reads an empty history and an empty cursor", () => {
    expect(toMergeHistory({ enabled: true, items: [], nextCursor: "" })).toEqual({ enabled: true, items: [], nextCursor: null })
  })
})

describe("leadTime", () => {
  const merged = "2026-11-09T12:00:00.000Z"

  it("is unknown without an opening time or when the times are out of order", () => {
    expect(leadTime(null, merged)).toBeNull()
    expect(leadTime("2026-11-09T12:00:01.000Z", merged)).toBeNull()
    expect(leadTime("not a date", merged)).toBeNull()
  })

  it("is 'under an hour' below 60 minutes", () => {
    expect(leadTime(merged, merged)).toEqual({ unit: "underHour" })
    expect(leadTime("2026-11-09T11:00:01.000Z", merged)).toEqual({ unit: "underHour" })
  })

  it("counts hours up to two days, then days", () => {
    expect(leadTime("2026-11-09T11:00:00.000Z", merged)).toEqual({ unit: "hours", n: 1 })
    expect(leadTime("2026-11-08T13:30:00.000Z", merged)).toEqual({ unit: "hours", n: 23 })
    expect(leadTime("2026-11-07T12:00:01.000Z", merged)).toEqual({ unit: "hours", n: 48 })
    expect(leadTime("2026-11-07T12:00:00.000Z", merged)).toEqual({ unit: "days", n: 2 })
    expect(leadTime("2026-10-30T12:00:00.000Z", merged)).toEqual({ unit: "days", n: 10 })
  })
})
