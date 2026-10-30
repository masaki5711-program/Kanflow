import { describe, expect, it } from "vitest"
import {
  TOKEN_PREFIX,
  bearerToken,
  displayPrefix,
  generateApiToken,
  hashApiToken,
  isWellFormedToken,
  parseProjectIds,
  parseScopes,
  serializeProjectIds,
  serializeScopes,
  tokenState,
} from "../token"

describe("generateApiToken", () => {
  it("creates kfl_ + 43 base64url chars (32 random bytes) with its hash and display prefix", () => {
    const t = generateApiToken()
    expect(t.token).toMatch(/^kfl_[A-Za-z0-9_-]{43}$/)
    expect(t.hash).toBe(hashApiToken(t.token))
    expect(t.hash).toMatch(/^[0-9a-f]{64}$/)
    expect(t.prefix).toBe(t.token.slice(0, 12))
    expect(t.prefix.startsWith(TOKEN_PREFIX)).toBe(true)
  })

  it("never repeats", () => {
    const seen = new Set(Array.from({ length: 50 }, () => generateApiToken().token))
    expect(seen.size).toBe(50)
  })
})

describe("hashApiToken", () => {
  it("is the sha256 hex of the token (deterministic)", () => {
    expect(hashApiToken("kfl_abc")).toBe(hashApiToken("kfl_abc"))
    expect(hashApiToken("a")).toBe("ca978112ca1bbdcafac231b39a23dc4da786eff8147c4e72b9807785afee48bb")
  })
})

describe("isWellFormedToken / displayPrefix", () => {
  it("accepts only the kfl_ format", () => {
    expect(isWellFormedToken(generateApiToken().token)).toBe(true)
    expect(isWellFormedToken("kfl_short")).toBe(false)
    expect(isWellFormedToken("xyz_" + "a".repeat(43))).toBe(false)
    expect(isWellFormedToken("kfl_" + "a".repeat(42) + "!")).toBe(false)
  })

  it("shows the first 12 characters", () => {
    expect(displayPrefix("kfl_ABCDEFGHxyz")).toBe("kfl_ABCDEFGH")
  })
})

describe("bearerToken", () => {
  it("extracts a Bearer credential (case-insensitive scheme)", () => {
    expect(bearerToken("Bearer kfl_x")).toBe("kfl_x")
    expect(bearerToken("bearer   kfl_x  ")).toBe("kfl_x")
  })

  it("rejects missing / other schemes / empty", () => {
    expect(bearerToken(null)).toBeNull()
    expect(bearerToken("Basic abc")).toBeNull()
    expect(bearerToken("Bearer ")).toBeNull()
    expect(bearerToken("Bearer a b")).toBeNull()
  })
})

describe("scopes", () => {
  it("round-trips a JSON array", () => {
    expect(parseScopes(serializeScopes(["read"]))).toEqual(["read"])
  })

  it("treats malformed / non-array / unknown entries as no scope", () => {
    expect(parseScopes("not json")).toEqual([])
    expect(parseScopes('{"a":1}')).toEqual([])
    expect(parseScopes('["read", 3, "admin"]')).toEqual(["read"])
  })
})

describe("project restriction", () => {
  it("stores null for no restriction and round-trips a list", () => {
    expect(serializeProjectIds(null)).toBeNull()
    expect(serializeProjectIds([])).toBeNull()
    expect(parseProjectIds(null)).toBeNull()
    expect(parseProjectIds(serializeProjectIds(["p1", "p2"]))).toEqual(["p1", "p2"])
  })

  it("fails closed on malformed text (no project allowed)", () => {
    expect(parseProjectIds("not json")).toEqual([])
    expect(parseProjectIds('{"a":1}')).toEqual([])
    expect(parseProjectIds('["p1", 3, ""]')).toEqual(["p1"])
  })
})

describe("tokenState", () => {
  const now = new Date("2026-10-05T00:00:00Z")
  it("classifies revoked, expired and active", () => {
    expect(tokenState({ revokedAt: now, expiresAt: null }, now)).toBe("revoked")
    expect(tokenState({ revokedAt: null, expiresAt: new Date("2026-10-04T23:59:59Z") }, now)).toBe("expired")
    expect(tokenState({ revokedAt: null, expiresAt: now }, now)).toBe("expired")
    expect(tokenState({ revokedAt: null, expiresAt: new Date("2026-10-06T00:00:00Z") }, now)).toBe("active")
    expect(tokenState({ revokedAt: null, expiresAt: null }, now)).toBe("active")
  })
})
