import { describe, expect, it, vi } from "vitest"
import { cliMain, type CliDeps } from "../cli"
import type { MigrationReport } from "../run"

const SRC = "mysql://reader@127.0.0.1:23306/scrum_tool"
const TGT = "postgresql://writer@127.0.0.1:25435/scrum_tool"
const ENV = {
  KANFLOW_MIGRATOR_SOURCE_PASSWORD: "src-secret-value",
  KANFLOW_MIGRATOR_TARGET_PASSWORD: "tgt-secret-value",
  KANFLOW_MIGRATOR_DENY_TARGETS: "prod-db.internal:5432/scrum_tool",
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
    print: (line: string) => out.push(line),
    run: vi.fn(async () => ({ outcome: "ok", exitCode: 0 }) as MigrationReport),
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
    expect(await cliMain(["--source", SRC, "--target", "postgresql://w@prod-db.internal:5432/scrum_tool"], d)).toBe(2)
    expect(d.run).not.toHaveBeenCalled()
    expect(d.out.join("\n")).toContain("TARGET_DENIED")
  })

  it("refuses to run without a deny list", async () => {
    const d = deps({ env: { KANFLOW_MIGRATOR_SOURCE_PASSWORD: "s", KANFLOW_MIGRATOR_TARGET_PASSWORD: "t" } })
    expect(await cliMain(["--source", SRC, "--target", TGT], d)).toBe(2)
    expect(d.run).not.toHaveBeenCalled()
  })

  it("passes the resolved passwords to the runner but never prints them", async () => {
    const d = deps()
    expect(await cliMain(["--source", SRC, "--target", TGT, "--dry-run"], d)).toBe(0)
    expect(d.run).toHaveBeenCalledTimes(1)
    const [args, passwords] = (d.run as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(args.mode).toBe("dry-run")
    expect(passwords).toEqual({ source: "src-secret-value", target: "tgt-secret-value" })
    expect(d.out.join("\n")).not.toContain("secret-value")
  })

  it("propagates the runner's exit code and writes the report when asked", async () => {
    const d = deps({ run: vi.fn(async () => ({ outcome: "verify-failed", exitCode: 1 }) as MigrationReport) })
    expect(await cliMain(["--source", SRC, "--target", TGT, "--report", "r.json"], d)).toBe(1)
    expect(d.writeReport).toHaveBeenCalledWith("r.json", expect.objectContaining({ exitCode: 1 }))
  })

  it("maps an unexpected runner failure to exit 3 without leaking the password", async () => {
    const d = deps({
      run: vi.fn(async () => {
        throw new Error("connect failed for tgt-secret-value")
      }),
    })
    expect(await cliMain(["--source", SRC, "--target", TGT], d)).toBe(3)
    expect(d.out.join("\n")).not.toContain("tgt-secret-value")
    expect(d.out.join("\n")).toContain("***")
  })
})
