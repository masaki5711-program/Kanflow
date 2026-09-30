import { appendFile, copyFile, mkdir, readdir, rename, stat, truncate, unlink } from "fs/promises"
import path from "path"

/**
 * Daily file rotation with day-based retention. No external deps.
 *
 * Two layouts are supported:
 * - "dated": every line goes straight to `<base>-YYYY-MM-DD<ext>` (structured app logs).
 * - "live":  lines go to a fixed `<base><ext>` (so `tail -f` / `Get-Content -Wait` keeps
 *            working) and on the first write of a new day the previous content is moved
 *            to `<base>-YYYY-MM-DD<ext>` (the date the content was written).
 *
 * In both layouts dated files older than `retentionDays` (today counts as day 1) are deleted.
 */

export type RotationMode = "dated" | "live"

export interface DailyFileWriterOptions {
  dir: string
  baseName: string
  /** File extension including the dot. Default ".log". */
  ext?: string
  /** Keep dated files for this many days (today included). Default 14. */
  retentionDays?: number
  mode?: RotationMode
  /** Clock override for tests. */
  now?: () => Date
}

export const DEFAULT_RETENTION_DAYS = 14
const MS_PER_DAY = 24 * 60 * 60 * 1000

const pad = (n: number, w = 2) => String(n).padStart(w, "0")

/** Local-time `YYYY-MM-DD`. */
export function localDateStamp(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/** Local-time ISO-8601 with offset, e.g. `2026-09-23T17:09:38.123+09:00`. */
export function localIsoTimestamp(d: Date): string {
  const off = -d.getTimezoneOffset()
  const sign = off >= 0 ? "+" : "-"
  const abs = Math.abs(off)
  return (
    `${localDateStamp(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}` +
    `.${pad(d.getMilliseconds(), 3)}${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`
  )
}

/** `<base>-YYYY-MM-DD<ext>` */
export function datedFileName(baseName: string, date: Date, ext = ".log"): string {
  return `${baseName}-${localDateStamp(date)}${ext}`
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

/** Returns the `YYYY-MM-DD` stamp if `fileName` is a dated file of `baseName`, else null. */
export function parseDatedFileName(fileName: string, baseName: string, ext = ".log"): string | null {
  const re = new RegExp(`^${escapeRegExp(baseName)}-(\\d{4}-\\d{2}-\\d{2})${escapeRegExp(ext)}$`)
  const m = re.exec(fileName)
  return m ? m[1] : null
}

/** Oldest date stamp that is still kept for the given retention. */
export function retentionCutoffStamp(now: Date, retentionDays: number): string {
  const keep = Math.max(1, Math.floor(retentionDays))
  return localDateStamp(new Date(now.getTime() - (keep - 1) * MS_PER_DAY))
}

/** Delete dated files older than the retention window. Returns deleted file names. */
export async function pruneRotatedFiles(
  dir: string,
  baseName: string,
  ext: string,
  retentionDays: number,
  now: Date,
): Promise<string[]> {
  const cutoff = retentionCutoffStamp(now, retentionDays)
  const names = await readdir(dir).catch(() => [] as string[])
  const stale = names.filter((n) => {
    const stamp = parseDatedFileName(n, baseName, ext)
    return stamp !== null && stamp < cutoff
  })
  const results = await Promise.all(
    stale.map((n) => unlink(path.join(dir, n)).then(() => n, () => null)),
  )
  return results.filter((n): n is string => n !== null)
}

/**
 * Append-only writer with daily rotation. Writes are serialised through a
 * promise chain so lines keep their order; `write` never throws or rejects.
 */
export class DailyFileWriter {
  private readonly dir: string
  private readonly baseName: string
  private readonly ext: string
  private readonly retentionDays: number
  private readonly mode: RotationMode
  private readonly now: () => Date
  private chain: Promise<void> = Promise.resolve()
  private currentStamp: string | null = null
  private lastError: unknown = null

  constructor(opts: DailyFileWriterOptions) {
    this.dir = opts.dir
    this.baseName = opts.baseName
    this.ext = opts.ext ?? ".log"
    this.retentionDays = opts.retentionDays ?? DEFAULT_RETENTION_DAYS
    this.mode = opts.mode ?? "dated"
    this.now = opts.now ?? (() => new Date())
  }

  /** Path of the file the next line would be written to. */
  currentPath(date: Date = this.now()): string {
    const name = this.mode === "live" ? `${this.baseName}${this.ext}` : datedFileName(this.baseName, date, this.ext)
    return path.join(this.dir, name)
  }

  /** Queue one chunk (caller supplies the trailing newline). */
  write(chunk: string): void {
    const date = this.now()
    this.chain = this.chain
      .then(() => this.writeNow(chunk, date))
      .catch((err: unknown) => {
        // Logging must never break the caller; keep the error for diagnostics.
        this.lastError = err
      })
  }

  /** Resolves once every queued write has been attempted. */
  flush(): Promise<void> {
    return this.chain
  }

  /** Last write/rotation error, if any (for diagnostics/tests). */
  getLastError(): unknown {
    return this.lastError
  }

  private async writeNow(chunk: string, date: Date): Promise<void> {
    const stamp = localDateStamp(date)
    if (stamp !== this.currentStamp) {
      await mkdir(this.dir, { recursive: true })
      if (this.mode === "live") await this.rotateLiveFile(stamp)
      await pruneRotatedFiles(this.dir, this.baseName, this.ext, this.retentionDays, date)
      this.currentStamp = stamp
    }
    await appendFile(this.currentPath(date), chunk, "utf8")
  }

  /** Move the live file aside if its content belongs to an earlier day. */
  private async rotateLiveFile(todayStamp: string): Promise<void> {
    const live = path.join(this.dir, `${this.baseName}${this.ext}`)
    const info = await stat(live).catch(() => null)
    if (!info || info.size === 0) return
    const fileStamp = localDateStamp(info.mtime)
    if (fileStamp >= todayStamp) return
    const target = path.join(this.dir, `${this.baseName}-${fileStamp}${this.ext}`)
    try {
      await rename(live, target)
    } catch {
      // The live file may be held open by a tailing process (Windows): copy + truncate instead.
      await copyFile(live, target)
      await truncate(live, 0)
    }
  }
}
