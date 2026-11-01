import { afterEach, describe, expect, it, vi } from "vitest"
import type { ChatProposal } from "@/lib/chat-proposals"
import { PartialApplyError, applyProposal, proposalRequests, proposalResultHref, requiredAction } from "../proposal-actions"

const PBI: ChatProposal = {
  kind: "create_pbi", proposalId: "prop_a", title: "SSO", userStory: "As a user", acceptanceCriteria: "",
  storyPoints: 3, epic: null, reason: "", possibleDuplicates: [],
}
const SPLIT: ChatProposal = {
  kind: "task_split", proposalId: "prop_b", pbi: { id: "pb-1", displayId: 4, title: "Login" }, sprint: { id: "s 1", name: "S1" },
  tasks: [{ name: "Design", estimate: 2 }, { name: "Build", estimate: null }], skippedExisting: [], reason: "",
}
const TASK_STATUS: ChatProposal = {
  kind: "status_change", proposalId: "prop_c", entity: "task", target: { id: "t1", title: "Build", displayId: null, sprintId: "s1" },
  fromStatus: "todo", toStatus: "done", version: 5, reason: "",
}
const PBI_STATUS: ChatProposal = { ...TASK_STATUS, entity: "pbi", target: { id: "pb-1", title: "Login", displayId: 4, sprintId: null }, toStatus: "ready" }

const PLAN_LOAD: ChatProposal = {
  kind: "plan_load", proposalId: "prop_plan_x", name: "設備導入", startDate: "2026-11-02", itemCount: 2, dependencyCount: 1,
  plannedStart: "2026-11-02", plannedEnd: "2026-11-08",
  schedule: { items: [{ key: "a", name: "A", durationDays: 5 }, { key: "b", name: "B", durationDays: 2, dependsOn: ["a"] }] },
  preview: [{ name: "A", plannedStart: "2026-11-02", plannedEnd: "2026-11-06", isMilestone: false, children: 0 }], reason: "",
}

afterEach(() => vi.unstubAllGlobals())

describe("plan_load (W12)", () => {
  it("needs plan.write, calls POST /plan/load with the schedule (dates are recomputed server side) and lands on the plan", () => {
    expect(requiredAction(PLAN_LOAD)).toBe("plan.write")
    expect(proposalRequests("p1", PLAN_LOAD)).toEqual([
      { url: "/api/projects/p1/plan/load", method: "POST", json: { startDate: "2026-11-02", schedule: PLAN_LOAD.kind === "plan_load" ? PLAN_LOAD.schedule : null } },
    ])
    expect(proposalResultHref("p1", PLAN_LOAD, [])).toBe("/projects/p1/plan")
  })
})

describe("requiredAction mirrors the API gates", () => {
  it("maps each proposal to the route permission", () => {
    expect(requiredAction(PBI)).toBe("backlog.write")
    expect(requiredAction(SPLIT)).toBe("task.write")
    expect(requiredAction(TASK_STATUS)).toBe("task.write")
    expect(requiredAction(PBI_STATUS)).toBe("backlog.write")
  })
})

describe("proposalRequests", () => {
  it("creates a PBI through POST /backlog, omitting empty fields", () => {
    expect(proposalRequests("p1", PBI)).toEqual([
      { url: "/api/projects/p1/backlog", method: "POST", json: { initiative: "SSO", userStory: "As a user", workloadScore: 3 } },
    ])
  })

  it("creates one task per POST in order", () => {
    expect(proposalRequests("p1", SPLIT)).toEqual([
      { url: "/api/projects/p1/sprints/s%201/tasks", method: "POST", json: { pbItemId: "pb-1", taskName: "Design", estimatedHours: 2 } },
      { url: "/api/projects/p1/sprints/s%201/tasks", method: "POST", json: { pbItemId: "pb-1", taskName: "Build", estimatedHours: null } },
    ])
  })

  it("PATCHes status with the proposal's version (optimistic lock)", () => {
    expect(proposalRequests("p1", TASK_STATUS)).toEqual([
      { url: "/api/projects/p1/sprints/s1/tasks/t1", method: "PATCH", json: { status: "done", version: 5 } },
    ])
    expect(proposalRequests("p1", PBI_STATUS)[0]).toMatchObject({ url: "/api/projects/p1/backlog/pb-1", json: { status: "ready", version: 5 } })
  })
})

describe("proposalResultHref", () => {
  it("links to the PBI / task deep links", () => {
    expect(proposalResultHref("p1", PBI, ["pb-9"])).toBe("/projects/p1/backlog?pbi=pb-9")
    expect(proposalResultHref("p1", SPLIT, ["t9", "t10"])).toBe("/projects/p1/sprints?task=t9")
    expect(proposalResultHref("p1", TASK_STATUS, [])).toBe("/projects/p1/sprints?task=t1")
    expect(proposalResultHref("p1", PBI_STATUS, [])).toBe("/projects/p1/backlog?pbi=pb-1")
  })
})

describe("applyProposal", () => {
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } })

  it("reports a partial task split with the created ids", async () => {
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(json({ id: "t-new" }, 201))
      .mockResolvedValueOnce(json({ error: "boom" }, 500)))
    const err = await applyProposal("p1", SPLIT).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(PartialApplyError)
    expect(err).toMatchObject({ done: 1, total: 2, ids: ["t-new"] })
  })

  it("rethrows a failure of the first request unchanged", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json({ error: "forbidden", code: "FORBIDDEN" }, 403)))
    const err = await applyProposal("p1", PBI).catch((e: unknown) => e)
    expect(err).not.toBeInstanceOf(PartialApplyError)
    expect(err).toMatchObject({ status: 403 })
  })
})


const ICEBOX: ChatProposal = { kind: "create_icebox", proposalId: "prop_i", request: "Dark mode", background: "Night shifts", reason: "" }
const SPRINT_ADD: ChatProposal = {
  kind: "sprint_pbi", proposalId: "prop_s", action: "add", pbi: { id: "pb-1", displayId: 4, title: "Login" }, sprint: { id: "s1", name: "S1" }, reason: "",
}
const SPRINT_REMOVE: ChatProposal = { ...SPRINT_ADD, action: "remove" } as ChatProposal
const PLAN_EDIT: ChatProposal = {
  kind: "plan_edit", proposalId: "prop_p", reason: "",
  ops: [
    { op: "create", name: "UAT", parent: { id: "pl-1", name: "Release" }, plannedStart: "2026-11-02", plannedEnd: "2026-11-06", isMilestone: false, durationDays: null },
    { op: "update", target: { id: "pl-2", name: "Build" }, version: 3, changes: { plannedEnd: "2026-11-20" },
      before: { name: "Build", plannedStart: "2026-11-01", plannedEnd: "2026-11-13", status: "in_progress" } },
    { op: "shift", target: { id: "pl-3", name: "Test" }, version: 1, days: 7, followers: "dependents",
      before: { plannedStart: "2026-12-01", plannedEnd: "2026-12-05" }, after: { plannedStart: "2026-12-08", plannedEnd: "2026-12-12" } },
  ],
}
const SPRINT_SCHEDULE: ChatProposal = {
  kind: "sprint_schedule", proposalId: "prop_ss", sprint: { id: "s1", name: "S1" }, version: 2,
  before: { startDate: "2026-10-12", endDate: "2026-10-23" }, after: { startDate: "2026-10-19", endDate: "2026-10-30" }, reason: "",
}
const TEMPLATE: ChatProposal = {
  kind: "create_template", proposalId: "prop_t", name: "Release", description: "", visibility: "private", stageCount: 1, reason: "",
  content: { stages: [{ name: "Plan", durationDays: 5 }] },
}

describe("scheduling proposals", () => {
  it("maps each to the route permission", () => {
    expect(requiredAction(ICEBOX)).toBe("icebox.write")
    expect(requiredAction(SPRINT_ADD)).toBe("sprint.manage")
    expect(requiredAction(SPRINT_SCHEDULE)).toBe("sprint.manage")
    expect(requiredAction(PLAN_EDIT)).toBe("plan.write")
    expect(requiredAction(TEMPLATE)).toBe("project.view")
  })

  it("adds to the Icebox, leaving an empty background out", () => {
    expect(proposalRequests("p1", ICEBOX)).toEqual([
      { url: "/api/projects/p1/icebox", method: "POST", json: { request: "Dark mode", background: "Night shifts" } },
    ])
    expect(proposalRequests("p1", { ...ICEBOX, background: "" } as ChatProposal)[0].json).toEqual({ request: "Dark mode" })
  })

  it("puts a PBI into a sprint or takes it out", () => {
    expect(proposalRequests("p1", SPRINT_ADD)).toEqual([
      { url: "/api/projects/p1/sprints/s1/pbis", method: "POST", json: { pbIds: ["pb-1"] } },
    ])
    expect(proposalRequests("p1", SPRINT_REMOVE)).toEqual([
      { url: "/api/projects/p1/sprints/s1/pbis", method: "DELETE", json: { pbItemId: "pb-1" } },
    ])
  })

  it("applies plan edits in order: create, versioned update, followers before the shifted item", () => {
    expect(proposalRequests("p1", PLAN_EDIT)).toEqual([
      { url: "/api/projects/p1/plan", method: "POST",
        json: { name: "UAT", parentId: "pl-1", plannedStart: "2026-11-02", plannedEnd: "2026-11-06", isMilestone: false } },
      { url: "/api/projects/p1/plan/pl-2", method: "PATCH", json: { plannedEnd: "2026-11-20", version: 3 } },
      { url: "/api/projects/p1/plan/pl-3/shift-following", method: "POST", json: { scope: "dependents", apply: true, deltaDays: 7 } },
      { url: "/api/projects/p1/plan/pl-3", method: "PATCH", json: { plannedStart: "2026-12-08", plannedEnd: "2026-12-12", version: 1 } },
    ])
  })

  it("applies a reflow op through POST /plan/reflow", () => {
    const reflow: ChatProposal = { kind: "plan_edit", proposalId: "prop_r", reason: "", ops: [{ op: "reflow" }] }
    expect(proposalRequests("p1", reflow)).toEqual([{ url: "/api/projects/p1/plan/reflow", method: "POST", json: { apply: true } }])
  })

  it("changes the sprint dates with the proposal's version", () => {
    expect(proposalRequests("p1", SPRINT_SCHEDULE)).toEqual([
      { url: "/api/projects/p1/sprints/s1", method: "PATCH", json: { startDate: "2026-10-19", endDate: "2026-10-30", version: 2 } },
    ])
  })

  it("creates a template through the shared template API", () => {
    expect(proposalRequests("p1", TEMPLATE)).toEqual([
      { url: "/api/plan-templates", method: "POST",
        json: { name: "Release", description: null, visibility: "private", content: { stages: [{ name: "Plan", durationDays: 5 }] } } },
    ])
  })

  it("links to where the result lives", () => {
    expect(proposalResultHref("p1", ICEBOX, ["i1"])).toBe("/projects/p1/icebox")
    expect(proposalResultHref("p1", SPRINT_ADD, [])).toBe("/projects/p1/sprints")
    expect(proposalResultHref("p1", PLAN_EDIT, [])).toBe("/projects/p1/plan")
    expect(proposalResultHref("p1", SPRINT_SCHEDULE, [])).toBe("/projects/p1/sprints")
    expect(proposalResultHref("p1", TEMPLATE, ["t1"])).toBe("/templates")
  })
})
