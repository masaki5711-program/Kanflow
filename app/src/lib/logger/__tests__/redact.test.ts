import { describe, expect, it } from "vitest"
import { REDACTED, redact, redactString, truncateText } from "@/lib/logger/redact"

describe("redact", () => {
  it("masks secret keys at any depth without mutating the input", () => {
    const input = {
      user: "a@b.c",
      password: "hunter2",
      headers: { Authorization: "Bearer abc", cookie: "sid=1" },
      nested: [{ apiKey: "k", accessToken: "t" }],
    }
    const snapshot = JSON.parse(JSON.stringify(input))

    const out = redact(input) as typeof input

    expect(out.password).toBe(REDACTED)
    expect(out.headers.Authorization).toBe(REDACTED)
    expect(out.headers.cookie).toBe(REDACTED)
    expect(out.nested[0]).toEqual({ apiKey: REDACTED, accessToken: REDACTED })
    expect(out.user).toBe("a@b.c")
    expect(input).toEqual(snapshot)
  })

  it("keeps numeric token counts", () => {
    expect(redact({ maxTokens: 512, tokens: 42 })).toEqual({ maxTokens: 512, tokens: 42 })
  })

  it("truncates free-text keys to maxTextLength only", () => {
    const out = redact({ content: "x".repeat(50), id: "y".repeat(50) }, { maxTextLength: 10 }) as Record<string, string>

    expect(out.content).toBe("x".repeat(10) + "…(+40 chars)")
    expect(out.id).toBe("y".repeat(50))
  })

  it("serialises errors and breaks cycles", () => {
    const a: Record<string, unknown> = { name: "a" }
    a.self = a

    const out = redact({ err: new Error("boom"), a }) as { err: { message: string }; a: { self: unknown } }

    expect(out.err.message).toBe("boom")
    expect(out.a.self).toBe("[Circular]")
  })
})

describe("redactString", () => {
  it("masks inline bearer tokens and key=value secrets", () => {
    expect(redactString("Authorization: Bearer abc.def-123")).toBe(`Authorization: Bearer ${REDACTED}`)
    expect(redactString("login password=hunter2 ok")).toBe(`login password=${REDACTED} ok`)
    expect(redactString('{"token":"abc"}')).toBe(`{"token":"${REDACTED}"}`)
  })
})

describe("truncateText", () => {
  it("leaves short text untouched", () => {
    expect(truncateText("hello", 10)).toBe("hello")
  })
})
