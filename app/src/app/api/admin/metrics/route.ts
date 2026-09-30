import { requireAdmin } from "@/lib/api-helpers"
import { logger } from "@/lib/logger"
import { collectCurrentMetrics } from "@/lib/metrics/runtime"
import { loadSnapshots, metricsRetentionDays, snapshotIntervalMs, type SnapshotPoint } from "@/lib/metrics/snapshots"
import { defaultDb } from "@/services/_shared/db"
import { jsonResponse, toHttpResponse } from "@/services/_shared"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

const log = logger.child({ module: "admin-metrics" })
const HISTORY_MS = 24 * 60 * 60 * 1000

async function history(now: number): Promise<SnapshotPoint[]> {
  try {
    return await loadSnapshots(defaultDb, new Date(now - HISTORY_MS))
  } catch (error) {
    // e.g. MetricSnapshot not migrated yet: show the live numbers without history.
    log.warn("metric snapshots unavailable", { error: error instanceof Error ? error.message : String(error) })
    return []
  }
}

/**
 * GET /api/admin/metrics (admin only) → `{ current, history, config }`:
 * the live report of THIS web process and the last 24 h of snapshots
 * (every process that writes them; points carry their `pid`).
 */
export async function GET() {
  const gate = await requireAdmin()
  if ("error" in gate) return gate.error
  try {
    const now = Date.now()
    const [current, points] = await Promise.all([collectCurrentMetrics(), history(now)])
    return jsonResponse({
      current,
      history: points,
      config: { snapshotIntervalMs: snapshotIntervalMs(), retentionDays: metricsRetentionDays() },
    })
  } catch (error) {
    return toHttpResponse(error, { fallback: "取得に失敗しました", context: "Admin metrics GET" })
  }
}
