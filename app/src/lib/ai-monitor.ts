import path from "path"
import { resolveLogDir, resolveRetentionDays } from "@/lib/logger"
import { redactString } from "@/lib/logger/redact"
import { DailyFileWriter, localIsoTimestamp } from "@/lib/logger/rotation"

/**
 * AI activity logger for live demos / observability.
 *
 * Appends one human-readable line per AI event (chat start, LLM turn, tool
 * call, streaming progress, completion) to a log file that the console
 * monitor (demo/ai-monitor.ps1) tails in real time.
 *
 * Location: env AI_ACTIVITY_LOG (full file path), else `<LOG_DIR>/ai-activity.log`
 * (LOG_DIR default `<cwd>/logs`). The live file keeps a fixed name so tailing works;
 * previous days are rotated to `ai-activity-YYYY-MM-DD.log` and pruned after
 * LOG_RETENTION_DAYS (default 14).
 *
 * User text excerpts (`aiLogTrunc`) are capped at AI_LOG_USER_TEXT_MAX chars
 * (default 60), secrets are masked, and AI_LOG_USER_TEXT=0 disables excerpts.
 *
 * Fire-and-forget by design: logging must never slow down or break the AI
 * request path, so all errors are swallowed by the writer.
 */

const MAX_DETAIL = 220
const DEFAULT_USER_TEXT_MAX = 60
const OMITTED = "(omitted)"

function resolveActivityPath(): { dir: string; baseName: string; ext: string } {
  const explicit = process.env.AI_ACTIVITY_LOG?.trim()
  const file = explicit ? path.resolve(explicit) : path.join(resolveLogDir(), "ai-activity.log")
  const ext = path.extname(file) || ".log"
  return { dir: path.dirname(file), baseName: path.basename(file, ext), ext }
}

let writer: DailyFileWriter | null = null

function getWriter(): DailyFileWriter {
  if (!writer) {
    writer = new DailyFileWriter({ ...resolveActivityPath(), mode: "live", retentionDays: resolveRetentionDays() })
  }
  return writer
}

function isUserTextEnabled(): boolean {
  const v = process.env.AI_LOG_USER_TEXT?.trim().toLowerCase()
  return !(v === "0" || v === "false" || v === "off")
}

function userTextMax(): number {
  const n = Number(process.env.AI_LOG_USER_TEXT_MAX)
  return Number.isInteger(n) && n > 0 ? n : DEFAULT_USER_TEXT_MAX
}

/** Append one event line: `<local ISO timestamp> | EVENT | detail` */
export function aiLog(event: string, detail = ""): void {
  const clean = redactString(detail.replace(/\s+/g, " ").trim())
  const cut = clean.length > MAX_DETAIL ? clean.slice(0, MAX_DETAIL) + "…" : clean
  getWriter().write(`${localIsoTimestamp(new Date())} | ${event.padEnd(13)} | ${cut}\n`)
}

/**
 * Truncate helper for quoting user text in log details. The effective limit is
 * `min(max, AI_LOG_USER_TEXT_MAX)`; returns "(omitted)" when AI_LOG_USER_TEXT=0.
 */
export function aiLogTrunc(s: string | null | undefined, max = 80): string {
  if (!s) return ""
  if (!isUserTextEnabled()) return OMITTED
  const limit = Math.min(max, userTextMax())
  const t = redactString(s.replace(/\s+/g, " ").trim())
  return t.length > limit ? t.slice(0, limit) + "…" : t
}

/** Resolves when queued activity-log writes are done (tests / shutdown). */
export function aiLogFlush(): Promise<void> {
  return writer ? writer.flush() : Promise.resolve()
}
