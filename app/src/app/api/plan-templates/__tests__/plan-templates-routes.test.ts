import { beforeEach, describe, expect, it, vi } from "vitest"
import { ForbiddenError, ValidationError } from "@/services/_shared/errors"

const authMock = vi.fn()
vi.mock("@/lib/auth", () => ({ auth: () => authMock() }))
vi.mock("@/lib/prisma", () => ({ prisma: {} }))
vi.mock("@/lib/logger", () => ({
  logger: { child: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }) },
}))

const svc = {
  listTemplates: vi.fn(async () => []),
  getTemplate: vi.fn(async () => ({ id: "t1" })),
  createTemplate: vi.fn(async () => ({ id: "new" })),
  updateTemplate: vi.fn(async () => ({ id: "t1", version: 3 })),
  deleteTemplate: vi.fn(async () => undefined),
  resetTemplate: vi.fn(async () => ({ id: "t1" })),
  duplicateTemplate: vi.fn(async () => ({ id: "copy" })),
  listRevisions: vi.fn(async () => []),
}
vi.mock("@/services/plan-templates/plan-templates.service", () => svc)

const list = await import("../route")
const one = await import("../[id]/route")
const reset = await import("../[id]/reset/route")
const revisions = await import("../[id]/revisions/route")
const duplicate = await import("../[id]/duplicate/route")

const params = { params: Promise.resolve({ id: "t1" }) }
const json = (url: string, method: string, body: unknown) =>
  new Request(`http://x${url}`, { method, body: JSON.stringify(body), headers: { "content-type": "application/json" } })
const CONTENT = { stages: [{ name: "企画" }] }

describe("plan template routes", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    authMock.mockResolvedValue({ user: { id: `u-${Math.random()}`, name: "Alice", role: "member" } })
  })

  it("every handler answers 401 without a session and never reaches the service", async () => {
    authMock.mockResolvedValue(null)
    const responses = await Promise.all([
      list.GET(),
      list.POST(json("/api/plan-templates", "POST", { name: "x", content: CONTENT })),
      one.GET(new Request("http://x/api/plan-templates/t1"), params),
      one.PUT(json("/api/plan-templates/t1", "PUT", { name: "x", content: CONTENT }), params),
      one.DELETE(new Request("http://x/api/plan-templates/t1", { method: "DELETE" }), params),
      reset.POST(json("/api/plan-templates/t1/reset", "POST", {}), params),
      revisions.GET(new Request("http://x/api/plan-templates/t1/revisions"), params),
      duplicate.POST(json("/api/plan-templates/t1/duplicate", "POST", {}), params),
    ])
    expect(responses.map((r) => r?.status)).toEqual(Array(8).fill(401))
    for (const fn of Object.values(svc)) expect(fn).not.toHaveBeenCalled()
  })

  it("any logged-in user can list and create (shared by default)", async () => {
    expect((await list.GET())?.status).toBe(200)
    const res = await list.POST(json("/api/plan-templates", "POST", { name: " 新工法 ", content: CONTENT }))
    expect(res?.status).toBe(201)
    expect(svc.createTemplate).toHaveBeenCalledWith({ name: "新工法", visibility: "public", content: CONTENT }, expect.objectContaining({ userName: "Alice" }))
  })

  it("validates content (depth, empty names) with 400 and bounds the body with 413", async () => {
    const deep = { stages: [{ name: "a", children: [{ name: "b", children: [{ name: "c", children: [{ name: "d" }] }] }] }] }
    expect((await list.POST(json("/api/plan-templates", "POST", { name: "x", content: deep })))?.status).toBe(400)
    expect((await list.POST(json("/api/plan-templates", "POST", { name: "x", content: { stages: [{ name: "" }] } })))?.status).toBe(400)
    const huge = { name: "x", content: { stages: [{ name: "a", description: "z".repeat(300_000) }] } }
    expect((await list.POST(json("/api/plan-templates", "POST", huge)))?.status).toBe(413)
    expect(svc.createTemplate).not.toHaveBeenCalled()
  })

  it("maps service refusals (403 delete, 400 built-in) and passes the version / revisionId", async () => {
    svc.deleteTemplate.mockRejectedValueOnce(new ForbiddenError("no", {}, "PLAN_TEMPLATE_DELETE_FORBIDDEN"))
    const del = await one.DELETE(new Request("http://x/api/plan-templates/t1", { method: "DELETE" }), params)
    expect(del?.status).toBe(403)
    expect(await del?.json()).toMatchObject({ code: "PLAN_TEMPLATE_DELETE_FORBIDDEN" })
    svc.deleteTemplate.mockRejectedValueOnce(new ValidationError("no", {}, "PLAN_TEMPLATE_BUILTIN"))
    expect((await one.DELETE(new Request("http://x/api/plan-templates/t1", { method: "DELETE" }), params))?.status).toBe(400)

    await one.PUT(json("/api/plan-templates/t1", "PUT", { name: "x", content: CONTENT, version: 2 }), params)
    expect(svc.updateTemplate).toHaveBeenCalledWith("t1", expect.objectContaining({ version: 2 }), expect.anything())
    await reset.POST(json("/api/plan-templates/t1/reset", "POST", { version: 4 }), params)
    expect(svc.resetTemplate).toHaveBeenCalledWith("t1", 4, expect.anything())
    await revisions.GET(new Request("http://x/api/plan-templates/t1/revisions?revisionId=r9"), params)
    expect(svc.listRevisions).toHaveBeenCalledWith("t1", expect.anything(), "r9")
  })

  it("rate-limits template writes per user (429)", async () => {
    authMock.mockResolvedValue({ user: { id: "busy-user", name: "Busy", role: "member" } })
    const statuses: number[] = []
    for (let i = 0; i < 61; i++) statuses.push((await duplicate.POST(json("/api/plan-templates/t1/duplicate", "POST", {}), params))?.status ?? 0)
    expect(statuses.slice(0, 60).every((s) => s === 201)).toBe(true)
    expect(statuses[60]).toBe(429)
  })
})
