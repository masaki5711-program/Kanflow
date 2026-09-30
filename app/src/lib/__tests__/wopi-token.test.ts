import { describe, expect, it } from "vitest"
import jwt from "jsonwebtoken"
import {
  WOPI_TOKEN_TTL_MS,
  buildWopiFileId,
  deriveWopiKey,
  parseWopiFileId,
  signWopiToken,
  tokenMatchesFileId,
  verifyWopiToken,
} from "@/lib/wopi-token"

const KEY = deriveWopiKey("test-secret")
const CLAIMS = { projectId: "proj1", attachmentId: "att1", userId: "user1", canWrite: true }
const NOW = Date.UTC(2026, 0, 1)

describe("wopi-token", () => {
  it("round-trips claims through sign and verify", () => {
    const { token, expiresAt } = signWopiToken(CLAIMS, KEY, NOW)
    expect(expiresAt).toBe(NOW + WOPI_TOKEN_TTL_MS)
    expect(verifyWopiToken(token, KEY, NOW + 1000)).toEqual(CLAIMS)
  })

  it("preserves canWrite=false", () => {
    const { token } = signWopiToken({ ...CLAIMS, canWrite: false }, KEY, NOW)
    expect(verifyWopiToken(token, KEY, NOW)?.canWrite).toBe(false)
  })

  it("rejects an expired token", () => {
    const { token } = signWopiToken(CLAIMS, KEY, NOW, 60_000)
    expect(verifyWopiToken(token, KEY, NOW + 59_000)).not.toBeNull()
    expect(verifyWopiToken(token, KEY, NOW + 61_000)).toBeNull()
  })

  it("rejects a token signed with another key", () => {
    const { token } = signWopiToken(CLAIMS, deriveWopiKey("other"), NOW)
    expect(verifyWopiToken(token, KEY, NOW)).toBeNull()
  })

  it("rejects a tampered payload", () => {
    const { token } = signWopiToken({ ...CLAIMS, canWrite: false }, KEY, NOW)
    const [header, , signature] = token.split(".")
    const forged = Buffer.from(
      JSON.stringify({
        projectId: "proj1",
        attachmentId: "att1",
        canWrite: true,
        sub: "user1",
        aud: "kanflow-wopi",
        exp: 9999999999,
      })
    ).toString("base64url")
    expect(verifyWopiToken(`${header}.${forged}.${signature}`, KEY, NOW)).toBeNull()
  })

  it("rejects alg=none and a wrong audience", () => {
    const unsigned = jwt.sign({ ...CLAIMS, sub: "user1", aud: "kanflow-wopi" }, "", {
      algorithm: "none",
    })
    expect(verifyWopiToken(unsigned, KEY, NOW)).toBeNull()
    const wrongAud = jwt.sign(
      { projectId: "proj1", attachmentId: "att1", canWrite: true, sub: "user1", aud: "other" },
      KEY,
      { algorithm: "HS256" }
    )
    expect(verifyWopiToken(wrongAud, KEY)).toBeNull()
  })

  it("rejects the raw legacy secret and empty tokens", () => {
    expect(verifyWopiToken("test-secret", KEY)).toBeNull()
    expect(verifyWopiToken(null, KEY)).toBeNull()
    expect(verifyWopiToken("", KEY)).toBeNull()
  })

  it("rejects tokens with missing claims", () => {
    const partial = jwt.sign({ projectId: "proj1", sub: "user1", aud: "kanflow-wopi" }, KEY, {
      algorithm: "HS256",
    })
    expect(verifyWopiToken(partial, KEY)).toBeNull()
  })

  it("derives a stable key that differs from the raw secret", () => {
    expect(deriveWopiKey("abc")).not.toBe("abc")
    expect(deriveWopiKey("abc")).toBe(deriveWopiKey("abc"))
  })

  it("binds tokens to a single fileId", () => {
    expect(tokenMatchesFileId(CLAIMS, buildWopiFileId("proj1", "att1"))).toBe(true)
    expect(tokenMatchesFileId(CLAIMS, "proj1_att2")).toBe(false)
    expect(tokenMatchesFileId(CLAIMS, "proj2_att1")).toBe(false)
    expect(tokenMatchesFileId(CLAIMS, "garbage")).toBe(false)
  })

  it("parses fileIds", () => {
    expect(parseWopiFileId("p_a_b")).toEqual({ projectId: "p", attachmentId: "a_b" })
    expect(parseWopiFileId("_a")).toBeNull()
    expect(parseWopiFileId("p_")).toBeNull()
  })
})
