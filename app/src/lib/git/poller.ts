import { prisma } from "@/lib/prisma"
import { logger } from "@/lib/logger"
import { pollIntervalSec } from "@/services/git/git.service"
import { syncRepository } from "@/services/git/git-sync"
import { runKnowledgeTick } from "@/services/git/repo-index-runner"

/**
 * Background GitLab sync (polling: GitLab on Google Cloud cannot reach the
 * LAN, so webhooks are impossible). Every GIT_SYNC_INTERVAL_SEC (default 180 s)
 * each repository of an enabled project is synced, one after another; a tick
 * never overlaps the previous one. Projects with the integration off cost
 * one indexed query per tick. After the sync, repositories used as AI
 * knowledge ("AI の参照資料") are re-indexed when their branch moved
 * (services/git/repo-index-runner, time-boxed, resumed next tick).
 *
 * GIT_SYNC=off disables it; under `next dev` it only runs with GIT_SYNC_IN_DEV=true.
 */
const log = logger.child({ module: "git-poller" })

export function shouldStartGitPoller(env: NodeJS.ProcessEnv = process.env): { start: boolean; reason: string } {
  if ((env.GIT_SYNC ?? "").toLowerCase() === "off") return { start: false, reason: "GIT_SYNC=off" }
  if (env.NODE_ENV !== "production" && env.GIT_SYNC_IN_DEV !== "true") return { start: false, reason: "dev (set GIT_SYNC_IN_DEV=true)" }
  return { start: true, reason: "default" }
}

let timer: ReturnType<typeof setInterval> | null = null
let running = false

/** One pass over every enabled repository. Exported for tests and the CLI. */
export async function runGitSyncTick(sync: typeof syncRepository = syncRepository): Promise<number> {
  if (running) return 0
  running = true
  try {
    const repos = await prisma.gitRepository.findMany({
      where: { project: { deletedAt: null, gitIntegration: { enabled: true } } },
      select: { id: true },
      orderBy: { syncedAt: { sort: "asc", nulls: "first" } },
    })
    for (const r of repos) {
      const result = await sync(r.id)
      // "provider": the sync refused a provider Kanflow cannot read and logged it once already.
      if (!result.ok && result.error !== "disabled" && result.error !== "provider") log.warn("repository sync failed", { repositoryId: r.id, error: result.error })
    }
    return repos.length
  } catch (err) {
    log.error("git sync tick failed", { error: err instanceof Error ? err.message : String(err) })
    return 0
  } finally {
    running = false
  }
}

/** Sync, then the knowledge index (each has its own overlap guard). */
async function runGitTick(): Promise<void> {
  await runGitSyncTick()
  await runKnowledgeTick()
}

export function startGitPoller(): void {
  if (timer) return
  const everyMs = pollIntervalSec() * 1000
  // First pass shortly after start (not during the boot burst), then on the interval.
  setTimeout(() => void runGitTick(), 30_000).unref?.()
  timer = setInterval(() => void runGitTick(), everyMs)
  timer.unref?.()
}
