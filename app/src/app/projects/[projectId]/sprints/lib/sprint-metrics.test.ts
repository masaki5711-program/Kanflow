import { describe, expect, it } from "vitest"
import type { Sprint, SprintItem } from "../components/types"
import { carryOverSource, computeSprintMetrics, defaultSprintTab, groupTasksByAssignee, groupTasksByPb, myOpenTasks, sprintAttention, sprintTabOf, sprintTime, nextTaskStatus, orderByPbDependency, patchTask, removeTask, summarizePbTasks, unfinishedWork } from "./sprint-metrics"

function pb(id: string, workloadScore: number) {
  return { id, displayId: 1, initiative: null, epic: null, userStory: null, workloadScore }
}
function task(id: string, pbId: string, workload: number, status: string, taskName: string | null = id): SprintItem {
  return { id, taskName, assignee: null, estimatedHours: null, actualHours: null, status, pbItem: pb(pbId, workload) }
}
function sprint(items: SprintItem[], capacity = 10): Sprint {
  return {
    id: "s1", sprintName: "S1", startDate: "", endDate: "", sprintGoal: null, capacity, actualScore: 0,
    status: "active", reviewComment: null, retrospectiveMemo: null, retrospectiveKeep: null,
    retrospectiveProblem: null, retrospectiveTry: null, items,
  }
}

describe("computeSprintMetrics", () => {
  it("counts completed points only for PBIs whose real tasks are all done (same rule as actualScore)", () => {
    const m = computeSprintMetrics(sprint([
      task("a", "p1", 4, "done"),
      task("b", "p1", 4, "done"),
      task("c", "p2", 2, "done"),
      task("d", "p2", 2, "todo"),
      task("placeholder", "p3", 3, "todo", null),
    ]))
    expect(m.completedWorkload).toBe(4)
    expect(Number.isInteger(m.completedWorkload)).toBe(true)
  })

  it("counts each PBI workload once; a partly done PBI adds no completed points", () => {
    const m = computeSprintMetrics(sprint([
      task("a", "p1", 4, "done"),
      task("b", "p1", 4, "todo"),
      task("c", "p2", 2, "in_progress"),
      task("placeholder", "p3", 3, "todo", null),
    ]))
    expect(m.currentWorkload).toBe(9)
    expect(m.completedWorkload).toBe(0)
    expect(m.totalTasks).toBe(3)
    expect(m).toMatchObject({ doneTasks: 1, inProgressTasks: 1, todoTasks: 1, progress: 90, isOver: false })
  })

  it("caps bar widths at 100% and flags over-capacity", () => {
    const m = computeSprintMetrics(sprint([task("a", "p1", 20, "done")], 10))
    expect(m.isOver).toBe(true)
    expect(m.progress).toBe(200)
    expect(m.committedProgress).toBe(100)
    expect(m.doneProgress).toBe(100)
  })

  it("returns zero progress when capacity is 0", () => {
    const m = computeSprintMetrics(sprint([task("a", "p1", 5, "todo")], 0))
    expect(m.progress).toBe(0)
    expect(m.committedProgress).toBe(0)
  })
})

describe("groupTasksByPb", () => {
  it("groups by PBI preserving first-seen order", () => {
    const groups = groupTasksByPb([task("a", "p2", 1, "todo"), task("b", "p1", 1, "todo"), task("c", "p2", 1, "todo")])
    expect(groups.map((g) => g.pbItem.id)).toEqual(["p2", "p1"])
    expect(groups[0].tasks.map((t) => t.id)).toEqual(["a", "c"])
  })
})

describe("task helpers", () => {
  it("cycles task status", () => {
    expect(nextTaskStatus("todo")).toBe("in_progress")
    expect(nextTaskStatus("in_progress")).toBe("done")
    expect(nextTaskStatus("done")).toBe("todo")
  })

  it("patches and removes tasks without mutating the input", () => {
    const list = [sprint([task("a", "p1", 1, "todo"), task("b", "p1", 1, "todo")])]
    const patched = patchTask(list, "s1", "a", { status: "done" })
    expect(patched[0].items[0].status).toBe("done")
    expect(list[0].items[0].status).toBe("todo")
    const removed = removeTask(list, "s1", "b")
    expect(removed[0].items.map((i) => i.id)).toEqual(["a"])
    expect(list[0].items).toHaveLength(2)
  })
})

describe("unfinishedWork", () => {
  it("counts open real tasks and PBIs that are not complete (placeholders are not tasks)", () => {
    const items = [
      task("a1", "A", 3, "done"), task("a2", "A", 3, "done"),
      task("b1", "B", 2, "done"), task("b2", "B", 2, "todo"), task("b3", "B", 2, "in_progress"),
      task("c0", "C", 1, "todo", null),
    ]
    expect(unfinishedWork(items)).toEqual({ tasks: 2, pbis: 2 })
  })

  it("is empty when everything is done", () => {
    expect(unfinishedWork([task("a1", "A", 3, "done")])).toEqual({ tasks: 0, pbis: 0 })
  })
})

describe("summarizePbTasks (S-20)", () => {
  it("counts done / total real tasks and sums estimated hours without PBI points", () => {
    const items = [
      { ...task("a", "p1", 3, "done"), estimatedHours: 4 },
      { ...task("b", "p1", 3, "todo"), estimatedHours: 8.25 },
      { ...task("c", "p1", 3, "in_progress"), estimatedHours: null },
      task("placeholder", "p1", 3, "todo", null),
    ]
    expect(summarizePbTasks(items)).toEqual({ total: 3, done: 1, estimatedHours: 12.3, donePercent: 33 })
  })

  it("is all zero without real tasks", () => {
    expect(summarizePbTasks([task("x", "p1", 5, "todo", "")])).toEqual({ total: 0, done: 0, estimatedHours: 0, donePercent: 0 })
  })
})

describe("orderByPbDependency", () => {
  const link = (id: string) => ({ dependencyId: `d-${id}`, id, displayId: 1, initiative: null, userStory: null, status: "ready", i18n: {} })
  const withDeps = (t: SprintItem, over: { blockedBy?: string[]; blocking?: string[] }): SprintItem => ({
    ...t,
    pbItem: { ...t.pbItem, blockedBy: (over.blockedBy ?? []).map(link), blocking: (over.blocking ?? []).map(link) },
  })

  it("moves the PBI that others wait for ahead of them, keeping each PBI's tasks together", () => {
    const items = [
      withDeps(task("a1", "p1", 1, "todo"), { blockedBy: ["p3"] }),
      task("b1", "p2", 1, "todo"),
      withDeps(task("c1", "p3", 1, "todo"), { blocking: ["p1"] }),
      withDeps(task("a2", "p1", 1, "todo"), { blockedBy: ["p3"] }),
    ]
    expect(orderByPbDependency(items).map((i) => i.id)).toEqual(["c1", "b1", "a1", "a2"])
  })

  it("does not reorder for a prerequisite that is already completed", () => {
    const done = { dependencyId: "d-p2", id: "p2", displayId: 2, initiative: null, userStory: null, status: "completed", i18n: {} }
    const items = [
      { ...task("a", "p1", 1, "todo"), pbItem: { ...pb("p1", 1), blockedBy: [done], blocking: [] } },
      task("b", "p2", 1, "done"),
    ]
    expect(orderByPbDependency(items).map((i) => i.id)).toEqual(["a", "b"])
  })

  it("leaves the order alone when the sprint has no dependencies, and does not change its input", () => {
    const items = [task("a", "p1", 1, "todo"), task("b", "p2", 1, "todo")]
    expect(orderByPbDependency(items).map((i) => i.id)).toEqual(["a", "b"])
    expect(items.map((i) => i.id)).toEqual(["a", "b"])
  })
})

describe("carryOverSource", () => {
  const ended = (id: string, startDate: string, status: string, items: SprintItem[]): Sprint => ({
    ...sprint(items), id, startDate, endDate: startDate, status,
  })

  it("offers the unfinished PBIs of the newest ended sprint that has any", () => {
    const newest = ended("s3", "2026-03-01", "archived", [task("a", "p1", 3, "done"), task("b", "p2", 2, "todo"), task("c", "p2", 2, "done"), task("d", "p3", 1, "todo", null)])
    const older = ended("s2", "2026-02-01", "archived", [task("e", "p9", 1, "todo")])
    const source = carryOverSource([older, newest])
    expect(source?.sprint.id).toBe("s3")
    expect(source?.candidates.map((c) => [c.pbItem.id, c.openTasks])).toEqual([["p2", 1], ["p3", 0]])
  })

  it("skips a newer sprint with nothing left and ignores a sprint still in progress", () => {
    const clean = ended("s3", "2026-03-01", "archived", [task("a", "p1", 3, "done")])
    const older = ended("s2", "2026-02-01", "done", [task("e", "p9", 1, "todo")])
    const running = ended("s4", "2026-04-01", "active", [task("f", "p8", 1, "todo")])
    expect(carryOverSource([running, clean, older])?.sprint.id).toBe("s2")
    expect(carryOverSource([running, clean])).toBeNull()
  })

  it("does not offer work a later sprint already took over, even after that copy was finished", () => {
    const original = ended("s2", "2026-02-01", "archived", [task("x", "p1", 3, "todo")])
    const copy = { ...task("x2", "p1", 3, "done"), carriedFromId: "x" }
    const later = ended("s3", "2026-03-01", "archived", [copy])
    expect(carryOverSource([original, later])).toBeNull()
  })
})

describe("sprint tabs", () => {
  it("files running / review work as current, planning as planning, finished as past", () => {
    expect(["active", "review", "planning", "done", "archived"].map(sprintTabOf)).toEqual(["current", "current", "planning", "past", "past"])
  })

  it("opens the most relevant tab first", () => {
    expect(defaultSprintTab([{ status: "done" }, { status: "active" }])).toBe("current")
    expect(defaultSprintTab([{ status: "done" }, { status: "planning" }])).toBe("planning")
    expect(defaultSprintTab([{ status: "archived" }])).toBe("past")
    expect(defaultSprintTab([])).toBe("past")
  })
})

describe("sprintTime", () => {
  const period = { startDate: "2026-09-10T00:00:00.000Z", endDate: "2026-09-14T00:00:00.000Z" }
  const at = (day: number) => new Date(2026, 8, day, 12)

  it("counts calendar days around the period, the last day included", () => {
    expect(sprintTime(period, at(7))).toEqual({ kind: "startsIn", days: 3 })
    expect(sprintTime(period, at(10))).toEqual({ kind: "daysLeft", days: 4 })
    expect(sprintTime(period, at(13))).toEqual({ kind: "daysLeft", days: 1 })
    expect(sprintTime(period, at(14))).toEqual({ kind: "lastDay" })
    expect(sprintTime(period, at(15))).toEqual({ kind: "over" })
  })
})

describe("sprintAttention", () => {
  it("flags open unassigned tasks and ignores done ones and placeholders", () => {
    const owned = { ...task("a", "p1", 3, "todo"), assignees: [{ id: "u1", name: "Ann" }] }
    const legacy = { ...task("b", "p1", 3, "todo"), assignee: "Bob" }
    const open = task("c", "p1", 3, "todo")
    const done = task("d", "p1", 3, "done")
    const placeholder = task("e", "p2", 3, "todo", null)
    const a = sprintAttention({ items: [owned, legacy, open, done, placeholder], capacity: 100 })
    expect(a).toEqual({ unassigned: 1, waitingPbis: 0, isOver: false })
  })

  it("flags a sprint loaded beyond its capacity", () => {
    expect(sprintAttention({ items: [task("a", "p1", 8, "todo")], capacity: 5 }).isOver).toBe(true)
  })
})

describe("my tasks and assignee groups", () => {
  const ann = { id: "u1", name: "Ann" }
  const bob = { id: "u2", name: "Bob" }
  const items = [
    { ...task("a", "p1", 1, "todo"), assignees: [ann] },
    { ...task("b", "p1", 1, "done"), assignees: [ann] },
    { ...task("c", "p2", 1, "in_progress"), assignees: [bob, ann] },
    task("d", "p2", 1, "todo"),
    task("e", "p3", 1, "todo", null),
  ]

  it("lists only the viewer's open real tasks", () => {
    expect(myOpenTasks(items, "u1").map((i) => i.id)).toEqual(["a", "c"])
    expect(myOpenTasks(items, null)).toEqual([])
  })

  it("groups real tasks by owner (shared tasks under each), unassigned last", () => {
    const groups = groupTasksByAssignee(items)
    expect(groups.map((g) => [g.name, g.tasks.map((i) => i.id)])).toEqual([["Ann", ["a", "b", "c"]], ["Bob", ["c"]], [null, ["d"]]])
  })
})
