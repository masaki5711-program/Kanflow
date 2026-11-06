import type { WorkerConfig } from "./config"
import { DailyScheduler, type SchedulerLog } from "./scheduler"
import { purgeCollaborationHistory, type RetentionResult } from "./jobs/activity-retention"
import { runNotifyDue, type NotifyDueResult } from "./jobs/notify-due"
import { purgeChatHistory, type ChatRetentionResult } from "./jobs/chat-retention"
import { runFeedbackRecurrence, type RecurrenceResult } from "@/services/feedback/feedback.recurrence.service"
import { runImprovementCheckReminders, type ImprovementReminderResult } from "./jobs/improvement-checks"
import { purgeExpiredEstimateRuns, type PlanRunRetentionResult } from "./jobs/plan-run-retention"
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
 * 4. 定着確認 reminders of the 改善成果ボード (IMPROVEMENT_CHECK_REMINDERS=off skips)
 * 5. prevention-PBI proposals for recurring failures (feedback loop, FEEDBACK_RECURRENCE=off skips)
 * 6. retention of 計画を作る estimate runs past their one-year purgeAfter (feedback goes with them)
 * 7. backtest catch-up: lineages whose record is missing or not of their current actuals (plan 12 §5; a queued run lost
 *    on restart, a failed one, a hard-deleted project) — until then their gate stays closed
 * Each step fails independently (logged; the others still run).
 */

type CollabConfig = Pick<WorkerConfig, "notifyDueTimes" | "notifyDueSoonDays" | "activityRetentionDays" | "notificationRetentionDays"> &
  Partial<Pick<WorkerConfig, "chatRetentionDays" | "chatDeletedRetentionDays" | "aiJobRetentionDays" | "improvementReminders" | "feedbackRecurrence">>

export interface CollabDailyResult {
  retention: RetentionResult | null
  notifyDue: NotifyDueResult | null
  chatRetention: ChatRetentionResult | null
  improvementReminders?: ImprovementReminderResult | null
  feedbackRecurrence?: RecurrenceResult | null
  planRunRetention?: PlanRunRetentionResult | null
  /** Step 7: lineages recomputed / failed (null when the step failed as a whole). */
  backtestCatchUp?: { recorded: number; failed: number } | null
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
  const improvementReminders = await runImprovementStep(cfg, log, signal)
  const feedbackRecurrence = await runFeedbackStep(cfg, log, signal)
  let planRunRetention: PlanRunRetentionResult | null = null
  try {
    planRunRetention = await purgeExpiredEstimateRuns()
    if (planRunRetention.estimateRuns.more) log.warn("plan estimate run retention reached its batch cap; the rest goes at the next run", { ...planRunRetention })
    else log.info("plan estimate run retention done", { ...planRunRetention })
  } catch (err) {
    log.error("plan estimate run retention failed", { error: errorMessage(err) })
  }
  let backtestCatchUp: CollabDailyResult["backtestCatchUp"] = null
  try {
    // Loaded lazily: the estimate engine is not needed by the other steps.
    const { recordOutdatedLineages } = await import("@/services/plan-estimate-eval/eval.service")
    const r = await recordOutdatedLineages()
    backtestCatchUp = { recorded: r.recorded.length, failed: r.failed.length }
    if (r.failed.length > 0) log.warn("backtest catch-up finished with failures", { ...backtestCatchUp, lineages: r.failed.slice(0, 20) })
    else log.info("backtest catch-up done", backtestCatchUp)
  } catch (err) {
    log.error("backtest catch-up failed", { error: errorMessage(err) })
  }
  return { retention, notifyDue, chatRetention, improvementReminders, feedbackRecurrence, planRunRetention, backtestCatchUp }
}

/** Step 4: 定着確認 reminders (skipped when disabled; failures logged, never thrown). */
async function runImprovementStep(cfg: CollabConfig, log: SchedulerLog, signal?: AbortSignal): Promise<ImprovementReminderResult | null> {
  if (cfg.improvementReminders === false) return null
  try {
    const result = await runImprovementCheckReminders({ signal })
    log.info("improvement check reminders done", { ...result })
    return result
  } catch (err) {
    log.error("improvement check reminders failed", { error: errorMessage(err) })
    return null
  }
}

/** Step 5: prevention-PBI proposals (skipped when disabled; failures logged, never thrown). */
async function runFeedbackStep(cfg: CollabConfig, log: SchedulerLog, signal?: AbortSignal): Promise<RecurrenceResult | null> {
  if (cfg.feedbackRecurrence === false) return null
  try {
    const result = await runFeedbackRecurrence({ signal })
    log.info("feedback recurrence done", { ...result })
    return result
  } catch (err) {
    log.error("feedback recurrence failed", { error: errorMessage(err) })
    return null
  }
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
