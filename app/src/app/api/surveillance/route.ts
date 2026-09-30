import { NextResponse } from "next/server"
import { safeEqual } from "@/lib/api-helpers"
import { aiLog } from "@/lib/ai-monitor"
import { runSurveillance, type SurveillanceResult } from "@/worker/jobs/surveillance"
import { SingleFlightJobRunner } from "@/worker/jobs/job-runner"

/**
 * AI surveillance — machine trigger, not a user route.
 *
 * The daily run is normally executed by the standalone worker on its
 * schedule (SURVEILLANCE_SCHEDULE, see src/worker/main.ts). This route is
 * the manual / legacy trigger:
 *
 *   POST /api/surveillance            header x-surveillance-token: <token>
 *     → 202 { jobId, alreadyRunning }  — the run continues in the background
 *   GET  /api/surveillance?jobId=<id>  same header
 *     → 200 job record (status running | done | failed | aborted, result)
 *
 * Concurrent triggers never double-run: an in-process mutex returns the
 * running job, and a MySQL named lock inside runSurveillance() skips the
 * run when the worker (or another web process) is already running it.
 */

const g = globalThis as unknown as { __kanflowSurveillanceRunner?: SingleFlightJobRunner<SurveillanceResult> }
const runner: SingleFlightJobRunner<SurveillanceResult> =
  g.__kanflowSurveillanceRunner ??
  (g.__kanflowSurveillanceRunner = new SingleFlightJobRunner<SurveillanceResult>((id, error) =>
    aiLog("CHAT_ERROR", `surveillance job ${id} failed: ${error}`)
  ))

function authorize(request: Request): NextResponse | null {
  const token = process.env.SURVEILLANCE_TOKEN
  if (!token) return NextResponse.json({ error: "SURVEILLANCE_TOKEN not configured", code: "SERVICE_UNAVAILABLE" }, { status: 503 })
  if (!safeEqual(request.headers.get("x-surveillance-token"), token)) {
    return NextResponse.json({ error: "forbidden", code: "FORBIDDEN" }, { status: 403 })
  }
  return null
}

export async function POST(request: Request) {
  const denied = authorize(request)
  if (denied) return denied
  const { accepted, job } = runner.trigger("http", (signal) => runSurveillance({ signal }))
  aiLog("SURVEIL", accepted ? `manual trigger accepted: job ${job.id}` : `manual trigger ignored: job ${job.id} already running`)
  return NextResponse.json(
    { jobId: job.id, alreadyRunning: !accepted, status: job.status, startedAt: job.startedAt },
    { status: 202 }
  )
}

export async function GET(request: Request) {
  const denied = authorize(request)
  if (denied) return denied
  const jobId = new URL(request.url).searchParams.get("jobId")
  if (!jobId) return NextResponse.json({ running: runner.running(), recent: runner.list() })
  if (!/^[0-9a-f-]{36}$/i.test(jobId)) return NextResponse.json({ error: "invalid jobId", code: "VALIDATION" }, { status: 400 })
  const job = runner.get(jobId)
  if (!job) return NextResponse.json({ error: "job not found (jobs are kept in memory of this process only)", code: "NOT_FOUND" }, { status: 404 })
  return NextResponse.json(job)
}
