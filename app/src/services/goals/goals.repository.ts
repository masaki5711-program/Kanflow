import type { Db } from "@/services/_shared/db"
import { LIST_LIMITS } from "@/services/_shared/limits"
import type { CreateGoalInput, UpdateGoalInput } from "./goals.schemas"

export function findGoals(db: Db, projectId: string) {
  return db.productGoal.findMany({
    where: { projectId },
    orderBy: { createdAt: "asc" },
    take: LIST_LIMITS.productGoals,
  })
}

export function insertGoal(db: Db, projectId: string, data: CreateGoalInput) {
  return db.productGoal.create({
    data: { projectId, title: data.title, description: data.description },
  })
}

export function updateGoal(db: Db, projectId: string, goalId: string, data: UpdateGoalInput) {
  return db.productGoal.update({ where: { id: goalId, projectId }, data })
}

export function deleteGoal(db: Db, projectId: string, goalId: string) {
  return db.productGoal.delete({ where: { id: goalId, projectId } })
}
