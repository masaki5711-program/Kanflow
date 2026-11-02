import { describe, expect, it } from "vitest"
import { parseArgs } from "../args"
import { assertExpectedTarget } from "../deny-list"
import { MigratorError } from "../errors"
import { assertWindowsAclPrivate } from "../file-acl"
import { redactDeep, sanitizeError } from "../sanitize"
import { mysqlSsl, pgSsl } from "../tls"

/** Review follow-ups (HIGH/MEDIUM/LOW of the independent review of MR K2). */

const SRC = "mysql://reader@127.0.0.1:23306/scrum_tool"
const TGT = "postgresql://writer@127.0.0.1:25435/scrum_tool"
const EXPECT = ["--expect-target", "127.0.0.1:25435/scrum_tool"]
const IDS = ["--source-identity", "uuid-1", "--target-identity", "sys-1/16384"]

function code(fn: () => unknown): string | undefined {
  try {
    fn()
  } catch (e) {
    return e instanceof MigratorError ? e.code : `other:${String(e)}`
  }
  return undefined
}

describe("TLS for non-loopback endpoints", () => {
  it("refuses a non-loopback host without a CA file (exit 2 family, not usage)", () => {
    expect(code(() => parseArgs(["--source", SRC, "--target", "postgresql://w@db.internal:5432/scrum_tool", "--expect-target", "db.internal:5432/scrum_tool", "--dry-run"]))).toBe("TLS_REQUIRED")
    expect(code(() => parseArgs(["--source", "mysql://r@10.1.2.3:3306/scrum_tool", "--target", TGT, ...EXPECT, "--dry-run"]))).toBe("TLS_REQUIRED")
  })

  it("accepts a non-loopback host with --target-ca / --source-ca", () => {
    const a = parseArgs([
      "--source", "mysql://r@10.1.2.3:3306/scrum_tool", "--source-ca", "src-ca.pem",
      "--target", "postgresql://w@db.internal:5432/scrum_tool", "--target-ca", "pg-ca.pem",
      "--expect-target", "db.internal:5432/scrum_tool", "--dry-run",
    ])
    expect(a.sourceCaFile).toBe("src-ca.pem")
    expect(a.targetCaFile).toBe("pg-ca.pem")
  })

  it("builds verifying TLS options (never rejectUnauthorized: false)", () => {
    expect(pgSsl("127.0.0.1", null)).toBeUndefined()
    expect(mysqlSsl("localhost", null)).toBeUndefined()
    expect(pgSsl("db.internal", "PEM")).toEqual({ rejectUnauthorized: true, ca: "PEM" })
    expect(mysqlSsl("db.internal", "PEM")).toEqual({ rejectUnauthorized: true, ca: "PEM" })
    expect(pgSsl("127.0.0.1", "PEM")).toEqual({ rejectUnauthorized: true, ca: "PEM" })
    expect(code(() => pgSsl("db.internal", null))).toBe("TLS_REQUIRED")
    expect(code(() => mysqlSsl("10.0.0.1", null))).toBe("TLS_REQUIRED")
  })
})

describe("new required arguments", () => {
  it("requires --expect-target in every mode", () => {
    expect(code(() => parseArgs(["--source", SRC, "--target", TGT, "--dry-run"]))).toBe("USAGE")
  })

  it("requires the identities recorded at the dry run for a migrate run only", () => {
    expect(code(() => parseArgs(["--source", SRC, "--target", TGT, ...EXPECT]))).toBe("USAGE")
    expect(parseArgs(["--source", SRC, "--target", TGT, ...EXPECT, ...IDS])).toMatchObject({ sourceIdentity: "uuid-1", targetIdentity: "sys-1/16384" })
    expect(parseArgs(["--source", SRC, "--target", TGT, ...EXPECT, "--dry-run"]).sourceIdentity).toBeNull()
  })

  it("parses --accept-warnings and rejects unknown codes", () => {
    const a = parseArgs(["--source", SRC, "--target", TGT, ...EXPECT, ...IDS, "--accept-warnings", "LOCAL_TIME_SUSPECT,FUTURE_TIMESTAMP", "--dry-run-report", "dry.json"])
    expect(a.acceptWarnings).toEqual(["LOCAL_TIME_SUSPECT", "FUTURE_TIMESTAMP"])
    expect(code(() => parseArgs(["--source", SRC, "--target", TGT, ...EXPECT, ...IDS, "--accept-warnings", "NUL_BYTE"]))).toBe("USAGE")
    expect(code(() => parseArgs(["--source", SRC, "--target", TGT, ...EXPECT, ...IDS, "--accept-warnings", "BOGUS"]))).toBe("USAGE")
  })

  it("--allow-invalid-json needs --invalid-json-file (nulled keys and originals go there, not to stdout)", () => {
    expect(code(() => parseArgs(["--source", SRC, "--target", TGT, ...EXPECT, "--dry-run", "--allow-invalid-json"]))).toBe("USAGE")
    expect(parseArgs(["--source", SRC, "--target", TGT, ...EXPECT, "--dry-run", "--allow-invalid-json", "--invalid-json-file", "x.jsonl"]).invalidJsonFile).toBe("x.jsonl")
  })

  it("does not echo an unknown argument (it might be a pasted secret)", () => {
    try {
      parseArgs(["--source", SRC, "--target", TGT, ...EXPECT, "--dry-run", "hunter2-secret"])
      expect.unreachable()
    } catch (e) {
      expect((e as Error).message).not.toContain("hunter2")
    }
  })
})

describe("assertExpectedTarget", () => {
  const target = parseArgs(["--source", SRC, "--target", TGT, ...EXPECT, "--dry-run"]).target
  it("accepts the same host:port/db (loopback aliases equal)", () => {
    expect(() => assertExpectedTarget(target, "localhost:25435/scrum_tool")).not.toThrow()
  })
  it("refuses any difference", () => {
    expect(code(() => assertExpectedTarget(target, "127.0.0.1:25435/scrum_tool_x"))).toBe("EXPECT_TARGET_MISMATCH")
    expect(code(() => assertExpectedTarget(target, "127.0.0.1:5432/scrum_tool"))).toBe("EXPECT_TARGET_MISMATCH")
    expect(code(() => assertExpectedTarget(target, "garbage"))).toBe("EXPECT_TARGET_MISMATCH")
  })
})

describe("sanitizeError (no row values in logs or reports)", () => {
  it("strips PostgreSQL value echoes", () => {
    const e = Object.assign(new Error('invalid input syntax for type boolean: "alice@example.test"'), { code: "22P02" })
    const s = sanitizeError(e)
    expect(s).toContain("22P02")
    expect(s).not.toContain("alice@example.test")
    const dup = Object.assign(new Error('duplicate key value violates unique constraint "User_email_key"'), {
      code: "23505",
      detail: "Key (email)=(alice@example.test) already exists.",
    })
    expect(sanitizeError(dup)).not.toContain("alice@example.test")
    expect(sanitizeError(dup)).toContain("User_email_key")
  })

  it("strips MySQL value echoes", () => {
    const e = Object.assign(new Error("Duplicate entry 'alice@example.test' for key 'User.User_email_key'"), { code: "ER_DUP_ENTRY", sqlMessage: "Duplicate entry 'alice@example.test' for key 'User.User_email_key'" })
    expect(sanitizeError(e)).not.toContain("alice@example.test")
    expect(sanitizeError(e)).toContain("ER_DUP_ENTRY")
  })

  it("keeps plain messages that carry no quoted value", () => {
    expect(sanitizeError(new Error("connect ECONNREFUSED 127.0.0.1:25435"))).toContain("ECONNREFUSED")
  })
})

describe("redactDeep", () => {
  it("redacts secrets in every string of a nested object, keys included", () => {
    const out = redactDeep({ a: "x pw1 y", b: [{ c: "pw2" }], pw1: 1, n: 3, z: null }, ["pw1", "pw2"])
    expect(JSON.stringify(out)).not.toMatch(/pw1|pw2/)
    expect(out).toMatchObject({ a: "x *** y", b: [{ c: "***" }], n: 3, z: null })
  })
})

describe("assertWindowsAclPrivate", () => {
  it("refuses Everyone / Users / Authenticated Users entries", () => {
    expect(code(() => assertWindowsAclPrivate("f.pw", "f.pw BUILTIN\\Users:(I)(RX)\n    NT AUTHORITY\\SYSTEM:(F)\n"))).toBe("PASSWORD_FILE_MODE")
    expect(code(() => assertWindowsAclPrivate("f.pw", "f.pw Everyone:(R)\n"))).toBe("PASSWORD_FILE_MODE")
    expect(code(() => assertWindowsAclPrivate("f.pw", "f.pw NT AUTHORITY\\Authenticated Users:(I)(M)\n"))).toBe("PASSWORD_FILE_MODE")
  })
  it("accepts owner / SYSTEM / Administrators only", () => {
    expect(() =>
      assertWindowsAclPrivate("f.pw", "f.pw CORP\\op1:(R)\n     NT AUTHORITY\\SYSTEM:(R)\n     BUILTIN\\Administrators:(F)\n\nSuccessfully processed 1 files; Failed processing 0 files\n"),
    ).not.toThrow()
  })
})
