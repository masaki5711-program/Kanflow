import { describe, expect, it } from "vitest"
import { scheduleFrom, type ScheduleNode } from "../schedule"

const n = (id: string, over: Partial<ScheduleNode> = {}): ScheduleNode => ({
  id,
  parentId: null,
  sortOrder: 1,
  isMilestone: false,
  durationDays: null,
  plannedStart: null,
  plannedEnd: null,
  ...over,
})

describe("scheduleFrom (日程を仮置き)", () => {
  it("places undated leaves one after another from the start date", () => {
    const nodes = [n("a", { sortOrder: 1, durationDays: 3 }), n("b", { sortOrder: 2, durationDays: 2 }), n("c", { sortOrder: 3 })]
    expect(scheduleFrom(nodes, null, "2026-10-30")).toEqual([
      { id: "a", plannedStart: "2026-10-30", plannedEnd: "2026-11-01" },
      { id: "b", plannedStart: "2026-11-02", plannedEnd: "2026-11-03" },
      // No 目安期間 → one day.
      { id: "c", plannedStart: "2026-11-04", plannedEnd: "2026-11-04" },
    ])
  })

  it("puts a milestone on the last day of its window", () => {
    const nodes = [n("work", { sortOrder: 1, durationDays: 5 }), n("ms", { sortOrder: 2, isMilestone: true, durationDays: 2 }), n("next", { sortOrder: 3, durationDays: 1 })]
    expect(scheduleFrom(nodes, null, "2026-01-01")).toEqual([
      { id: "work", plannedStart: "2026-01-01", plannedEnd: "2026-01-05" },
      { id: "ms", plannedStart: "2026-01-07", plannedEnd: "2026-01-07" },
      { id: "next", plannedStart: "2026-01-08", plannedEnd: "2026-01-08" },
    ])
  })

  it("fills children inside their parent in sortOrder and never writes the parent", () => {
    const nodes = [
      n("p", { sortOrder: 1, durationDays: 99 }),
      n("p2", { parentId: "p", sortOrder: 2, durationDays: 2 }),
      n("p1", { parentId: "p", sortOrder: 1, durationDays: 3 }),
      n("q", { sortOrder: 2, durationDays: 1 }),
    ]
    expect(scheduleFrom(nodes, null, "2026-03-01").map((d) => [d.id, d.plannedStart, d.plannedEnd])).toEqual([
      ["p1", "2026-03-01", "2026-03-03"],
      ["p2", "2026-03-04", "2026-03-05"],
      ["q", "2026-03-06", "2026-03-06"],
    ])
  })

  it("keeps dated leaves and moves the cursor past their end", () => {
    const nodes = [
      n("a", { sortOrder: 1, durationDays: 2 }),
      n("fixed", { sortOrder: 2, plannedStart: "2026-05-10", plannedEnd: "2026-05-20" }),
      n("b", { sortOrder: 3, durationDays: 1 }),
    ]
    expect(scheduleFrom(nodes, null, "2026-05-01")).toEqual([
      { id: "a", plannedStart: "2026-05-01", plannedEnd: "2026-05-02" },
      { id: "b", plannedStart: "2026-05-21", plannedEnd: "2026-05-21" },
    ])
  })

  it("rootIds limit the placement to those subtrees (in sortOrder); unknown ids are ignored", () => {
    const nodes = [n("old", { sortOrder: 1, durationDays: 4 }), n("r2", { sortOrder: 3, durationDays: 1 }), n("r1", { sortOrder: 2, durationDays: 2 })]
    expect(scheduleFrom(nodes, ["r2", "r1", "ghost"], "2026-02-01").map((d) => d.id)).toEqual(["r1", "r2"])
  })

  it("an invalid start date places nothing", () => {
    expect(scheduleFrom([n("a")], null, "2026-02-30")).toEqual([])
  })
})
