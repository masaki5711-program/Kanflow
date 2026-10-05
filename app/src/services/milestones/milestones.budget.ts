import { MS_MAX_BUDGET_LINES, MS_MAX_METRIC_POINTS, MS_MAX_METRICS } from "@/lib/milestones/constants"
import type { Actor } from "@/services/_shared/actor"
import { withTransaction } from "@/services/_shared/db"
import * as parts from "./milestones.parts.repository"
import type {
  CreateBudgetLineInput,
  CreateMetricInput,
  PutMetricPointInput,
  UpdateBudgetLineInput,
  UpdateMetricInput,
} from "./milestones.schemas"
import { assertRoom, defined, logBoard, notFound } from "./milestones.shared"

/**
 * 予算 lines (plan / actual yen; plan.write) and 推移 metrics with monthly
 * values. Metric definitions are plan.write; entering a month's value is
 * floor work (milestone.track), like the KAIZEN effect numbers' follow-up.
 */

const blankToNull = (v: string | null | undefined) => (v === undefined ? undefined : v || null)

// === 予算 ===

export async function createBudgetLine(projectId: string, input: CreateBudgetLineInput, actor: Actor) {
  return withTransaction(async (tx) => {
    assertRoom(await parts.countBudgetLines(tx, projectId), MS_MAX_BUDGET_LINES)
    const line = await parts.insertBudgetLine(tx, { projectId, name: input.name, plannedYen: input.plannedYen ?? null, actualYen: input.actualYen ?? null, note: input.note || null })
    await logBoard(tx, projectId, actor, "budgetLine", { from: null, to: input.name })
    return line
  })
}

export async function updateBudgetLine(projectId: string, lineId: string, input: UpdateBudgetLineInput, actor: Actor) {
  return withTransaction(async (tx) => {
    const before = await parts.findBudgetLine(tx, projectId, lineId)
    if (!before) throw notFound()
    const line = await parts.updateBudgetLine(tx, lineId, defined({ ...input, note: blankToNull(input.note) }))
    for (const key of ["plannedYen", "actualYen"] as const) {
      if (input[key] !== undefined && input[key] !== before[key]) await logBoard(tx, projectId, actor, `budget_${key}`, { from: before[key], to: input[key] ?? null }, { line: before.name })
    }
    return line
  })
}

export async function deleteBudgetLine(projectId: string, lineId: string, actor: Actor): Promise<void> {
  await withTransaction(async (tx) => {
    const line = await parts.findBudgetLine(tx, projectId, lineId)
    if (!line) throw notFound()
    await parts.deleteBudgetLine(tx, lineId)
    await logBoard(tx, projectId, actor, "budgetLine", { from: line.name, to: null })
  })
}

// === 推移 ===

export async function createMetric(projectId: string, input: CreateMetricInput, actor: Actor) {
  return withTransaction(async (tx) => {
    assertRoom(await parts.countMetrics(tx, projectId), MS_MAX_METRICS)
    const metric = await parts.insertMetric(tx, {
      projectId,
      name: input.name,
      unit: input.unit || null,
      direction: input.direction ?? "decrease",
      baselineValue: input.baselineValue ?? null,
      targetValue: input.targetValue ?? null,
    })
    await logBoard(tx, projectId, actor, "milestoneMetric", { from: null, to: input.name })
    return metric
  })
}

export async function updateMetric(projectId: string, metricId: string, input: UpdateMetricInput, actor: Actor) {
  return withTransaction(async (tx) => {
    const before = await parts.findMetric(tx, projectId, metricId)
    if (!before) throw notFound()
    const metric = await parts.updateMetric(tx, metricId, defined({ ...input, unit: blankToNull(input.unit) }))
    if (input.name !== undefined && input.name !== before.name) await logBoard(tx, projectId, actor, "milestoneMetric", { from: before.name, to: input.name })
    return metric
  })
}

export async function deleteMetric(projectId: string, metricId: string, actor: Actor): Promise<void> {
  await withTransaction(async (tx) => {
    const metric = await parts.findMetric(tx, projectId, metricId)
    if (!metric) throw notFound()
    await parts.deleteMetric(tx, metricId)
    await logBoard(tx, projectId, actor, "milestoneMetric", { from: metric.name, to: null })
  })
}

/** Set (or with value null: remove) one month's value. */
export async function putMetricPoint(projectId: string, metricId: string, input: PutMetricPointInput, actor: Actor) {
  return withTransaction(async (tx) => {
    const metric = await parts.findMetric(tx, projectId, metricId)
    if (!metric) throw notFound()
    const before = metric.points.find((p) => p.month === input.month)?.value ?? null
    if (input.value === null) await parts.deleteMetricPoint(tx, metricId, input.month)
    else {
      if (before === null && !(await parts.hasMetricPoint(tx, metricId, input.month))) assertRoom(await parts.countMetricPoints(tx, metricId), MS_MAX_METRIC_POINTS)
      await parts.upsertMetricPoint(tx, metricId, input.month, input.value, actor.userName)
    }
    if (before !== input.value) await logBoard(tx, projectId, actor, "milestoneMetricValue", { from: before, to: input.value }, { metric: metric.name, month: input.month })
    return { metricId, month: input.month, value: input.value }
  })
}
