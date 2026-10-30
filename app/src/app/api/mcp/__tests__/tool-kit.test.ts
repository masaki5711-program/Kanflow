import { describe, expect, it, vi } from "vitest"

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }))
vi.mock("@/lib/prisma", () => ({ prisma: {} }))
vi.mock("@/app/api/v1/_lib/v1-route", async (orig) => ({
  ...(await orig<typeof import("@/app/api/v1/_lib/v1-route")>()),
  resolveV1ProjectActor: vi.fn(),
}))

const { definedOnly, mcpIdempotency, MCP_AUTO_IDEMPOTENCY_TTL_MS, PROJECT_CHECK_CONCURRENCY, toolError, visibleProjects } = await import("@/app/api/mcp/_lib/tool-kit")
const { canonicalJson, IDEMPOTENCY_TTL_MS } = await import("@/app/api/v1/_lib/v1-write")
const { describeUnexpected, resolveV1ProjectActor } = await import("@/app/api/v1/_lib/v1-route")
const { NotFoundError } = await import("@/services/_shared/errors")

const PRINCIPAL = { userId: "u1", role: "member", tokenId: "t1", tokenPrefix: "kfl_x", scopes: ["read" as const], projectIds: null }

describe("visibleProjects", () => {
  it("checks each distinct project once through resolveV1ProjectActor, with bounded concurrency", async () => {
    let running = 0
    let peak = 0
    vi.mocked(resolveV1ProjectActor).mockImplementation(async (_p, pid) => {
      running++
      peak = Math.max(peak, running)
      await new Promise((r) => setTimeout(r, 2))
      running--
      if (pid === "p3") throw new NotFoundError()
      return {} as never
    })
    const ids = ["p1", "p2", "p3", "p4", "p5", "p6", "p7", "p8", "p1", "p2"]
    const out = await visibleProjects(PRINCIPAL, ids)
    expect([...out].sort()).toEqual(["p1", "p2", "p4", "p5", "p6", "p7", "p8"])
    expect(resolveV1ProjectActor).toHaveBeenCalledTimes(8)
    expect(peak).toBeLessThanOrEqual(PROJECT_CHECK_CONCURRENCY)
    expect(peak).toBeGreaterThan(1)
  })

  it("any error other than NOT_FOUND fails the call", async () => {
    vi.mocked(resolveV1ProjectActor).mockRejectedValue(new Error("db down"))
    await expect(visibleProjects(PRINCIPAL, ["p1"])).rejects.toThrow("db down")
  })
})

describe("describeUnexpected (log fields)", () => {
  it("logs Prisma errors by name and code only; other errors keep their message", () => {
    const prismaErr = Object.assign(new Error("Invalid `prisma.user.findFirst()` invocation: where email = 'a@b'"), { name: "PrismaClientKnownRequestError", code: "P2002" })
    expect(describeUnexpected(prismaErr)).toEqual({ errorName: "PrismaClientKnownRequestError", errorCode: "P2002" })
    expect(describeUnexpected(new TypeError("x is undefined"))).toEqual({ errorName: "TypeError", error: "x is undefined" })
    expect(describeUnexpected("boom")).toEqual({ error: "boom" })
  })
})

describe("canonicalJson", () => {
  it("sorts object keys at every level, keeps array order, drops undefined", () => {
    expect(canonicalJson({ b: 1, a: { d: [2, 1], c: undefined } })).toBe('{"a":{"d":[2,1]},"b":1}')
    expect(canonicalJson({ a: 1, b: 2 })).toBe(canonicalJson({ b: 2, a: 1 }))
  })
})

describe("mcpIdempotency (create tools)", () => {
  it("derives a short-lived key from the call: same arguments → same key, other arguments → other key", () => {
    const a = mcpIdempotency("create_task", "p1", { sprintId: "s1" }, { pbItemId: "b1", taskName: "X" }, undefined)
    const b = mcpIdempotency("create_task", "p1", { sprintId: "s1" }, { taskName: "X", pbItemId: "b1" }, undefined)
    const c = mcpIdempotency("create_task", "p1", { sprintId: "s1" }, { pbItemId: "b1", taskName: "Y" }, undefined)
    expect(a).toEqual(b)
    expect(a.key).not.toBe(c.key)
    expect(a.key).toMatch(/^auto-[0-9a-f]{48}$/)
    expect(a.ttlMs).toBe(MCP_AUTO_IDEMPOTENCY_TTL_MS)
  })

  it("an explicit key keeps the default 24 h TTL; tool, project and path params separate the scope", () => {
    const k = mcpIdempotency("create_task", "p1", { sprintId: "s1" }, {}, "my-key")
    expect(k).toEqual({ scope: expect.stringContaining("create_task"), key: "my-key" })
    expect(k.ttlMs ?? IDEMPOTENCY_TTL_MS).toBe(IDEMPOTENCY_TTL_MS)
    expect(mcpIdempotency("create_task", "p1", { sprintId: "s2" }, {}, "my-key").scope).not.toBe(k.scope)
    expect(mcpIdempotency("add_comment", "p1", { sprintId: "s1" }, {}, "my-key").scope).not.toBe(k.scope)
    expect(mcpIdempotency("create_task", "p2", { sprintId: "s1" }, {}, "my-key").scope).not.toBe(k.scope)
  })
})

describe("toolError / definedOnly", () => {
  it("adds a reissue hint for INSUFFICIENT_SCOPE and retryAfterSec for a rate limit", () => {
    const scope = JSON.parse((toolError({ error: "Insufficient scope", code: "INSUFFICIENT_SCOPE", requiredScope: "task:write" }).content[0] as { text: string }).text)
    expect(scope).toMatchObject({ code: "INSUFFICIENT_SCOPE", requiredScope: "task:write" })
    expect(scope.hint).toContain("task:write")
    const limited = toolError({ error: "Too many write requests", code: "RATE_LIMITED" }, { "Retry-After": "12" })
    expect(limited.isError).toBe(true)
    expect(JSON.parse((limited.content[0] as { text: string }).text)).toEqual({ error: "Too many write requests", code: "RATE_LIMITED", retryAfterSec: 12 })
  })

  it("definedOnly drops undefined but keeps null / false / 0", () => {
    expect(definedOnly({ a: undefined, b: null, c: false, d: 0 })).toEqual({ b: null, c: false, d: 0 })
  })
})
