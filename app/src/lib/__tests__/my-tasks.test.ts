import { describe, expect, it } from "vitest"
import { isMyTask, myTaskAssigneeWhere } from "../my-tasks"

describe("myTaskAssigneeWhere", () => {
  it("matches TaskAssignee by user id, or legacy rows (no TaskAssignee yet) whose string contains the name", () => {
    expect(myTaskAssigneeWhere("u1", " Taro ")).toEqual({
      OR: [
        { assignees: { some: { userId: "u1" } } },
        { assignees: { none: {} }, assignee: { contains: "Taro" } },
      ],
    })
  })

  it("without a name only the TaskAssignee rows count (never 'all tasks')", () => {
    expect(myTaskAssigneeWhere("u1", null)).toEqual({ assignees: { some: { userId: "u1" } } })
    expect(myTaskAssigneeWhere("u1", "  ")).toEqual({ assignees: { some: { userId: "u1" } } })
  })
})

describe("isMyTask", () => {
  it("a TaskAssignee row for the user wins", () => {
    expect(isMyTask({ assignee: "Someone else", assignees: [{ userId: "u1" }] }, "u1", "Taro")).toBe(true)
  })

  it("normalized rows of other users are not mine even if the legacy text mentions my name", () => {
    expect(isMyTask({ assignee: "Taro", assignees: [{ userId: "u2" }] }, "u1", "Taro")).toBe(false)
  })

  it("legacy rows need an exact name, not a substring", () => {
    expect(isMyTask({ assignee: "Taro, Hanako", assignees: [] }, "u1", "Taro")).toBe(true)
    expect(isMyTask({ assignee: "Taro Yamada", assignees: [] }, "u1", "Taro")).toBe(false)
    expect(isMyTask({ assignee: "Taro Yamada", assignees: [] }, "u1", "Taro  Yamada")).toBe(true)
    expect(isMyTask({ assignee: null, assignees: [] }, "u1", "Taro")).toBe(false)
    expect(isMyTask({ assignee: "Taro", assignees: [] }, "u1", null)).toBe(false)
  })
})
