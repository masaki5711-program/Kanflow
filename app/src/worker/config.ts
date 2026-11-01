import fs from "node:fs"
import path from "node:path"
import { envPositiveInt, loadAiGateConfig, type AiGateConfig } from "@/lib/ai-gate/config"
import { DEFAULT_AI_REPORT_RETENTION_DAYS, resolveAiReportRetentionDays } from "@/lib/ai-report-retention"
import { parseWorkerMode, type TranslationWorkerMode } from "@/lib/translation/worker-mode"
import { resolveHeartbeatFile } from "@/lib/ai-gate/worker-heartbeat"
import { describeBusinessHours, parseBusinessHours, type BusinessHours } from "./business-hours"
import { DEFAULT_ACTIVITY_RETENTION_DAYS, DEFAULT_NOTIFICATION_RETENTION_DAYS } from "./jobs/retention-defaults"
import { resolvePurgeTrashAfterDays } from "@/services/_shared/soft-delete"
import { resolveMaxInvestigations } from "./jobs/surveillance-limits"
import {
  DEFAULT_AI_JOB_RETENTION_DAYS,
  DEFAULT_CHAT_DELETED_RETENTION_DAYS,
  DEFAULT_CHAT_RETENTION_DAYS,
} from "./jobs/retention-defaults"
import { loadAiJobRunnerConfig, type AiJobRunnerEnvConfig } from "@/lib/ai-jobs/runner-config"
import { resolveAiJobRunner, workerRunsAiJobs, type AiJobRunnerLocation } from "@/lib/ai-jobs/config"

/**
 * Standalone worker configuration. Pure except `loadEnvFiles`; importing
 * this module never touches the database (the `--dry-run` path relies on it).
 */

export interface DailyTime {
  hour: number
  minute: number
}

export interface WorkerConfig {
  translationMode: TranslationWorkerMode
  /** Run the translation loop in this process? (false when inprocess/off) */
  runTranslation: boolean
  /** Daily surveillance start times (local time); empty = disabled. */
  surveillanceTimes: DailyTime[]
  surveillanceRetentionDays: number
  /** Longest a scheduled surveillance run waits for busy web users before starting a project anyway. */
  surveillanceYieldMaxMs: number
  heartbeatMs: number
  /** Liveness file rewritten every heartbeat (read by /api/health and the watchdog). */
  heartbeatFile: string
  /** Background-translation throttle during office hours; null = off. */
  businessHours: BusinessHours | null
  shutdownTimeoutMs: number
  lockName: string
  gate: AiGateConfig
  /** Daily due-date notifications + activity / notification retention sweep (local times); empty = disabled. */
  notifyDueTimes: DailyTime[]
  /** NOTIFY_DUE_SOON_DAYS: "due soon" = due within today .. today + N days. */
  notifyDueSoonDays: number
  activityRetentionDays: number
  notificationRetentionDays: number
  /** Daily trash purge start times (local time); empty = disabled. */
  purgeTrashTimes: DailyTime[]
  /** PURGE_TRASH_AFTER_DAYS: trashed rows older than this are deleted permanently. */
  purgeTrashAfterDays: number
  /** SURVEILLANCE_MAX_INVESTIGATIONS: agent investigations per surveillance run. */
  surveillanceMaxInvestigations: number
  /** Where background AI report jobs run (AI_JOB_RUNNER / AI_TRANSLATION_WORKER). */
  aiJobRunner: AiJobRunnerLocation
  /** Run the AI job loop in this process? (true when aiJobRunner = worker) */
  runAiJobs: boolean
  aiJobs: AiJobRunnerEnvConfig
  /** CHAT_RETENTION_DAYS: chat threads idle longer than this are deleted by the collab job. */
  chatRetentionDays: number
  /** CHAT_DELETED_RETENTION_DAYS: deleted chat threads are purged this long after deletion. */
  chatDeletedRetentionDays: number
  /** AI_JOB_RETENTION_DAYS: finished AiJob rows older than this are deleted by the collab job. */
  aiJobRetentionDays: number
  /** IMPROVEMENT_CHECK_REMINDERS: 定着確認 reminders to POs in the collab job (default on). */
  improvementReminders: boolean
  /** FEEDBACK_RECURRENCE: prevention-PBI proposals for recurring failures in the collab job (default on). */
  feedbackRecurrence: boolean
}

export const DEFAULT_SURVEILLANCE_SCHEDULE = "06:30"
/** Outside business hours: the purge deletes files and many rows. */
export const DEFAULT_PURGE_TRASH_SCHEDULE = "03:15"
/** Before business hours so due-date notifications are waiting at the start of the day. */
export const DEFAULT_NOTIFY_DUE_SCHEDULE = "07:45"
export const DEFAULT_NOTIFY_DUE_SOON_DAYS = 2
export const DEFAULT_SURVEILLANCE_RETENTION_DAYS = DEFAULT_AI_REPORT_RETENTION_DAYS
export const WORKER_LOCK_NAME = "kanflow_worker"

/**
 * SURVEILLANCE_SCHEDULE: comma-separated local HH:MM times ("06:30",
 * "06:30,18:00"); "off" / "none" / "false" disables. Unset → 06:30.
 * Invalid entries are dropped; if every entry is invalid the default is used.
 */
export function parseSchedule(raw: string | undefined, fallback: string = DEFAULT_SURVEILLANCE_SCHEDULE): DailyTime[] {
  const v = raw?.trim().toLowerCase()
  if (v === "off" || v === "none" || v === "false" || v === "0") return []
  const source = v ? v : fallback
  const times: DailyTime[] = []
  for (const part of source.split(",")) {
    const m = /^(\d{1,2}):(\d{2})$/.exec(part.trim())
    if (!m) continue
    const hour = Number(m[1])
    const minute = Number(m[2])
    if (hour > 23 || minute > 59) continue
    if (!times.some((t) => t.hour === hour && t.minute === minute)) times.push({ hour, minute })
  }
  if (times.length === 0 && source !== fallback) return parseSchedule(fallback, fallback)
  return times.sort((a, b) => a.hour * 60 + a.minute - (b.hour * 60 + b.minute))
}

/** Next local-time occurrence strictly after `now`, or null when `times` is empty. */
export function nextRunAt(now: Date, times: ReadonlyArray<DailyTime>): Date | null {
  let best: Date | null = null
  for (const t of times) {
    const candidate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), t.hour, t.minute, 0, 0)
    if (candidate.getTime() <= now.getTime()) candidate.setDate(candidate.getDate() + 1)
    if (!best || candidate.getTime() < best.getTime()) best = candidate
  }
  return best
}

export function formatDailyTimes(times: ReadonlyArray<DailyTime>): string {
  if (times.length === 0) return "off"
  return times.map((t) => `${String(t.hour).padStart(2, "0")}:${String(t.minute).padStart(2, "0")}`).join(",")
}

/** FEEDBACK_RECURRENCE: "off" / "false" / "0" / "none" disables the recurrence step (feedback loop, W11); anything else (or unset) = on. */
export function feedbackRecurrenceEnabled(env: Readonly<Record<string, string | undefined>>): boolean {
  const v = env.FEEDBACK_RECURRENCE?.trim().toLowerCase()
  return !(v === "off" || v === "false" || v === "0" || v === "none")
}

/** IMPROVEMENT_CHECK_REMINDERS: "off" / "false" / "0" / "none" disables; anything else (or unset) = on. */
export function improvementRemindersEnabled(env: Readonly<Record<string, string | undefined>>): boolean {
  const v = env.IMPROVEMENT_CHECK_REMINDERS?.trim().toLowerCase()
  return !(v === "off" || v === "false" || v === "0" || v === "none")
}

/** SURVEILLANCE_RETENTION_DAYS: positive integer, default 90. */
export function parseRetentionDays(raw: string | undefined): number {
  return envPositiveInt(raw, DEFAULT_SURVEILLANCE_RETENTION_DAYS)
}

export function loadWorkerConfig(env: NodeJS.ProcessEnv): WorkerConfig {
  const translationMode = parseWorkerMode(env.AI_TRANSLATION_WORKER)
  return {
    translationMode,
    runTranslation: translationMode === "external",
    surveillanceTimes: parseSchedule(env.SURVEILLANCE_SCHEDULE),
    surveillanceRetentionDays: resolveAiReportRetentionDays(env),
    surveillanceYieldMaxMs: envPositiveInt(env.SURVEILLANCE_YIELD_MAX_MS, 10 * 60_000),
    heartbeatMs: envPositiveInt(env.WORKER_HEARTBEAT_MS, 60_000),
    heartbeatFile: resolveHeartbeatFile(env),
    businessHours: parseBusinessHours(env),
    shutdownTimeoutMs: envPositiveInt(env.WORKER_SHUTDOWN_TIMEOUT_MS, 25_000),
    lockName: WORKER_LOCK_NAME,
    gate: loadAiGateConfig(env),
    notifyDueTimes: parseSchedule(env.NOTIFY_DUE_SCHEDULE, DEFAULT_NOTIFY_DUE_SCHEDULE),
    notifyDueSoonDays: envPositiveInt(env.NOTIFY_DUE_SOON_DAYS, DEFAULT_NOTIFY_DUE_SOON_DAYS),
    activityRetentionDays: envPositiveInt(env.ACTIVITY_RETENTION_DAYS, DEFAULT_ACTIVITY_RETENTION_DAYS),
    notificationRetentionDays: envPositiveInt(env.NOTIFICATION_RETENTION_DAYS, DEFAULT_NOTIFICATION_RETENTION_DAYS),
    purgeTrashTimes: parseSchedule(env.PURGE_TRASH_SCHEDULE, DEFAULT_PURGE_TRASH_SCHEDULE),
    purgeTrashAfterDays: resolvePurgeTrashAfterDays(env.PURGE_TRASH_AFTER_DAYS),
    surveillanceMaxInvestigations: resolveMaxInvestigations(env),
    aiJobRunner: resolveAiJobRunner(env),
    runAiJobs: workerRunsAiJobs(env),
    aiJobs: loadAiJobRunnerConfig(env),
    chatRetentionDays: envPositiveInt(env.CHAT_RETENTION_DAYS, DEFAULT_CHAT_RETENTION_DAYS),
    chatDeletedRetentionDays: envPositiveInt(env.CHAT_DELETED_RETENTION_DAYS, DEFAULT_CHAT_DELETED_RETENTION_DAYS),
    aiJobRetentionDays: envPositiveInt(env.AI_JOB_RETENTION_DAYS, DEFAULT_AI_JOB_RETENTION_DAYS),
    improvementReminders: improvementRemindersEnabled(env),
    feedbackRecurrence: feedbackRecurrenceEnabled(env),
  }
}

/** Config as printed by `--dry-run` and logged at start-up (no secrets). */
export function describeConfig(cfg: WorkerConfig): Record<string, unknown> {
  return {
    translationMode: cfg.translationMode,
    runTranslation: cfg.runTranslation,
    surveillanceSchedule: formatDailyTimes(cfg.surveillanceTimes),
    surveillanceRetentionDays: cfg.surveillanceRetentionDays,
    surveillanceYieldMaxMs: cfg.surveillanceYieldMaxMs,
    heartbeatMs: cfg.heartbeatMs,
    heartbeatFile: cfg.heartbeatFile,
    businessHours: describeBusinessHours(cfg.businessHours),
    shutdownTimeoutMs: cfg.shutdownTimeoutMs,
    lockName: cfg.lockName,
    gate: {
      peers: cfg.gate.peers,
      tokenConfigured: cfg.gate.token !== null,
      pollMs: cfg.gate.pollMs,
      timeoutMs: cfg.gate.timeoutMs,
      maxBackoffMs: cfg.gate.maxBackoffMs,
      quietMs: cfg.gate.quietMs,
      degradedIntervalMs: cfg.gate.degradedIntervalMs,
    },
    notifyDueSchedule: formatDailyTimes(cfg.notifyDueTimes),
    notifyDueSoonDays: cfg.notifyDueSoonDays,
    activityRetentionDays: cfg.activityRetentionDays,
    notificationRetentionDays: cfg.notificationRetentionDays,
    purgeTrashSchedule: formatDailyTimes(cfg.purgeTrashTimes),
    purgeTrashAfterDays: cfg.purgeTrashAfterDays,
    surveillanceMaxInvestigations: cfg.surveillanceMaxInvestigations,
    aiJobRunner: cfg.aiJobRunner,
    runAiJobs: cfg.runAiJobs,
    aiJobs: cfg.aiJobs,
    chatRetentionDays: cfg.chatRetentionDays,
    chatDeletedRetentionDays: cfg.chatDeletedRetentionDays,
    aiJobRetentionDays: cfg.aiJobRetentionDays,
    improvementReminders: cfg.improvementReminders,
    feedbackRecurrence: cfg.feedbackRecurrence,
  }
}

/**
 * Load .env files the way `next start` does (first file wins, real
 * environment variables always win): .env.production.local, .env.local,
 * .env.production, .env — or the .development variants when
 * NODE_ENV=development. Returns the files that were loaded.
 */
export function loadEnvFiles(dir: string, nodeEnv: string | undefined): string[] {
  const envName = nodeEnv === "development" ? "development" : "production"
  const candidates = [`.env.${envName}.local`, ".env.local", `.env.${envName}`, ".env"]
  const loaded: string[] = []
  for (const name of candidates) {
    const file = path.join(dir, name)
    if (!fs.existsSync(file)) continue
    process.loadEnvFile(file)
    loaded.push(name)
  }
  return loaded
}
