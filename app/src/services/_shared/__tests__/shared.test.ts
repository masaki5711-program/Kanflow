import { describe, expect, it, vi } from "vitest"
import { z } from "zod"

vi.mock("@/lib/logger", () => ({
  logger: { child: () => ({ error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() }) },
}))

const { toHttpResponse, jsonResponse, successResponse, errorResponse } = await import("../http")
const { codeForStatus, API_ERROR_CODES } = await import("../error-codes")
const errors = await import("../errors")
const { parseDateOrThrow, optionalDate } = await import("../dates")
const { wouldCreateCycle, collectSubtreeIds } = await import("../tree")
const { actorFromSession } = await import("../actor")
const { prismaError } = await import("@/services/__tests__/support")

async function bodyOf(res: Response) {
  return { status: res.status, body: await res.json() }
}

describe("toHttpResponse", () => {
  const opts = { fallback: "失敗しました" }

  it("maps service errors to their status and merges extra fields", async () => {
    const res = toHttpResponse(new errors.ConflictError("busy", { blocker: { id: "s1" } }, "SPRINT_ACTIVE_EXISTS"), opts)
    expect(await bodyOf(res)).toEqual({
      status: 409,
      body: { error: "busy", code: "SPRINT_ACTIVE_EXISTS", blocker: { id: "s1" } },
    })
  })

  it.each([
    [new errors.NotFoundError(), 404, "Not found", "NOT_FOUND"],
    [new errors.ValidationError("bad"), 400, "bad", "VALIDATION"],
    [new errors.ForbiddenError("no"), 403, "no", "FORBIDDEN"],
    [new errors.ConflictError("dup"), 409, "dup", "CONFLICT"],
    [new errors.StatusError(413, "too big"), 413, "too big", "PAYLOAD_TOO_LARGE"],
    [new errors.StatusError(415, "type", {}, "UNSUPPORTED_MEDIA"), 415, "type", "UNSUPPORTED_MEDIA"],
    [new errors.ValidationError("日付", {}, "INVALID_DATE"), 400, "日付", "INVALID_DATE"],
  ])("maps %s", async (err, status, message, code) => {
    expect(await bodyOf(toHttpResponse(err, opts))).toEqual({ status, body: { error: message, code } })
  })

  it("keeps the zod issues contract", async () => {
    const parsed = z.object({ a: z.string() }).safeParse({})
    const res = await bodyOf(toHttpResponse(parsed.error, opts))
    expect(res.status).toBe(400)
    expect(Array.isArray(res.body.error)).toBe(true)
    expect(res.body.code).toBe("VALIDATION")
  })

  it("answers 400 for malformed JSON bodies", async () => {
    expect(await bodyOf(toHttpResponse(new SyntaxError("x"), opts))).toEqual({
      status: 400,
      body: { error: "Invalid JSON", code: "INVALID_JSON" },
    })
  })

  it("answers 404 for Prisma P2025 and 500 with the fallback otherwise", async () => {
    expect(await bodyOf(toHttpResponse(prismaError("P2025"), opts))).toEqual({
      status: 404,
      body: { error: "Not found", code: "NOT_FOUND" },
    })
    expect(await bodyOf(toHttpResponse(new Error("boom"), opts))).toEqual({
      status: 500,
      body: { error: "失敗しました", code: "INTERNAL" },
    })
    expect((await bodyOf(toHttpResponse("weird", opts))).status).toBe(500)
  })

  it("answers 400 INVALID_REFERENCE for Prisma P2003 (foreign key)", async () => {
    expect(await bodyOf(toHttpResponse(prismaError("P2003"), opts))).toEqual({
      status: 400,
      body: { error: "Invalid reference", code: "INVALID_REFERENCE" },
    })
  })

  it("errorResponse builds { error, code } with a status default code, extra fields and headers", async () => {
    expect(await bodyOf(errorResponse(404, "gone"))).toEqual({ status: 404, body: { error: "gone", code: "NOT_FOUND" } })
    const res = errorResponse(429, "slow", "RATE_LIMITED", { extra: { retry: 3 }, headers: { "Retry-After": "3" } })
    expect(res.headers.get("Retry-After")).toBe("3")
    expect(await bodyOf(res)).toEqual({ status: 429, body: { error: "slow", code: "RATE_LIMITED", retry: 3 } })
  })

  it("codeForStatus covers the generic classes", () => {
    expect([400, 401, 403, 404, 409, 413, 415, 429, 500, 502, 503, 504, 418].map(codeForStatus)).toEqual([
      "VALIDATION", "UNAUTHORIZED", "FORBIDDEN", "NOT_FOUND", "CONFLICT", "PAYLOAD_TOO_LARGE",
      "UNSUPPORTED_MEDIA", "RATE_LIMITED", "INTERNAL", "UPSTREAM_FAILED", "SERVICE_UNAVAILABLE", "INTERNAL", "VALIDATION",
    ])
    expect(new Set(API_ERROR_CODES).size).toBe(API_ERROR_CODES.length)
  })

  it("builds success responses", async () => {
    expect(await bodyOf(jsonResponse({ a: 1 }, 201))).toEqual({ status: 201, body: { a: 1 } })
    expect(await bodyOf(successResponse())).toEqual({ status: 200, body: { success: true } })
  })
})

describe("errors helpers", () => {
  it("detects prisma codes", () => {
    expect(errors.prismaErrorCode(prismaError("P2002"))).toBe("P2002")
    expect(errors.prismaErrorCode({ code: "ENOENT" })).toBeNull()
    expect(errors.prismaErrorCode(null)).toBeNull()
    expect(errors.isUniqueViolation(prismaError("P2002"))).toBe(true)
    expect(errors.isServiceError(new errors.NotFoundError())).toBe(true)
  })

  it("rethrowPrisma converts known codes and rethrows others", () => {
    expect(() => errors.rethrowPrisma(prismaError("P2025"), { notFound: "nf" })).toThrow(errors.NotFoundError)
    expect(() => errors.rethrowPrisma(prismaError("P2002"), { conflict: "dup" })).toThrow(errors.ConflictError)
    expect(() => errors.rethrowPrisma(prismaError("P2002"), { notFound: "nf" })).toThrow("prisma P2002")
    expect(() => errors.rethrowPrisma(prismaError("P2002"), { conflict: "dup", conflictCode: "DUPLICATE_NAME" }))
      .toThrow(expect.objectContaining({ code: "DUPLICATE_NAME", status: 409 }))
    expect(() => errors.rethrowPrisma(prismaError("P2025"), { notFound: "nf" }))
      .toThrow(expect.objectContaining({ code: "NOT_FOUND" }))
    expect(errors.isForeignKeyViolation(prismaError("P2003"))).toBe(true)
  })
})

describe("dates", () => {
  it("parses valid dates and rejects invalid ones", () => {
    expect(parseDateOrThrow("2026-01-02").toISOString()).toContain("2026-01-02")
    expect(() => parseDateOrThrow("nope")).toThrow("日付が不正です")
  })

  it("optionalDate keeps undefined, maps empty to null", () => {
    expect(optionalDate(undefined)).toBeUndefined()
    expect(optionalDate(null)).toBeNull()
    expect(optionalDate("")).toBeNull()
    expect(optionalDate("2026-01-02")).toBeInstanceOf(Date)
  })
})

describe("tree", () => {
  const nodes = [
    { id: "a", parentId: null },
    { id: "b", parentId: "a" },
    { id: "c", parentId: "b" },
    { id: "d", parentId: "a" },
  ]

  it("detects cycles and self-parenting", () => {
    expect(wouldCreateCycle(nodes, "a", "c")).toBe(true)
    expect(wouldCreateCycle(nodes, "b", "b")).toBe(true)
    expect(wouldCreateCycle(nodes, "c", "d")).toBe(false)
  })

  it("collects a subtree including the root", () => {
    expect(collectSubtreeIds(nodes, "b").sort()).toEqual(["b", "c"])
    expect(collectSubtreeIds(nodes, "a").sort()).toEqual(["a", "b", "c", "d"])
    expect(collectSubtreeIds(nodes, "zz")).toEqual(["zz"])
  })
})

describe("actorFromSession", () => {
  it("maps the session user", () => {
    const session = { user: { id: "u", name: "N", email: "e", role: "admin" }, expires: "" }
    expect(actorFromSession(session)).toEqual({ userId: "u", userName: "N", systemRole: "admin" })
  })
})
