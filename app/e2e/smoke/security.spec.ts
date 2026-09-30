import { expect, test } from "@playwright/test"

// Read-only HTTP-level checks. No request here can create or modify data:
// every mutating request is sent WITHOUT a session and must be rejected.

const NONCE_RE = /script-src[^;]*'nonce-([A-Za-z0-9+/=]{16,})'/

test.describe("health", () => {
  test("/api/health returns JSON with a status field", async ({ request }) => {
    const res = await request.get("/api/health")
    expect([200, 503]).toContain(res.status())
    expect(res.headers()["content-type"]).toContain("application/json")
    expect(res.headers()["cache-control"]).toContain("no-store")

    const body = await res.json()
    expect(["ok", "error"]).toContain(body.status)
    expect(body).toHaveProperty("db")
    // Must never leak connection details.
    expect(JSON.stringify(body)).not.toMatch(/mysql:|password|DATABASE_URL/i)
  })
})

test.describe("auth redirects", () => {
  test("unauthenticated /projects/:id redirects to /login", async ({ page }) => {
    await page.goto("/projects/e2e-nonexistent-project")
    await expect(page).toHaveURL(/\/login(\?|$)/)
  })

  test("unauthenticated / redirects to /login", async ({ page }) => {
    await page.goto("/")
    await expect(page).toHaveURL(/\/login(\?|$)/)
  })
})

test.describe("security headers", () => {
  test("HTML pages carry a CSP with a fresh per-request nonce", async ({ request }) => {
    const first = await request.get("/login")
    const second = await request.get("/login")
    const csp1 = first.headers()["content-security-policy"] ?? ""
    const csp2 = second.headers()["content-security-policy"] ?? ""

    const nonce1 = NONCE_RE.exec(csp1)?.[1]
    const nonce2 = NONCE_RE.exec(csp2)?.[1]
    expect(nonce1, csp1).toBeTruthy()
    expect(nonce2).toBeTruthy()
    expect(nonce1).not.toEqual(nonce2)

    expect(csp1).toContain("'strict-dynamic'")
    expect(csp1).toContain("object-src 'none'")
    expect(csp1).toContain("base-uri 'self'")
    expect(csp1).toContain("frame-ancestors 'self'")
    expect(csp1).not.toMatch(/script-src[^;]*'unsafe-inline'/)

    // Next must stamp the same nonce onto its own <script> tags.
    const html = await first.text()
    expect(html).toContain(`nonce="${nonce1}"`)
  })

  test("baseline security headers on pages and API responses", async ({ request }) => {
    for (const path of ["/login", "/api/health"]) {
      const h = (await request.get(path)).headers()
      expect(h["x-content-type-options"], path).toBe("nosniff")
      expect(h["x-frame-options"], path).toBe("SAMEORIGIN")
      expect(h["referrer-policy"], path).toBe("strict-origin-when-cross-origin")
      expect(h["permissions-policy"], path).toContain("camera=()")
      expect(h["x-powered-by"], path).toBeUndefined()
    }
  })
})

test.describe("attachments API without a session", () => {
  test("download / metadata endpoints return 401 or 404", async ({ request }) => {
    for (const path of [
      "/api/projects/e2e-x/attachments/e2e-y",
      "/api/projects/e2e-x/attachments/e2e-y/editor-config",
    ]) {
      const res = await request.get(path, { maxRedirects: 0 })
      expect([401, 404], path).toContain(res.status())
    }
  })

  test("upload is rejected without a session", async ({ request }) => {
    const res = await request.post("/api/projects/e2e-x/attachments", {
      multipart: { file: { name: "e2e.txt", mimeType: "text/plain", buffer: Buffer.from("e2e") } },
      maxRedirects: 0,
    })
    expect([401, 404]).toContain(res.status())
  })

  test("delete is rejected without a session", async ({ request }) => {
    const res = await request.delete("/api/projects/e2e-x/attachments/e2e-y", { maxRedirects: 0 })
    expect([401, 404]).toContain(res.status())
  })
})

test.describe("WOPI endpoint", () => {
  // Before per-file JWTs, Collabora sent the raw WOPI_ACCESS_TOKEN env value.
  // Such a static token (or anything that is not a valid signed JWT for this
  // fileId) must be rejected. E2E_LEGACY_WOPI_TOKEN can supply the real old
  // value when running in a controlled environment.
  const legacyToken = process.env.E2E_LEGACY_WOPI_TOKEN || "kanflow-static-wopi-token"
  const fileId = "e2eproject_e2eattachment"

  // Unsigned "alg: none" JWT with plausible claims.
  const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64url")
  const unsignedJwt = `${b64({ alg: "none", typ: "JWT" })}.${b64({
    projectId: "e2eproject",
    attachmentId: "e2eattachment",
    canWrite: true,
    sub: "e2e",
    aud: "kanflow-wopi",
    exp: Math.floor(Date.now() / 1000) + 3600,
  })}.`

  for (const [label, token] of [
    ["missing token", null],
    ["old-style static token", legacyToken],
    ["unsigned alg:none JWT", unsignedJwt],
  ] as const) {
    test(`CheckFileInfo rejects ${label}`, async ({ request }) => {
      const qs = token === null ? "" : `?access_token=${encodeURIComponent(token)}`
      const res = await request.get(`/api/wopi/files/${fileId}${qs}`)
      expect(res.status()).toBe(401)
    })
  }

  test("GetFile rejects the old-style static token", async ({ request }) => {
    const res = await request.get(
      `/api/wopi/files/${fileId}/contents?access_token=${encodeURIComponent(legacyToken)}`,
    )
    expect(res.status()).toBe(401)
  })

  test("PutFile rejects the old-style static token", async ({ request }) => {
    const res = await request.post(
      `/api/wopi/files/${fileId}/contents?access_token=${encodeURIComponent(legacyToken)}`,
      { headers: { "X-WOPI-Override": "PUT" }, data: Buffer.from("e2e") },
    )
    expect(res.status()).toBe(401)
  })
})
