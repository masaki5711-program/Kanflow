import { describe, expect, it } from "vitest"
import {
  assigneeIdsOf,
  buildStatusPatch,
  buildTaskCreate,
  buildTaskPatch,
  displayAssignees,
  EMPTY_TASK_FORM,
  isTaskFormDirty,
  needsRetroDialog,
  taskFormFromItem,
} from "./task-payload"
import type { Member, SprintItem } from "../components/types"

const MEMBERS: Member[] = [
  { id: "m1", userId: "u1", role: "po", user: { id: "u1", name: "Alice", email: "a@x" } },
  { id: "m2", userId: "u2", role: "dev", user: { id: "u2", name: "Bob", email: "b@x" } },
]
const PB = { id: "pb1", displayId: 1, initiative: null, epic: null, userStory: null, workloadScore: 1 }
function taskWith(over: Partial<SprintItem>): SprintItem {
  return { id: "t1", taskName: "T", assignee: null, estimatedHours: null, actualHours: null, status: "todo", pbItem: PB, ...over }
}

describe("task payload builders", () => {
  it("PATCH clears empty hours with null and sends the assignee ids (empty = unassigned)", () => {
    expect(buildTaskPatch({ ...EMPTY_TASK_FORM, taskName: "T", status: "done" })).toEqual({
      taskName: "T", assigneeIds: [], estimatedHours: null, actualHours: null, status: "done",
    })
  })

  it("PATCH parses hours", () => {
    const body = buildTaskPatch({ ...EMPTY_TASK_FORM, taskName: "T", estimatedHours: "2.5", actualHours: "3", assigneeIds: ["u1"] })
    expect(body).toMatchObject({ estimatedHours: 2.5, actualHours: 3, assigneeIds: ["u1"] })
  })

  it("POST sends the PBI id, assignee ids and estimate", () => {
    expect(buildTaskCreate({ ...EMPTY_TASK_FORM, pbItemId: "p", taskName: "T", estimatedHours: "4", assigneeIds: ["u2"] })).toEqual({
      pbItemId: "p", taskName: "T", assigneeIds: ["u2"], estimatedHours: 4,
    })
  })

  it("assigneeIdsOf prefers the normalized assignees", () => {
    expect(assigneeIdsOf(taskWith({ assignee: "Alice", assignees: [{ id: "u2", name: "Bob" }] }), MEMBERS)).toEqual(["u2"])
  })

  it("assigneeIdsOf falls back to exact member names in the legacy string (not yet backfilled)", () => {
    expect(assigneeIdsOf(taskWith({ assignee: "Bob, Nobody", assignees: [] }), MEMBERS)).toEqual(["u2"])
    expect(assigneeIdsOf(taskWith({ assignee: null }), MEMBERS)).toEqual([])
  })

  it("taskFormFromItem loads the ids", () => {
    expect(taskFormFromItem(taskWith({ assignees: [{ id: "u1", name: "Alice" }], estimatedHours: 2 }), MEMBERS)).toMatchObject({
      assigneeIds: ["u1"], estimatedHours: "2",
    })
  })

  it("displayAssignees uses the normalized names, else the legacy string", () => {
    expect(displayAssignees(taskWith({ assignee: "x", assignees: [{ id: "u1", name: "Alice" }] }))).toEqual([{ key: "u1", name: "Alice" }])
    expect(displayAssignees(taskWith({ assignee: "Ann, Bob" }))).toEqual([{ key: "Ann", name: "Ann" }, { key: "Bob", name: "Bob" }])
    expect(displayAssignees(taskWith({ assignee: null }))).toEqual([])
  })

  it("PATCH omits unchanged assignees (keeps an unmatched legacy name) and sends changed ones", () => {
    const loaded = taskFormFromItem(taskWith({ assignee: "Guest", estimatedHours: 1 }), MEMBERS)
    expect(loaded.assigneeIds).toEqual([])
    expect(buildTaskPatch({ ...loaded, estimatedHours: "3" })).not.toHaveProperty("assigneeIds")
    expect(buildTaskPatch({ ...loaded, assigneeIds: ["u1"] })).toMatchObject({ assigneeIds: ["u1"] })
    const owned = taskFormFromItem(taskWith({ assignees: [{ id: "u1", name: "Alice" }] }), MEMBERS)
    expect(buildTaskPatch({ ...owned, assigneeIds: [] })).toMatchObject({ assigneeIds: [] })
  })

  it("isTaskFormDirty compares the assignee ids by value", () => {
    const base = { ...EMPTY_TASK_FORM, assigneeIds: ["u1"] }
    expect(isTaskFormDirty({ ...base, assigneeIds: ["u1"] }, base)).toBe(false)
    expect(isTaskFormDirty({ ...base, assigneeIds: [] }, base)).toBe(true)
    expect(isTaskFormDirty({ ...base, taskName: "x" }, base)).toBe(true)
  })

  it("status patch collapses empty retro fields to null", () => {
    expect(buildStatusPatch("done", { retrospectiveKeep: "k", retrospectiveTry: "" })).toEqual({
      status: "done", retrospectiveKeep: "k", retrospectiveTry: null,
    })
    expect(buildStatusPatch("active", null)).toEqual({ status: "active" })
  })

  it("requires the retro dialog only for review/done", () => {
    expect(needsRetroDialog("review")).toBe(true)
    expect(needsRetroDialog("done")).toBe(true)
    expect(needsRetroDialog("active")).toBe(false)
  })
})
