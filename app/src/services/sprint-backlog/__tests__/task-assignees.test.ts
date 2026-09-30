import { describe, expect, it } from "vitest"
import {
  MAX_TASK_ASSIGNEES,
  flattenAssignees,
  planAssigneeWrite,
  previousAssigneeIds,
  withAssigneeRefs,
} from "../task-assignees"

const MEMBERS = [
  { id: "u-ann", name: "Ann Lee" },
  { id: "u-bob", name: "Bob" },
]

describe("planAssigneeWrite", () => {
  it("returns null when the input touches no assignee field", () => {
    expect(planAssigneeWrite({}, MEMBERS)).toBeNull()
  })

  it("ids → TaskAssignee set + legacy names joined by ', ' (dual-write)", () => {
    expect(planAssigneeWrite({ assigneeIds: ["u-bob", "u-ann", "u-bob"] }, MEMBERS)).toEqual({
      assignee: "Bob, Ann Lee",
      assignees: [
        { id: "u-bob", name: "Bob" },
        { id: "u-ann", name: "Ann Lee" },
      ],
    })
  })

  it("empty ids clear both the set and the legacy string", () => {
    expect(planAssigneeWrite({ assigneeIds: [] }, MEMBERS)).toEqual({ assignee: null, assignees: [] })
  })

  it("ids win over a legacy string sent alongside", () => {
    expect(planAssigneeWrite({ assigneeIds: ["u-ann"], assignee: "Bob" }, MEMBERS)?.assignee).toBe("Ann Lee")
  })

  it("rejects ids that are not project members with a 400", () => {
    expect(() => planAssigneeWrite({ assigneeIds: ["u-ann", "u-stranger"] }, MEMBERS)).toThrow(
      expect.objectContaining({ status: 400, extra: { invalidAssigneeIds: ["u-stranger"] } })
    )
  })

  it("legacy string → kept as given and matched names synced (case/space tolerant)", () => {
    expect(planAssigneeWrite({ assignee: "ann lee" }, MEMBERS)).toEqual({
      assignee: "ann lee",
      assignees: [{ id: "u-ann", name: "Ann Lee" }],
    })
  })

  it("legacy string with an unknown name keeps the text but syncs nobody", () => {
    expect(planAssigneeWrite({ assignee: "Guest" }, MEMBERS)).toEqual({ assignee: "Guest", assignees: [] })
  })

  it("legacy null clears", () => {
    expect(planAssigneeWrite({ assignee: null }, MEMBERS)).toEqual({ assignee: null, assignees: [] })
  })

  it("caps the number of assignees", () => {
    const many = Array.from({ length: MAX_TASK_ASSIGNEES + 1 }, (_, i) => `u${i}`)
    const members = many.map((id) => ({ id, name: id }))
    expect(() => planAssigneeWrite({ assigneeIds: many }, members)).toThrow(expect.objectContaining({ status: 400 }))
  })
})

describe("previousAssigneeIds", () => {
  it("prefers the TaskAssignee rows", () => {
    expect(previousAssigneeIds(["u-bob"], "Ann Lee", MEMBERS)).toEqual(["u-bob"])
  })

  it("falls back to resolving the legacy string for rows not yet backfilled", () => {
    expect(previousAssigneeIds([], "Ann Lee", MEMBERS)).toEqual(["u-ann"])
    expect(previousAssigneeIds([], null, MEMBERS)).toEqual([])
  })
})

describe("DTO helpers", () => {
  it("flattenAssignees maps relation rows to {id, name}", () => {
    expect(flattenAssignees([{ user: { id: "u-bob", name: "Bob" } }])).toEqual([{ id: "u-bob", name: "Bob" }])
    expect(flattenAssignees(undefined)).toEqual([])
  })

  it("withAssigneeRefs replaces the relation rows on a task (new object)", () => {
    const row = { id: "t1", assignees: [{ user: { id: "u-bob", name: "Bob" } }] }
    const out = withAssigneeRefs(row)
    expect(out).toEqual({ id: "t1", assignees: [{ id: "u-bob", name: "Bob" }] })
    expect(row.assignees[0]).toHaveProperty("user")
  })

  it("withAssigneeRefs gives [] when the relation was not loaded", () => {
    expect(withAssigneeRefs({ id: "t1" })).toEqual({ id: "t1", assignees: [] })
  })
})
