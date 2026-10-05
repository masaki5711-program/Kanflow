/**
 * 定着確認 reminders of the 改善成果ボード (worker job, part of collab-daily).
 *
 * A check is due when its day (stored as UTC midnight) is today or earlier
 * (local calendar), it has no result yet and no reminder was sent. Each due
 * check notifies the project's PO(s) (改善オーナー, ProjectMember role "po")
 * once, then `notifiedAt` is stamped. Only live, active process_improvement
 * projects and items that are not 延期 count.
 *
 * Idempotent twice over: the query skips stamped rows, and the notification
 * dedupeKey `improvement_check_due:<checkId>:<yyyy-mm-dd>` makes a repeat a
 * no-op even if the stamp failed. Moving the 展開日 re-arms a check (the
 * service clears notifiedAt). A check whose project has no PO is retried on
 * the next run (cheap: bounded by MAX_ROWS) so a PO added later still hears of it.
 *
 * Disabled with IMPROVEMENT_CHECK_REMINDERS=off (default on; see worker/config.ts).
 */
import { logger } from "@/lib/logger"
import { localDayUtc } from "@/lib/improvement/metrics"
import { defaultDb, type Db } from "@/services/_shared/db"
import { notify } from "@/services/_shared/notifications"

const log = logger.child({ module: "improvement-checks" })

/** Upper bound of due checks handled per run. */
const MAX_ROWS = 2000
const DAY_MS = 24 * 60 * 60 * 1000

export interface ImprovementReminderOptions {
  now?: () => Date
  db?: Db
  signal?: AbortSignal
}

export interface ImprovementReminderResult {
  status: "done" | "aborted"
  due: number
  notified: number
  stamped: number
}

function findDueChecks(db: Db, now: Date) {
  return db.improvementCheck.findMany({
    where: {
      checkedAt: null,
      notifiedAt: null,
      dueDate: { lt: new Date(localDayUtc(now).getTime() + DAY_MS) },
      releaseItem: {
        kaizenStage: { not: "deferred" },
        project: { status: "active", deletedAt: null, projectType: "process_improvement" },
      },
    },
    select: {
      id: true,
      dueDate: true,
      kind: true,
      releaseItem: {
        select: { id: true, projectId: true, initiative: true, userStory: true, pbItem: { select: { userStory: true } } },
      },
    },
    orderBy: { dueDate: "asc" },
    take: MAX_ROWS,
  })
}

type DueCheck = Awaited<ReturnType<typeof findDueChecks>>[number]

/** The item's title as the board shows it (linked PBI story → own story → initiative). */
function itemLabel(item: DueCheck["releaseItem"]): string {
  const text = item.pbItem?.userStory ?? item.userStory ?? item.initiative ?? ""
  return (text.split(/\r?\n/, 1)[0] ?? "").trim().slice(0, 120)
}

/** Per-run memo of each project's PO user ids. */
function poCache(db: Db) {
  const cache = new Map<string, Promise<string[]>>()
  return (projectId: string): Promise<string[]> => {
    let p = cache.get(projectId)
    if (!p) {
      p = db.projectMember.findMany({ where: { projectId, role: "po" }, select: { userId: true } }).then((rows) => rows.map((r) => r.userId))
      cache.set(projectId, p)
    }
    return p
  }
}

/** Run one pass. Notification failures are absorbed by notify(); query failures reject. */
export async function runImprovementCheckReminders(opts: ImprovementReminderOptions = {}): Promise<ImprovementReminderResult> {
  const db = opts.db ?? defaultDb
  const now = (opts.now ?? (() => new Date()))()
  if (opts.signal?.aborted) return { status: "aborted", due: 0, notified: 0, stamped: 0 }
  const checks = await findDueChecks(db, now)
  const posOf = poCache(db)
  let notified = 0
  let stamped = 0
  for (const check of checks) {
    if (opts.signal?.aborted) return { status: "aborted", due: checks.length, notified, stamped }
    const recipients = await posOf(check.releaseItem.projectId)
    if (recipients.length === 0) continue
    const dueDate = check.dueDate.toISOString().slice(0, 10)
    notified += await notify(db, {
      recipientIds: recipients,
      type: "improvement_check_due",
      projectId: check.releaseItem.projectId,
      entityType: "release",
      entityId: check.releaseItem.id,
      payload: { entityLabel: itemLabel(check.releaseItem), dueDate, kind: check.kind, checkId: check.id },
      dedupeKey: `improvement_check_due:${check.id}:${dueDate}`,
    })
    const { count } = await db.improvementCheck.updateMany({ where: { id: check.id, notifiedAt: null }, data: { notifiedAt: now } })
    stamped += count
  }
  if (checks.length > 0) log.info("improvement check reminders", { due: checks.length, notified, stamped })
  return { status: "done", due: checks.length, notified, stamped }
}
