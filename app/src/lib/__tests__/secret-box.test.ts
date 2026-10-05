import { describe, expect, it } from "vitest"
import { open, seal, secretHint } from "../secret-box"

/**
 * AES-256-GCM secret sealing for integration tokens. Every test passes an
 * explicit `env` object (never mutates `process.env`) so cases are isolated.
 * NodeJS.ProcessEnv's typing requires NODE_ENV; these partial envs are cast
 * since only the secret-box-relevant keys matter here.
 */
const fakeEnv = (vars: Record<string, string>) => vars as unknown as NodeJS.ProcessEnv
const ENV_A = fakeEnv({ INTEGRATION_SECRET_KEY: "key-a-for-tests" })
const ENV_B = fakeEnv({ INTEGRATION_SECRET_KEY: "key-b-for-tests" })

describe("seal / open round trip", () => {
  it("opens exactly what was sealed", () => {
    const sealed = seal("glpat-AbCdEf123456", ENV_A)
    expect(open(sealed, ENV_A)).toBe("glpat-AbCdEf123456")
  })

  it("round-trips unicode and empty-ish content", () => {
    const text = "トークン🔑with-dashes_and.dots"
    expect(open(seal(text, ENV_A), ENV_A)).toBe(text)
  })

  it("round-trips a long token up to the service's max length", () => {
    const text = "a".repeat(200)
    expect(open(seal(text, ENV_A), ENV_A)).toBe(text)
  })

  it("produces a different ciphertext each time (random IV) even for the same plaintext", () => {
    const first = seal("same-token", ENV_A)
    const second = seal("same-token", ENV_A)
    expect(first).not.toBe(second)
    expect(open(first, ENV_A)).toBe("same-token")
    expect(open(second, ENV_A)).toBe("same-token")
  })

  it("stores the format v1:<iv>:<tag>:<ciphertext> in base64, and never the plaintext", () => {
    const sealed = seal("SECRETVALUE1234", ENV_A)
    const parts = sealed.split(":")
    expect(parts).toHaveLength(4)
    expect(parts[0]).toBe("v1")
    for (const part of parts.slice(1)) expect(() => Buffer.from(part, "base64")).not.toThrow()
    expect(sealed).not.toContain("SECRETVALUE1234")
  })
})

describe("open() failure modes — never throws, returns null", () => {
  it("returns null for tampered ciphertext (auth tag mismatch)", () => {
    const sealed = seal("hello-world", ENV_A)
    const [version, iv, tag, data] = sealed.split(":")
    const bytes = Buffer.from(data, "base64")
    bytes[0] ^= 0xff // flip a bit in the ciphertext
    const tampered = [version, iv, tag, bytes.toString("base64")].join(":")
    expect(open(tampered, ENV_A)).toBeNull()
  })

  it("returns null for a tampered auth tag", () => {
    const sealed = seal("hello-world", ENV_A)
    const [version, iv, tag, data] = sealed.split(":")
    const bytes = Buffer.from(tag, "base64")
    bytes[0] ^= 0xff
    const tampered = [version, iv, bytes.toString("base64"), data].join(":")
    expect(open(tampered, ENV_A)).toBeNull()
  })

  it("returns null when opened with a different key", () => {
    const sealed = seal("secret-for-a", ENV_A)
    expect(open(sealed, ENV_B)).toBeNull()
  })

  it("returns null for a malformed sealed string (missing parts)", () => {
    expect(open("v1:onlytwoparts", ENV_A)).toBeNull()
    expect(open("not-sealed-at-all", ENV_A)).toBeNull()
    expect(open("", ENV_A)).toBeNull()
  })

  it("returns null for an unknown version prefix", () => {
    const sealed = seal("hello", ENV_A)
    const rest = sealed.split(":").slice(1).join(":")
    expect(open(`v2:${rest}`, ENV_A)).toBeNull()
  })

  it("returns null when iv / tag / data are not valid base64 pairs for GCM (wrong iv length)", () => {
    const sealed = seal("hello", ENV_A)
    const [version, , tag, data] = sealed.split(":")
    const badIv = Buffer.from("short").toString("base64")
    expect(open([version, badIv, tag, data].join(":"), ENV_A)).toBeNull()
  })
})

describe("key derivation", () => {
  it("seal() throws when no secret source is configured at all", () => {
    expect(() => seal("x", fakeEnv({}))).toThrow(/INTEGRATION_SECRET_KEY/)
  })

  it("open() swallows the same missing-key error and returns null (never throws)", () => {
    // key() throws inside open()'s try block, so the caller sees a clean null
    // like any other "cannot open" case, not an unhandled exception.
    expect(open("v1:a:b:c", fakeEnv({}))).toBeNull()
  })

  it("prefers INTEGRATION_SECRET_KEY over AUTH_SECRET when both are set", () => {
    const sealed = seal("x", fakeEnv({ INTEGRATION_SECRET_KEY: "k1", AUTH_SECRET: "k2" }))
    // Opening with only AUTH_SECRET=k2 uses a different effective key → fails.
    expect(open(sealed, fakeEnv({ AUTH_SECRET: "k2" }))).toBeNull()
    // Opening with the same INTEGRATION_SECRET_KEY succeeds regardless of AUTH_SECRET.
    expect(open(sealed, fakeEnv({ INTEGRATION_SECRET_KEY: "k1", AUTH_SECRET: "different" }))).toBe("x")
  })

  it("falls back to AUTH_SECRET when INTEGRATION_SECRET_KEY is absent", () => {
    const sealed = seal("x", fakeEnv({ AUTH_SECRET: "auth-secret-value" }))
    expect(open(sealed, fakeEnv({ AUTH_SECRET: "auth-secret-value" }))).toBe("x")
  })

  it("falls back to NEXTAUTH_SECRET when neither of the others is set", () => {
    const sealed = seal("x", fakeEnv({ NEXTAUTH_SECRET: "nextauth-secret-value" }))
    expect(open(sealed, fakeEnv({ NEXTAUTH_SECRET: "nextauth-secret-value" }))).toBe("x")
  })

  it("trims whitespace around the configured secret", () => {
    const sealed = seal("x", fakeEnv({ INTEGRATION_SECRET_KEY: "  padded-key  " }))
    expect(open(sealed, fakeEnv({ INTEGRATION_SECRET_KEY: "padded-key" }))).toBe("x")
  })

  it("treats an empty-string secret as not configured (falls through / throws)", () => {
    expect(() => seal("x", fakeEnv({ INTEGRATION_SECRET_KEY: "", AUTH_SECRET: "" }))).toThrow()
  })
})

describe("secretHint", () => {
  it("returns the last 4 characters", () => {
    expect(secretHint("glpat-AbCdEf1234")).toBe("1234")
  })

  it("trims surrounding whitespace before slicing", () => {
    expect(secretHint("  glpat-wxyz  ")).toBe("wxyz")
  })

  it("returns the whole value when shorter than 4 characters", () => {
    expect(secretHint("ab")).toBe("ab")
  })

  it("never reveals more than 4 characters even for a long token", () => {
    const hint = secretHint("a".repeat(200) + "Z9k2")
    expect(hint).toBe("Z9k2")
    expect(hint.length).toBe(4)
  })
})
