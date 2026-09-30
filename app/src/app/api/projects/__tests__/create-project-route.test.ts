import { beforeEach, describe, expect, it, vi } from "vitest"
import { ValidationError } from "@/services/_shared/errors"

const authMock = vi.fn()
vi.mock("@/lib/auth", () => ({ auth: () => authMock() }))
vi.mock("@/lib/prisma", () => ({ prisma: {} }))
vi.mock("@/lib/logger", () => ({
  logger: { child: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }) },
}))

const createProject = vi.fn()
vi.mock("@/services/projects/projects.service", () => ({
  createProject: (...a: unknown[]) => createProject(...a),
}))

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

const { POST } = defined(await import("@/app/api/projects/route"))

const URL_ = "http://localhost/api/projects"
function req(body: unknown): Request {
  return new Request(URL_, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  })
}

beforeEach(() => {
  authMock.mockReset().mockResolvedValue({ user: { id: "user-1", name: "Taro", role: "member" } })
  createProject.mockReset()
})

describe("POST /api/projects", () => {
  it("returns 401 without a session", async () => {
    authMock.mockResolvedValue(null)
    expect((await POST(req({ name: "P" }))).status).toBe(401)
    expect(createProject).not.toHaveBeenCalled()
  })

  it("creates a project as the calling actor (201)", async () => {
    createProject.mockResolvedValue({ id: "p1", name: "P" })
    const res = await POST(req({ name: "P", projectType: "software", sectionIds: ["s1"] }))
    expect(res.status).toBe(201)
    expect(await res.json()).toEqual({ id: "p1", name: "P" })
    expect(createProject).toHaveBeenCalledWith(
      { name: "P", projectType: "software", sectionIds: ["s1"] },
      { userId: "user-1", userName: "Taro", systemRole: "member" }
    )
  })

  it("defaults actor name / role when absent from the session", async () => {
    authMock.mockResolvedValue({ user: { id: "user-2" } })
    createProject.mockResolvedValue({ id: "p2" })
    await POST(req({ name: "Q" }))
    expect(createProject).toHaveBeenCalledWith({ name: "Q" }, { userId: "user-2", userName: null, systemRole: "member" })
  })

  it.each([
    ["empty name", { name: "" }],
    ["name too long", { name: "x".repeat(201) }],
    ["unknown project type", { name: "P", projectType: "hardware" }],
    ["description too long", { name: "P", description: "x".repeat(5001) }],
  ])("rejects %s with 400 zod issues", async (_l, body) => {
    const res = await POST(req(body))
    expect(res.status).toBe(400)
    expect(Array.isArray((await res.json()).error)).toBe(true)
    expect(createProject).not.toHaveBeenCalled()
  })

  it("rejects malformed JSON with 400", async () => {
    const res = await POST(req("{"))
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: "Invalid JSON", code: "INVALID_JSON" })
  })

  it("maps service validation errors to 400 and unexpected ones to 500", async () => {
    createProject.mockRejectedValueOnce(new ValidationError("bad section"))
    expect((await POST(req({ name: "P" }))).status).toBe(400)
    createProject.mockRejectedValueOnce(new Error("db"))
    const res = await POST(req({ name: "P" }))
    expect(res.status).toBe(500)
    expect(await res.json()).toEqual({ error: "作成に失敗しました", code: "INTERNAL" })
  })
})
