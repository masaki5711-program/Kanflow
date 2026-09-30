/**
 * Admin maintenance of the translation queue (FieldTranslation rows).
 * Worker status / priority-gate state are owned by the worker module and
 * stay in the stats route.
 */
import { logger } from "@/lib/logger"
import {
  purgeOrphanTranslations,
  retryFailedTranslations,
  translationCounts,
  type OrphanPurgeResult,
  type StatusCounts,
} from "@/lib/translation/service"
import type { PurgeOrphansInput } from "./translations-admin.schemas"

const log = logger.child({ module: "translations-admin" })

export function queueCounts(): Promise<StatusCounts> {
  return translationCounts()
}

/** Put every `failed` row back into the queue. */
export function retryFailed(): Promise<{ requeued: number }> {
  return retryFailedTranslations()
}

/**
 * Remove translation rows whose entity was deleted (one-time cleanup of
 * orphans created before deletes purged translations transactionally).
 */
export async function purgeOrphans(input: PurgeOrphansInput, actorId: string): Promise<OrphanPurgeResult> {
  const result = await purgeOrphanTranslations({ dryRun: input.dryRun ?? false })
  log.info("orphan translation purge", { actorId, dryRun: result.dryRun, total: result.total, byEntity: result.byEntity })
  return result
}
