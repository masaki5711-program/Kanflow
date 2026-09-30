import { describe, expect, it } from "vitest"
import type { Member, SprintItem, SprintPbItem } from "../types"
import {
  BOARD_STATUSES,
  boardStatusOf,
  buildSwimlanes,
  filterTasks,
  isFilterActive,
  matchesFilter,
  summarizeColumns,
  UNASSIGNED_LANE,
} from "./board-model"

function pb(id: string, displayId: number, over: Partial<SprintPbItem> = {}): SprintPbItem {
  return { id, displayId, initiative: `Initiative ${id}`, epic: null, userStory: null, workloadScore: 5, ...over }
}

function task(id: string, pbItem: SprintPbItem, over: Partial<SprintItem> = {}): SprintItem {
  return {
    id, taskName: `Task ${id}`, assignee: null, estimatedHours: null, actualHours: null, status: "todo",
    completionComment: null, pbItem, ...over,
  }
}

const members: Member[] = [
  { id: "m1", userId: "u1", role: "dev", user: { id: "u1", name: "Alice", email: "a@x" } },
  { id: "m2", userId: "u2", role: "dev", user: { id: "u2", name: "Bob", email: "b@x" } },
]

const pbA = pb("pbA", 12, { initiative: "Login page" })
const pbB = pb("pbB", 7, { initiative: "Export" })

const tAlice = task("t1", pbA, { assignees: [{ id: "u1", name: "Alice" }], estimatedHours: 2, actualHours: 1 })
const tBob = task("t2", pbB, { assignees: [{ id: "u2", name: "Bob" }], status: "in_progress", estimatedHours: 1.5 })
const tLegacy = task("t3", pbA, { assignee: "Bob", status: "done", estimatedHours: 3, actualHours: 2.25 })
const tNone = task("t4", pbB, { taskName: "Write docs" })
const all = [tAlice, tBob, tLegacy, tNone]

describe("boardStatusOf", () => {
  it("keeps known statuses and maps anything else to todo", () => {
    expect(BOARD_STATUSES).toEqual(["todo", "in_progress", "done"])
    expect(boardStatusOf("in_progress")).toBe("in_progress")
    expect(boardStatusOf("done")).toBe("done")
    expect(boardStatusOf("weird")).toBe("todo")
  })
})

describe("filters", () => {
  const ctx = { currentUserId: "u1", members }

  it("is inactive for the empty filter", () => {
    expect(isFilterActive({ assignee: "", query: "" })).toBe(false)
    expect(isFilterActive({ assignee: "", query: "   " })).toBe(false)
    expect(isFilterActive({ assignee: "me", query: "" })).toBe(true)
    expect(filterTasks(all, { assignee: "", query: "" }, ctx)).toEqual(all)
  })

  it("filters by me using the session user", () => {
    expect(filterTasks(all, { assignee: "me", query: "" }, ctx).map((x) => x.id)).toEqual(["t1"])
    expect(filterTasks(all, { assignee: "me", query: "" }, { members, currentUserId: null })).toEqual([])
  })

  it("filters by a specific member, resolving legacy assignee names", () => {
    expect(filterTasks(all, { assignee: "u2", query: "" }, ctx).map((x) => x.id)).toEqual(["t2", "t3"])
  })

  it("filters unassigned tasks", () => {
    expect(filterTasks(all, { assignee: "unassigned", query: "" }, ctx).map((x) => x.id)).toEqual(["t4"])
  })

  it("matches every whitespace-separated term case-insensitively against task, PBI and assignee text", () => {
    expect(filterTasks(all, { assignee: "", query: "DOCS" }, ctx).map((x) => x.id)).toEqual(["t4"])
    expect(filterTasks(all, { assignee: "", query: "#12" }, ctx).map((x) => x.id)).toEqual(["t1", "t3"])
    expect(filterTasks(all, { assignee: "", query: "login bob" }, ctx).map((x) => x.id)).toEqual(["t3"])
    expect(filterTasks(all, { assignee: "", query: "export" }, ctx).map((x) => x.id)).toEqual(["t2", "t4"])
  })

  it("also searches extra text such as the viewer-language translation", () => {
    const extra = (x: SprintItem) => (x.id === "t1" ? ["ログイン画面"] : [])
    expect(matchesFilter(tAlice, { assignee: "", query: "ログイン" }, { ...ctx, extraText: extra })).toBe(true)
    expect(matchesFilter(tBob, { assignee: "", query: "ログイン" }, { ...ctx, extraText: extra })).toBe(false)
  })

  it("combines assignee and text filters", () => {
    expect(filterTasks(all, { assignee: "u2", query: "export" }, ctx).map((x) => x.id)).toEqual(["t2"])
  })
})

describe("summarizeColumns", () => {
  it("counts tasks and sums hours per status (rounded to 0.1)", () => {
    const s = summarizeColumns(all)
    expect(s.todo).toEqual({ status: "todo", count: 2, estimatedHours: 2, actualHours: 1 })
    expect(s.in_progress).toEqual({ status: "in_progress", count: 1, estimatedHours: 1.5, actualHours: 0 })
    expect(s.done).toEqual({ status: "done", count: 1, estimatedHours: 3, actualHours: 2.3 })
  })

  it("returns zeroed columns for no tasks", () => {
    expect(summarizeColumns([]).done).toEqual({ status: "done", count: 0, estimatedHours: 0, actualHours: 0 })
  })
})

describe("buildSwimlanes", () => {
  it("returns one lane with every task split into columns when swimlanes are off", () => {
    const lanes = buildSwimlanes(all, "none")
    expect(lanes).toHaveLength(1)
    expect(lanes[0].kind).toBe("all")
    expect(lanes[0].cells.todo.map((x) => x.id)).toEqual(["t1", "t4"])
    expect(lanes[0].cells.in_progress.map((x) => x.id)).toEqual(["t2"])
    expect(lanes[0].cells.done.map((x) => x.id)).toEqual(["t3"])
  })

  it("groups by owner (first assignee; legacy names resolved to members) with unassigned last", () => {
    const lanes = buildSwimlanes([tNone, tAlice, tBob, tLegacy], "assignee", members)
    expect(lanes.map((l) => [l.key, l.title, l.count])).toEqual([
      ["u1", "Alice", 1],
      ["u2", "Bob", 2],
      [UNASSIGNED_LANE, null, 1],
    ])
    expect(lanes[1].cells.in_progress.map((x) => x.id)).toEqual(["t2"])
    expect(lanes[1].cells.done.map((x) => x.id)).toEqual(["t3"])
    expect(lanes[2].kind).toBe("unassigned")
  })

  it("keeps an unknown legacy name as its own lane", () => {
    const lanes = buildSwimlanes([task("t9", pbA, { assignee: "Carol" })], "assignee", members)
    expect(lanes.map((l) => [l.key, l.title])).toEqual([["name:Carol", "Carol"]])
  })

  it("groups by PBI in first-seen order", () => {
    const lanes = buildSwimlanes(all, "pbi")
    expect(lanes.map((l) => l.key)).toEqual(["pbA", "pbB"])
    expect(lanes[0].pbItem).toBe(pbA)
    expect(lanes[0].cells.done.map((x) => x.id)).toEqual(["t3"])
    expect(lanes[1].cells.todo.map((x) => x.id)).toEqual(["t4"])
  })

  it("never mutates the input", () => {
    const input = [...all]
    buildSwimlanes(input, "assignee")
    expect(input).toEqual(all)
  })
})
