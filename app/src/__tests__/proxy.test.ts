import { describe, expect, it } from "vitest"
import { buildContentSecurityPolicy, generateNonce } from "@/proxy"

function directive(csp: string, name: string): string | undefined {
  return csp.split("; ").find((d) => d.startsWith(`${name} `))
}

describe("buildContentSecurityPolicy", () => {
  it("uses nonce + strict-dynamic without unsafe-inline/eval in production", () => {
    const csp = buildContentSecurityPolicy({ nonce: "abc", isDev: false, collaboraOrigin: null })
    expect(directive(csp, "script-src")).toBe("script-src 'self' 'nonce-abc' 'strict-dynamic'")
    expect(csp).not.toContain("unsafe-eval")
    expect(directive(csp, "object-src")).toBe("object-src 'none'")
  })

  it("allows unsafe-eval only in development", () => {
    const csp = buildContentSecurityPolicy({ nonce: "abc", isDev: true, collaboraOrigin: null })
    expect(directive(csp, "script-src")).toContain("'unsafe-eval'")
  })

  it("allows Collabora only as a frame / form target", () => {
    const origin = "http://collabora.local:9980"
    const csp = buildContentSecurityPolicy({ nonce: "n", isDev: false, collaboraOrigin: origin })
    expect(directive(csp, "frame-src")).toContain(origin)
    expect(directive(csp, "form-action")).toContain(origin)
    expect(directive(csp, "script-src")).not.toContain(origin)
  })

  it("generates distinct base64 nonces", () => {
    const nonce = generateNonce()
    expect(nonce).toMatch(/^[A-Za-z0-9+/]+=*$/)
    expect(nonce).not.toBe(generateNonce())
  })
})
