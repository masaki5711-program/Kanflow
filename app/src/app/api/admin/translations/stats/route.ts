import { NextResponse } from "next/server"
import { requireAdmin } from "@/lib/api-helpers"
import { OLLAMA_MODELS } from "@/lib/ollama"
import { gate } from "@/lib/translation/priority-gate"
import { queueCounts } from "@/services/translations-admin/translations-admin.service"
import { ollamaReachable } from "@/lib/translation/translator"
import { workerStatus } from "@/lib/translation/worker"
import { describeWorkerLocation } from "@/lib/translation/worker-mode"
import type { TranslationStats } from "@/lib/translation/types"

/**
 * Translation queue status for /admin/translations (admin only).
 * In the default external mode the loop runs in the standalone worker
 * process, so `started` is always false here — `workerLocation` /
 * `workerNote` say so instead of reporting the worker as stopped.
 */
export async function GET() {
  const auth = await requireAdmin()
  if ("error" in auth) return auth.error

  const [counts, reachable] = await Promise.all([queueCounts(), ollamaReachable()])
  const worker = workerStatus()
  const status = gate.status()
  const where = describeWorkerLocation(worker.mode, worker.started)
  const body: TranslationStats = {
    ...counts,
    workerIdle: worker.idle,
    workerEnabled: worker.enabled,
    workerMode: worker.mode,
    workerLocation: where.location,
    workerNote: where.note,
    highActive: status.high_active,
    backgroundActive: status.background_active,
    ollamaReachable: reachable,
    model: OLLAMA_MODELS.translate,
  }
  return NextResponse.json(body)
}
