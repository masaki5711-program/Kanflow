import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import {
  HEARTBEAT_FILE_NAME,
  readHeartbeatStatus,
  removeHeartbeatFile,
  resolveHeartbeatFile,
  writeHeartbeatFile,
  type WorkerHeartbeat,
} from "../worker-heartbeat"

const env = (vars: Record<string, string>) => vars as unknown as NodeJS.ProcessEnv
let dir: string

function hb(writtenAt: Date, over: Partial<WorkerHeartbeat> = {}): WorkerHeartbeat {
  return {
    v: 1,
    pid: 4242,
    startedAt: writtenAt.toISOString(),
    writtenAt: writtenAt.toISOString(),
    intervalMs: 60_000,
    translation: { mode: "external", runHere: true, lastTickAt: null, lastResult: null },
    gate: "idle",
    businessHours: "off",
    webBuildId: null,
    ...over,
  }
}

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "kanflow-hb-"))
})
afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true })
})

describe("resolveHeartbeatFile", () => {
  it("uses WORKER_HEARTBEAT_FILE, else LOG_DIR, else <cwd>/logs", () => {
    expect(resolveHeartbeatFile(env({ WORKER_HEARTBEAT_FILE: path.join(dir, "hb.json") }))).toBe(path.join(dir, "hb.json"))
    expect(resolveHeartbeatFile(env({ LOG_DIR: dir }))).toBe(path.join(dir, HEARTBEAT_FILE_NAME))
    expect(resolveHeartbeatFile(env({}))).toBe(path.join(process.cwd(), "logs", HEARTBEAT_FILE_NAME))
  })
})

describe("heartbeat file round trip", () => {
  it("absent when there is no file", () => {
    expect(readHeartbeatStatus(path.join(dir, "missing.json"))).toEqual({ status: "absent", ageSec: null, pid: null })
  })

  it("write (creating the directory) then read: ok while fresh", () => {
    const file = path.join(dir, "sub", HEARTBEAT_FILE_NAME)
    const now = Date.parse("2026-09-23T10:00:00Z")
    writeHeartbeatFile(file, hb(new Date(now - 30_000)))
    expect(readHeartbeatStatus(file, now, env({}))).toEqual({ status: "ok", ageSec: 30, pid: 4242 })
    expect(fs.readdirSync(path.dirname(file))).toEqual([HEARTBEAT_FILE_NAME]) // no temp file left behind
  })

  it("stale after 3 intervals, or after WORKER_HEARTBEAT_STALE_MS when larger", () => {
    const file = path.join(dir, HEARTBEAT_FILE_NAME)
    const now = Date.parse("2026-09-23T10:00:00Z")
    writeHeartbeatFile(file, hb(new Date(now - 181_000)))
    expect(readHeartbeatStatus(file, now, env({})).status).toBe("stale")
    expect(readHeartbeatStatus(file, now, env({ WORKER_HEARTBEAT_STALE_MS: "600000" })).status).toBe("ok")
    writeHeartbeatFile(file, hb(new Date(now - 25_000), { intervalMs: 5_000 }))
    expect(readHeartbeatStatus(file, now, env({})).status).toBe("stale")
  })

  it("falls back to the file mtime when the content is unreadable", () => {
    const file = path.join(dir, HEARTBEAT_FILE_NAME)
    fs.writeFileSync(file, "{ partial")
    const r = readHeartbeatStatus(file, Date.now() + 1_000, env({}))
    expect(r.status).toBe("ok")
    expect(r.pid).toBeNull()
  })

  it("remove deletes the file and ignores a missing one", () => {
    const file = path.join(dir, HEARTBEAT_FILE_NAME)
    writeHeartbeatFile(file, hb(new Date()))
    removeHeartbeatFile(file)
    removeHeartbeatFile(file)
    expect(readHeartbeatStatus(file).status).toBe("absent")
  })
})
