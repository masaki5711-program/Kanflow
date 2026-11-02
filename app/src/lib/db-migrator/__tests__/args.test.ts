import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { describe, expect, it } from "vitest"
import { assertPrivateFileMode, describeEndpoint, parseArgs, resolvePasswords } from "../args"
import { MigratorError } from "../errors"

const SRC = "mysql://reader@127.0.0.1:23306/scrum_tool"
const TGT = "postgresql://writer@127.0.0.1:25435/scrum_tool"

function codeOf(fn: () => unknown): string | undefined {
  try {
    fn()
  } catch (e) {
    return e instanceof MigratorError ? e.code : `not-a-MigratorError:${String(e)}`
  }
  return undefined
}

describe("parseArgs", () => {
  it("parses the required endpoints and defaults", () => {
    const a = parseArgs(["--source", SRC, "--target", TGT])
    expect(a.mode).toBe("migrate")
    expect(a.source).toMatchObject({ scheme: "mysql", user: "reader", host: "127.0.0.1", port: 23306, database: "scrum_tool" })
    expect(a.target).toMatchObject({ scheme: "postgresql", user: "writer", host: "127.0.0.1", port: 25435, database: "scrum_tool" })
    expect(a.batchSize).toBe(1000)
    expect(a.allowInvalidJson).toBe(false)
    expect(a.statementTimeoutSec).toBe(900)
  })

  it("never takes the endpoints from the environment (DATABASE_URL is ignored)", () => {
    const before = process.env.DATABASE_URL
    process.env.DATABASE_URL = "postgresql://kanflow:x@127.0.0.1:5432/scrum_tool"
    try {
      expect(codeOf(() => parseArgs(["--source", SRC]))).toBe("USAGE")
      expect(codeOf(() => parseArgs(["--target", TGT]))).toBe("USAGE")
      expect(codeOf(() => parseArgs([]))).toBe("USAGE")
    } finally {
      if (before === undefined) delete process.env.DATABASE_URL
      else process.env.DATABASE_URL = before
    }
  })

  it("refuses a password embedded in a URL (it would sit on argv and in shell history)", () => {
    expect(codeOf(() => parseArgs(["--source", "mysql://reader:secret@127.0.0.1:23306/scrum_tool", "--target", TGT]))).toBe("PASSWORD_ON_ARGV")
    expect(codeOf(() => parseArgs(["--source", SRC, "--target", "postgresql://w:secret@127.0.0.1:25435/scrum_tool"]))).toBe("PASSWORD_ON_ARGV")
  })

  it("requires the right scheme on each side", () => {
    expect(codeOf(() => parseArgs(["--source", TGT, "--target", TGT]))).toBe("USAGE")
    expect(codeOf(() => parseArgs(["--source", SRC, "--target", SRC]))).toBe("USAGE")
    expect(parseArgs(["--source", SRC, "--target", "postgres://w@db.internal/scrum_tool"]).target.port).toBe(5432)
    expect(parseArgs(["--source", "mysql://r@db.internal/scrum_tool", "--target", TGT]).source.port).toBe(3306)
  })

  it("rejects missing user / database, query strings and unknown flags", () => {
    expect(codeOf(() => parseArgs(["--source", "mysql://127.0.0.1:23306/scrum_tool", "--target", TGT]))).toBe("USAGE")
    expect(codeOf(() => parseArgs(["--source", "mysql://r@127.0.0.1:23306/", "--target", TGT]))).toBe("USAGE")
    expect(codeOf(() => parseArgs(["--source", `${SRC}?ssl=1`, "--target", TGT]))).toBe("USAGE")
    expect(codeOf(() => parseArgs(["--source", SRC, "--target", TGT, "--target-empty-check=skip"]))).toBe("USAGE")
    expect(codeOf(() => parseArgs(["--source", SRC, "--target", TGT, "--force"]))).toBe("USAGE")
  })

  it("parses modes and options", () => {
    expect(parseArgs(["--source", SRC, "--target", TGT, "--dry-run"]).mode).toBe("dry-run")
    expect(parseArgs(["--source", SRC, "--target", TGT, "--verify-only"]).mode).toBe("verify-only")
    expect(codeOf(() => parseArgs(["--source", SRC, "--target", TGT, "--dry-run", "--verify-only"]))).toBe("USAGE")
    const a = parseArgs([
      "--source", SRC, "--target", TGT, "--batch-size", "250", "--allow-invalid-json", "--report", "out.json",
      "--deny-file", "deny.txt", "--source-password-file", "s.pw", "--target-password-file", "t.pw", "--statement-timeout-sec", "60",
    ])
    expect(a).toMatchObject({
      batchSize: 250, allowInvalidJson: true, reportPath: "out.json", denyFile: "deny.txt",
      sourcePasswordFile: "s.pw", targetPasswordFile: "t.pw", statementTimeoutSec: 60,
    })
    expect(codeOf(() => parseArgs(["--source", SRC, "--target", TGT, "--batch-size", "0"]))).toBe("USAGE")
    expect(codeOf(() => parseArgs(["--source", SRC, "--target", TGT, "--batch-size", "20000"]))).toBe("USAGE")
    expect(codeOf(() => parseArgs(["--source", SRC, "--target", TGT, "--batch-size"]))).toBe("USAGE")
  })

  it("--help short-circuits", () => {
    expect(parseArgs(["--help"]).mode).toBe("help")
  })
})

describe("describeEndpoint", () => {
  it("never contains a password", () => {
    const a = parseArgs(["--source", SRC, "--target", TGT])
    expect(describeEndpoint(a.source)).toBe("mysql://reader@127.0.0.1:23306/scrum_tool")
    expect(describeEndpoint(a.target)).toBe("postgresql://writer@127.0.0.1:25435/scrum_tool")
  })
})

describe("resolvePasswords", () => {
  const base = parseArgs(["--source", SRC, "--target", TGT])

  it("reads passwords from the dedicated env variables", () => {
    const p = resolvePasswords(base, { KANFLOW_MIGRATOR_SOURCE_PASSWORD: "s", KANFLOW_MIGRATOR_TARGET_PASSWORD: "t" }, "linux")
    expect(p).toEqual({ source: "s", target: "t" })
  })

  it("fails when a password is missing (never falls back to DATABASE_PASSWORD)", () => {
    expect(codeOf(() => resolvePasswords(base, { KANFLOW_MIGRATOR_SOURCE_PASSWORD: "s", DATABASE_PASSWORD: "x" }, "linux"))).toBe("PASSWORD_MISSING")
  })

  it("reads a password file (first line, trimmed) and checks its mode on POSIX", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "k2-pw-"))
    const f = path.join(dir, "t.pw")
    fs.writeFileSync(f, "file-secret\n")
    if (process.platform !== "win32") fs.chmodSync(f, 0o600)
    const a = { ...base, targetPasswordFile: f }
    expect(resolvePasswords(a, { KANFLOW_MIGRATOR_SOURCE_PASSWORD: "s" }, process.platform).target).toBe("file-secret")
    fs.rmSync(dir, { recursive: true, force: true })
  })
})

describe("assertPrivateFileMode", () => {
  it("accepts 0600 / 0400 and refuses group or world access on POSIX", () => {
    expect(() => assertPrivateFileMode("/x", 0o100600, "linux")).not.toThrow()
    expect(() => assertPrivateFileMode("/x", 0o100400, "linux")).not.toThrow()
    expect(codeOf(() => assertPrivateFileMode("/x", 0o100640, "linux"))).toBe("PASSWORD_FILE_MODE")
    expect(codeOf(() => assertPrivateFileMode("/x", 0o100604, "darwin"))).toBe("PASSWORD_FILE_MODE")
  })

  it("does not judge POSIX bits on Windows (NTFS ACLs are documented instead)", () => {
    expect(() => assertPrivateFileMode("C:\\x", 0o100666, "win32")).not.toThrow()
  })
})
