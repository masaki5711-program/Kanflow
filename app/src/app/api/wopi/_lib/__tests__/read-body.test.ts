import { describe, expect, it, vi } from "vitest"

vi.mock("@/lib/prisma", () => ({ prisma: {} }))

const { readBodyWithLimit } = await import("../wopi-auth")

function put(body: Uint8Array<ArrayBuffer>, headers: Record<string, string> = {}): Request {
  return new Request("http://localhost/api/wopi/files/p_a/contents", {
    method: "POST",
    body,
    headers,
  })
}

describe("readBodyWithLimit", () => {
  it("returns the body when within the limit", async () => {
    const result = await readBodyWithLimit(put(new Uint8Array([1, 2, 3])), 3)
    expect(result.ok).toBe(true)
    if (result.ok) expect([...result.body]).toEqual([1, 2, 3])
  })

  it("rejects when the declared Content-Length exceeds the limit", async () => {
    const result = await readBodyWithLimit(put(new Uint8Array(2), { "content-length": "100" }), 10)
    expect(result).toEqual({ ok: false, reason: "too_large" })
  })

  it("rejects when the actual body exceeds the limit", async () => {
    const result = await readBodyWithLimit(put(new Uint8Array(11)), 10)
    expect(result).toEqual({ ok: false, reason: "too_large" })
  })
})
