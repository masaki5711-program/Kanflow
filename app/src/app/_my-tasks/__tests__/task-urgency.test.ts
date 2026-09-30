import { describe, expect, it } from "vitest"
import { daysUntil, groupByProject, summarizeMyTasks, urgencyOf, type UrgencyTask } from "../task-urgency"

// Local-time dates: urgency compares calendar days in the viewer's zone.
const now = new Date(2026, 8, 30, 15, 0) // 2026-09-30 15:00
const iso = (y: number, m: number, d: number, h = 0) => new Date(y, m - 1, d, h).toISOString()

function task(id: string, over: Partial<UrgencyTask> = {}): UrgencyTask {
  return { id, status: "todo", sprintEndDate: iso(2026, 10, 20), projectId: "p1", ...over }
}

describe("daysUntil", () => {
  it("counts calendar days regardless of the time of day", () => {
    expect(daysUntil(iso(2026, 9, 30, 0), now)).toBe(0)
    expect(daysUntil(iso(2026, 10, 1, 23), now)).toBe(1)
    expect(daysUntil(iso(2026, 9, 29, 23), now)).toBe(-1)
  })

  it("returns null for an invalid date", () => {
    expect(daysUntil("nope", now)).toBeNull()
  })
})

describe("urgencyOf", () => {
  it("classifies open tasks by the sprint end date", () => {
    expect(urgencyOf(task("a", { sprintEndDate: iso(2026, 9, 29) }), now)).toBe("overdue")
    expect(urgencyOf(task("b", { sprintEndDate: iso(2026, 9, 30) }), now)).toBe("due_soon")
    expect(urgencyOf(task("c", { sprintEndDate: iso(2026, 10, 3) }), now)).toBe("due_soon")
    expect(urgencyOf(task("d", { sprintEndDate: iso(2026, 10, 4) }), now)).toBe("later")
    expect(urgencyOf(task("e", { sprintEndDate: "bad" }), now)).toBe("later")
  })

  it("done tasks are never urgent", () => {
    expect(urgencyOf(task("a", { status: "done", sprintEndDate: iso(2026, 9, 1) }), now)).toBe("done")
  })
})

describe("summarizeMyTasks", () => {
  it("counts open, overdue and due-this-week (next 7 days incl. today) tasks", () => {
    const tasks = [
      task("overdue", { sprintEndDate: iso(2026, 9, 28) }),
      task("today", { status: "in_progress", sprintEndDate: iso(2026, 9, 30) }),
      task("in6", { sprintEndDate: iso(2026, 10, 6) }),
      task("in7", { sprintEndDate: iso(2026, 10, 7) }),
      task("done", { status: "done", sprintEndDate: iso(2026, 9, 28) }),
    ]
    expect(summarizeMyTasks(tasks, now)).toEqual({ open: 4, overdue: 1, dueThisWeek: 2 })
  })
})

describe("groupByProject", () => {
  it("puts the most urgent project first and sorts tasks overdue → due soon → later → done", () => {
    const tasks = [
      task("later", { projectId: "p1" }),
      task("done", { projectId: "p1", status: "done", sprintEndDate: iso(2026, 9, 1) }),
      task("soon-todo", { projectId: "p2", sprintEndDate: iso(2026, 10, 2) }),
      task("soon-wip", { projectId: "p2", status: "in_progress", sprintEndDate: iso(2026, 10, 2) }),
      task("overdue", { projectId: "p1", sprintEndDate: iso(2026, 9, 20) }),
      task("earlier-soon", { projectId: "p2", sprintEndDate: iso(2026, 10, 1) }),
    ]
    const groups = groupByProject(tasks, now)
    expect(groups.map((g) => g.projectId)).toEqual(["p1", "p2"])
    expect(groups[0].tasks.map((t) => t.id)).toEqual(["overdue", "later", "done"])
    expect(groups[1].tasks.map((t) => t.id)).toEqual(["earlier-soon", "soon-wip", "soon-todo"])
  })

  it("orders equally urgent projects by their earliest due date, then first appearance", () => {
    const groups = groupByProject(
      [task("a", { projectId: "pa", sprintEndDate: iso(2026, 11, 1) }), task("b", { projectId: "pb", sprintEndDate: iso(2026, 10, 15) }), task("c", { projectId: "pc", sprintEndDate: iso(2026, 10, 15) })],
      now,
    )
    expect(groups.map((g) => g.projectId)).toEqual(["pb", "pc", "pa"])
  })

  it("returns an empty list for no tasks", () => {
    expect(groupByProject([], now)).toEqual([])
  })
})
