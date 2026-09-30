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

afterEach(() => vi.unstubAllGlobals())

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
