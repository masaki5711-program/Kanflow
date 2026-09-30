/**
 * Shared helpers for the a2-* route tests. Each test file mocks
 * `@/lib/auth` and `@/lib/prisma` itself (vi.mock is hoisted per file);
 * these helpers only build requests, params and sessions.
 */

export const BASE = "http://localhost/api/projects/p1"

export function session(role = "member", id = "user-1") {
  return { user: { id, name: "Taro", email: "t@example.com", role } }
}

export function ctx<T extends Record<string, string>>(params: T) {
  return { params: Promise.resolve(params) }
}

export function jsonReq(method: string, body: unknown, url = BASE): Request {
  return new Request(url, {
    method,
    headers: { "content-type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  })
}

export function getReq(url = BASE, headers: Record<string, string> = {}): Request {
  return new Request(url, { method: "GET", headers })
}

export function formReq(form: FormData, url = BASE): Request {
  return new Request(url, { method: "POST", body: form })
}

/**
 * Configure the mocked auth + membership lookups used by the real
 * `requireProject`. "none" → no session (401), "outsider" → session but
 * no membership (404), otherwise a member with the given project role.
 */
export interface GateMocks {
  authMock: { mockResolvedValue: (v: unknown) => unknown }
  memberFindFirst: { mockResolvedValue: (v: unknown) => unknown }
}

export function asRole(m: GateMocks, role: "none" | "outsider" | "po" | "sm" | "dev" | "admin"): void {
  if (role === "none") {
    m.authMock.mockResolvedValue(null)
    return
  }
  if (role === "admin") {
    m.authMock.mockResolvedValue(session("admin"))
    return
  }
  m.authMock.mockResolvedValue(session("member"))
  m.memberFindFirst.mockResolvedValue(role === "outsider" ? null : { role })
}
