import { beforeEach, describe, expect, it, vi } from "vitest"

const authMock = vi.fn()
vi.mock("@/lib/auth", () => ({ auth: () => authMock() }))
vi.mock("@/lib/prisma", () => ({ prisma: {} }))
vi.mock("@/lib/logger", () => ({
  logger: { child: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }) },
}))

const listSectionOptions = vi.fn()
vi.mock("@/services/sections/sections.service", () => ({ listSectionOptions: () => listSectionOptions() }))

/**
 * Type-only: requireAuth/requireAdmin gates make tsc infer
 * `Promise<Response | undefined>` for handlers; at runtime they always return.
 */
type Defined<T> = {
  [K in keyof T]: T[K] extends (...a: infer A) => Promise<infer R> ? (...a: A) => Promise<NonNullable<R>> : T[K]
}
function defined<T>(mod: T): Defined<T> {
  return mod as Defined<T>
}

const { GET } = defined(await import("@/app/api/sections/route"))

beforeEach(() => {
  authMock.mockReset().mockResolvedValue({ user: { id: "user-1", role: "member" } })
  listSectionOptions.mockReset()
})

describe("GET /api/sections", () => {
  it("returns 401 without a session", async () => {
    authMock.mockResolvedValue(null)
    expect((await GET()).status).toBe(401)
    expect(listSectionOptions).not.toHaveBeenCalled()
  })

  it("returns section options to any authenticated user", async () => {
    listSectionOptions.mockResolvedValue([{ id: "s1", name: "A" }])
    const res = await GET()
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual([{ id: "s1", name: "A" }])
  })

  it("maps failures to 500", async () => {
    listSectionOptions.mockRejectedValue(new Error("x"))
    const res = await GET()
    expect(res.status).toBe(500)
    expect(await res.json()).toEqual({ error: "取得に失敗しました", code: "INTERNAL" })
  })
})
