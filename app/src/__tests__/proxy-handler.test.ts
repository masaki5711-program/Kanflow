import { afterEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"
import { config, proxy } from "@/proxy"

afterEach(() => vi.unstubAllEnvs())

function directive(csp: string, name: string): string | undefined {
  return csp.split("; ").find((d) => d.startsWith(`${name} `))
}

describe("proxy", () => {
  it("sets the same nonce-bearing CSP on the request and response", () => {
    vi.stubEnv("NODE_ENV", "production")
    vi.stubEnv("NEXT_PUBLIC_COLLABORA_URL", "http://office.local:9980/some/path")
    const res = proxy(new NextRequest("http://localhost/projects", { headers: { cookie: "a=b" } }))
    const csp = res.headers.get("Content-Security-Policy")!
    expect(csp).toBeTruthy()
    const nonce = /'nonce-([^']+)'/.exec(csp)![1]
    expect(nonce.length).toBeGreaterThan(10)
    expect(directive(csp, "frame-src")).toBe("frame-src 'self' http://office.local:9980")
    expect(csp).not.toContain("unsafe-eval")
    // Next forwards overridden request headers via x-middleware-request-* headers.
    expect(res.headers.get("x-middleware-request-x-nonce")).toBe(nonce)
    expect(res.headers.get("x-middleware-request-content-security-policy")).toBe(csp)
    expect(res.headers.get("x-middleware-request-cookie")).toBe("a=b")
  })

  it("uses dev relaxations and ignores an invalid Collabora URL", () => {
    vi.stubEnv("NODE_ENV", "development")
    vi.stubEnv("NEXT_PUBLIC_COLLABORA_URL", "not a url")
    const csp = proxy(new NextRequest("http://localhost/")).headers.get("Content-Security-Policy")!
    expect(directive(csp, "script-src")).toContain("'unsafe-eval'")
    expect(directive(csp, "connect-src")).toBe("connect-src 'self' ws: wss:")
    expect(directive(csp, "frame-src")).toBe("frame-src 'self'")
  })

  it("issues a fresh nonce per request and no Collabora origin when unset", () => {
    vi.stubEnv("NEXT_PUBLIC_COLLABORA_URL", "")
    const a = proxy(new NextRequest("http://localhost/")).headers.get("Content-Security-Policy")!
    const b = proxy(new NextRequest("http://localhost/")).headers.get("Content-Security-Policy")!
    expect(a).not.toBe(b)
    expect(directive(a, "form-action")).toBe("form-action 'self'")
  })
})

describe("proxy matcher", () => {
  const re = new RegExp(`^${config.matcher[0].source}$`)

  it.each(["/", "/projects/p1", "/admin/users"])("runs for page %s", (p) => {
    expect(re.test(p)).toBe(true)
  })

  it.each(["/api/wopi/files/x", "/api/projects", "/_next/static/a.js", "/_next/image", "/favicon.ico", "/icon.svg"])(
    "skips %s",
    (p) => {
      expect(re.test(p)).toBe(false)
    }
  )

  it("skips prefetch requests", () => {
    expect(config.matcher[0].missing).toEqual(
      expect.arrayContaining([{ type: "header", key: "next-router-prefetch" }])
    )
  })
})
