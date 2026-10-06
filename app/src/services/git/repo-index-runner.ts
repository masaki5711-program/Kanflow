import { prisma } from "@/lib/prisma"
import { logger } from "@/lib/logger"
import { indexRepository, type IndexResult } from "./repo-index"

/**
 * Scheduling of the knowledge index: one repository at a time in the whole
 * process (poller tick and the manual "今すぐ取り込む" share one lock), each
 * call bounded by a time budget and resumed on the next tick.
 */
const log = logger.child({ module: "repo-index-runner" })

/** Indexing time per poller tick (the default sync interval is 180 s). */
export const TICK_BUDGET_MS = 90_000
/** A manual run may take longer (it runs in the background; the UI updates live). */
export const MANUAL_BUDGET_MS = 10 * 60_000

type IndexFn = (repositoryId: string, opts: { deadline: number }) => Promise<IndexResult>

// Survives Next.js dev HMR re-evaluating this module (one lock per process).
const state = globalThis as unknown as { kanflowRepoIndex?: { current: string | null } }
const lock = (state.kanflowRepoIndex ??= { current: null })

/** True while this repository is being indexed right now. */
export function isIndexing(repositoryId: string): boolean {
  return lock.current === repositoryId
}

async function runLocked(repositoryId: string, budgetMs: number, index: IndexFn): Promise<IndexResult | null> {
  if (lock.current) return null
  lock.current = repositoryId
  try {
    return await index(repositoryId, { deadline: Date.now() + budgetMs })
  } finally {
    lock.current = null
  }
}

/**
 * Poller step: knowledge repositories of live, Git-enabled projects, least
 * recently indexed first, until the budget is used or a pass is cut short.
 * Up-to-date repositories cost one GitLab request each.
 */
export async function runKnowledgeTick(index: IndexFn = indexRepository, budgetMs = TICK_BUDGET_MS): Promise<number> {
  if (lock.current) return 0
  try {
    const repos = await prisma.gitRepository.findMany({
      where: { aiKnowledge: true, project: { deletedAt: null, gitIntegration: { enabled: true } } },
      select: { id: true },
      orderBy: { indexedAt: { sort: "asc", nulls: "first" } },
    })
    const deadline = Date.now() + budgetMs
    let visited = 0
    for (const r of repos) {
      const left = deadline - Date.now()
      if (left <= 0) break
      const result = await runLocked(r.id, left, index)
      visited++
      if (result?.status === "failed") log.warn("repository index failed", { repositoryId: r.id })
      if (!result || result.status === "partial") break
    }
    return visited
  } catch (err) {
    log.error("knowledge index tick failed", { error: err instanceof Error ? err.message : String(err) })
    return 0
  }
}

/** Manual / on-switch run in the background. False when another index is running (try again later). */
export function startIndexInBackground(repositoryId: string, index: IndexFn = indexRepository): boolean {
  if (lock.current) return false
  void runLocked(repositoryId, MANUAL_BUDGET_MS, index).catch((err) =>
    log.error("background index failed", { repositoryId, error: err instanceof Error ? err.message : String(err) }),
  )
  return true
}
