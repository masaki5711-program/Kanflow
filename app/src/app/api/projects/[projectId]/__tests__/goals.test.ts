import { beforeEach, describe, expect, it, vi } from "vitest"
import { ACTOR, PROJECT_ID, asRole, ctx, read, req } from "./route-harness"

vi.mock("@/lib/auth", async () => (await import("./route-harness")).authModule)
vi.mock("@/lib/prisma", async () => (await import("./route-harness")).prismaModule)
vi.mock("@/lib/logger", async () => (await import("./route-harness")).loggerModule)
vi.mock("@/services/goals/goals.service", () => ({
  listGoals: vi.fn(),
  createGoal: vi.fn(),
  updateGoal: vi.fn(),
  deleteGoal: vi.fn(),
}))

const svc = await import("@/services/goals/goals.service")
const list = await import("@/app/api/projects/[projectId]/goals/route")
const one = await import("@/app/api/projects/[projectId]/goals/[goalId]/route")
const { NotFoundError } = await import("@/services/_shared")

const gCtx = () => ctx({ goalId: "g-1" })

beforeEach(() => {
  for (const fn of Object.values(svc)) vi.mocked(fn as () => unknown).mockReset()
})

describe("GET/POST /goals", () => {
  it("lists goals for a dev", async () => {
    asRole("dev")
    vi.mocked(svc.listGoals).mockResolvedValue([{ id: "g" }] as never)
    expect(await read(await list.GET(req("GET"), ctx()))).toEqual({ status: 200, body: [{ id: "g" }] })
  })

  it("maps list failure to 500", async () => {
    asRole("dev")
    vi.mocked(svc.listGoals).mockRejectedValue(new Error("x"))
    expect((await list.GET(req("GET"), ctx())).status).toBe(500)
  })

  it("creates as PO (201)", async () => {
    asRole("po")
    vi.mocked(svc.createGoal).mockResolvedValue({ id: "g" } as never)
    expect((await list.POST(req("POST", { title: "Goal" }), ctx())).status).toBe(201)
    expect(svc.createGoal).toHaveBeenCalledWith(PROJECT_ID, { title: "Goal" }, ACTOR)
  })

  it("refuses a dev (goal.write is PO/SM)", async () => {
    asRole("dev")
    expect((await list.POST(req("POST", { title: "Goal" }), ctx())).status).toBe(403)
  })

  it("rejects an empty title", async () => {
    asRole("po")
    expect((await list.POST(req("POST", { title: "" }), ctx())).status).toBe(400)
  })

  it("maps create failure to 500", async () => {
    asRole("po")
    vi.mocked(svc.createGoal).mockRejectedValue(new Error("x"))
    expect(await read(await list.POST(req("POST", { title: "G" }), ctx()))).toEqual({
      status: 500,
      body: { error: "作成に失敗しました", code: "INTERNAL" },
    })
  })
})

describe("PATCH/DELETE /goals/[goalId]", () => {
  it("updates as SM", async () => {
    asRole("sm")
    vi.mocked(svc.updateGoal).mockResolvedValue({ id: "g-1" } as never)
    expect((await one.PATCH(req("PATCH", { description: null }), gCtx())).status).toBe(200)
    expect(svc.updateGoal).toHaveBeenCalledWith(PROJECT_ID, "g-1", { description: null }, ACTOR)
  })

  it("rejects an empty title", async () => {
    asRole("sm")
    expect((await one.PATCH(req("PATCH", { title: "" }), gCtx())).status).toBe(400)
  })

  it("404 for a goal outside the project", async () => {
    asRole("sm")
    vi.mocked(svc.updateGoal).mockRejectedValue(new NotFoundError())
    expect((await one.PATCH(req("PATCH", {}), gCtx())).status).toBe(404)
  })

  it("maps update failure to 500", async () => {
    asRole("sm")
    vi.mocked(svc.updateGoal).mockRejectedValue(new Error("x"))
    expect((await one.PATCH(req("PATCH", {}), gCtx())).status).toBe(500)
  })

  it("deletes", async () => {
    asRole("po")
    vi.mocked(svc.deleteGoal).mockResolvedValue(undefined as never)
    expect(await read(await one.DELETE(req("DELETE"), gCtx()))).toEqual({ status: 200, body: { success: true } })
    expect(svc.deleteGoal).toHaveBeenCalledWith(PROJECT_ID, "g-1", expect.objectContaining({ userId: expect.any(String) }))
  })

  it("refuses delete by a dev and maps delete failure to 500", async () => {
    asRole("dev")
    expect((await one.DELETE(req("DELETE"), gCtx())).status).toBe(403)
    asRole("po")
    vi.mocked(svc.deleteGoal).mockRejectedValue(new Error("x"))
    expect((await one.DELETE(req("DELETE"), gCtx())).status).toBe(500)
  })
})
