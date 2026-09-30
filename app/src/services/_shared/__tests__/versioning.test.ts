import { describe, expect, it, vi } from "vitest"

const debug = vi.fn()
vi.mock("@/lib/logger", () => ({
  logger: { child: () => ({ error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug }) },
}))

const { toHttpResponse } = await import("../http")
const { NotFoundError, VersionConflictError } = await import("../errors")
const v = await import("../versioning")

describe("VersionConflictError", () => {
  it("is a 409 VERSION_CONFLICT carrying the current row", () => {
    const err = new VersionConflictError({ id: "a", version: 3 })
    expect(err.status).toBe(409)
    expect(err.code).toBe("VERSION_CONFLICT")
    expect(err.current).toEqual({ id: "a", version: 3 })
  })

  it("maps to {error, code, current} through the HTTP mapper", async () => {
    const res = toHttpResponse(new VersionConflictError({ id: "a", version: 3 }), { fallback: "x" })
    expect(res.status).toBe(409)
    expect(await res.json()).toEqual({
      error: expect.any(String),
      code: "VERSION_CONFLICT",
      current: { id: "a", version: 3 },
    })
  })
})

describe("versioning helpers", () => {
  it("takeVersion splits the lock token off the input", () => {
    const withVersion: { version?: number; name: string } = { version: 2, name: "x" }
    const without: { version?: number; name: string } = { name: "x" }
    expect(v.takeVersion(withVersion)).toEqual({ version: 2, data: { name: "x" } })
    expect(v.takeVersion(without)).toEqual({ version: undefined, data: { name: "x" } })
  })

  it("versionWhere only constrains when a version is given", () => {
    expect(v.versionWhere(4)).toEqual({ version: 4 })
    expect(v.versionWhere(undefined)).toEqual({})
  })

  it("BUMP_VERSION increments", () => {
    expect(v.BUMP_VERSION).toEqual({ version: { increment: 1 } })
  })

  it("versionField accepts non-negative integers or nothing", () => {
    expect(v.versionField.parse(undefined)).toBeUndefined()
    expect(v.versionField.parse(0)).toBe(0)
    expect(() => v.versionField.parse(-1)).toThrow()
    expect(() => v.versionField.parse(1.5)).toThrow()
  })

  it("staleOrMissing → conflict with the current row when it still exists", () => {
    const err = v.staleOrMissing({ id: "a", version: 5 }, () => new NotFoundError())
    expect(err).toBeInstanceOf(VersionConflictError)
    expect((err as InstanceType<typeof VersionConflictError>).current).toEqual({ id: "a", version: 5 })
  })

  it("staleOrMissing → the not-found error when the row is gone", () => {
    const err = v.staleOrMissing(null, () => new NotFoundError("gone"))
    expect(err).toBeInstanceOf(NotFoundError)
    expect(err.message).toBe("gone")
  })

  it("noteUnversionedWrite logs a debug line only when the version is missing", () => {
    debug.mockClear()
    v.noteUnversionedWrite("pbi", "a", undefined)
    expect(debug).toHaveBeenCalledWith("write without version", { entity: "pbi", id: "a" })
    debug.mockClear()
    v.noteUnversionedWrite("pbi", "a", 1)
    expect(debug).not.toHaveBeenCalled()
  })

  it("parseVersionParam reads ?version= and rejects junk with a 400", () => {
    expect(v.parseVersionParam(new Request("http://x/a?version=3"))).toBe(3)
    expect(v.parseVersionParam(new Request("http://x/a?version=0"))).toBe(0)
    expect(v.parseVersionParam(new Request("http://x/a"))).toBeUndefined()
    expect(v.parseVersionParam(new Request("http://x/a?version="))).toBeUndefined()
    expect(() => v.parseVersionParam(new Request("http://x/a?version=abc"))).toThrow(expect.objectContaining({ status: 400 }))
    expect(() => v.parseVersionParam(new Request("http://x/a?version=-2"))).toThrow(expect.objectContaining({ status: 400 }))
  })
})
