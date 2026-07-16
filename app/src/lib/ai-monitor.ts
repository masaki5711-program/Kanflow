import { appendFile } from "fs/promises"

/**
 * AI activity logger for live demos / observability.
 *
 * Appends one human-readable line per AI event (chat start, LLM turn, tool
 * call, streaming progress, completion) to a log file that the console
 * monitor (demo/ai-monitor.bat) tails in real time.
 *
 * Fire-and-forget by design: logging must never slow down or break the AI
 * request path, so all errors are swallowed.
 */

// Absolute default because the Windows service's cwd is not the app root.
// Override with AI_ACTIVITY_LOG if the install location differs.
const LOG_PATH = process.env.AI_ACTIVITY_LOG ?? "D:\\APP\\Kanflow\\ai-activity.log"

const MAX_DETAIL = 220

function ts(): string {
  const d = new Date()
  const p = (n: number, w = 2) => String(n).padStart(w, "0")
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}.${p(d.getMilliseconds(), 3)}`
}

/** Append one event line: `HH:mm:ss.mmm | EVENT | detail` */
export function aiLog(event: string, detail = ""): void {
  const clean = detail.replace(/\s+/g, " ").trim()
  const cut = clean.length > MAX_DETAIL ? clean.slice(0, MAX_DETAIL) + "…" : clean
  const line = `${ts()} | ${event.padEnd(13)} | ${cut}\n`
  appendFile(LOG_PATH, line, "utf8").catch(() => {})
}

/** Truncate helper for quoting user text in log details. */
export function aiLogTrunc(s: string | null | undefined, max = 80): string {
  if (!s) return ""
  const t = s.replace(/\s+/g, " ").trim()
  return t.length > max ? t.slice(0, max) + "…" : t
}
