import type { Actor } from "@/services/_shared/actor"
import { loadSnapshot, logCreate, logDelete, logUpdate } from "@/services/_shared/activity"
import { defaultDb, withTransaction } from "@/services/_shared/db"
import { attachI18n, attachI18nOne, enqueueIn, prepareText, purgeIn } from "@/services/_shared/translations"
import * as repo from "./goals.repository"
import type { CreateGoalInput, UpdateGoalInput } from "./goals.schemas"

export async function listGoals(projectId: string) {
  return attachI18n("product_goal", await repo.findGoals(defaultDb, projectId))
}

export async function createGoal(projectId: string, input: CreateGoalInput, actor: Actor) {
  const data = await prepareText(input, actor.userId)
  return withTransaction(async (tx) => {
    const goal = await repo.insertGoal(tx, projectId, data)
    await enqueueIn(tx, "product_goal", goal.id, goal)
    await logCreate(tx, { projectId, entityType: "goal", entityId: goal.id, actor, row: goal })
    return goal
  })
}

export async function updateGoal(projectId: string, goalId: string, input: UpdateGoalInput, actor: Actor) {
  const data = await prepareText(input, actor.userId)
  const goal = await withTransaction(async (tx) => {
    const before = await loadSnapshot(tx, "goal", goalId)
    const updated = await repo.updateGoal(tx, projectId, goalId, data)
    await enqueueIn(tx, "product_goal", updated.id, data)
    await logUpdate(tx, { projectId, entityType: "goal", entityId: goalId, actor, before, after: updated })
    return updated
  })
  return attachI18nOne("product_goal", goal)
}

/** PBIs keep existing (their productGoalId is set to NULL by the FK). */
export async function deleteGoal(projectId: string, goalId: string, actor: Actor | null = null): Promise<void> {
  await withTransaction(async (tx) => {
    const row = await loadSnapshot(tx, "goal", goalId)
    await repo.deleteGoal(tx, projectId, goalId)
    await logDelete(tx, { projectId, entityType: "goal", entityId: goalId, actor, row })
    await purgeIn(tx, { product_goal: [goalId] })
  })
}
