import { describe, expect, it } from "vitest"
import type { Sprint, SprintItem } from "../components/types"
import { computeSprintMetrics, groupTasksByPb, nextTaskStatus, patchTask, removeTask, unfinishedWork } from "./sprint-metrics"

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
  it("counts each PBI workload once and weights done workload by task share", () => {
    const m = computeSprintMetrics(sprint([
      task("a", "p1", 4, "done"),
      task("b", "p1", 4, "todo"),
      task("c", "p2", 2, "in_progress"),
      task("placeholder", "p3", 3, "todo", null),
    ]))
    expect(m.currentWorkload).toBe(9)
    expect(m.completedWorkload).toBe(2)
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
