import { envPositiveInt } from "@/lib/ai-gate/config"

/**
 * Single retention setting for AiReport rows (pure; no database access).
 *
 * SURVEILLANCE_RETENTION_DAYS  primary setting (positive integer).
 * AI_REPORT_RETENTION_DAYS     accepted alias, used when the primary is unset / invalid.
 * Default 90 days. The surveillance job's retention sweep is the only place
 * that deletes reports, so every deletion follows this one value.
 */
export const DEFAULT_AI_REPORT_RETENTION_DAYS = 90

export function resolveAiReportRetentionDays(env: Readonly<Record<string, string | undefined>>): number {
  const fallback = envPositiveInt(env.AI_REPORT_RETENTION_DAYS, DEFAULT_AI_REPORT_RETENTION_DAYS)
  return envPositiveInt(env.SURVEILLANCE_RETENTION_DAYS, fallback)
}
