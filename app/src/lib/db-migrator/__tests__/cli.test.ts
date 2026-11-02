import { describe, expect, it, vi } from "vitest"
import { cliMain, type CliDeps } from "../cli"
import { MigratorError } from "../errors"
import type { MigrationReport } from "../run"

const SRC = "mysql://reader@127.0.0.1:23306/scrum_tool"
const TGT = "postgresql://writer@127.0.0.1:25435/scrum_tool"
const REQ = ["--expect-target", "127.0.0.1:25435/scrum_tool", "--source-identity", "s-id", "--target-identity", "t-id"]
const ENV = {
  KANFLOW_MIGRATOR_SOURCE_PASSWORD: "src-secret-value",
  KANFLOW_MIGRATOR_TARGET_PASSWORD: "tgt-secret-value",
  KANFLOW_MIGRATOR_DENY_TARGETS: "prod-db.internal:5432/scrum_tool",
}

function okReport(extra: Partial<MigrationReport> = {}): MigrationReport {
  return { outcome: "ok", exitCode: 0, committed: true, durationMs: 1, ...extra } as MigrationReport
}

function deps(overrides: Partial<CliDeps> = {}): CliDeps & { out: string[] } {
  const out: string[] = []
  return {
    out,
    env: ENV,
    platform: "linux",
    readFile: vi.fn(() => {
      throw new Error("no file")
    }),
    statMode: vi.fn(() => 0o100600),
    writeReport: vi.fn(),
    writeSideFile: vi.fn(),
    print: (line: string) => out.push(line),
    run: vi.fn(async () => okReport()),
    ...overrides,
  }
}

describe("cliMain", () => {
  it("exits 64 on a usage error without connecting", async () => {
    const d = deps()
    expect(await cliMain(["--target", TGT], d)).toBe(64)
    expect(d.run).not.toHaveBeenCalled()
  })

  it("refuses a deny-listed target (exit 2) before any connection is made", async () => {
    const d = deps()
    expect(await cliMain(["--source", SRC, "--target", "postgresql://w@prod-db.internal:5432/scrum_tool", "--target-ca", "ca.pem", ...REQ.slice(2), "--expect-target", "prod-db.internal:5432/scrum_tool"], d)).toBe(2)
    expect(d.run).not.toHaveBeenCalled()
    expect(d.out.join("\n")).toContain("TARGET_DENIED")
  })

  it("refuses when --expect-target does not equal --target", async () => {
    const d = deps()
    expect(await cliMain(["--source", SRC, "--target", TGT, ...REQ.slice(2), "--expect-target", "127.0.0.1:25435/other_db"], d)).toBe(2)
    expect(d.run).not.toHaveBeenCalled()
    expect(d.out.join("\n")).toContain("EXPECT_TARGET_MISMATCH")
  })

  it("refuses to run without a deny list", async () => {
    const d = deps({ env: { KANFLOW_MIGRATOR_SOURCE_PASSWORD: "s", KANFLOW_MIGRATOR_TARGET_PASSWORD: "t" } })
    expect(await cliMain(["--source", SRC, "--target", TGT, ...REQ], d)).toBe(2)
    expect(d.run).not.toHaveBeenCalled()
  })

  it("on Windows refuses a password file whose ACL is too broad", async () => {
    const d = deps({
      platform: "win32",
      env: { KANFLOW_MIGRATOR_DENY_TARGETS: "x:1/y", KANFLOW_MIGRATOR_SOURCE_PASSWORD: "s" },
      readFile: vi.fn(() => "pw\n"),
      aclCheck: vi.fn(() => {
        throw new MigratorError("PASSWORD_FILE_MODE", "grants access to a broad group")
      }),
    })
    expect(await cliMain(["--source", SRC, "--target", TGT, ...REQ, "--target-password-file", "t.pw"], d)).toBe(2)
    expect(d.aclCheck).toHaveBeenCalledWith("t.pw")
    expect(d.run).not.toHaveBeenCalled()
  })

  it("passes the resolved passwords to the runner but never prints them", async () => {
    const d = deps()
    expect(await cliMain(["--source", SRC, "--target", TGT, ...REQ, "--dry-run"], d)).toBe(0)
    const [args, passwords] = (d.run as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(args.mode).toBe("dry-run")
    expect(passwords).toEqual({ source: "src-secret-value", target: "tgt-secret-value" })
    expect(d.out.join("\n")).not.toContain("secret-value")
  })

  it("propagates the runner's exit code and writes the report (secrets redacted on the object)", async () => {
    const d = deps({ run: vi.fn(async () => okReport({ outcome: "verify-failed", exitCode: 1, committed: false, error: "x tgt-secret-value y" })) })
    expect(await cliMain(["--source", SRC, "--target", TGT, ...REQ, "--report", "r.json"], d)).toBe(1)
    const written = (d.writeReport as ReturnType<typeof vi.fn>).mock.calls[0][1] as MigrationReport
    expect(written.exitCode).toBe(1)
    expect(JSON.stringify(written)).not.toContain("tgt-secret-value")
  })

  it("a connection failure still leaves a sanitized error report (exit 3, committed false)", async () => {
    const d = deps({
      run: vi.fn(async () => {
        throw new Error("connect failed for tgt-secret-value: role \"alice@example.test\" does not exist")
      }),
    })
    expect(await cliMain(["--source", SRC, "--target", TGT, ...REQ, "--report", "r.json"], d)).toBe(3)
    const written = (d.writeReport as ReturnType<typeof vi.fn>).mock.calls[0][1] as MigrationReport
    expect(written).toMatchObject({ outcome: "error", exitCode: 3, committed: false })
    const all = d.out.join("\n") + JSON.stringify(written)
    expect(all).not.toContain("tgt-secret-value")
    expect(all).not.toContain("alice@example.test")
  })

  it("a failed report write is logged with the real exit code and does not change it", async () => {
    const d = deps({
      run: vi.fn(async () => okReport()),
      writeReport: vi.fn(() => {
        throw new Error("EACCES")
      }),
    })
    expect(await cliMain(["--source", SRC, "--target", TGT, ...REQ, "--report", "r.json"], d)).toBe(0)
    expect(d.out.join("\n")).toMatch(/report could not be written.*exit 0.*committed=true/)
  })

  it("--allow-invalid-json routes the nulled keys + originals to the side file, never to stdout", async () => {
    const d = deps({
      run: vi.fn(async (_a, _p, _log, hooks) => {
        await hooks?.onInvalidJsonNulled?.([{ table: "git_link", column: "outsideScopePaths", key: "k1", original: '["secret-original"]' }])
        return okReport()
      }),
    })
    expect(await cliMain(["--source", SRC, "--target", TGT, ...REQ, "--allow-invalid-json", "--invalid-json-file", "nulled.jsonl"], d)).toBe(0)
    expect(d.writeSideFile).toHaveBeenCalledWith("nulled.jsonl", expect.stringContaining("secret-original"))
    expect(d.out.join("\n")).not.toContain("secret-original")
  })
})
