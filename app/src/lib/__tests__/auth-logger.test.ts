import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { authLogger, isExpectedAuthError } from "@/lib/auth-logger"

/** Shape of an Auth.js AuthError: `type` set from the class. */
function authError(type: string, message = "x", cause?: unknown): Error {
  const e = new Error(message, cause ? { cause } : undefined) as Error & { type: string }
  e.name = type
  e.type = type
  return e
}

let warn: ReturnType<typeof vi.spyOn>
let error: ReturnType<typeof vi.spyOn>
beforeEach(() => {
  warn = vi.spyOn(console, "warn").mockImplementation(() => {})
  error = vi.spyOn(console, "error").mockImplementation(() => {})
})
afterEach(() => vi.restoreAllMocks())

describe("authLogger (C3-02)", () => {
  it("logs a wrong-password CredentialsSignin as one warn line without a stack", () => {
    authLogger.error(authError("CredentialsSignin", "Read more at https://errors.authjs.dev#credentialssignin"))

    expect(error).not.toHaveBeenCalled()
    expect(warn).toHaveBeenCalledTimes(1)
    const line = String(warn.mock.calls[0][0])
    expect(line).toBe("[auth] sign-in rejected (CredentialsSignin)")
    expect(line).not.toContain("\n")
  })

  it("keeps real auth errors with their stack", () => {
    const e = authError("JWTSessionError", "bad jwt")
    authLogger.error(e)

    expect(warn).not.toHaveBeenCalled()
    expect(error).toHaveBeenCalledWith("[auth][error] JWTSessionError: bad jwt")
    expect(error).toHaveBeenCalledWith(e.stack)
  })

  it("prints the cause's stack when the error wraps one", () => {
    const inner = new Error("db down")
    authLogger.error(authError("CallbackRouteError", "cb", { err: inner, provider: "credentials" }))

    expect(error).toHaveBeenCalledWith("[auth][cause]:", inner.stack)
  })

  it("falls back to error.name for plain errors", () => {
    const plain = new TypeError("boom")
    expect(isExpectedAuthError(plain)).toBe(false)
    authLogger.error(plain)
    expect(error).toHaveBeenCalledWith("[auth][error] TypeError: boom")
  })
})
