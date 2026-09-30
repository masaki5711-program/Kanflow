import fs from "node:fs"
import path from "node:path"

/**
 * BUILD_ID of the Next.js build this process serves (<cwd>/<NEXT_DIST_DIR or .next>/BUILD_ID).
 * Read once: the dist dir never changes under a running server (swap-build.ps1
 * restarts the service). Null when unreadable (e.g. `next dev`).
 */
let cached: string | null | undefined

export function readBuildId(): string | null {
  if (cached !== undefined) return cached
  const distDir = process.env.NEXT_DIST_DIR?.trim() || ".next"
  try {
    cached = fs.readFileSync(path.join(process.cwd(), distDir, "BUILD_ID"), "utf8").trim() || null
  } catch {
    cached = null
  }
  return cached
}

/** Test hook: forget the cached value. */
export function resetBuildIdCache(): void {
  cached = undefined
}
