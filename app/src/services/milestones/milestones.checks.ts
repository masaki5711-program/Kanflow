import { MS_MAX_CHECKS } from "@/lib/milestones/constants"
import type { Actor } from "@/services/_shared/actor"
import { withTransaction } from "@/services/_shared/db"
import * as parts from "./milestones.parts.repository"
import type { CreateCheckInput, UpdateCheckInput } from "./milestones.schemas"
import { assertRoom, assertStageLink, dayColumn, defined, logBoard, notFound, todayUtc } from "./milestones.shared"

/**
 * チェック項目 (検収 / テスト / 評価 / 竣工検査 — one mechanism, the 呼び名 is
 * a board setting). The PO / SM define them (plan.write); anyone in the
 * project records the result, 立会者 and day (milestone.track; the route
 * refuses structure fields to track-only callers).
 */

export async function createCheck(projectId: string, input: CreateCheckInput, actor: Actor) {
  return withTransaction(async (tx) => {
    assertRoom(await parts.countChecks(tx, projectId), MS_MAX_CHECKS)
    await assertStageLink(tx, projectId, input.planItemId)
    const check = await parts.insertCheck(tx, { projectId, name: input.name, criterion: input.criterion || null, planItemId: input.planItemId ?? null })
    await logBoard(tx, projectId, actor, "milestoneCheck", { from: null, to: input.name })
    return check
  })
}

/** Result columns: recording a result stamps who and (unless given) today; clearing it clears both. */
function resultColumns(input: UpdateCheckInput, actor: Actor, now: Date) {
  if (input.result === undefined) return { ...(input.checkedAt !== undefined ? { checkedAt: dayColumn(input.checkedAt) } : {}) }
  if (input.result === null) return { result: null, checkedAt: null, recordedById: null, recordedByName: null }
  return {
    result: input.result,
    checkedAt: input.checkedAt !== undefined ? dayColumn(input.checkedAt) : todayUtc(now),
    recordedById: actor.userId,
    recordedByName: actor.userName,
  }
}

export async function updateCheck(projectId: string, checkId: string, input: UpdateCheckInput, actor: Actor, now: Date = new Date()) {
  return withTransaction(async (tx) => {
    const before = await parts.findCheck(tx, projectId, checkId)
    if (!before) throw notFound()
    await assertStageLink(tx, projectId, input.planItemId)
    const { criterion, witness, note } = input
    const check = await parts.updateCheck(tx, checkId, {
      ...defined({ name: input.name, planItemId: input.planItemId, sortOrder: input.sortOrder }),
      ...(criterion !== undefined ? { criterion: criterion || null } : {}),
      ...(witness !== undefined ? { witness: witness || null } : {}),
      ...(note !== undefined ? { note: note || null } : {}),
      ...resultColumns(input, actor, now),
    })
    if (input.result !== undefined && input.result !== before.result) {
      await logBoard(tx, projectId, actor, "milestoneCheckResult", { from: before.result, to: input.result }, { check: before.name })
    } else if (input.name !== undefined && input.name !== before.name) {
      await logBoard(tx, projectId, actor, "milestoneCheck", { from: before.name, to: input.name })
    }
    return check
  })
}

export async function deleteCheck(projectId: string, checkId: string, actor: Actor): Promise<void> {
  await withTransaction(async (tx) => {
    const check = await parts.findCheck(tx, projectId, checkId)
    if (!check) throw notFound()
    await parts.deleteCheck(tx, checkId)
    await logBoard(tx, projectId, actor, "milestoneCheck", { from: check.name, to: null })
  })
}
