import type { WorkerConfig } from "./config"
import { DailyScheduler, type SchedulerLog } from "./scheduler"
import { purgeCollaborationHistory, type RetentionResult } from "./jobs/activity-retention"
import { runNotifyDue, type NotifyDueResult } from "./jobs/notify-due"
import { purgeChatHistory, type ChatRetentionResult } from "./jobs/chat-retention"
import {
  DEFAULT_AI_JOB_RETENTION_DAYS,
  DEFAULT_CHAT_DELETED_RETENTION_DAYS,
  DEFAULT_CHAT_RETENTION_DAYS,
} from "./jobs/retention-defaults"

/**
 * Daily collaboration housekeeping (NOTIFY_DUE_SCHEDULE, default 07:45 —
 * before business hours so notifications are waiting at the start of the day):
 * 1. retention sweep of ActivityLog / read Notification rows
 * 2. due_soon / overdue notifications
 * 3. retention of chat threads (deleted / idle) and finished AI jobs (P3)
 * Each step fails independently (logged; the others still run).
 */

type CollabConfig = Pick<WorkerConfig, "notifyDueTimes" | "notifyDueSoonDays" | "activityRetentionDays" | "notificationRetentionDays"> &
  Partial<Pick<WorkerConfig, "chatRetentionDays" | "chatDeletedRetentionDays" | "aiJobRetentionDays">>

export interface CollabDailyResult {
  retention: RetentionResult | null
  notifyDue: NotifyDueResult | null
  chatRetention: ChatRetentionResult | null
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
  let chatRetention: ChatRetentionResult | null = null
  try {
    chatRetention = await purgeChatHistory({
      idleDays: cfg.chatRetentionDays ?? DEFAULT_CHAT_RETENTION_DAYS,
      deletedDays: cfg.chatDeletedRetentionDays ?? DEFAULT_CHAT_DELETED_RETENTION_DAYS,
      aiJobDays: cfg.aiJobRetentionDays ?? DEFAULT_AI_JOB_RETENTION_DAYS,
    })
    log.info("chat / ai job retention done", { ...chatRetention })
  } catch (err) {
    log.error("chat / ai job retention failed", { error: errorMessage(err) })
  }
  return { retention, notifyDue, chatRetention }
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
