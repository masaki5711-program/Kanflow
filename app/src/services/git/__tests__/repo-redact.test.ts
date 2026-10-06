import { describe, expect, it } from "vitest"
import { REDACTED, redactSecrets } from "../repo-redact"

describe("redactSecrets", () => {
  it("masks private key blocks", () => {
    const text = "before\n-----BEGIN RSA PRIVATE KEY-----\nMIIEow\nabc\n-----END RSA PRIVATE KEY-----\nafter"
    const out = redactSecrets(text)
    expect(out).not.toContain("MIIEow")
    expect(out).toContain("before")
    expect(out).toContain("after")
  })

  it.each([
    ["GitLab", "token glpat-AbCdEfGhIjKlMnOpQrSt12"],
    ["GitHub", "ghp_0123456789abcdefghijABCDEFGHIJ0123"],
    ["AWS", "key AKIAIOSFODNN7EXAMPLE here"],
    ["Slack", "xoxb-1234567890-abcdefghij"],
    ["OpenAI-style", "sk-abcdefghijklmnopqrstuvwx"],
    ["JWT", "Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.abcdefghijklmnop"],
  ])("masks %s tokens", (_name, text) => {
    expect(redactSecrets(text)).toContain(REDACTED)
  })

  it("masks the password in a URL but keeps the rest", () => {
    expect(redactSecrets("postgres://app:S3cretPw@db:5432/pfs")).toBe(`postgres://app:${REDACTED}@db:5432/pfs`)
  })

  it.each([
    ['password = "Kanflow-2026!"', `password = "${REDACTED}"`],
    ["DB_PASSWORD=hunter2hunter2", `DB_PASSWORD=${REDACTED}`],
    ['"apiKey": "a1b2c3d4e5f6g7h8"', `"apiKey": "${REDACTED}"`],
    ["client_secret: xY9-long-secret-value", `client_secret: ${REDACTED}`],
    ['password: "SuperSecretPassphrase"', `password: "${REDACTED}"`],
  ])("masks the value of a secret assignment: %s", (text, expected) => {
    expect(redactSecrets(text)).toBe(expected)
  })

  it.each([
    "| password | string | required |",
    "password: 必須",
    "token: string",
    "PASSWORD :'owner_pw'",
    "password_var: 'reader_password_variable'",
    "api_key: ${API_KEY}",
    "password = <your password>",
    "secret: process.env.SECRET",
    "パスワードは 8 文字以上",
    "The token expires after 30 minutes.",
  ])("leaves prose, types and placeholders alone: %s", (text) => {
    expect(redactSecrets(text)).toBe(text)
  })
})
