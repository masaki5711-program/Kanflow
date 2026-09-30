import { describe, expect, it, vi } from "vitest"
import { renderHook } from "@testing-library/react"
import { ApiError } from "./api-client"
import { conflictAwareToast, handleVersionConflict, versionConflictOf, versionParam, withVersion } from "./version-conflict"

const conflict = (current: unknown) =>
  new ApiError("msg", 409, { error: "x", code: "VERSION_CONFLICT", current }, "VERSION_CONFLICT")

describe("versionConflictOf", () => {
  it("extracts the server's current row from a 409 VERSION_CONFLICT", () => {
    expect(versionConflictOf(conflict({ id: "a", version: 3 }))).toEqual({ current: { id: "a", version: 3 } })
  })

  it("gives current null when the body has none", () => {
    expect(versionConflictOf(new ApiError("m", 409, undefined, "VERSION_CONFLICT"))).toEqual({ current: null })
  })

  it("ignores other errors, including a plain 409 CONFLICT", () => {
    expect(versionConflictOf(new ApiError("m", 409, { code: "CONFLICT" }, "CONFLICT"))).toBeNull()
    expect(versionConflictOf(new ApiError("m", 500, undefined, "INTERNAL"))).toBeNull()
    expect(versionConflictOf(new Error("x"))).toBeNull()
    expect(versionConflictOf(null)).toBeNull()
  })
})

describe("request helpers", () => {
  it("withVersion adds the version only when known (new object)", () => {
    const body = { status: "done" }
    expect(withVersion(body, 4)).toEqual({ status: "done", version: 4 })
    expect(withVersion(body, undefined)).toEqual({ status: "done" })
    expect(body).toEqual({ status: "done" })
  })

  it("versionParam builds the DELETE query", () => {
    expect(versionParam(0)).toBe("?version=0")
    expect(versionParam(7)).toBe("?version=7")
    expect(versionParam(undefined)).toBe("")
  })
})

describe("handleVersionConflict", () => {
  it("toasts the message and hands `current` to the callback", () => {
    const toast = { error: vi.fn() }
    const onConflict = vi.fn()
    expect(handleVersionConflict(conflict({ id: "a" }), { toast, message: "他のユーザーが先に更新しました", onConflict })).toBe(true)
    expect(toast.error).toHaveBeenCalledWith("他のユーザーが先に更新しました")
    expect(onConflict).toHaveBeenCalledWith({ id: "a" })
  })

  it("returns false and does nothing for other errors", () => {
    const toast = { error: vi.fn() }
    const onConflict = vi.fn()
    expect(handleVersionConflict(new Error("x"), { toast, message: "m", onConflict })).toBe(false)
    expect(toast.error).not.toHaveBeenCalled()
    expect(onConflict).not.toHaveBeenCalled()
  })
})

describe("conflictAwareToast", () => {
  it("shows the conflict message alone, formats everything else", () => {
    const toastFor = conflictAwareToast((e) => `保存に失敗: ${e.message}`)
    expect(toastFor(conflict(null))).toBe("msg")
    expect(toastFor(new Error("boom"))).toBe("保存に失敗: boom")
  })
})

describe("useVersionConflict", () => {
  it("binds the kit toast and the localized message", async () => {
    const error = vi.fn()
    vi.doMock("@/components/ui/toast", () => ({ useToast: () => ({ error, success: vi.fn(), info: vi.fn(), dismiss: vi.fn() }) }))
    vi.doMock("@/lib/language-context", () => ({ useLanguage: () => ({ t: { apiErrVersionConflict: "最新の内容を読み込みました" } }) }))
    vi.resetModules()
    const mod = await import("./version-conflict")
    const { result } = renderHook(() => mod.useVersionConflict())
    const onConflict = vi.fn()
    const { ApiError: FreshApiError } = await import("./api-client")
    const err = new FreshApiError("m", 409, { current: { id: "z" } }, "VERSION_CONFLICT")
    expect(result.current(err, onConflict)).toBe(true)
    expect(error).toHaveBeenCalledWith("最新の内容を読み込みました")
    expect(onConflict).toHaveBeenCalledWith({ id: "z" })
    vi.doUnmock("@/components/ui/toast")
    vi.doUnmock("@/lib/language-context")
  })
})
