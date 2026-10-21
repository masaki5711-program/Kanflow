import { describe, expect, it, vi } from "vitest"

vi.mock("@/lib/prisma", () => ({ prisma: {} }))

const { withoutSupersededTasks } = await import("../pbi-status-sync")
import { unfinishedByPbi, withoutTakenOver, type CarryRow } from "../sprint-carry-over"

type Row = CarryRow & { id: string }
const row = (id: string, pbId: string, taskName: string | null, status = "todo"): Row => ({ id, pbId, taskName, status })
const read = (r: Row): CarryRow => r

describe("unfinishedByPbi", () => {
  it("lists the open real tasks of PBIs that are not finished, in first-seen order", () => {
    const rows = [
      row("1", "b1", "design", "done"),
      row("2", "b1", "build", "in_progress"),
      row("3", "b2", "only", "todo"),
      row("4", "b1", "test", "todo"),
    ]
    const groups = unfinishedByPbi(rows, read)
    expect(groups.map((g) => g.pbId)).toEqual(["b1", "b2"])
    expect(groups[0].tasks.map((t) => t.id)).toEqual(["2", "4"])
    expect(groups[0].placeholder).toBe(false)
  })

  it("leaves out a PBI whose real tasks are all done", () => {
    expect(unfinishedByPbi([row("1", "b1", "a", "done"), row("2", "b1", "b", "done")], read)).toEqual([])
  })

  it("carries a PBI that has only placeholders as one bare membership row", () => {
    const groups = unfinishedByPbi([row("1", "b1", null), row("2", "b1", null), row("3", "b2", "  ")], read)
    expect(groups.map((g) => [g.pbId, g.placeholder, g.tasks.map((t) => t.id)])).toEqual([["b1", true, ["1"]], ["b2", true, ["3"]]])
  })

  it("lists nothing for a PBI whose open tasks were all taken over", () => {
    const rows = [row("1", "b1", "done task", "done"), row("2", "b1", "open", "todo"), row("3", "b2", "open", "todo")]
    expect(unfinishedByPbi(withoutTakenOver(rows, new Set(["2"])), read).map((g) => g.pbId)).toEqual(["b2"])
  })
})

describe("withoutSupersededTasks", () => {
  const task = (taskName: string | null, status: string, copies: number) => ({
    taskName, status, carriedCopies: Array.from({ length: copies }, () => ({ id: "c" })),
  })

  it("drops an unfinished original that a carry-over has copied", () => {
    const rows = [task("a", "done", 0), task("b", "todo", 1), task("b", "todo", 0)]
    expect(withoutSupersededTasks(rows)).toEqual([rows[0], rows[2]])
  })

  it("keeps an unfinished task that has no copy", () => {
    const rows = [task("x", "in_progress", 0), task("y", "done", 0)]
    expect(withoutSupersededTasks(rows)).toEqual(rows)
  })

  it("changes nothing for rows without the copy link", () => {
    const bare = [{ taskName: "b", status: "todo" }, { taskName: null, status: "todo" }]
    expect(withoutSupersededTasks(bare)).toEqual(bare)
  })
})
