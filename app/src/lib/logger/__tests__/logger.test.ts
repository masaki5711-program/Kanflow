import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { mkdtemp, readFile, rm } from "fs/promises"
import os from "os"
import path from "path"
import { createLogger } from "@/lib/logger"

const NOW = new Date(2026, 8, 23, 10, 0, 0)
let dir: string

beforeEach(async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), "kanflow-log-"))
})
afterEach(async () => {
  vi.restoreAllMocks()
  await rm(dir, { recursive: true, force: true })
})

async function readLines(): Promise<Record<string, unknown>[]> {
  const raw = await readFile(path.join(dir, "app-2026-09-23.log"), "utf8")
  return raw.trim().split("\n").map((l) => JSON.parse(l))
}

describe("createLogger", () => {
  it("filters below the configured level", async () => {
    const log = createLogger({ dir, level: "warn", stderr: false, now: () => NOW })

    log.debug("d")
    log.info("i")
    log.warn("w")
    log.error("e")
    await log.flush()

    expect((await readLines()).map((l) => l.level)).toEqual(["warn", "error"])
    expect(log.isLevelEnabled("info")).toBe(false)
    expect(log.isLevelEnabled("error")).toBe(true)
  })

  it("writes JSON lines with ISO timestamp, child bindings and redacted fields", async () => {
    const log = createLogger({ dir, level: "debug", stderr: false, now: () => NOW })
    const child = log.child({ module: "auth" })

    child.info("login", { email: "a@b.c", password: "secret" })
    await log.flush()

    const [line] = await readLines()
    expect(line).toMatchObject({ level: "info", msg: "login", module: "auth", email: "a@b.c", password: "[REDACTED]" })
    expect(String(line.ts)).toMatch(/^2026-09-23T10:00:00\.000[+-]\d{2}:\d{2}$/)
  })

  it("mirrors only warn and error to stderr", async () => {
    const spy = vi.spyOn(process.stderr, "write").mockImplementation(() => true)
    const log = createLogger({ dir, level: "debug", now: () => NOW })

    log.info("quiet")
    log.warn("loud")
    log.error("louder")
    await log.flush()

    const mirrored = spy.mock.calls.map((c) => JSON.parse(String(c[0])).msg)
    expect(mirrored).toEqual(["loud", "louder"])
  })
})
