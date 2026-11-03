import { describe, expect, it } from "vitest"
import {
  computeLeafActuals,
  dayDiff,
  loadObserved,
  onHoldDays,
  ownerConcurrency,
  pbiHours,
  pbiMrFacts,
  pbiReopenCount,
  repositoryReadable,
  spanDays,
  type LeafInput,
  type MrLinkInput,
} from "../compute"

// 2026-11-02 is a Monday.
const leaf = (over: Partial<LeafInput> = {}): LeafInput => ({
  planItemId: "a",
  templateKey: "impl",
  name: "実装",
  parentKey: null,
  isMilestone: false,
  templateDays: 5,
  baselineStart: "2026-11-02",
  baselineEnd: "2026-11-06",
  plannedStart: "2026-11-02",
  plannedEnd: "2026-11-06",
  actualStart: "2026-11-02",
  actualEnd: "2026-11-10",
  ownerId: "u1",
  role: "dev",
  status: "done",
  predecessorIds: [],
  ...over,
})
const ctx = (over = {}) => ({ skipWeekends: true, actualEndById: new Map<string, string | null>(), statusHistory: [], ownerIntervals: [], ...over })

describe("days", () => {
  it("snapshot_counts_workdays_when_skip_weekends", () => {
    expect(spanDays("2026-11-02", "2026-11-10", true)).toBe(7) // Mon..Tue next week, weekend skipped
    expect(spanDays("2026-11-02", "2026-11-10", false)).toBe(9)
    expect(spanDays("2026-11-07", "2026-11-08", true)).toBe(0) // a weekend only
    expect(spanDays("2026-11-10", "2026-11-02", false)).toBe(0)
    const a = computeLeafActuals(leaf(), ctx())
    expect(a).toMatchObject({ plannedDays: 5, actualDays: 7, endSlipDays: 2, startSlipDays: 0, complete: true })
  })

  it("dayDiff is signed and counts working days with skipWeekends", () => {
    expect(dayDiff("2026-11-06", "2026-11-10", true)).toBe(2) // Fri → Tue
    expect(dayDiff("2026-11-10", "2026-11-06", true)).toBe(-2)
    expect(dayDiff("2026-11-06", "2026-11-10", false)).toBe(4)
    expect(dayDiff("2026-11-06", "2026-11-06", true)).toBe(0)
  })
})

describe("completeness", () => {
  it("incomplete_leaf_is_kept_but_not_learnable (missing date, reversed dates, over 5 × baseline)", () => {
    expect(computeLeafActuals(leaf({ actualEnd: null }), ctx())).toMatchObject({ complete: false, actualDays: null, issues: [{ kind: "missing_actual" }] })
    expect(computeLeafActuals(leaf({ actualStart: "2026-11-10", actualEnd: "2026-11-02" }), ctx())).toMatchObject({ complete: false, actualDays: null, issues: [{ kind: "start_after_end" }] })
    const long = computeLeafActuals(leaf({ actualEnd: "2027-01-29" }), ctx())
    expect(long.complete).toBe(false)
    expect(long.issues).toEqual([{ planItemId: "a", kind: "actual_over_baseline" }])
    // The days are still kept (the row is stored, only not learned from).
    expect(long.actualDays).toBeGreaterThan(25)
  })

  it("without a baseline nothing is learned (the plan may have been moved to match reality)", () => {
    const a = computeLeafActuals(leaf({ baselineStart: null, baselineEnd: null }), ctx())
    expect(a).toMatchObject({ plannedDays: null, startSlipDays: null, endSlipDays: null, complete: false, issues: [{ kind: "missing_baseline" }] })
  })

  it("an actual or baseline span with no working day is an issue, not a measured 0", () => {
    const a = computeLeafActuals(leaf({ actualStart: "2026-11-07", actualEnd: "2026-11-08" }), ctx())
    expect(a).toMatchObject({ actualDays: 0, complete: false, issues: [{ kind: "empty_span" }] })
    const b = computeLeafActuals(leaf({ baselineStart: "2026-11-07", baselineEnd: "2026-11-08" }), ctx())
    expect(b).toMatchObject({ plannedDays: 0, complete: false })
    expect(b.issues.map((i) => i.kind)).toContain("empty_span")
  })

  it("an unreadable status history makes on-hold days unknown and the leaf an issue", () => {
    const a = computeLeafActuals(leaf(), ctx({ historyUnreadable: true }))
    expect(a).toMatchObject({ onHoldDays: null, complete: false, issues: [{ kind: "history_unreadable" }] })
  })
})

describe("wait gap", () => {
  it("is the working days between the predecessors' last actual end and the start", () => {
    const ends = new Map([
      ["p1", "2026-10-28"],
      ["p2", "2026-10-29"],
    ])
    // p2 ended Thu 10-29; the leaf started Mon 11-02: Fri 10-30 is the only waiting working day.
    expect(computeLeafActuals(leaf({ predecessorIds: ["p1", "p2"] }), ctx({ actualEndById: ends })).waitGapDays).toBe(1)
    expect(computeLeafActuals(leaf({ predecessorIds: ["p1"] }), ctx({ actualEndById: new Map([["p1", "2026-10-30"]]) })).waitGapDays).toBe(0)
    // No predecessor with an actual end: nothing was measured.
    expect(computeLeafActuals(leaf({ predecessorIds: ["p9"] }), ctx()).waitGapDays).toBeNull()
    // One predecessor known, one not: the wait is unknown (the unknown one may have ended later).
    expect(computeLeafActuals(leaf({ predecessorIds: ["p1", "p9"] }), ctx({ actualEndById: new Map([["p1", "2026-10-28"]]) })).waitGapDays).toBeNull()
    expect(computeLeafActuals(leaf(), ctx()).waitGapDays).toBeNull()
  })
})

describe("on hold", () => {
  it("on_hold_days_from_activity_log", () => {
    const history = [
      { at: "2026-11-03", from: "in_progress", to: "on_hold" },
      { at: "2026-11-05", from: "on_hold", to: "in_progress" },
    ]
    // Tue 11-03 and Wed 11-04 on hold.
    expect(onHoldDays("2026-11-02", "2026-11-10", history, "done", true)).toBe(2)
    // A change before the span sets the status at its start.
    expect(onHoldDays("2026-11-04", "2026-11-10", history, "done", true)).toBe(1)
    // Nothing recorded: the status never changed — 0, or unknown when it is on hold now.
    expect(onHoldDays("2026-11-02", "2026-11-10", [], "done", true)).toBe(0)
    expect(onHoldDays("2026-11-02", "2026-11-10", [], "on_hold", true)).toBeNull()
  })
})

describe("owner concurrency", () => {
  it("concurrent_load_stores_no_other_project_names: only spans go in, only numbers come out", () => {
    const others = [
      { start: "2026-11-02", end: "2026-11-03" },
      { start: "2026-11-03", end: "2026-11-04" },
    ]
    const c = ownerConcurrency("2026-11-02", "2026-11-06", others, true)
    // Mon 2, Tue 3, Wed 2, Thu 1, Fri 1 → avg 1.8, peak 3.
    expect(c).toEqual({ avg: 1.8, peak: 3 })
    const a = computeLeafActuals(leaf({ actualEnd: "2026-11-06" }), ctx({ ownerIntervals: others }))
    expect(Object.keys(a).sort()).not.toContain("ownerProjects")
    expect(a).toMatchObject({ ownerConcurrentAvg: 1.8, ownerConcurrentPeak: 3 })
    expect(computeLeafActuals(leaf({ ownerId: null }), ctx({ ownerIntervals: others })).ownerConcurrentPeak).toBeNull()
    // The owner's other spans could not all be read: unknown, not understated.
    expect(computeLeafActuals(leaf({ actualEnd: "2026-11-06" }), ctx({ ownerIntervals: others, ownerIntervalsIncomplete: true })).ownerConcurrentPeak).toBeNull()
  })
})

describe("merge requests", () => {
  const repos = [
    { repositoryId: "api", repositoryRef: "group/api", readable: true },
    { repositoryId: "web", repositoryRef: "group/web", readable: true },
    { repositoryId: "infra", repositoryRef: "group/infra", readable: true },
  ]
  const mr = (repositoryId: string, opened: string, merged: string | null, over: Partial<MrLinkInput> = {}): MrLinkInput => ({
    repositoryId,
    state: merged ? "merged" : "closed",
    openedAt: new Date(opened),
    mergedAt: merged ? new Date(merged) : null,
    versionCount: 2,
    additions: 10,
    deletions: 5,
    ...over,
  })

  it("mr_set_lead_time_spans_all_bound_repositories and per_repo_breakdown_sums_to_item_totals", () => {
    const links = [mr("api", "2026-11-02T00:00:00Z", "2026-11-03T00:00:00Z"), mr("web", "2026-11-02T12:00:00Z", "2026-11-04T00:00:00Z"), mr("infra", "2026-11-03T00:00:00Z", "2026-11-05T00:00:00Z")]
    const f = pbiMrFacts(links, repos)
    // First open (api, 11-02 00:00) → last merge (infra, 11-05 00:00) = 72 h.
    expect(f.mrSetLeadTimeHours).toBe(72)
    expect(f.mrCount).toBe(3)
    expect(f.repos.map((r) => r.repositoryId)).toEqual(["api", "web", "infra"])
    expect(f.repos.reduce((n, r) => n + (r.mrCount ?? 0), 0)).toBe(f.mrCount)
    expect(f.repos.find((r) => r.repositoryId === "web")).toMatchObject({ leadTimeP50Hours: 36, additions: 10, deletions: 5, versionCount: 2 })
  })

  it("closed_unmerged_mr_not_in_set", () => {
    const f = pbiMrFacts([mr("api", "2026-11-01T00:00:00Z", null), mr("api", "2026-11-02T00:00:00Z", "2026-11-03T00:00:00Z")], repos)
    expect(f.mrCount).toBe(1)
    expect(f.mrSetLeadTimeHours).toBe(24)
  })

  it("same_pbi_in_two_repos_counted_once_as_set", () => {
    const f = pbiMrFacts([mr("api", "2026-11-02T00:00:00Z", "2026-11-02T10:00:00Z"), mr("web", "2026-11-02T01:00:00Z", "2026-11-02T08:00:00Z")], repos)
    expect(f.mrSetLeadTimeHours).toBe(10) // one set: 00:00 → 10:00, not 10 + 7
    expect(f.repos).toHaveLength(2)
  })

  it("unreadable_repository_gives_null_not_zero", () => {
    const blind = repos.map((r) => (r.repositoryId === "web" ? { ...r, readable: false } : r))
    const f = pbiMrFacts([mr("api", "2026-11-02T00:00:00Z", "2026-11-03T00:00:00Z"), mr("web", "2026-11-02T00:00:00Z", "2026-11-04T00:00:00Z")], blind)
    expect(f.mrCount).toBeNull()
    expect(f.mrSetLeadTimeHours).toBeNull()
    expect(f.repos.find((r) => r.repositoryId === "web")).toMatchObject({ mrCount: null, leadTimeP50Hours: null })
  })

  it("an unreadable repository with NO known link of the PBI still makes its numbers unknown", () => {
    const blind = repos.map((r) => (r.repositoryId === "infra" ? { ...r, readable: false } : r))
    const f = pbiMrFacts([mr("api", "2026-11-02T00:00:00Z", "2026-11-03T00:00:00Z")], blind)
    expect(f).toMatchObject({ mrCount: null, mrSetLeadTimeHours: null })
    expect(f.repos.find((r) => r.repositoryId === "infra")).toMatchObject({ mrCount: null })
  })

  it("no bound repository, a merged MR without a merge time, or a negative lead are unknown — never 0", () => {
    expect(pbiMrFacts([], [])).toEqual({ mrCount: null, mrSetLeadTimeHours: null, repos: [] })
    expect(pbiMrFacts([mr("api", "2026-11-02T00:00:00Z", null, { state: "merged" })], repos).mrCount).toBeNull()
    const skewed = pbiMrFacts([mr("api", "2026-11-05T00:00:00Z", "2026-11-03T00:00:00Z")], repos)
    expect(skewed.mrSetLeadTimeHours).toBeNull()
    expect(skewed.repos[0].leadTimeP50Hours).toBeNull()
  })

  it("an unknown open time or diff size is null, never 0", () => {
    const f = pbiMrFacts([mr("api", "2026-11-02T00:00:00Z", "2026-11-03T00:00:00Z", { openedAt: null, additions: null })], repos)
    expect(f.mrSetLeadTimeHours).toBeNull()
    expect(f.repos[0]).toMatchObject({ mrCount: 1, leadTimeP50Hours: null, additions: null, deletions: 5 })
    expect(pbiMrFacts([], repos)).toEqual({ mrCount: 0, mrSetLeadTimeHours: null, repos: [] })
  })

  it("a repository is unreadable when never synced, failed last, or awaiting a GitStation re-read", () => {
    const t = new Date("2026-11-02T00:00:00Z")
    const later = new Date("2026-11-02T01:00:00Z")
    expect(repositoryReadable({ syncedAt: later, lastErrorAt: t, stationRereadAt: null })).toBe(true)
    expect(repositoryReadable({ syncedAt: null, lastErrorAt: null, stationRereadAt: null })).toBe(false)
    expect(repositoryReadable({ syncedAt: t, lastErrorAt: later, stationRereadAt: null })).toBe(false)
    expect(repositoryReadable({ syncedAt: later, lastErrorAt: null, stationRereadAt: t })).toBe(false)
  })
})

describe("hours", () => {
  it("sums spent hours, and estimates only of tasks not carried over", () => {
    expect(
      pbiHours([
        { estimatedHours: 4, actualHours: 3, hasCarriedCopy: true },
        { estimatedHours: 2, actualHours: 2.5, hasCarriedCopy: false },
      ]),
    ).toEqual({ effortHours: 5.5, estimatedHours: 2 })
    expect(pbiHours([])).toEqual({ effortHours: null, estimatedHours: null })
  })

  it("one task without recorded hours makes the PBI's effort unknown (no understated partial sum)", () => {
    expect(
      pbiHours([
        { estimatedHours: 4, actualHours: 3, hasCarriedCopy: false },
        { estimatedHours: 2, actualHours: null, hasCarriedCopy: false },
      ]),
    ).toEqual({ effortHours: null, estimatedHours: 6 })
  })

  it("loadObserved is clamped to 0..1.5 and null when unknown", () => {
    expect(loadObserved(15, 4)).toBe(0.5)
    expect(loadObserved(300, 2)).toBe(1.5)
    expect(loadObserved(null, 4)).toBeNull()
    expect(loadObserved(5, null)).toBeNull()
  })

  it("counts reopenings (done → something else)", () => {
    expect(pbiReopenCount([{ from: "ready", to: "done" }, { from: "done", to: "in_progress" }, { from: "in_progress", to: "done" }, { from: "done", to: "ready" }])).toBe(2)
  })
})
