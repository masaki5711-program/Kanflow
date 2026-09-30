import { beforeEach, describe, expect, it, vi } from "vitest"
import { ACTOR, PROJECT_ID, asRole, ctx, read, req, signedOut } from "./route-harness"

vi.mock("@/lib/auth", async () => (await import("./route-harness")).authModule)
vi.mock("@/lib/prisma", async () => (await import("./route-harness")).prismaModule)
vi.mock("@/lib/logger", async () => (await import("./route-harness")).loggerModule)
vi.mock("@/services/surveillance-settings/surveillance-settings.service", () => ({
  getSurveillanceSettings: vi.fn(),
  updateSurveillanceSettings: vi.fn(),
}))

const svc = await import("@/services/surveillance-settings/surveillance-settings.service")
const route = await import("@/app/api/projects/[projectId]/surveillance-settings/route")
const { DEFAULT_SURVEILLANCE_SETTINGS } = await import("@/lib/surveillance-settings")

const SETTINGS = { ...DEFAULT_SURVEILLANCE_SETTINGS }

beforeEach(() => {
  vi.mocked(svc.getSurveillanceSettings).mockReset().mockResolvedValue(SETTINGS)
  vi.mocked(svc.updateSurveillanceSettings).mockReset().mockImplementation(async (_p, input) => input)
})

describe("GET /surveillance-settings", () => {
  it("any member can read", async () => {
    asRole("dev")
    expect(await read(await route.GET(req("GET"), ctx()))).toEqual({ status: 200, body: { settings: SETTINGS } })
    expect(svc.getSurveillanceSettings).toHaveBeenCalledWith(PROJECT_ID)
  })

  it("401 / 404 for signed-out users and outsiders", async () => {
    signedOut()
    expect((await route.GET(req("GET"), ctx())).status).toBe(401)
    asRole(null)
    expect((await route.GET(req("GET"), ctx())).status).toBe(404)
  })
})

describe("PUT /surveillance-settings", () => {
  const body = { ...SETTINGS, stalledDays: 5 }

  it("PO saves the validated object", async () => {
    asRole("po")
    expect(await read(await route.PUT(req("PUT", body), ctx()))).toEqual({ status: 200, body: { settings: body } })
    expect(svc.updateSurveillanceSettings).toHaveBeenCalledWith(PROJECT_ID, body, ACTOR)
  })

  it("system admins may save without membership", async () => {
    asRole(null, "admin")
    expect((await route.PUT(req("PUT", body), ctx())).status).toBe(200)
  })

  it.each(["sm", "dev"] as const)("403 for %s", async (role) => {
    asRole(role)
    expect((await route.PUT(req("PUT", body), ctx())).status).toBe(403)
    expect(svc.updateSurveillanceSettings).not.toHaveBeenCalled()
  })

  it("400 for out-of-range, partial or malformed bodies", async () => {
    asRole("po")
    for (const bad of [{ ...SETTINGS, stalledDays: 0 }, { stalledDays: 3 }, "{bad"]) {
      expect((await route.PUT(req("PUT", bad), ctx())).status).toBe(400)
    }
    expect(svc.updateSurveillanceSettings).not.toHaveBeenCalled()
  })
})
