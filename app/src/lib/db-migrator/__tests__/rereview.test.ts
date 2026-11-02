import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { describe, expect, it } from "vitest"
import { parseArgs } from "../args"
import { writeAtomic } from "../atomic-file"
import { identityDenyList, parseDenyEntries } from "../deny-list"
import { MigratorError } from "../errors"
import { assertWindowsAclPrivate, icaclsPath } from "../file-acl"
import { checkWarningBaseline, makeValueHasher } from "../run"

/** Re-review follow-ups (MR K2, second round). */

function code(fn: () => unknown): string | undefined {
  try {
    fn()
  } catch (e) {
    return e instanceof MigratorError ? e.code : `other:${String(e)}`
  }
  return undefined
}

describe("value hashes are HMAC-SHA256 with a per-run random key", () => {
  it("groups equal values within one run, differs between runs, is not a plain sha256 prefix", async () => {
    const a = makeValueHasher()
    const b = makeValueHasher()
    expect(a("alice@example.test")).toBe(a("alice@example.test"))
    expect(a("alice@example.test")).not.toBe(a("bob@example.test"))
    expect(a("alice@example.test")).not.toBe(b("alice@example.test"))
    const { createHash } = await import("node:crypto")
    expect(a("alice@example.test")).not.toBe(createHash("sha256").update("alice@example.test").digest("hex").slice(0, 12))
    expect(a("x")).toMatch(/^[0-9a-f]{16}$/)
  })
})

describe("file-acl: SIDs and an explicit icacls path", () => {
  it("refuses the well-known broad SIDs as icacls prints them when names do not resolve", () => {
    for (const sid of ["*S-1-1-0", "*S-1-5-11", "*S-1-5-32-545"]) {
      expect(code(() => assertWindowsAclPrivate("f.pw", `f.pw ${sid}:(R)\n`))).toBe("PASSWORD_FILE_MODE")
    }
    expect(() => assertWindowsAclPrivate("f.pw", "f.pw *S-1-5-18:(F)\n     *S-1-5-32-544:(F)\n")).not.toThrow()
  })
  it("uses %SystemRoot%\\System32\\icacls.exe, never a PATH lookup", () => {
    expect(icaclsPath({ SystemRoot: "D:\\Win" })).toBe(path.win32.join("D:\\Win", "System32", "icacls.exe"))
    expect(icaclsPath({})).toBe(path.win32.join("C:\\Windows", "System32", "icacls.exe"))
  })
})

describe("--accept-warnings is bounded by the dry run of the same source", () => {
  const baseline = {
    sourceIdentity: "src-1",
    warnings: [{ code: "LOCAL_TIME_SUSPECT", table: "field_translation", column: "requested_at", count: 3 }],
  }
  const w = (count: number) => ({ code: "LOCAL_TIME_SUSPECT" as const, severity: "warning" as const, table: "field_translation", column: "requested_at", count, sampleKeys: [], message: "" })

  it("accepts counts up to the dry run's", () => {
    expect(checkWarningBaseline([w(3)], baseline, "src-1")).toEqual([])
    expect(checkWarningBaseline([w(2)], baseline, "src-1")).toEqual([])
  })
  it("refuses a rise, a warning the dry run did not have, and a different source", () => {
    expect(checkWarningBaseline([w(4)], baseline, "src-1")[0]).toContain("3 -> 4")
    expect(checkWarningBaseline([{ ...w(1), column: "updated_at" }], baseline, "src-1")[0]).toContain("not in the dry run")
    expect(checkWarningBaseline([w(1)], baseline, "src-2")[0]).toContain("different source")
  })
  it("the CLI requires --dry-run-report with --accept-warnings", () => {
    const base = ["--source", "mysql://r@127.0.0.1:23306/x", "--target", "postgresql://w@127.0.0.1:25435/y", "--expect-target", "127.0.0.1:25435/y", "--source-identity", "s", "--target-identity", "t"]
    expect(code(() => parseArgs([...base, "--accept-warnings", "LOCAL_TIME_SUSPECT"]))).toBe("USAGE")
    expect(parseArgs([...base, "--accept-warnings", "LOCAL_TIME_SUSPECT", "--dry-run-report", "d.json"]).dryRunReport).toBe("d.json")
  })
})

describe("deny list may carry server identities", () => {
  it("parses id:<identity> entries separately from host entries", () => {
    const e = parseDenyEntries("id:7703533737960398882/16384\n127.0.0.1:25434/*\nid:562f135e-d6b3-11f1-bbd3-0e7d6fcd52c6\n")
    expect(e.map((x) => x.raw)).toEqual(["id:7703533737960398882/16384", "127.0.0.1:25434/*", "id:562f135e-d6b3-11f1-bbd3-0e7d6fcd52c6"])
    expect(identityDenyList(e)).toEqual(["7703533737960398882/16384", "562f135e-d6b3-11f1-bbd3-0e7d6fcd52c6"])
  })
})

describe("writeAtomic", () => {
  it("writes via temp + rename and leaves no .tmp behind on failure", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "k2-atomic-"))
    const f = path.join(dir, "r.json")
    writeAtomic(f, "one")
    expect(fs.readFileSync(f, "utf8")).toBe("one")
    // rename onto a directory fails -> the temp file must be removed
    const blocker = path.join(dir, "blocked")
    fs.mkdirSync(blocker)
    fs.writeFileSync(path.join(blocker, "x"), "keep")
    expect(() => writeAtomic(blocker, "two")).toThrow()
    expect(fs.readdirSync(dir).filter((n) => n.endsWith(".tmp"))).toEqual([])
    fs.rmSync(dir, { recursive: true, force: true })
  })
})
