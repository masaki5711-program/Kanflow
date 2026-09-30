import { NextResponse } from "next/server"
import { checkInternalRequest } from "@/lib/ai-gate/internal-auth"
import { gate } from "@/lib/translation/priority-gate"

/**
 * GET /api/internal/ai-busy — process-to-process only (loopback + shared
 * secret `x-internal-token` = INTERNAL_API_TOKEN).
 *
 * Reports this web process's user-facing AI activity so the standalone
 * translation worker can yield (lib/ai-gate/remote-gate.ts). Only genuine
 * local calls are counted; entries mirrored from other processes are not,
 * so mirroring can never feed back. Answering is O(1) and never waits.
 */
export const dynamic = "force-dynamic"

export function GET(request: Request) {
  const auth = checkInternalRequest(request.headers, process.env.INTERNAL_API_TOKEN)
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })
  const idle = gate.localIdleForMs()
  return NextResponse.json(
    {
      busyHigh: gate.local_high_active,
      idleForMs: Number.isFinite(idle) ? idle : null,
      pid: process.pid,
    },
    { headers: { "cache-control": "no-store" } }
  )
}
