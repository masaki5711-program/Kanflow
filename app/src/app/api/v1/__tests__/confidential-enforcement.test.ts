import { readdirSync, readFileSync, statSync } from "node:fs"
import path from "node:path"
import { describe, expect, it, vi } from "vitest"

/**
 * Confidential PBIs (D-5) on the Claude-facing surfaces: the registry guard and one deny + allow test per
 * mechanism. The REAL repository filters, masking helpers and v1 operations run over an in-memory
 * stand-in of Prisma (confidential-fixture.ts); only the downstream write services are mocked, to see
 * which id they are handed.
 *
 * The registry (confidential-coverage.ts) is checked against the REAL MCP tools and the REAL /api/v1 route
 * files: a tool or route nobody classified fails here, so it cannot silently skip the rule.
 */

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }))
vi.mock("@/lib/prisma", async () => ({ prisma: (await import("@/services/api-v1/__tests__/confidential-fixture")).confidentialDb }))
vi.mock("@/lib/logger", () => ({
  logger: { child: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }) },
}))
vi.mock("@/services/_shared/translations", () => ({ getI18nFor: vi.fn(async () => new Map()) }))
vi.mock("@/services/sprint-backlog/sprint-backlog.service")
vi.mock("@/services/comments/comments.service")
vi.mock("@/services/acceptance-criteria/acceptance-criteria.service")
vi.mock("@/services/sprints/sprints.service")
vi.mock("@/services/dev-work/dev-work.service")

const fixture = await import("@/services/api-v1/__tests__/confidential-fixture")
const { leaksSecret } = fixture
const conf = await import("@/services/api-v1/api-v1.confidential")
const v1 = await import("@/services/api-v1/api-v1.service")
const activityService = await import("@/services/activity/activity.service")
const { NotFoundError } = await import("@/services/_shared/errors")
const handlers = await import("@/app/api/v1/_lib/v1-handlers")
const devHandlers = await import("@/app/api/v1/_lib/v1-dev-handlers")
const { updateBacklogItemSchema } = await import("@/services/backlog/backlog.schemas")
const sprintBacklog = await import("@/services/sprint-backlog/sprint-backlog.service")
const comments = await import("@/services/comments/comments.service")
const acService = await import("@/services/acceptance-criteria/acceptance-criteria.service")
const sprints = await import("@/services/sprints/sprints.service")
const devWork = await import("@/services/dev-work/dev-work.service")
const coverage = await import("@/app/api/v1/_lib/confidential-coverage")
const { registerKanflowTools } = await import("@/app/api/mcp/_lib/tools")

vi.mocked(devWork.claimWork).mockResolvedValue({ claim: {}, created: true, takenOver: [], superseded: [] } as never)
vi.mocked(devWork.linkMergeRequest).mockResolvedValue({ link: {}, created: true } as never)

const { NO_SUCH_ID } = conf
const ACTOR = { userId: "u1", userName: "Dev One", systemRole: "member", via: "api" as const }

function writeInput<P extends object>(params: P, body: unknown = {}) {
  return { projectId: "p1", actor: {} as never, body, serviceActor: ACTOR, params }
}

/** A failure as the client sees it: status, code, message. */
async function failure(fn: () => Promise<unknown>) {
  try {
    await fn()
  } catch (error) {
    const e = error as { status?: number; code?: string; message: string }
    return { status: e.status, code: e.code, message: e.message }
  }
  throw new Error("expected a failure")
}

const TESTED = new Set<string>()
/** One mechanism = one describe; the registry check below needs every mechanism named in it to be tested here. */
function mechanism(id: (typeof coverage.CONFIDENTIAL_MECHANISMS)[number], body: () => void) {
  TESTED.add(id)
  describe(`mechanism ${id}`, body)
}

// =========================================================================== registry guard

describe("registry: every MCP tool and /api/v1 route is classified", () => {
  function mcpToolNames(): string[] {
    const names: string[] = []
    const recorder = { registerTool: (name: string) => void names.push(name) }
    registerKanflowTools(recorder as never, { userId: "u1", role: "member", tokenId: "t1", tokenPrefix: "kfl_x", scopes: [], projectIds: null } as never)
    return names
  }

  function routeKeys(): string[] {
    const root = path.resolve(process.cwd(), "src/app/api/v1")
    const keys: string[] = []
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir)) {
        const full = path.join(dir, entry)
        if (statSync(full).isDirectory()) walk(full)
        else if (entry === "route.ts") {
          const rel = path.relative(root, dir).split(path.sep).join("/")
          for (const m of readFileSync(full, "utf8").matchAll(/^export const (GET|POST|PATCH|PUT|DELETE)\b/gm)) keys.push(`${m[1]} ${rel}`)
        }
      }
    }
    walk(root)
    return keys
  }

  it("the registry lists exactly the registered MCP tools (a new tool must be classified)", () => {
    expect(Object.keys(coverage.MCP_TOOL_COVERAGE).sort()).toEqual([...mcpToolNames()].sort())
  })

  it("the registry lists exactly the /api/v1 route handlers (a new route must be classified)", () => {
    expect(Object.keys(coverage.V1_ROUTE_COVERAGE).sort()).toEqual(routeKeys().sort())
  })

  it("an entry says how it is covered, and says why when it is independent", () => {
    for (const [name, entry] of [...Object.entries(coverage.MCP_TOOL_COVERAGE), ...Object.entries(coverage.V1_ROUTE_COVERAGE)]) {
      if ("by" in entry) expect(entry.by.length, name).toBeGreaterThan(0)
      else expect(entry.independent.length, name).toBeGreaterThan(10)
    }
  })

  it("every mechanism the registry names has a deny + allow test in this file", () => {
    const used = new Set<string>()
    for (const entry of [...Object.values(coverage.MCP_TOOL_COVERAGE), ...Object.values(coverage.V1_ROUTE_COVERAGE)]) {
      if ("by" in entry) for (const id of entry.by) used.add(id)
    }
    expect([...used].filter((id) => !TESTED.has(id))).toEqual([])
    expect([...TESTED].filter((id) => !used.has(id))).toEqual([]) // no orphan mechanism
  })
})

// =========================================================================== reads

mechanism("read:backlog", () => {
  it("lists the normal PBI and omits the confidential one", async () => {
    const out = await v1.listBacklog("p1", { limit: 50 })
    expect(out.data.map((p) => p.id)).toEqual(["pbA"])
    expect(leaksSecret(out)).toBe(false)
  })
})

mechanism("read:pbi", () => {
  it("allow: a normal PBI is returned by id, number and PBI-number", async () => {
    for (const ref of ["pbA", "1", "PBI-1"]) expect((await v1.getPbi("p1", ref)).data.id).toBe("pbA")
  })

  it("deny: the confidential PBI answers exactly what a missing PBI answers (id, number, PBI-number)", async () => {
    const missing = await failure(() => v1.getPbi("p1", "nope"))
    expect(missing).toEqual({ status: 404, code: "PBI_NOT_FOUND", message: "PBI not found" })
    for (const ref of ["pbC", "2", "PBI-2"]) expect(await failure(() => v1.getPbi("p1", ref))).toEqual(missing)
  })
})

mechanism("read:locate", () => {
  it("allow: a normal PBI and its task are located", async () => {
    expect(await v1.locateEntity("pbi", "pbA")).toMatchObject({ projectId: "p1" })
    expect(await v1.locateEntity("task", "tA")).toMatchObject({ projectId: "p1", sprintId: "s1" })
  })

  it("deny: a confidential PBI and a task under it are not found", async () => {
    expect(await v1.locateEntity("pbi", "pbC")).toBeNull()
    expect(await v1.locateEntity("task", "tC")).toBeNull()
  })
})

mechanism("read:sprint-tasks", () => {
  it("lists the normal task and omits the task under the confidential PBI (no title, no description)", async () => {
    const out = await v1.listSprintTasks("p1", "s1")
    expect(out.data.map((t) => t.id)).toEqual(["tA"])
    expect(leaksSecret(out)).toBe(false)
  })
})

mechanism("read:my-tasks", () => {
  it("lists the normal task and omits the task under the confidential PBI", async () => {
    const out = await v1.listMyTasks("u1", ["p1"], false)
    expect(out.data.map((t) => t.id)).toEqual(["tA"])
    expect(leaksSecret(out)).toBe(false)
  })
})

mechanism("read:similar-tasks", () => {
  it("allow: the duplicate hint finds a same-named task of a normal PBI", async () => {
    expect((await v1.findSimilarTasks("p1", "s1", "pbA", "public task")).map((t) => t.id)).toEqual(["tA"])
  })

  it("deny: it never reveals a task of a confidential PBI", async () => {
    expect(await v1.findSimilarTasks("p1", "s1", "pbC", "SECRET task")).toEqual([])
  })
})

mechanism("read:releases", () => {
  it("lists release items of normal PBIs and unlinked copies, and omits the copy of a confidential PBI", async () => {
    const out = await v1.listReleases("p1")
    expect(out.data.map((r) => r.id).sort()).toEqual(["rA", "rN"])
    expect(leaksSecret(out)).toBe(false)
  })
})

mechanism("read:activity", () => {
  it("token surfaces: rows about the confidential PBI, its task and its release copy are left out", async () => {
    const out = await v1.listActivity("p1", { limit: 50 })
    expect(out.data.map((a) => a.id).sort()).toEqual(["a1", "a12", "a3", "a5", "a7", "a9"])
    expect(leaksSecret(out)).toBe(false)
  })

  it("a deleted task under a confidential PBI (parent recorded) is not returned; one under a normal PBI still is", async () => {
    const ids = (await v1.listActivity("p1", { limit: 50 })).data.map((a) => a.id)
    expect(ids).not.toContain("a8")
    expect(ids).not.toContain("a13")
    expect(ids).toContain("a9")
  })

  it("fail closed: an old row with no recorded parent whose entity is gone, and a purged PBI's row, are excluded", async () => {
    const ids = (await v1.listActivity("p1", { limit: 50 })).data.map((a) => a.id)
    expect(ids).not.toContain("a10")
    expect(ids).not.toContain("a11")
  })

  it("pages stay full: hidden rows are skipped before the page limit", async () => {
    const page = await v1.listActivity("p1", { limit: 2 })
    expect(page.data).toHaveLength(2)
    expect(page.nextCursor).not.toBeNull()
    expect(leaksSecret(page)).toBe(false)
  })

  it("the web UI keeps every row", async () => {
    const out = await activityService.listProjectActivity("p1", { limit: 50 })
    expect(out.items).toHaveLength(13)
  })
})

// =========================================================================== masks

mechanism("mask:pbi-ref", () => {
  it("masks a confidential PBI named by id, number or PBI-number; leaves a normal or unknown one", async () => {
    for (const ref of ["pbC", "2", "PBI-2"]) expect(await conf.maskPbiRef("p1", ref)).toBe(NO_SUCH_ID)
    for (const ref of ["pbA", "1", "PBI-1", "nope"]) expect(await conf.maskPbiRef("p1", ref)).toBe(ref)
  })

  it("create_task / acceptance criteria / list claims / mr-links hand the service a missing id for it", async () => {
    vi.mocked(sprintBacklog.createTask).mockClear()
    await handlers.createTaskOp(writeInput({ sprintId: "s1" }, { pbItemId: "pbC", taskName: "x" }))
    await handlers.createTaskOp(writeInput({ sprintId: "s1" }, { pbItemId: "pbA", taskName: "x" }))
    expect(vi.mocked(sprintBacklog.createTask).mock.calls.map((c) => c[2].pbItemId)).toEqual([NO_SUCH_ID, "pbA"])

    await handlers.createAcceptanceCriterionOp(writeInput({ itemId: "PBI-2" }, { text: "x" }))
    await handlers.updateAcceptanceCriterionOp(writeInput({ itemId: "2", acRef: "AC-1" }, { text: "x" }))
    await handlers.deleteAcceptanceCriterionOp(writeInput({ itemId: "pbC", acRef: "AC-1" }))
    await handlers.listAcceptanceCriteriaOp("p1", "PBI-2")
    await handlers.createAcceptanceCriterionOp(writeInput({ itemId: "PBI-1" }, { text: "x" }))
    expect(vi.mocked(acService.createAcceptanceCriterion).mock.calls.map((c) => c[1])).toEqual([NO_SUCH_ID, "PBI-1"])
    expect(vi.mocked(acService.updateAcceptanceCriterion).mock.calls[0]?.[1]).toBe(NO_SUCH_ID)
    expect(vi.mocked(acService.deleteAcceptanceCriterion).mock.calls[0]?.[1]).toBe(NO_SUCH_ID)
    expect(vi.mocked(acService.listAcceptanceCriteria).mock.calls[0]?.[1]).toBe(NO_SUCH_ID)

    vi.mocked(devWork.linkMergeRequest).mockClear()
    const url = "https://gitlab.scm.service.infosys.yamaha.com/g/r/-/merge_requests/7"
    await devHandlers.linkMergeRequestOp(writeInput({}, { pbi: "pbC", url }))
    await devHandlers.linkMergeRequestOp(writeInput({}, { pbi: "pbA", url }))
    // A bad URL keeps the service's own order (URL first), so it answers the same for any PBI.
    await devHandlers.linkMergeRequestOp(writeInput({}, { pbi: "pbC", url: "not a url" }))
    expect(vi.mocked(devWork.linkMergeRequest).mock.calls.map((c) => c[1].pbi)).toEqual([NO_SUCH_ID, "pbA", "pbC"])

    vi.mocked(devWork.claimWork).mockClear()
    vi.mocked(devWork.claimWork).mockResolvedValue({ claim: {}, created: true, takenOver: [], superseded: [] } as never)
    await devHandlers.claimWorkOp(writeInput({}, { pbi: "PBI-2", sessionId: "s" }))
    await devHandlers.claimWorkOp(writeInput({}, { pbi: "PBI-1", sessionId: "s" }))
    expect(vi.mocked(devWork.claimWork).mock.calls.map((c) => c[1].pbi)).toEqual([NO_SUCH_ID, "PBI-1"])
  })
})

mechanism("mask:pbi-ids", () => {
  it("replaces confidential ids, keeping length and order", async () => {
    expect(await conf.maskPbiIds(["pbA", "pbC", "nope"])).toEqual(["pbA", NO_SUCH_ID, "nope"])
    expect(await conf.maskPbiIds(["pbA"])).toEqual(["pbA"])
  })

  it("add PBIs to a sprint / create a sprint (selection and carry-over) never pass the confidential id on", async () => {
    vi.mocked(sprintBacklog.addPbisToSprint).mockResolvedValue({ added: 1, skipped: 1 } as never)
    await handlers.addSprintPbisOp(writeInput({ sprintId: "s1" }, { pbIds: ["pbA", "pbC"] }))
    expect(vi.mocked(sprintBacklog.addPbisToSprint).mock.calls[0]?.[2]).toEqual(["pbA", NO_SUCH_ID])

    vi.mocked(sprints.createSprint).mockResolvedValue({ id: "s2", items: [] } as never)
    await handlers.createSprintOp(
      writeInput({}, { sprintName: "S", startDate: "2026-11-01", endDate: "2026-11-14", selectedPbIds: ["pbA", "pbC"], carryOver: { fromSprintId: "s1", pbItemIds: ["pbC"] } })
    )
    const input = vi.mocked(sprints.createSprint).mock.calls[0]?.[1]
    expect(input?.selectedPbIds).toEqual(["pbA", NO_SUCH_ID])
    expect(input?.carryOver?.pbItemIds).toEqual([NO_SUCH_ID])
  })
})

mechanism("mask:task-id", () => {
  it("masks a task under a confidential PBI; leaves a normal or unknown task", async () => {
    expect(await conf.maskTaskId("tC")).toBe(NO_SUCH_ID)
    expect(await conf.maskTaskId("tA")).toBe("tA")
    expect(await conf.maskTaskId("nope")).toBe("nope")
  })

  it("update_task and claim_work by task id hand the service a missing id for it", async () => {
    vi.mocked(sprintBacklog.updateTask).mockClear()
    await handlers.updateTaskOp(writeInput({ sprintId: "s1", taskId: "tC" }, { status: "done" }))
    await handlers.updateTaskOp(writeInput({ sprintId: "s1", taskId: "tA" }, { status: "done" }))
    expect(vi.mocked(sprintBacklog.updateTask).mock.calls.map((c) => c[2])).toEqual([NO_SUCH_ID, "tA"])

    vi.mocked(devWork.claimWork).mockClear()
    await devHandlers.claimWorkOp(writeInput({}, { taskId: "tC", sessionId: "s" }))
    await devHandlers.claimWorkOp(writeInput({}, { taskId: "tA", sessionId: "s" }))
    expect(vi.mocked(devWork.claimWork).mock.calls.map((c) => c[1].taskId)).toEqual([NO_SUCH_ID, "tA"])
  })
})

mechanism("mask:claim-id", () => {
  it("masks a claim on a confidential PBI; leaves a normal or unknown claim", async () => {
    expect(await conf.maskClaimId("p1", "clC")).toBe(NO_SUCH_ID)
    expect(await conf.maskClaimId("p1", "clA")).toBe("clA")
    expect(await conf.maskClaimId("p1", "nope")).toBe("nope")
  })

  it("heartbeat, release and declare scope hand the service a missing id for it", async () => {
    vi.mocked(devWork.heartbeatClaim).mockResolvedValue({ claim: {} } as never)
    vi.mocked(devWork.releaseClaim).mockResolvedValue({ claim: {} } as never)
    vi.mocked(devWork.declareScope).mockResolvedValue({ scope: [], overlaps: [] } as never)
    for (const claimId of ["clC", "clA"]) {
      await devHandlers.heartbeatClaimOp(writeInput({ claimId }, {}))
      await devHandlers.releaseClaimOp(writeInput({ claimId }, {}))
      await devHandlers.declareScopeOp(writeInput({ claimId }, { scope: [] }))
    }
    expect(vi.mocked(devWork.heartbeatClaim).mock.calls.map((c) => c[1])).toEqual([NO_SUCH_ID, "clA"])
    expect(vi.mocked(devWork.releaseClaim).mock.calls.map((c) => c[1])).toEqual([NO_SUCH_ID, "clA"])
    expect(vi.mocked(devWork.declareScope).mock.calls.map((c) => c[1])).toEqual([NO_SUCH_ID, "clA"])
  })
})

mechanism("mask:comment-target", () => {
  it("masks the threads of a confidential PBI and of its tasks; leaves normal ones and Icebox threads", async () => {
    expect(await conf.maskCommentEntityId("p1", "pbi", "pbC")).toBe(NO_SUCH_ID)
    expect(await conf.maskCommentEntityId("p1", "pbi", "PBI-2")).toBe(NO_SUCH_ID)
    expect(await conf.maskCommentEntityId("p1", "sprint_task", "tC")).toBe(NO_SUCH_ID)
    expect(await conf.maskCommentEntityId("p1", "pbi", "pbA")).toBe("pbA")
    expect(await conf.maskCommentEntityId("p1", "sprint_task", "tA")).toBe("tA")
    expect(await conf.maskCommentEntityId("p1", "icebox", "ib1")).toBe("ib1")
  })

  it("list / add comments and progress comments hand the service a missing id for them", async () => {
    vi.mocked(comments.listComments).mockResolvedValue({ items: [], nextCursor: null } as never)
    vi.mocked(comments.createComment).mockResolvedValue({} as never)
    await handlers.listCommentsOp("p1", {} as never, { entityType: "pbi", entityId: "pbC" })
    await handlers.listCommentsOp("p1", {} as never, { entityType: "pbi", entityId: "pbA" })
    expect(vi.mocked(comments.listComments).mock.calls.map((c) => c[1].entityId)).toEqual([NO_SUCH_ID, "pbA"])

    vi.mocked(comments.createComment).mockClear()
    await handlers.createCommentOp(writeInput({}, { entityType: "sprint_task", entityId: "tC", body: "x" }))
    await handlers.createCommentOp(writeInput({}, { entityType: "sprint_task", entityId: "tA", body: "x" }))
    expect(vi.mocked(comments.createComment).mock.calls.map((c) => c[1].entityId)).toEqual([NO_SUCH_ID, "tA"])

    vi.mocked(devWork.postProgress).mockClear()
    await devHandlers.postProgressOp(writeInput({}, { entityType: "pbi", entityId: "pbC", body: "x" }))
    await devHandlers.postProgressOp(writeInput({}, { entityType: "pbi", entityId: "pbA", body: "x" }))
    expect(vi.mocked(devWork.postProgress).mock.calls.map((c) => c[1].entityId)).toEqual([NO_SUCH_ID, "pbA"])
  })
})

// =========================================================================== filters

mechanism("filter:claims", () => {
  const claim = (id: string, pbiId: string) => ({ id, pbi: { id: pbiId } })

  it("the claim list asks the service to exclude confidential claims in the query (before the page limit)", async () => {
    vi.mocked(devWork.listClaims).mockResolvedValue({ data: [claim("c1", "pbA")], staleAfterHours: 4 } as never)
    await devHandlers.listClaimsOp("p1", {}, "u1")
    expect(vi.mocked(devWork.listClaims).mock.calls[0]?.[4]).toEqual({ hideConfidential: true })
  })

  it("the repository query filters on the PBI's flag only for token surfaces", async () => {
    const { findOpenClaims } = await import("@/services/dev-work/dev-work.repository")
    const since = new Date(0)
    const db = fixture.confidentialDb
    const token = await findOpenClaims(db as never, "p1", since, {}, true)
    expect(vi.mocked(db.workClaim.findMany).mock.lastCall?.[0]).toMatchObject({ where: { backlogItem: { deletedAt: null, confidential: false } } })
    expect(token).toBeDefined()
    await findOpenClaims(db as never, "p1", since, {})
    expect(vi.mocked(db.workClaim.findMany).mock.lastCall?.[0]).toMatchObject({ where: { backlogItem: { deletedAt: null } } })
    expect(JSON.stringify(vi.mocked(db.workClaim.findMany).mock.lastCall?.[0])).not.toContain("confidential")
  })

  it("scope overlaps drop other people's claims on a confidential PBI", async () => {
    vi.mocked(devWork.declareScope).mockResolvedValue({ scope: [], overlaps: [claim("o1", "pbA"), claim("o2", "pbC")] } as never)
    const out = await devHandlers.declareScopeOp(writeInput({ claimId: "clA" }, { scope: [] }))
    expect(out.data.overlaps.map((o) => (o as unknown as { id: string }).id)).toEqual(["o1"])
  })

  it("nothing is dropped when nothing is confidential", async () => {
    expect(await conf.withoutConfidentialItems([claim("c1", "pbA")], (c) => c.pbi.id)).toHaveLength(1)
    expect(await conf.withoutConfidentialItems([], () => "x")).toEqual([])
  })
})

mechanism("filter:sprint-answer", () => {
  const item = (id: string, pbItemId: string) => ({ id, pbItemId })

  it("create / update sprint answers drop the tasks of a confidential PBI", async () => {
    vi.mocked(sprints.createSprint).mockResolvedValue({ id: "s2", items: [item("i1", "pbA"), item("i2", "pbC")] } as never)
    vi.mocked(sprints.updateSprint).mockResolvedValue({ id: "s2", items: [item("i1", "pbA"), item("i2", "pbC")] } as never)
    const created = await handlers.createSprintOp(writeInput({}, { sprintName: "S", startDate: "2026-11-01", endDate: "2026-11-14" }))
    const updated = await handlers.updateSprintOp(writeInput({ sprintId: "s2" }, { sprintGoal: "g" }))
    expect((created.data.items as Array<{ id: string }>).map((i) => i.id)).toEqual(["i1"])
    expect((updated.data.items as unknown as Array<{ id: string }>).map((i) => i.id)).toEqual(["i1"])
  })
})

mechanism("schema:no-flag", () => {
  it("the web UI schema carries the flag", () => {
    expect(updateBacklogItemSchema.parse({ confidential: true })).toEqual({ confidential: true })
  })

  it("the token schema neither accepts nor passes it on (REST and MCP)", () => {
    expect(handlers.v1UpdatePbiSchema.parse({ confidential: true, initiative: "x" })).toEqual({ initiative: "x" })
    expect(Object.keys(handlers.v1UpdatePbiSchema.shape)).not.toContain("confidential")
  })
})

// =========================================================================== helpers

describe("api-v1.confidential helpers", () => {
  it("the where-fragments are live-and-not-confidential", () => {
    expect(conf.API_VISIBLE_PBI).toEqual({ deletedAt: null, confidential: false })
    expect(conf.API_VISIBLE_PBI_OF).toEqual({ pbItem: { deletedAt: null, confidential: false } })
    expect(conf.apiVisiblePbi({ projectId: "p1" })).toEqual({ projectId: "p1", deletedAt: null, confidential: false })
  })

  it("confidentialPbiIds finds only the confidential ones (and reads nothing for an empty list)", async () => {
    expect([...(await conf.confidentialPbiIds(["pbA", "pbC", "x"]))]).toEqual(["pbC"])
    const reads = fixture.confidentialDb.productBacklogItem.findMany.mock.calls.length
    expect((await conf.confidentialPbiIds([])).size).toBe(0)
    expect(fixture.confidentialDb.productBacklogItem.findMany.mock.calls.length).toBe(reads)
  })

  it("a confidential PBI answers the same error as a missing one (class and code)", async () => {
    const error = await v1.getPbi("p1", "pbC").catch((e: unknown) => e)
    expect(error).toBeInstanceOf(NotFoundError)
  })
})
