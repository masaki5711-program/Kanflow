import { dormantDays } from "./dormancy"
import type { Project } from "./types"

export interface BulkArchivePlan {
  /** Dormant projects the viewer may archive ("project.update"). */
  archivable: Project[]
  /** Dormant projects the viewer may not archive — listed as skipped. */
  skipped: Project[]
}

/** Split the dormant projects of a list into archivable and skipped (permission). */
export function planBulkArchive(projects: readonly Project[], now: Date): BulkArchivePlan {
  const dormant = projects.filter((p) => dormantDays(p, now) !== null)
  return {
    archivable: dormant.filter((p) => p.canUpdate === true),
    skipped: dormant.filter((p) => p.canUpdate !== true),
  }
}

export interface BulkFailure<T> {
  item: T
  error: Error
}

export interface BulkResult<T> {
  succeeded: T[]
  failed: BulkFailure<T>[]
}

/**
 * Run `task` for each item ONE AT A TIME (the server logs one activity row per
 * project; parallel PATCHes would also race on the router refresh). A failure
 * does not stop the batch — it is collected and reported at the end.
 * `onProgress(done, total)` fires after every item.
 */
export async function runSequential<T>(
  items: readonly T[],
  task: (item: T) => Promise<unknown>,
  onProgress?: (done: number, total: number) => void,
): Promise<BulkResult<T>> {
  const succeeded: T[] = []
  const failed: BulkFailure<T>[] = []
  for (const [index, item] of items.entries()) {
    try {
      await task(item)
      succeeded.push(item)
    } catch (e) {
      failed.push({ item, error: e instanceof Error ? e : new Error(String(e)) })
    }
    onProgress?.(index + 1, items.length)
  }
  return { succeeded, failed }
}
