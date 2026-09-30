import type { WorkerConfig } from "./config"
import { DailyScheduler, type SchedulerLog } from "./scheduler"
import { purgeCollaborationHistory, type RetentionResult } from "./jobs/activity-retention"
import { runNotifyDue, type NotifyDueResult } from "./jobs/notify-due"

/**
 * Daily collaboration housekeeping (NOTIFY_DUE_SCHEDULE, default 07:45 —
 * before business hours so notifications are waiting at the start of the day):
 * 1. retention sweep of ActivityLog / read Notification rows
 * 2. due_soon / overdue notifications
 * Each step fails independently (logged; the other still runs).
 */

type CollabConfig = Pick<WorkerConfig, "notifyDueTimes" | "notifyDueSoonDays" | "activityRetentionDays" | "notificationRetentionDays">

export interface CollabDailyResult {
  retention: RetentionResult | null
  notifyDue: NotifyDueResult | null
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

export async function runCollabDaily(cfg: CollabConfig, log: SchedulerLog, signal?: AbortSignal): Promise<CollabDailyResult> {
  let retention: RetentionResult | null = null
  let notifyDue: NotifyDueResult | null = null
  try {
    retention = await purgeCollaborationHistory({
      activityDays: cfg.activityRetentionDays,
      notificationDays: cfg.notificationRetentionDays,
    })
    log.info("collab retention sweep done", { ...retention })
  } catch (err) {
    log.error("collab retention sweep failed", { error: errorMessage(err) })
  }
  try {
    notifyDue = await runNotifyDue({ soonDays: cfg.notifyDueSoonDays, signal })
    log.info("due-date notifications done", { ...notifyDue })
  } catch (err) {
    log.error("due-date notifications failed", { error: errorMessage(err) })
  }
  return { retention, notifyDue }
}

/** Start the daily scheduler, or null when NOTIFY_DUE_SCHEDULE=off. */
export function startCollabScheduler(cfg: CollabConfig, log: SchedulerLog, signal?: AbortSignal): DailyScheduler | null {
  if (cfg.notifyDueTimes.length === 0) return null
  const scheduler = new DailyScheduler({
    name: "collab-daily",
    times: cfg.notifyDueTimes,
    log,
    run: () => runCollabDaily(cfg, log, signal),
  })
  scheduler.start()
  log.info("collab daily scheduled", { next: scheduler.nextAt()?.toISOString() })
  return scheduler
}
