import fs from "node:fs"
import path from "node:path"

/**
 * Worker liveness signal WITHOUT a schema change: the standalone worker
 * rewrites a small JSON file every heartbeat (default 60 s); web processes
 * (GET /api/health) and ops scripts (watchdog, status.ps1) read its age.
 *
 *   file:  WORKER_HEARTBEAT_FILE, default <LOG_DIR>/worker-heartbeat.json
 *          (LOG_DIR defaults to <app>/logs; worker and web share app\.env)
 *   ok     = written within max(3 x interval, WORKER_HEARTBEAT_STALE_MS)
 *   stale  = older than that (worker hung, stopped hard, or lost its lock)
 *   absent = no file (never started, or stopped gracefully - it deletes it)
 *
 * Contents are operational only (pid, times, counters) - never secrets.
 */

export const HEARTBEAT_FILE_NAME = "worker-heartbeat.json"
const DEFAULT_INTERVAL_MS = 60_000

export type WorkerLiveness = "ok" | "stale" | "absent"

export interface WorkerHeartbeat {
  v: 1
  pid: number
  startedAt: string
  writtenAt: string
  intervalMs: number
  translation: {
    mode: string
    runHere: boolean
    lastTickAt: string | null
    lastResult: { processed: number; skipped: string | null } | null
  }
  gate: string
  businessHours: "open" | "closed" | "off"
  /** BUILD_ID of the web build the worker bundle was built with (BUILD_INFO.json), if known. */
  webBuildId: string | null
}

export interface HeartbeatStatus {
  status: WorkerLiveness
  ageSec: number | null
  pid: number | null
}

export function resolveHeartbeatFile(env: NodeJS.ProcessEnv = process.env): string {
  const explicit = env.WORKER_HEARTBEAT_FILE?.trim()
  if (explicit) return path.resolve(explicit)
  // Same default as src/lib/logger resolveLogDir(): LOG_DIR, else <cwd>/logs.
  const logDir = env.LOG_DIR?.trim()
  return path.join(logDir ? path.resolve(logDir) : path.join(process.cwd(), "logs"), HEARTBEAT_FILE_NAME)
}

/** Write atomically (temp file + rename); falls back to a direct write if the rename is blocked. */
export function writeHeartbeatFile(file: string, hb: WorkerHeartbeat): void {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  const body = `${JSON.stringify(hb)}\n`
  const tmp = `${file}.${process.pid}.tmp`
  try {
    fs.writeFileSync(tmp, body)
    fs.renameSync(tmp, file)
  } catch {
    // Windows: rename over a file a reader has open can fail with EPERM.
    fs.rmSync(tmp, { force: true })
    fs.writeFileSync(file, body)
  }
}

export function removeHeartbeatFile(file: string): void {
  fs.rmSync(file, { force: true })
}

function staleAfterMs(intervalMs: number, env: NodeJS.ProcessEnv): number {
  const fromEnv = Number(env.WORKER_HEARTBEAT_STALE_MS)
  const floor = Number.isInteger(fromEnv) && fromEnv > 0 ? fromEnv : 0
  return Math.max(3 * intervalMs, floor)
}

/** Classify the heartbeat file. Never throws. */
export function readHeartbeatStatus(file: string, nowMs: number = Date.now(), env: NodeJS.ProcessEnv = process.env): HeartbeatStatus {
  let raw: string
  try {
    raw = fs.readFileSync(file, "utf8")
  } catch {
    return { status: "absent", ageSec: null, pid: null }
  }
  let writtenMs = Number.NaN
  let intervalMs = DEFAULT_INTERVAL_MS
  let pid: number | null = null
  try {
    const hb = JSON.parse(raw) as Partial<WorkerHeartbeat>
    writtenMs = Date.parse(String(hb.writtenAt))
    if (typeof hb.intervalMs === "number" && hb.intervalMs > 0) intervalMs = hb.intervalMs
    if (typeof hb.pid === "number") pid = hb.pid
  } catch {
    // Unparseable (partial write): fall back to the file's mtime below.
  }
  if (!Number.isFinite(writtenMs)) {
    try {
      writtenMs = fs.statSync(file).mtimeMs
    } catch {
      return { status: "absent", ageSec: null, pid: null }
    }
  }
  const ageMs = Math.max(0, nowMs - writtenMs)
  return { status: ageMs <= staleAfterMs(intervalMs, env) ? "ok" : "stale", ageSec: Math.round(ageMs / 1000), pid }
}
