import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { mkdtemp, readFile, rm } from "fs/promises"
import os from "os"
import path from "path"

const ENV_KEYS = ["AI_ACTIVITY_LOG", "AI_LOG_USER_TEXT", "AI_LOG_USER_TEXT_MAX"] as const
let dir: string

beforeEach(async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), "kanflow-ai-"))
  vi.resetModules()
  process.env.AI_ACTIVITY_LOG = path.join(dir, "ai-activity.log")
})
afterEach(async () => {
  for (const k of ENV_KEYS) delete process.env[k]
  await rm(dir, { recursive: true, force: true })
})

describe("ai-monitor", () => {
  it("appends `ISO | EVENT | detail` lines to AI_ACTIVITY_LOG with secrets masked", async () => {
    const { aiLog, aiLogFlush } = await import("@/lib/ai-monitor")

    aiLog("CHAT_START", "lang=ja  token=abc")
    await aiLogFlush()

    const line = (await readFile(path.join(dir, "ai-activity.log"), "utf8")).trim()
    const [ts, event, detail] = line.split(" | ")
    expect(ts).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}[+-]\d{2}:\d{2}$/)
    expect(event.trim()).toBe("CHAT_START")
    expect(detail).toBe("lang=ja token=[REDACTED]")
  })

  it("caps user text excerpts at 60 chars by default", async () => {
    const { aiLogTrunc } = await import("@/lib/ai-monitor")

    expect(aiLogTrunc("a".repeat(100), 90)).toBe("a".repeat(60) + "…")
    expect(aiLogTrunc("short", 90)).toBe("short")
    expect(aiLogTrunc("abcdef", 3)).toBe("abc…")
    expect(aiLogTrunc(null)).toBe("")
  })

  it("omits excerpts when AI_LOG_USER_TEXT=0", async () => {
    process.env.AI_LOG_USER_TEXT = "0"
    const { aiLogTrunc } = await import("@/lib/ai-monitor")

    expect(aiLogTrunc("private question")).toBe("(omitted)")
  })
})
