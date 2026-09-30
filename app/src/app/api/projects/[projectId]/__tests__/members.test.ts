import { beforeEach, describe, expect, it, vi } from "vitest"
import { PROJECT_ID, asRole, ctx, read, req } from "./route-harness"

vi.mock("@/lib/auth", async () => (await import("./route-harness")).authModule)
vi.mock("@/lib/prisma", async () => (await import("./route-harness")).prismaModule)
vi.mock("@/lib/logger", async () => (await import("./route-harness")).loggerModule)
vi.mock("@/services/members/members.service", () => ({
  listMembers: vi.fn(),
  addMember: vi.fn(),
  addMembersBulk: vi.fn(),
  changeMemberRole: vi.fn(),
  removeMember: vi.fn(),
}))

const svc = await import("@/services/members/members.service")
const list = await import("@/app/api/projects/[projectId]/members/route")
const one = await import("@/app/api/projects/[projectId]/members/[memberId]/route")
const { ConflictError, NotFoundError, ValidationError } = await import("@/services/_shared")

const mCtx = () => ctx({ memberId: "m-1" })

beforeEach(() => {
  for (const fn of Object.values(svc)) vi.mocked(fn as () => unknown).mockReset()
})

describe("GET /members", () => {
  it("lists members", async () => {
    asRole("dev")
    vi.mocked(svc.listMembers).mockResolvedValue([{ id: "m" }] as never)
    expect(await read(await list.GET(req("GET"), ctx()))).toEqual({ status: 200, body: [{ id: "m" }] })
    expect(svc.listMembers).toHaveBeenCalledWith(PROJECT_ID)
  })

  it("maps failure to 500", async () => {
    asRole("dev")
    vi.mocked(svc.listMembers).mockRejectedValue(new Error("x"))
    expect((await list.GET(req("GET"), ctx())).status).toBe(500)
  })
})

describe("POST /members", () => {
  it("adds one member by email (201)", async () => {
    asRole("po")
    vi.mocked(svc.addMember).mockResolvedValue({ id: "m-2" } as never)
    const res = await read(await list.POST(req("POST", { email: "a@example.com", role: "dev" }), ctx()))
    expect(res).toEqual({ status: 201, body: { id: "m-2" } })
    expect(svc.addMember).toHaveBeenCalledWith(PROJECT_ID, { userId: undefined, email: "a@example.com" }, "dev", expect.objectContaining({ userId: expect.any(String) }))
    expect(svc.addMembersBulk).not.toHaveBeenCalled()
  })

  it("adds in bulk: 201 when someone was added", async () => {
    asRole("sm")
    vi.mocked(svc.addMembersBulk).mockResolvedValue({ added: 2, skipped: 0 } as never)
    const res = await list.POST(req("POST", { userIds: ["u2", "u3"], role: "dev" }), ctx())
    expect(res.status).toBe(201)
    expect(svc.addMembersBulk).toHaveBeenCalledWith(PROJECT_ID, ["u2", "u3"], "dev", expect.objectContaining({ userId: expect.any(String) }))
  })

  it("adds in bulk: 200 when nothing new was added", async () => {
    asRole("sm")
    vi.mocked(svc.addMembersBulk).mockResolvedValue({ added: 0, skipped: 2 } as never)
    expect((await list.POST(req("POST", { userIds: ["u2"], role: "dev" }), ctx())).status).toBe(200)
  })

  it("refuses a dev (member.manage is PO/SM)", async () => {
    asRole("dev")
    expect((await list.POST(req("POST", { userId: "u2", role: "dev" }), ctx())).status).toBe(403)
    expect(svc.addMember).not.toHaveBeenCalled()
  })

  it.each([
    ["no identifier", { role: "dev" }],
    ["bad role", { userId: "u2", role: "owner" }],
    ["bad email", { email: "nope", role: "dev" }],
    ["too many ids", { userIds: Array.from({ length: 51 }, (_, i) => `u${i}`), role: "dev" }],
    ["empty ids and nothing else", { userIds: [], role: "dev" }],
  ])("rejects %s with 400", async (_n, body) => {
    asRole("po")
    expect((await list.POST(req("POST", body), ctx())).status).toBe(400)
    expect(svc.addMember).not.toHaveBeenCalled()
    expect(svc.addMembersBulk).not.toHaveBeenCalled()
  })

  it("surfaces unknown user (404) and duplicate (409)", async () => {
    asRole("po")
    vi.mocked(svc.addMember).mockRejectedValueOnce(new NotFoundError("no user"))
    expect((await list.POST(req("POST", { userId: "u9", role: "dev" }), ctx())).status).toBe(404)
    vi.mocked(svc.addMember).mockRejectedValueOnce(new ConflictError("already"))
    expect((await list.POST(req("POST", { userId: "u9", role: "dev" }), ctx())).status).toBe(409)
  })

  it("maps unknown failure to 500", async () => {
    asRole("po")
    vi.mocked(svc.addMember).mockRejectedValue(new Error("x"))
    expect(await read(await list.POST(req("POST", { userId: "u9", role: "dev" }), ctx()))).toEqual({
      status: 500,
      body: { error: "追加に失敗しました", code: "INTERNAL" },
    })
  })
})

describe("PATCH/DELETE /members/[memberId]", () => {
  it("changes a role", async () => {
    asRole("po")
    vi.mocked(svc.changeMemberRole).mockResolvedValue({ id: "m-1", role: "sm" } as never)
    expect(await read(await one.PATCH(req("PATCH", { role: "sm" }), mCtx()))).toEqual({
      status: 200,
      body: { id: "m-1", role: "sm" },
    })
    expect(svc.changeMemberRole).toHaveBeenCalledWith(PROJECT_ID, "m-1", "sm", expect.objectContaining({ userId: expect.any(String) }))
  })

  it("rejects an invalid role", async () => {
    asRole("po")
    expect((await one.PATCH(req("PATCH", { role: "admin" }), mCtx())).status).toBe(400)
  })

  it("surfaces the last-PO guard", async () => {
    asRole("po")
    vi.mocked(svc.changeMemberRole).mockRejectedValue(new ValidationError("last PO"))
    expect(await read(await one.PATCH(req("PATCH", { role: "dev" }), mCtx()))).toEqual({
      status: 400,
      body: { error: "last PO", code: "VALIDATION" },
    })
  })

  it("maps update failure to 500", async () => {
    asRole("po")
    vi.mocked(svc.changeMemberRole).mockRejectedValue(new Error("x"))
    expect((await one.PATCH(req("PATCH", { role: "dev" }), mCtx())).status).toBe(500)
  })

  it("removes a member", async () => {
    asRole("sm")
    vi.mocked(svc.removeMember).mockResolvedValue(undefined)
    expect(await read(await one.DELETE(req("DELETE"), mCtx()))).toEqual({ status: 200, body: { success: true } })
    expect(svc.removeMember).toHaveBeenCalledWith(PROJECT_ID, "m-1", expect.objectContaining({ userId: expect.any(String) }))
  })

  it("refuses removal by a dev; maps failure to 500", async () => {
    asRole("dev")
    expect((await one.DELETE(req("DELETE"), mCtx())).status).toBe(403)
    asRole("po")
    vi.mocked(svc.removeMember).mockRejectedValue(new Error("x"))
    expect((await one.DELETE(req("DELETE"), mCtx())).status).toBe(500)
  })
})
