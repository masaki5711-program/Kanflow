import { describe, expect, it } from "vitest"
import { getTranslations } from "@/lib/i18n"
import type { Sprint, SprintItem, SprintPbItem } from "../components/types"
import { isSprintStart, sprintStartMessage, statusChangedTemplate } from "./status-change"

const t = getTranslations("ja")

const pb = (id: string, workloadScore: number): SprintPbItem => ({ id, displayId: 1, initiative: null, epic: null, userStory: null, workloadScore })
const task = (id: string, pbItem: SprintPbItem, taskName: string | null = id): SprintItem =>
  ({ id, taskName, assignee: null, estimatedHours: null, actualHours: null, status: "todo", completionComment: null, pbItem })

function sprint(items: SprintItem[], capacity: number): Sprint {
  return {
    id: "s1", sprintName: "S1", startDate: "2026-09-30", endDate: "2026-10-07", sprintGoal: null, capacity, actualScore: 0,
    status: "planning", reviewComment: null, retrospectiveMemo: null, retrospectiveKeep: null, retrospectiveProblem: null,
    retrospectiveTry: null, items,
  } as Sprint
}

describe("sprint status change texts (A3-10)", () => {
  it("treats only planning → active as a start", () => {
    expect(isSprintStart("planning", "active")).toBe(true)
    expect(isSprintStart("done", "active")).toBe(false)
    expect(isSprintStart("planning", "review")).toBe(false)
  })

  it("summarizes period, PBIs, real tasks and load vs capacity", () => {
    const a = pb("a", 5)
    const msg = sprintStartMessage(sprint([task("t1", a), task("t2", a), task("p", pb("b", 3), null)], 20), t, "ja")
    expect(msg).toContain("2026/9/30 – 2026/10/7")
    expect(msg).toContain("PBI: 2 件 / タスク: 2 件")
    expect(msg).toContain("負荷: 8 / キャパシティ 20")
    expect(msg).not.toContain(t.sprintStartConfirmOver)
    expect(msg).not.toContain(t.sprintStartConfirmNoTasks)
  })

  it("warns about over-capacity and an empty sprint", () => {
    const msg = sprintStartMessage(sprint([task("p", pb("b", 30), null)], 10), t, "ja")
    expect(msg).toContain(t.sprintStartConfirmOver)
    expect(msg).toContain(t.sprintStartConfirmNoTasks)
  })

  it("picks the toast of each transition", () => {
    expect(statusChangedTemplate("planning", "active", t)).toBe(t.sprintStatusChangedActive)
    expect(statusChangedTemplate("done", "active", t)).toBe(t.sprintStatusChangedReopened)
    expect(statusChangedTemplate("active", "review", t)).toBe(t.sprintStatusChangedReview)
    expect(statusChangedTemplate("review", "done", t)).toBe(t.sprintStatusChangedDone)
    expect(statusChangedTemplate("active", "planning", t)).toBeNull()
  })
})
