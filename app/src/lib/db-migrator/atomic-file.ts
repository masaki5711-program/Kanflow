/**
 * Atomic owner-only file write: temp file in the same directory, then rename,
 * so a reader never sees a half-written report. The temp file is removed when
 * anything fails (no stray .tmp with report contents left behind).
 */
import fs from "node:fs"
import path from "node:path"

export function writeAtomic(file: string, content: string): void {
  const abs = path.resolve(file)
  fs.mkdirSync(path.dirname(abs), { recursive: true })
  const tmp = `${abs}.${process.pid}.${Date.now()}.tmp`
  try {
    fs.writeFileSync(tmp, content, { encoding: "utf8", mode: 0o600, flag: "wx" })
    fs.renameSync(tmp, abs)
  } catch (e) {
    fs.rmSync(tmp, { force: true })
    throw e
  }
}
