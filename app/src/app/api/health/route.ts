import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { readHeartbeatStatus, resolveHeartbeatFile, type WorkerLiveness } from "@/lib/ai-gate/worker-heartbeat"
import { parseWorkerMode, type TranslationWorkerMode } from "@/lib/translation/worker-mode"
import { readBuildId } from "./build-id"

/**
 * GET /api/health — liveness/readiness probe for the watchdog and operators.
 *
 * - Unauthenticated on purpose (the watchdog calls it from 127.0.0.1). Any
 *   auth middleware/proxy MUST exclude /api/health.
 * - Never returns secrets, connection strings or raw error messages.
 * - 200 when the database answers `SELECT 1` within DB_TIMEOUT_MS, else 503.
 *   Everything else is informational and never changes the status code:
 *   - ollama: reachability of /api/tags
 *   - worker: standalone worker liveness from its heartbeat file
 *     (ok | stale | absent; `expected` = AI_TRANSLATION_WORKER=external)
 *   - translation: queue backlog (pending count, age of the oldest pending
 *     row, running / failed counts); null when the query fails
 *   - buildId: BUILD_ID of the build this process serves (<distDir>/BUILD_ID)
 */

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

const DB_TIMEOUT_MS = 3000
const BACKLOG_TIMEOUT_MS = 3000
const OLLAMA_TIMEOUT_MS = 2000
const DEFAULT_OLLAMA_BASE_URL = "http://127.0.0.1:11434"

type DbStatus = "ok" | "error"
type OllamaStatus = "ok" | "unreachable"

interface WorkerHealth {
  status: WorkerLiveness
  heartbeatAgeSec: number | null
  /** True when translations depend on the external worker (AI_TRANSLATION_WORKER=external). */
  expected: boolean
  mode: TranslationWorkerMode
}

interface TranslationBacklog {
  pending: number
  oldestPendingAgeSec: number | null
  running: number
  failed: number
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error("timeout")), ms)
  })
  return Promise.race([promise, timeout]).finally(() => {
    if (timer) clearTimeout(timer)
  })
}

async function checkDb(): Promise<DbStatus> {
  try {
    await withTimeout(prisma.$queryRaw`SELECT 1`, DB_TIMEOUT_MS)
    return "ok"
  } catch (err) {
    // Log server-side only; the response never carries error details.
    console.error("[health] database check failed:", err instanceof Error ? err.message : "unknown error")
    return "error"
  }
}

async function checkOllama(): Promise<OllamaStatus> {
  const base = (process.env.OLLAMA_BASE_URL || DEFAULT_OLLAMA_BASE_URL).replace(/\/+$/, "")
  try {
    const res = await fetch(`${base}/api/tags`, {
      method: "GET",
      signal: AbortSignal.timeout(OLLAMA_TIMEOUT_MS),
      cache: "no-store",
    })
    return res.ok ? "ok" : "unreachable"
  } catch {
    return "unreachable"
  }
}

interface BacklogRow {
  status: string
  n: number | bigint
  oldest: Date | string | null
}

async function checkBacklog(nowMs: number): Promise<TranslationBacklog | null> {
  try {
    const rows = await withTimeout(
      prisma.$queryRaw<BacklogRow[]>`
        SELECT status, COUNT(*) AS n, MIN(requested_at) AS oldest
        FROM field_translation
        WHERE status IN ('pending', 'running', 'failed')
        GROUP BY status
      `,
      BACKLOG_TIMEOUT_MS
    )
    const out: TranslationBacklog = { pending: 0, oldestPendingAgeSec: null, running: 0, failed: 0 }
    for (const r of rows) {
      const n = Number(r.n)
      if (r.status === "pending") {
        out.pending = n
        const oldestMs = r.oldest ? new Date(r.oldest).getTime() : Number.NaN
        if (Number.isFinite(oldestMs)) out.oldestPendingAgeSec = Math.max(0, Math.round((nowMs - oldestMs) / 1000))
      } else if (r.status === "running") {
        out.running = n
      } else if (r.status === "failed") {
        out.failed = n
      }
    }
    return out
  } catch (err) {
    console.error("[health] translation backlog check failed:", err instanceof Error ? err.message : "unknown error")
    return null
  }
}

function checkWorker(nowMs: number): WorkerHealth {
  const mode = parseWorkerMode(process.env.AI_TRANSLATION_WORKER)
  const hb = readHeartbeatStatus(resolveHeartbeatFile(process.env), nowMs, process.env)
  return { status: hb.status, heartbeatAgeSec: hb.ageSec, expected: mode === "external", mode }
}

export async function GET(): Promise<NextResponse> {
  const nowMs = Date.now()
  const [db, ollama, translation] = await Promise.all([checkDb(), checkOllama(), checkBacklog(nowMs)])
  const healthy = db === "ok"

  return NextResponse.json(
    {
      status: healthy ? "ok" : "error",
      db,
      ollama,
      worker: checkWorker(nowMs),
      translation,
      uptime: Math.round(process.uptime()),
      buildId: readBuildId(),
    },
    {
      status: healthy ? 200 : 503,
      headers: { "Cache-Control": "no-store" },
    },
  )
}
