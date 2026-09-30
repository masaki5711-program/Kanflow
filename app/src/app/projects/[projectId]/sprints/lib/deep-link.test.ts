import { describe, expect, it } from "vitest"
import { findSprintById, findSprintOfTask, sprintElementId, taskElementId } from "./deep-link"

const sprints = [
  { id: "s1", items: [{ id: "t1", taskName: "Build" }, { id: "ph", taskName: "" }] },
  { id: "s2", items: [{ id: "t2", taskName: "Test" }] },
]

describe("sprint deep-link helpers", () => {
  it("builds the element ids used by rows, cards and sprint cards", () => {
    expect(taskElementId("t1")).toBe("task-t1")
    expect(sprintElementId("s1")).toBe("sprint-card-s1")
  })

  it("finds the sprint that contains a task", () => {
    expect(findSprintOfTask(sprints, "t2")?.id).toBe("s2")
  })

  it("ignores PBI placeholder rows and unknown ids", () => {
    expect(findSprintOfTask(sprints, "ph")).toBeUndefined()
    expect(findSprintOfTask(sprints, "nope")).toBeUndefined()
  })

  it("finds a sprint by id", () => {
    expect(findSprintById(sprints, "s1")?.id).toBe("s1")
    expect(findSprintById(sprints, "x")).toBeUndefined()
  })
})
