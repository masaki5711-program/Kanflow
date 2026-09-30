import { describe, expect, it } from "vitest"
import { buildStatusPatch, buildTaskCreate, buildTaskPatch, EMPTY_TASK_FORM, needsRetroDialog } from "./task-payload"

describe("task payload builders", () => {
  it("PATCH clears empty hours and assignee with null", () => {
    expect(buildTaskPatch({ ...EMPTY_TASK_FORM, taskName: "T", status: "done" })).toEqual({
      taskName: "T", assignee: null, estimatedHours: null, actualHours: null, status: "done",
    })
  })

  it("PATCH parses hours", () => {
    const body = buildTaskPatch({ ...EMPTY_TASK_FORM, taskName: "T", estimatedHours: "2.5", actualHours: "3", assignee: "Ann" })
    expect(body).toMatchObject({ estimatedHours: 2.5, actualHours: 3, assignee: "Ann" })
  })

  it("POST sends the PBI id and estimate", () => {
    expect(buildTaskCreate({ ...EMPTY_TASK_FORM, pbItemId: "p", taskName: "T", estimatedHours: "4" })).toEqual({
      pbItemId: "p", taskName: "T", assignee: null, estimatedHours: 4,
    })
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
