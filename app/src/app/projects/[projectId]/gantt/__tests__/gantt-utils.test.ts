import { describe, expect, it } from "vitest"
import type { Sprint, SprintItem } from "../gantt-types"
import {
  addDays,
  buildDateColumns,
  buildRows,
  computeTimeline,
  daysBetween,
  eventFlagColor,
  formatDate,
  getInitials,
  groupItemsByPbi,
  isRealTask,
  localeOf,
  pbiDonePercent,
  sortSprints,
  sprintDonePercent,
  sprintGradient,
  sprintTone,
  startOfDay,
  taskBarColor,
  taskBarRange,
  taskTone,
} from "../gantt-utils"

const pb = (id: string) => ({ id, displayId: 1, initiative: null, epic: null, userStory: null, workloadScore: 0 })
const item = (id: string, pbId: string, taskName: string | null, status = "todo"): SprintItem => ({
  id,
  taskName,
  assignee: null,
  estimatedHours: null,
  actualHours: null,
  status,
  pbItem: pb(pbId),
})
const sprint = (id: string, startDate: string, endDate: string, items: SprintItem[] = []): Sprint => ({
  id,
  sprintName: id,
  startDate,
  endDate,
  sprintGoal: null,
  capacity: 10,
  actualScore: 0,
  status: "active",
  items,
})

describe("gantt-utils date helpers", () => {
  it("computes day differences and local-midnight dates", () => {
    const a = new Date(2026, 0, 1, 15)
    expect(startOfDay(a)).toEqual(new Date(2026, 0, 1))
    expect(addDays(a, 3)).toEqual(new Date(2026, 0, 4))
    expect(daysBetween(new Date(2026, 0, 1), new Date(2026, 0, 11))).toBe(10)
  })

  it("maps languages to locales with an en-US fallback", () => {
    expect(localeOf("ja")).toBe("ja-JP")
    expect(localeOf("id")).toBe("id-ID")
    expect(localeOf("xx" as never)).toBe("en-US")
  })

  it("formats short dates", () => {
    expect(formatDate(new Date(2026, 2, 5), "en-US")).toBe("Mar 5")
  })
})

describe("task grouping", () => {
  it("treats blank task names as placeholders", () => {
    expect(isRealTask(item("a", "p", "  "))).toBe(false)
    expect(isRealTask(item("a", "p", null))).toBe(false)
    expect(isRealTask(item("a", "p", "Do"))).toBe(true)
  })

  it("keeps empty PBIs but only real tasks in each group", () => {
    const groups = groupItemsByPbi([
      item("1", "p1", null),
      item("2", "p1", "A"),
      item("3", "p2", ""),
      item("4", "p1", "B"),
      item("5", "p2", null),
    ])
    expect(groups.map((g) => g.pbItem.id)).toEqual(["p1", "p2"])
    expect(groups[0].tasks.map((t) => t.id)).toEqual(["2", "4"])
    expect(groups[1].tasks).toEqual([])
  })

  it("computes initials from ascii and full-width spaces", () => {
    expect(getInitials("taro yamada")).toBe("TY")
    expect(getInitials("山田　太郎")).toBe("山太")
    expect(getInitials("a b c")).toBe("AB")
  })

  it("computes done percentages ignoring placeholders", () => {
    expect(pbiDonePercent([])).toBe(0)
    expect(pbiDonePercent([item("1", "p", "a", "done"), item("2", "p", "b"), item("3", "p", "c")])).toBe(33)
    const s = sprint("s", "2026-01-01", "2026-01-10", [item("1", "p", "a", "done"), item("2", "p", null, "todo")])
    expect(sprintDonePercent(s)).toBe(100)
  })
})

describe("timeline + rows", () => {
  it("sorts sprints by start date without mutating input", () => {
    const input = [sprint("b", "2026-02-01", "2026-02-10"), sprint("a", "2026-01-01", "2026-01-10")]
    const sorted = sortSprints(input)
    expect(sorted.map((s) => s.id)).toEqual(["a", "b"])
    expect(input[0].id).toBe("b")
  })

  it("pads the timeline around sprints", () => {
    const { timelineStart, totalDays } = computeTimeline([
      sprint("a", "2026-01-10T00:00:00", "2026-01-20T00:00:00"),
      sprint("b", "2026-01-15T00:00:00", "2026-01-31T00:00:00"),
    ])
    expect(timelineStart).toEqual(new Date(2026, 0, 3))
    expect(totalDays).toBe(21 + 7 + 7 + 1)
  })

  it("uses a default window around today when there are no sprints", () => {
    const now = new Date(2026, 5, 15, 12)
    const { timelineStart, totalDays } = computeTimeline([], now)
    expect(timelineStart).toEqual(new Date(2026, 5, 8))
    expect(totalDays).toBe(7 + 28 + 1)
  })

  it("builds sprint/pbi/task rows honouring collapsed keys", () => {
    const s = sprint("s1", "2026-01-01", "2026-01-10", [item("t1", "p1", "A"), item("t2", "p1", "B"), item("t3", "p2", null)])
    const all = buildRows([s], () => true)
    expect(all.map((r) => r.key)).toEqual(["sprint-s1", "pbi-s1-p1", "task-t1", "task-t2", "pbi-s1-p2"])

    const pbiCollapsed = buildRows([s], (k) => k !== "pbi-s1-p1")
    expect(pbiCollapsed.map((r) => r.key)).toEqual(["sprint-s1", "pbi-s1-p1", "pbi-s1-p2"])

    const sprintCollapsed = buildRows([s], (k) => k !== "sprint-s1")
    expect(sprintCollapsed.map((r) => r.key)).toEqual(["sprint-s1"])
  })

  it("builds date columns with month spans and weekend flags", () => {
    const cols = buildDateColumns(new Date(2026, 0, 30), 5, ["日", "月", "火", "水", "木", "金", "土"], "en-US")
    expect(cols).toHaveLength(5)
    expect(cols[0]).toMatchObject({ dayNum: 30, showMonth: true, monthSpan: 2, weekday: "金", isWeekendDay: false })
    expect(cols[1]).toMatchObject({ dayNum: 31, showMonth: false, monthSpan: 0, isWeekendDay: true })
    expect(cols[2]).toMatchObject({ dayNum: 1, showMonth: true, monthSpan: 3 })
    expect(cols[0].id).toBe("2026-1-30")
  })

  it("falls back to empty weekday label", () => {
    const cols = buildDateColumns(new Date(2026, 0, 1), 1, [], "en-US")
    expect(cols[0].weekday).toBe("")
  })

  it("distributes task bars proportionally within the sprint", () => {
    const s = sprint("s", "2026-01-01T00:00:00", "2026-01-10T00:00:00")
    expect(taskBarRange(s, 0, 2)).toEqual({ start: new Date(2026, 0, 1), end: new Date(2026, 0, 5) })
    expect(taskBarRange(s, 1, 2)).toEqual({ start: new Date(2026, 0, 6), end: new Date(2026, 0, 10) })
    // Many tasks in a short sprint: end never precedes start.
    const short = sprint("s", "2026-01-01T00:00:00", "2026-01-01T00:00:00")
    const r = taskBarRange(short, 0, 5)
    expect(r.end.getTime()).toBeGreaterThanOrEqual(r.start.getTime())
  })
})

describe("style lookups", () => {
  it("returns known styles and fallbacks", () => {
    expect(sprintGradient("done")).toContain("emerald")
    expect(sprintGradient("zzz")).toBe(sprintGradient("active"))
    expect(sprintTone("planning")).toBe("warning")
    expect(sprintTone("zzz")).toBe("primary")
    expect(taskTone("done")).toBe("success")
    expect(taskTone("zzz")).toBe("neutral")
    expect(taskBarColor("in_progress")).toBe("bg-blue-400")
    expect(taskBarColor("zzz")).toBe("bg-slate-400")
    expect(eventFlagColor("red")).toBe("text-red-500")
    expect(eventFlagColor("zzz")).toBe("text-blue-400")
  })
})
