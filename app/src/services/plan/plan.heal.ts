/**
 * Heal of the STORED derived plan values (progressPct, status, parent
 * plannedStart / plannedEnd). Write paths keep them fresh through
 * recalcPlanProgress (src/lib/plan-progress.ts); this catches rows written
 * before that model (legacy data, the 20261004000000_plan_linkage migration)
 * or drifted otherwise. It runs from:
 *  - GET /plan (plan.service listPlan): always answers healed values, writes
 *    the drift at most once per project per PLAN_HEAL_DEBOUNCE_MS;
 *  - the daily notify-due job, before it reads plannedEnd / status;
 *  - scripts/heal-plan.ts (one-off backfill after the migration).
 *
 * Concurrency: a heal writes ABSOLUTE values recomputed from the live tree
 * through the versioning-free applyPlanUpdates path (derived columns are not
 * user edits, no version bump), all rows of one project in one transaction.
 * Two concurrent heals of a project therefore write the same values and are
 * idempotent (the later one is at worst a redundant write); a concurrent user
 * edit recalculates its chain in its own transaction.
 */
import { applyPlanUpdates, computePlanRecalc, toDateKey, type LinkedPbi, type PlanCalcNode, type PlanCalcUpdate } from "@/lib/plan-progress"
import { defaultDb, withTransaction, type Db } from "@/services/_shared/db"
import { LIST_LIMITS } from "@/services/_shared/limits"
import { toLinkedPbi } from "./plan.dto"
import * as repo from "./plan.repository"

type LinkedRows = Awaited<ReturnType<typeof repo.findLinkedPbisOfProject>>

/** A GET heals (writes) a project at most once per this window. */
export const PLAN_HEAL_DEBOUNCE_MS = 60_000
/** Above this many tracked projects, expired debounce entries are pruned. */
const DEBOUNCE_PRUNE_AT = 500

function linkedByItem(pbis: LinkedRows, linkedModeIds: ReadonlySet<string>): Map<string, LinkedPbi[]> {
  const out = new Map<string, LinkedPbi[]>()
  for (const p of pbis) {
    if (!p.planItemId || !linkedModeIds.has(p.planItemId)) continue
    out.set(p.planItemId, [...(out.get(p.planItemId) ?? []), toLinkedPbi(p)])
  }
  return out
}

export interface PlanHealComputation<T> {
  /** The rows with their recomputed derived values (new objects). */
  items: T[]
  /** Only the drifted fields per row (empty when nothing drifted or capped). */
  updates: PlanCalcUpdate[]
  /** The list hit LIST_LIMITS.planItems: a partial tree would roll up wrongly, nothing is healed. */
  capped: boolean
}

/** Pure: recompute every derived value of one project's live tree in memory. */
export function computePlanHeal<T extends PlanCalcNode>(rows: readonly T[], pbis: LinkedRows): PlanHealComputation<T> {
  if (rows.length >= LIST_LIMITS.planItems) return { items: [...rows], updates: [], capped: true }
  const linkedModeIds = new Set(rows.filter((r) => r.progressMode === "linked").map((r) => r.id))
  // The heal never invents actual dates (a backfill would stamp "today" on old rows): only write paths fill them.
  const calcRows = rows.map((r) => ({ ...r, actualStart: undefined, actualEnd: undefined }))
  const { updates, nodes } = computePlanRecalc(calcRows, linkedByItem(pbis, linkedModeIds), "all")
  const items = rows.map((r) => {
    const n = nodes.get(r.id) as PlanCalcNode
    return { ...r, progressPct: n.progressPct, status: n.status, plannedStart: n.plannedStart, plannedEnd: n.plannedEnd }
  })
  return { items, updates, capped: false }
}

/**
 * Persist heal updates. Through the global client: one transaction. Through a
 * caller-provided client (a transaction, or the worker's client): as given.
 */
export async function persistPlanHeal(updates: readonly PlanCalcUpdate[], db: Db = defaultDb): Promise<void> {
  if (updates.length === 0) return
  if (db === defaultDb) await withTransaction((tx) => applyPlanUpdates(tx, updates))
  else await applyPlanUpdates(db, updates)
}

export interface HealProjectOptions {
  db?: Db
  /** false = dry run: compute only. Default true. */
  apply?: boolean
}

export interface PlanHealResult {
  rows: Awaited<ReturnType<typeof repo.findPlanItems>>
  updates: PlanCalcUpdate[]
  capped: boolean
  /** Updates were written. */
  applied: boolean
}

/** Load one project's live plan tree + linked PBIs, compute and (unless dry run) persist the drift. Write errors propagate. */
export async function healProjectPlan(projectId: string, opts: HealProjectOptions = {}): Promise<PlanHealResult> {
  const db = opts.db ?? defaultDb
  const [rows, pbis] = await Promise.all([repo.findPlanItems(db, projectId), repo.findLinkedPbisOfProject(db, projectId)])
  const { updates, capped } = computePlanHeal(rows, pbis)
  const apply = opts.apply !== false && updates.length > 0
  if (apply) await persistPlanHeal(updates, db)
  return { rows, updates, capped, applied: apply }
}

// ── GET debounce (per process) ──────────────────────────────────────────────

const lastHealAt = new Map<string, number>()

function pruneExpired(nowMs: number): void {
  if (lastHealAt.size < DEBOUNCE_PRUNE_AT) return
  for (const [id, at] of lastHealAt) if (nowMs - at >= PLAN_HEAL_DEBOUNCE_MS) lastHealAt.delete(id)
}

/** true (and the project is marked) when it was not healed within the window; concurrent GETs: only the first claims. */
export function claimPlanHeal(projectId: string, nowMs: number): boolean {
  const last = lastHealAt.get(projectId)
  if (last !== undefined && nowMs - last < PLAN_HEAL_DEBOUNCE_MS) return false
  pruneExpired(nowMs)
  lastHealAt.set(projectId, nowMs)
  return true
}

/** Undo a claim (the heal write failed, so the next GET retries). */
export function releasePlanHeal(projectId: string): void {
  lastHealAt.delete(projectId)
}

/** Tests only. */
export function resetPlanHealDebounce(): void {
  lastHealAt.clear()
}

// ── reporting (backfill script) ─────────────────────────────────────────────

const fmt = (v: unknown): string => (v instanceof Date ? toDateKey(v) : String(v))

/** "Name (id): field from → to, …" for a dry-run report. */
export function describePlanHealUpdate(row: PlanCalcNode & { name: string }, update: PlanCalcUpdate): string {
  const fields = (["progressPct", "status", "plannedStart", "plannedEnd"] as const).filter((f) => update[f] !== undefined)
  return `${row.name} (${row.id}): ${fields.map((f) => `${f} ${fmt(row[f])} → ${fmt(update[f])}`).join(", ")}`
}
