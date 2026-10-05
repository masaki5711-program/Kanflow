import { AUTO_CHECK_MONTHS, IMPROVEMENT_MAX_CHECKS, type CheckKind } from "@/lib/improvement/constants"
import { addMonthsUtc } from "@/lib/improvement/metrics"
import type { Actor } from "@/services/_shared/actor"
import { logActivity } from "@/services/_shared/activity"
import { withTransaction, type Db } from "@/services/_shared/db"
import { NotFoundError, ValidationError } from "@/services/_shared/errors"
import * as children from "./improvements.children.repository"
import * as repo from "./improvements.repository"
import type { CreateCheckInput, RecordCheckInput } from "./improvements.schemas"

/**
 * 定着確認 (sustainment checks). Setting / changing the 展開日 schedules the
 * 1-month and 3-month checks: created the first time, moved along (and the
 * reminder re-armed) while they are still unchecked. Recorded checks are
 * never moved. Custom checks are added by hand.
 */

const AUTO_KINDS = Object.keys(AUTO_CHECK_MONTHS) as Array<keyof typeof AUTO_CHECK_MONTHS>

const itemNotFound = () => new NotFoundError("Not found")

/** Due date of an automatic check for a 展開日 (UTC midnight). */
export function autoCheckDueDate(releaseDate: Date, kind: keyof typeof AUTO_CHECK_MONTHS): Date {
  return addMonthsUtc(releaseDate, AUTO_CHECK_MONTHS[kind])
}

/**
 * Create or move the automatic checks of an item for its (new) 展開日.
 * Returns how many rows were created / moved. Runs inside the caller's tx.
 */
export async function scheduleAutoChecks(tx: Db, releaseItemId: string, releaseDate: Date): Promise<{ created: number; moved: number }> {
  const existing = await children.findChecks(tx, releaseItemId)
  const auto = existing.filter((c) => (AUTO_KINDS as string[]).includes(c.kind))
  if (auto.length === 0) {
    const rows = AUTO_KINDS.map((kind) => ({ releaseItemId, kind, dueDate: autoCheckDueDate(releaseDate, kind) }))
    await children.insertChecks(tx, rows)
    return { created: rows.length, moved: 0 }
  }
  let moved = 0
  for (const check of auto) {
    if (check.checkedAt) continue
    const dueDate = autoCheckDueDate(releaseDate, check.kind as keyof typeof AUTO_CHECK_MONTHS)
    if (check.dueDate.getTime() === dueDate.getTime()) continue
    await children.updateCheck(tx, check.id, { dueDate, notifiedAt: null })
    moved += 1
  }
  return { created: 0, moved }
}

async function assertItem(db: Db, projectId: string, itemId: string) {
  const item = await repo.findItemState(db, projectId, itemId)
  if (!item) throw itemNotFound()
  return item
}

function logCheckChange(tx: Db, projectId: string, itemId: string, change: { from: string | null; to: string | null }, actor: Actor | null) {
  return logActivity(tx, { projectId, entityType: "release", entityId: itemId, action: "update", actor, diff: { changes: { sustainmentCheck: change } } })
}

/** A custom 定着確認 on a chosen day. */
export async function addCustomCheck(projectId: string, itemId: string, input: CreateCheckInput, actor: Actor | null = null) {
  return withTransaction(async (tx) => {
    await assertItem(tx, projectId, itemId)
    if ((await children.countChecks(tx, itemId)) >= IMPROVEMENT_MAX_CHECKS) {
      throw new ValidationError("定着確認が多すぎます", {}, "IMPROVEMENT_TOO_MANY_CHECKS")
    }
    const kind: CheckKind = "custom"
    const check = await children.insertCheck(tx, { releaseItemId: itemId, kind, dueDate: new Date(input.dueDate) })
    await logCheckChange(tx, projectId, itemId, { from: null, to: input.dueDate }, actor)
    return check
  })
}

/** Record (or with result null: clear) the result of a check. Any project member may do it. */
export async function recordCheck(projectId: string, itemId: string, checkId: string, input: RecordCheckInput, actor: Actor) {
  return withTransaction(async (tx) => {
    const before = await children.findCheck(tx, projectId, itemId, checkId)
    if (!before) throw itemNotFound()
    const checked = input.result !== null
    const check = await children.updateCheck(tx, checkId, {
      result: input.result,
      ...(input.note !== undefined ? { note: input.note || null } : {}),
      checkedAt: checked ? new Date() : null,
      checkedById: checked ? actor.userId : null,
      checkedByName: checked ? actor.userName : null,
    })
    await logCheckChange(tx, projectId, itemId, { from: before.result, to: input.result }, actor)
    return check
  })
}

export async function deleteCheck(projectId: string, itemId: string, checkId: string, actor: Actor | null = null): Promise<void> {
  await withTransaction(async (tx) => {
    const check = await children.findCheck(tx, projectId, itemId, checkId)
    if (!check) throw itemNotFound()
    await children.deleteCheck(tx, checkId)
    await logCheckChange(tx, projectId, itemId, { from: check.kind, to: null }, actor)
  })
}
