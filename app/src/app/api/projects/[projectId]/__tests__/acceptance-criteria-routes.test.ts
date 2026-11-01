import { beforeEach, describe, expect, it, vi } from "vitest"
import { PROJECT_ID, asRole, ctx, read, signedOut } from "./route-harness"

vi.mock("@/lib/auth", async () => (await import("./route-harness")).authModule)
vi.mock("@/lib/prisma", async () => (await import("./route-harness")).prismaModule)
vi.mock("@/lib/logger", async () => (await import("./route-harness")).loggerModule)
vi.mock("@/services/acceptance-criteria/acceptance-criteria.service", () => ({
  listAcceptanceCriteria: vi.fn(),
  createAcceptanceCriterion: vi.fn(),
  updateAcceptanceCriterion: vi.fn(),
  deleteAcceptanceCriterion: vi.fn(),
}))

const svc = await import("@/services/acceptance-criteria/acceptance-criteria.service")
const listRoute = await import("@/app/api/projects/[projectId]/backlog/[itemId]/acceptance-criteria/route")
const itemRoute = await import("@/app/api/projects/[projectId]/backlog/[itemId]/acceptance-criteria/[acRef]/route")

const DTO = { id: "PBI-12/AC-1", seq: 1, given: null, when: null, then: null, text: "x", evidenceKind: null }
const req = (method: string, body?: unknown) =>
  new Request(`http://localhost/api/projects/${PROJECT_ID}/backlog/b1/acceptance-criteria`, {
    method,
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
const listCtx = () => ctx({ itemId: "b1" })
const itemCtx = () => ctx({ itemId: "b1", acRef: "AC-1" })

beforeEach(() => {
  vi.mocked(svc.listAcceptanceCriteria).mockReset().mockResolvedValue({ data: [DTO] })
  vi.mocked(svc.createAcceptanceCriterion).mockReset().mockResolvedValue(DTO)
  vi.mocked(svc.updateAcceptanceCriterion).mockReset().mockResolvedValue(DTO)
  vi.mocked(svc.deleteAcceptanceCriterion).mockReset().mockResolvedValue({ id: "PBI-12/AC-1" })
})

describe("GET (the PBI screen's checklist)", () => {
  it.each([
    ["dev", false],
    ["po", true],
    ["sm", true],
  ] as const)("%s reads the items; canEdit follows backlog.write (%s)", async (role, canEdit) => {
    asRole(role)
    expect(await read(await listRoute.GET(req("GET"), listCtx()))).toEqual({ status: 200, body: { data: [DTO], canEdit } })
    expect(svc.listAcceptanceCriteria).toHaveBeenCalledWith(PROJECT_ID, "b1")
  })

  it("401 without a session, 404 for a non-member", async () => {
    signedOut()
    expect((await listRoute.GET(req("GET"), listCtx())).status).toBe(401)
    asRole(null)
    expect((await listRoute.GET(req("GET"), listCtx())).status).toBe(404)
    expect(svc.listAcceptanceCriteria).not.toHaveBeenCalled()
  })
})

describe("writes need backlog.write (PO / SM / admin)", () => {
  it.each([["po"], ["sm"]] as const)("%s adds (201), edits and deletes through the service with the session actor", async (role) => {
    asRole(role)
    const created = await listRoute.POST(req("POST", { given: "g", evidenceKind: "test" }), listCtx())
    expect(await read(created)).toEqual({ status: 201, body: { data: DTO } })
    expect(svc.createAcceptanceCriterion).toHaveBeenCalledWith(PROJECT_ID, "b1", { given: "g", evidenceKind: "test" }, expect.objectContaining({ userId: "u1" }))
    expect((await itemRoute.PATCH(req("PATCH", { text: "y" }), itemCtx())).status).toBe(200)
    expect(svc.updateAcceptanceCriterion).toHaveBeenCalledWith(PROJECT_ID, "b1", "AC-1", { text: "y" }, expect.objectContaining({ userId: "u1" }))
    expect(await read(await itemRoute.DELETE(req("DELETE"), itemCtx()))).toEqual({ status: 200, body: { data: { id: "PBI-12/AC-1" } } })
  })

  it("a system admin passes", async () => {
    asRole(null, "admin")
    expect((await listRoute.POST(req("POST", { text: "x" }), listCtx())).status).toBe(201)
  })

  it("a developer is refused 403 on add / edit / delete before the service", async () => {
    asRole("dev")
    expect((await listRoute.POST(req("POST", { text: "x" }), listCtx())).status).toBe(403)
    expect((await itemRoute.PATCH(req("PATCH", { text: "x" }), itemCtx())).status).toBe(403)
    expect((await itemRoute.DELETE(req("DELETE"), itemCtx())).status).toBe(403)
    expect(svc.createAcceptanceCriterion).not.toHaveBeenCalled()
    expect(svc.updateAcceptanceCriterion).not.toHaveBeenCalled()
    expect(svc.deleteAcceptanceCriterion).not.toHaveBeenCalled()
  })

  it("an unknown evidenceKind is a 400; a missing criterion is the service's 404", async () => {
    asRole("po")
    expect((await listRoute.POST(req("POST", { text: "x", evidenceKind: "vibes" }), listCtx())).status).toBe(400)
    const { NotFoundError } = await import("@/services/_shared/errors")
    vi.mocked(svc.updateAcceptanceCriterion).mockRejectedValue(new NotFoundError("gone", {}, "AC_NOT_FOUND"))
    const res = await itemRoute.PATCH(req("PATCH", { text: "x" }), itemCtx())
    expect(await read(res)).toMatchObject({ status: 404, body: { code: "AC_NOT_FOUND" } })
  })
})
