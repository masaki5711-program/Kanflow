import { beforeEach, describe, expect, it, vi } from "vitest"
import { ACTOR, PROJECT_ID, asRole, ctx, read, req, signedOut } from "./route-harness"

vi.mock("@/lib/auth", async () => (await import("./route-harness")).authModule)
vi.mock("@/lib/prisma", async () => (await import("./route-harness")).prismaModule)
vi.mock("@/lib/logger", async () => (await import("./route-harness")).loggerModule)
vi.mock("@/services/reactions/reactions.service", () => ({ getReactions: vi.fn(), toggleReaction: vi.fn() }))

const svc = await import("@/services/reactions/reactions.service")
const route = await import("@/app/api/projects/[projectId]/reactions/route")
const { NotFoundError } = await import("@/services/_shared")
const { REACTION_RATE_LIMIT, getRateLimiter } = await import("@/lib/rate-limit")

const get = (q: string) => new Request(`http://localhost/api/projects/${PROJECT_ID}/reactions${q}`)
const toggle = { targetType: "comment", targetId: "c1", emoji: "👍" }

beforeEach(() => {
  for (const fn of Object.values(svc)) vi.mocked(fn as () => unknown).mockReset()
  vi.mocked(svc.getReactions).mockResolvedValue({ c1: [] })
  vi.mocked(svc.toggleReaction).mockResolvedValue({ active: true, reactions: [] })
})

describe("GET /reactions", () => {
  it("returns the reactions of the asked ids for any member", async () => {
    asRole("dev")
    expect(await read(await route.GET(get("?targetType=comment&ids=c1,c2"), ctx()))).toEqual({ status: 200, body: { reactions: { c1: [] } } })
    expect(svc.getReactions).toHaveBeenCalledWith(PROJECT_ID, { targetType: "comment", ids: ["c1", "c2"] }, "u1")
  })

  it.each(["", "?targetType=comment", "?targetType=pbi&ids=a", "?targetType=comment&ids="])("400 for %s", async (q) => {
    asRole("dev")
    expect((await route.GET(get(q), ctx())).status).toBe(400)
    expect(svc.getReactions).not.toHaveBeenCalled()
  })

  it("401 signed out, 404 for a non-member", async () => {
    signedOut()
    expect((await route.GET(get("?targetType=comment&ids=a"), ctx())).status).toBe(401)
    asRole(null)
    expect((await route.GET(get("?targetType=comment&ids=a"), ctx())).status).toBe(404)
  })
})

describe("POST /reactions", () => {
  it("toggles the viewer's reaction", async () => {
    asRole("dev")
    expect(await read(await route.POST(req("POST", toggle), ctx()))).toEqual({ status: 200, body: { active: true, reactions: [] } })
    expect(svc.toggleReaction).toHaveBeenCalledWith(PROJECT_ID, toggle, ACTOR)
  })

  it.each([
    { ...toggle, emoji: "💩" },
    { ...toggle, targetType: "pbi" },
    { targetType: "comment", emoji: "👍" },
    { ...toggle, targetId: "" },
  ])("400 for invalid input %#", async (input) => {
    asRole("dev")
    expect((await route.POST(req("POST", input), ctx())).status).toBe(400)
    expect(svc.toggleReaction).not.toHaveBeenCalled()
  })

  it("401 signed out, 404 non-member, 404 from the service", async () => {
    signedOut()
    expect((await route.POST(req("POST", toggle), ctx())).status).toBe(401)
    asRole(null)
    expect((await route.POST(req("POST", toggle), ctx())).status).toBe(404)
    asRole("dev")
    vi.mocked(svc.toggleReaction).mockRejectedValue(new NotFoundError("Reaction target not found"))
    expect((await route.POST(req("POST", toggle), ctx())).status).toBe(404)
  })

  it("section managers (not members) cannot react", async () => {
    asRole(null, "section_manager")
    const { sectionFindFirst } = await import("./route-harness")
    sectionFindFirst.mockResolvedValue({ id: "ps" })
    expect((await route.POST(req("POST", toggle), ctx())).status).toBe(403)
  })

  it("answers 429 with Retry-After once the per-user limit is used up", async () => {
    asRole("dev")
    // The limiter is process-wide: start this user from zero.
    getRateLimiter("reactions", REACTION_RATE_LIMIT).reset(ACTOR.userId)
    for (let i = 0; i < REACTION_RATE_LIMIT.limit; i++) {
      expect((await route.POST(req("POST", toggle), ctx())).status).toBe(200)
    }
    const limited = await route.POST(req("POST", toggle), ctx())
    expect(limited.status).toBe(429)
    expect(Number(limited.headers.get("Retry-After"))).toBeGreaterThan(0)
  })
})
