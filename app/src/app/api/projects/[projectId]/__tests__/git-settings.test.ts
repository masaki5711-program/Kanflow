import { beforeEach, describe, expect, it, vi } from "vitest"
import { ACTOR, PROJECT_ID, asRole, ctx, read, req, signedOut } from "./route-harness"

vi.mock("@/lib/auth", async () => (await import("./route-harness")).authModule)
vi.mock("@/lib/prisma", async () => (await import("./route-harness")).prismaModule)
vi.mock("@/lib/logger", async () => (await import("./route-harness")).loggerModule)
// Keep the real (pure) gitSettingsSchema so validation behaves exactly like production;
// only the I/O functions are mocked.
vi.mock("@/services/git/git.service", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/git/git.service")>()
  return { ...actual, getGitSettings: vi.fn(), updateGitSettings: vi.fn() }
})

const svc = await import("@/services/git/git.service")
const route = await import("@/app/api/projects/[projectId]/git/route")

const SETTINGS = { enabled: false, hasToken: false, tokenHint: null, autoCompleteOnMerge: false, repositories: [], pollIntervalSec: 180 }

beforeEach(() => {
  vi.mocked(svc.getGitSettings).mockReset().mockResolvedValue(SETTINGS)
  vi.mocked(svc.updateGitSettings).mockReset().mockImplementation(async () => ({ ...SETTINGS, enabled: true }))
})

describe("GET /git", () => {
  it("any project member can read (token never in the body)", async () => {
    asRole("dev")
    const res = await route.GET(req("GET"), ctx())
    expect(await read(res)).toEqual({ status: 200, body: SETTINGS })
    expect(svc.getGitSettings).toHaveBeenCalledWith(PROJECT_ID)
  })

  it("401 without a session, 404 for a non-member", async () => {
    signedOut()
    expect((await route.GET(req("GET"), ctx())).status).toBe(401)
    asRole(null)
    expect((await route.GET(req("GET"), ctx())).status).toBe(404)
    expect(svc.getGitSettings).not.toHaveBeenCalled()
  })
})

describe("PUT /git", () => {
  it("PO / SM may update settings (git.configure)", async () => {
    asRole("po")
    const res = await route.PUT(req("PUT", { enabled: true }), ctx())
    expect(res.status).toBe(200)
    expect(svc.updateGitSettings).toHaveBeenCalledWith(PROJECT_ID, { enabled: true }, ACTOR)

    asRole("sm")
    expect((await route.PUT(req("PUT", { enabled: true }), ctx())).status).toBe(200)
  })

  it("403 for a developer (git.configure is PO/SM only)", async () => {
    asRole("dev")
    expect((await route.PUT(req("PUT", { enabled: true }), ctx())).status).toBe(403)
    expect(svc.updateGitSettings).not.toHaveBeenCalled()
  })

  it("400 for an unknown field (schema is .strict())", async () => {
    asRole("po")
    const res = await route.PUT(req("PUT", { enabled: true, extra: 1 }), ctx())
    expect(res.status).toBe(400)
    expect(svc.updateGitSettings).not.toHaveBeenCalled()
  })

  it("400 for a token shorter than 8 characters", async () => {
    asRole("po")
    const res = await route.PUT(req("PUT", { token: "short" }), ctx())
    expect(res.status).toBe(400)
  })

  it("accepts token: null to remove the saved token", async () => {
    asRole("po")
    const res = await route.PUT(req("PUT", { token: null }), ctx())
    expect(res.status).toBe(200)
    expect(svc.updateGitSettings).toHaveBeenCalledWith(PROJECT_ID, { token: null }, ACTOR)
  })

  it("400 for malformed JSON", async () => {
    asRole("po")
    expect((await route.PUT(req("PUT", "{bad"), ctx())).status).toBe(400)
  })
})
