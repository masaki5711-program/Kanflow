import type { WorkerConfig } from "./config"
import { runPurgeTrash } from "./jobs/purge-trash"
import { DailyScheduler, type SchedulerLog } from "./scheduler"

/**
 * Daily trash purge (PURGE_TRASH_SCHEDULE, default 03:15 — outside business
 * hours): hard-deletes rows trashed more than PURGE_TRASH_AFTER_DAYS ago.
 * See jobs/purge-trash.ts.
 */

type TrashConfig = Pick<WorkerConfig, "purgeTrashTimes" | "purgeTrashAfterDays">

/** Start the daily scheduler, or null when PURGE_TRASH_SCHEDULE=off. */
export function startPurgeTrashScheduler(cfg: TrashConfig, log: SchedulerLog, signal?: AbortSignal): DailyScheduler | null {
  if (cfg.purgeTrashTimes.length === 0) return null
  const scheduler = new DailyScheduler({
    name: "purge-trash",
    times: cfg.purgeTrashTimes,
    log,
    run: () => runPurgeTrash({ retentionDays: cfg.purgeTrashAfterDays, signal, log }),
  })
  scheduler.start()
  log.info("trash purge scheduled", { next: scheduler.nextAt()?.toISOString(), afterDays: cfg.purgeTrashAfterDays })
  return scheduler
}
