/**
 * Daily trash purge (worker job): permanently deletes projects, PBIs and
 * Icebox items that have been in the trash longer than
 * PURGE_TRASH_AFTER_DAYS (default 30).
 *
 * Every row goes through the same hard-delete path as "delete permanently"
 * in the UI (purgeProject / purgeBacklogItem / purgeIceboxItem), so uploaded
 * files and FieldTranslation rows are cleaned up too. Projects go first: their
 * children (including trashed items) cascade with them. Each row is its own
 * transaction; a failing row is logged and retried on the next run.
 */
import { prisma } from "@/lib/prisma"
import { purgeCutoff } from "@/services/_shared/soft-delete"
import { findExpiredTrashedBacklogItems } from "@/services/backlog/backlog.repository"
import { purgeBacklogItem } from "@/services/backlog/backlog.service"
import { findExpiredTrashedIceboxItems } from "@/services/icebox/icebox.repository"
import { purgeIceboxItem } from "@/services/icebox/icebox.service"
import { findExpiredTrashedProjects } from "@/services/projects/projects.repository"
import { purgeProject } from "@/services/projects/projects.service"

/** Upper bound per entity type and run (keeps one run short; the rest waits a day). */
export const PURGE_TRASH_MAX_PER_TYPE = 500

export interface PurgeTrashLog {
  info(msg: string, fields?: Record<string, unknown>): void
  warn(msg: string, fields?: Record<string, unknown>): void
  error(msg: string, fields?: Record<string, unknown>): void
}

export interface RunPurgeTrashOptions {
  retentionDays: number
  now?: () => Date
  signal?: AbortSignal
  log?: PurgeTrashLog
}

export interface PurgeTrashResult {
  status: "done" | "aborted"
  cutoff: string
  purged: { projects: number; backlogItems: number; iceboxItems: number }
  failed: number
}

type EntityName = "project" | "backlog_item" | "icebox_item"

interface Pass<Row> {
  entity: EntityName
  find: (cutoff: Date) => Promise<Row[]>
  purge: (row: Row) => Promise<void>
}

interface PassOutcome {
  purged: number
  failed: number
  aborted: boolean
}

async function runPass<Row extends { id: string }>(pass: Pass<Row>, cutoff: Date, opts: RunPurgeTrashOptions): Promise<PassOutcome> {
  const rows = await pass.find(cutoff)
  if (rows.length >= PURGE_TRASH_MAX_PER_TYPE) {
    opts.log?.warn("purge-trash: per-run cap reached; the rest is purged next run", { entity: pass.entity, cap: PURGE_TRASH_MAX_PER_TYPE })
  }
  let purged = 0
  let failed = 0
  for (const row of rows) {
    if (opts.signal?.aborted) return { purged, failed, aborted: true }
    try {
      await pass.purge(row)
      purged++
    } catch (err) {
      failed++
      opts.log?.error("purge-trash: row failed", {
        entity: pass.entity,
        id: row.id,
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }
  return { purged, failed, aborted: !!opts.signal?.aborted }
}

export async function runPurgeTrash(opts: RunPurgeTrashOptions): Promise<PurgeTrashResult> {
  const now = (opts.now ?? (() => new Date()))()
  const cutoff = purgeCutoff(now, opts.retentionDays)
  const take = PURGE_TRASH_MAX_PER_TYPE
  const result: PurgeTrashResult = {
    status: "done",
    cutoff: cutoff.toISOString(),
    purged: { projects: 0, backlogItems: 0, iceboxItems: 0 },
    failed: 0,
  }
  const passes: Array<{ key: keyof PurgeTrashResult["purged"]; run: () => Promise<PassOutcome> }> = [
    {
      key: "projects",
      run: () => runPass({ entity: "project", find: (c) => findExpiredTrashedProjects(prisma, c, take), purge: (r) => purgeProject(r.id) }, cutoff, opts),
    },
    {
      key: "backlogItems",
      run: () =>
        runPass(
          { entity: "backlog_item", find: (c) => findExpiredTrashedBacklogItems(prisma, c, take), purge: (r) => purgeBacklogItem(r.projectId, r.id, null) },
          cutoff,
          opts
        ),
    },
    {
      key: "iceboxItems",
      run: () =>
        runPass(
          { entity: "icebox_item", find: (c) => findExpiredTrashedIceboxItems(prisma, c, take), purge: (r) => purgeIceboxItem(r.projectId, r.id, null) },
          cutoff,
          opts
        ),
    },
  ]

  for (const pass of passes) {
    if (opts.signal?.aborted) return { ...result, status: "aborted" }
    const outcome = await pass.run()
    result.purged[pass.key] = outcome.purged
    result.failed += outcome.failed
    if (outcome.aborted) return { ...result, status: "aborted" }
  }
  opts.log?.info("purge-trash: finished", { ...result })
  return result
}
