import { describe, expect, it } from "vitest"
import type { Sprint, SprintItem } from "../components/types"
import { computeSprintMetrics, groupTasksByPb, nextTaskStatus, orderByPbDependency, patchTask, removeTask, summarizePbTasks, unfinishedWork } from "./sprint-metrics"

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
    expect(orderByPbDependency(items).map((i) => i.id)).toEqual(["c1", "a1", "a2", "b1"])
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
