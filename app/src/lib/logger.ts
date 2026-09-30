import path from "path"
import { DailyFileWriter, DEFAULT_RETENTION_DAYS, localIsoTimestamp } from "@/lib/logger/rotation"
import { redact, type RedactOptions } from "@/lib/logger/redact"

/**
 * Tiny structured logger (Node runtime only — uses fs).
 *
 * - JSON lines to `<LOG_DIR>/<baseName>-YYYY-MM-DD.log` (daily rotation,
 *   LOG_RETENTION_DAYS retention, default 14).
 * - LOG_LEVEL: debug | info | warn | error (default info).
 * - warn / error are mirrored to stderr.
 * - Every field object passes through `redact()` (secrets masked, free text truncated).
 *
 *   const log = logger.child({ module: "translation-worker" })
 *   log.info("job done", { jobId, ms })
 */

export type LogLevel = "debug" | "info" | "warn" | "error"
export type LogFields = Record<string, unknown>

export const LOG_LEVELS: readonly LogLevel[] = ["debug", "info", "warn", "error"]
const LEVEL_RANK: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 }

export interface Logger {
  debug(msg: string, fields?: LogFields): void
  info(msg: string, fields?: LogFields): void
  warn(msg: string, fields?: LogFields): void
  error(msg: string, fields?: LogFields): void
  /** New logger sharing the same file, with `bindings` added to every line. */
  child(bindings: LogFields): Logger
  isLevelEnabled(level: LogLevel): boolean
  /** Resolves when queued file writes are done (tests / graceful shutdown). */
  flush(): Promise<void>
}

export interface LoggerOptions {
  /** Directory for log files. Default env LOG_DIR or `<cwd>/logs`. */
  dir?: string
  /** File name prefix. Default "app". */
  baseName?: string
  /** Minimum level. Default env LOG_LEVEL or "info". */
  level?: LogLevel
  /** Days of dated files to keep. Default env LOG_RETENTION_DAYS or 14. */
  retentionDays?: number
  /** Mirror warn/error lines to stderr. Default true. */
  stderr?: boolean
  /** Fields added to every line (e.g. `{ module }`). */
  bindings?: LogFields
  redactOptions?: RedactOptions
  /** Clock override for tests. */
  now?: () => Date
}

export function isLogLevel(v: unknown): v is LogLevel {
  return typeof v === "string" && (LOG_LEVELS as readonly string[]).includes(v)
}

/** Log directory from env LOG_DIR, default `<cwd>/logs`. */
export function resolveLogDir(): string {
  const fromEnv = process.env.LOG_DIR?.trim()
  return fromEnv ? path.resolve(fromEnv) : path.join(process.cwd(), "logs")
}

/** Retention from env LOG_RETENTION_DAYS (positive integer), default 14. */
export function resolveRetentionDays(): number {
  const n = Number(process.env.LOG_RETENTION_DAYS)
  return Number.isInteger(n) && n > 0 ? n : DEFAULT_RETENTION_DAYS
}

function resolveLevel(): LogLevel {
  const v = process.env.LOG_LEVEL?.trim().toLowerCase()
  return isLogLevel(v) ? v : "info"
}

interface SharedSink {
  writer: DailyFileWriter
  minRank: number
  stderr: boolean
  redactOptions: RedactOptions
  now: () => Date
}

function serialize(sink: SharedSink, level: LogLevel, msg: string, bindings: LogFields, fields?: LogFields): string {
  const payload = redact({ ...bindings, ...(fields ?? {}) }, sink.redactOptions) as LogFields
  const entry = { ts: localIsoTimestamp(sink.now()), level, msg, ...payload }
  try {
    return JSON.stringify(entry)
  } catch {
    return JSON.stringify({ ts: entry.ts, level, msg, note: "unserializable fields" })
  }
}

function build(sink: SharedSink, bindings: LogFields): Logger {
  const emit = (level: LogLevel, msg: string, fields?: LogFields): void => {
    if (LEVEL_RANK[level] < sink.minRank) return
    const line = serialize(sink, level, msg, bindings, fields) + "\n"
    sink.writer.write(line)
    if (sink.stderr && LEVEL_RANK[level] >= LEVEL_RANK.warn) {
      try {
        process.stderr.write(line)
      } catch {
        // stderr unavailable (detached service) — the file line is enough.
      }
    }
  }
  return {
    debug: (msg, fields) => emit("debug", msg, fields),
    info: (msg, fields) => emit("info", msg, fields),
    warn: (msg, fields) => emit("warn", msg, fields),
    error: (msg, fields) => emit("error", msg, fields),
    child: (extra) => build(sink, { ...bindings, ...extra }),
    isLevelEnabled: (level) => LEVEL_RANK[level] >= sink.minRank,
    flush: () => sink.writer.flush(),
  }
}

export function createLogger(opts: LoggerOptions = {}): Logger {
  const now = opts.now ?? (() => new Date())
  const sink: SharedSink = {
    writer: new DailyFileWriter({
      dir: opts.dir ?? resolveLogDir(),
      baseName: opts.baseName ?? "app",
      retentionDays: opts.retentionDays ?? resolveRetentionDays(),
      mode: "dated",
      now,
    }),
    minRank: LEVEL_RANK[opts.level ?? resolveLevel()],
    stderr: opts.stderr ?? true,
    redactOptions: opts.redactOptions ?? {},
    now,
  }
  return build(sink, opts.bindings ?? {})
}

/** Application-wide logger. Use `logger.child({ module: "..." })` per module. */
export const logger: Logger = createLogger()

export { redact, redactString, truncateText, REDACTED, type RedactOptions } from "@/lib/logger/redact"
export {
  DailyFileWriter,
  datedFileName,
  localDateStamp,
  localIsoTimestamp,
  parseDatedFileName,
  pruneRotatedFiles,
} from "@/lib/logger/rotation"
