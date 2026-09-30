/**
 * Activity log (audit trail / change history) — the one seam every domain
 * service uses to record mutations.
 *
 * Outbox style like `enqueueIn`: services call these INSIDE the transaction
 * that performs the mutation, so a rolled-back write never leaves a history
 * row behind. Recording is best effort: every function here catches and logs
 * its own failures and NEVER throws into the caller's transaction (a missing
 * history row must not fail the user's save).
 *
 * Stored `diff` column (JSON text):
 *   { changes?: { field: { from, to } | { changed: true } }, label?: string, meta?: {...} }
 * - `changes`: only the fields that actually changed. Long text bodies
 *   (> LONG_TEXT_THRESHOLD chars on either side) are stored as `{ changed: true }`
 *   so the log stays small.
 * - `label`: short human label of the entity (PBI story, task name, ...) so a
 *   feed can render deleted entities too.
 * - `meta`: extra context (e.g. `{ sprintId }` for a task, `{ count }` for a reorder).
 */
import { logger } from "@/lib/logger"
import type { Actor } from "./actor"
import type { Db } from "./db"

const log = logger.child({ module: "activity" })

export const ACTIVITY_ENTITY_TYPES = [
  "pbi",
  "sprint_task",
  "sprint",
  "icebox",
  "goal",
  "release",
  "plan_item",
  "member",
  "project",
] as const
export type ActivityEntityType = (typeof ACTIVITY_ENTITY_TYPES)[number]

export const ACTIVITY_ACTIONS = ["create", "update", "delete", "status_change", "assign", "move", "restore", "comment"] as const
export type ActivityAction = (typeof ACTIVITY_ACTIONS)[number]

/** Text longer than this (either side) is recorded as `{ changed: true }`. */
export const LONG_TEXT_THRESHOLD = 500
/** Labels are cut to this many characters. */
export const LABEL_MAX = 120
/** Hard cap of the serialized diff (the column is TEXT = 64 KB). */
const DIFF_MAX_CHARS = 16_000

export type FieldValue = string | number | boolean | null
export type FieldChange = { from: FieldValue; to: FieldValue } | { changed: true }
export type ActivityChanges = Record<string, FieldChange>

export interface ActivityDiff {
  changes?: ActivityChanges
  label?: string
  meta?: Record<string, unknown>
}

export interface ActivityInput {
  projectId: string
  entityType: ActivityEntityType
  entityId: string
  action: ActivityAction
  /** null = the system (worker jobs). */
  actor: Actor | null
  diff?: ActivityDiff | null
}

/**
 * Fields tracked per entity type. Derived / bookkeeping columns (sortOrder,
 * version, completedAt, progressPct of parents, ...) are deliberately absent.
 */
export const TRACKED_FIELDS: Readonly<Record<ActivityEntityType, readonly string[]>> = {
  pbi: [
    "initiative",
    "epic",
    "userStory",
    "acceptanceCriteria",
    "referenceDoc",
    "workloadScore",
    "status",
    "assignedPo",
    "poNote",
    "notReadyReason",
    "iceboxItemId",
    "productGoalId",
    "planItemId",
  ],
  sprint_task: ["taskName", "assignee", "estimatedHours", "actualHours", "status", "completionComment"],
  sprint: [
    "sprintName",
    "startDate",
    "endDate",
    "sprintGoal",
    "capacity",
    "status",
    "reviewComment",
    "retrospectiveMemo",
    "retrospectiveKeep",
    "retrospectiveProblem",
    "retrospectiveTry",
  ],
  icebox: [
    "author",
    "request",
    "background",
    "policyDoc",
    "planningDoc",
    "assignedPo",
    "status",
    "pbEpic",
    "rejectionReason",
    "freezeReason",
    "poHearingMemo",
    "poReviewMemo",
    "poFlag",
  ],
  goal: ["title", "description"],
  release: [
    "planVersion",
    "initiative",
    "epic",
    "userStory",
    "assignedPo",
    "releaseVersion",
    "releaseDate",
    "releaseNote",
    "manualLink",
    "poNote",
    "status",
  ],
  plan_item: [
    "name",
    "description",
    "notes",
    "parentId",
    "plannedStart",
    "plannedEnd",
    "actualStart",
    "actualEnd",
    "isMilestone",
    "color",
    "status",
    "ownerId",
    "progressMode",
  ],
  member: ["userId", "role"],
  project: [
    "name",
    "description",
    "status",
    "projectType",
    "defaultCapacity",
    "sprintDurationDays",
    "pointUnit",
    "pointDescription",
    "language",
    "bilingualMode",
    "progressPct",
    "cardColor",
  ],
}

/** The field whose value labels an entity in a feed. */
const LABEL_FIELD: Readonly<Record<ActivityEntityType, string>> = {
  pbi: "userStory",
  sprint_task: "taskName",
  sprint: "sprintName",
  icebox: "request",
  goal: "title",
  release: "userStory",
  plan_item: "name",
  member: "userId",
  project: "name",
}

/** Fields that make an update a "status_change" when nothing else changed. */
const STATUS_FIELDS: ReadonlySet<string> = new Set(["status", "completionComment"])
/** Fields that make an update an "assign" when nothing else changed. */
const ASSIGNEE_FIELDS: ReadonlySet<string> = new Set(["assignee", "assignedPo"])

type Row = Readonly<Record<string, unknown>>

/** Normalize a column value for comparison / storage (Date → ISO, undefined → null). */
export function normalizeValue(value: unknown): FieldValue {
  if (value === undefined || value === null) return null
  if (value instanceof Date) return isNaN(value.getTime()) ? null : value.toISOString()
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return value
  return JSON.stringify(value)
}

function isLong(value: FieldValue): boolean {
  return typeof value === "string" && value.length > LONG_TEXT_THRESHOLD
}

/**
 * Pure: `{ field: { from, to } }` for every listed field whose value differs
 * between `before` and `after`. Fields absent (or `undefined`) in `after` are
 * "not part of this change" and skipped. Long text becomes `{ changed: true }`.
 */
export function diffFields(before: Row | null | undefined, after: Row, fields: readonly string[]): ActivityChanges {
  const changes: ActivityChanges = {}
  for (const field of fields) {
    if (after[field] === undefined) continue
    const from = normalizeValue(before?.[field])
    const to = normalizeValue(after[field])
    if (from === to) continue
    changes[field] = isLong(from) || isLong(to) ? { changed: true } : { from, to }
  }
  return changes
}

/** Pure: status_change / assign / update from the set of changed fields. */
export function classifyUpdate(changes: ActivityChanges): ActivityAction {
  const keys = Object.keys(changes)
  if (keys.length === 0) return "update"
  if (keys.includes("status") && keys.every((k) => STATUS_FIELDS.has(k))) return "status_change"
  if (keys.every((k) => ASSIGNEE_FIELDS.has(k))) return "assign"
  return "update"
}

/** Pure: short label of a row (first line of the label field, cut to LABEL_MAX). */
export function labelOf(entityType: ActivityEntityType, row: Row | null | undefined): string | undefined {
  const raw = row?.[LABEL_FIELD[entityType]]
  if (typeof raw !== "string" || !raw.trim()) return undefined
  const firstLine = raw.trim().split(/\r?\n/)[0]
  return firstLine.length > LABEL_MAX ? `${firstLine.slice(0, LABEL_MAX - 1)}…` : firstLine
}

/** Pure: the stored JSON text of a diff, or null when there is nothing to store. */
export function serializeDiff(diff: ActivityDiff | null | undefined): string | null {
  if (!diff) return null
  const out: ActivityDiff = {}
  if (diff.changes && Object.keys(diff.changes).length > 0) out.changes = diff.changes
  if (diff.label) out.label = diff.label
  if (diff.meta && Object.keys(diff.meta).length > 0) out.meta = diff.meta
  if (Object.keys(out).length === 0) return null
  const text = JSON.stringify(out)
  if (text.length <= DIFF_MAX_CHARS) return text
  // Oversized (many long-ish fields): keep the field names only.
  const names = Object.keys(out.changes ?? {})
  return JSON.stringify({ label: out.label, changes: Object.fromEntries(names.map((n) => [n, { changed: true }])) })
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

/** Record one activity row within `tx`. Never throws. */
export async function logActivity(tx: Db, input: ActivityInput): Promise<void> {
  try {
    await tx.activityLog.create({
      data: {
        projectId: input.projectId,
        entityType: input.entityType,
        entityId: input.entityId,
        action: input.action,
        actorId: input.actor?.userId ?? null,
        actorName: input.actor?.userName ?? null,
        diff: serializeDiff(input.diff),
      },
    })
  } catch (err) {
    log.warn("activity log write failed", {
      entityType: input.entityType,
      entityId: input.entityId,
      action: input.action,
      error: errorMessage(err),
    })
  }
}

interface EntityRef {
  projectId: string
  entityType: ActivityEntityType
  entityId: string
  actor: Actor | null
  meta?: Record<string, unknown>
}

/** Pure: tracked non-empty fields of a row as `{ from: null, to }` (or `{ from, to: null }` when removed). */
export function snapshotChanges(entityType: ActivityEntityType, row: Row, direction: "created" | "deleted"): ActivityChanges {
  const fields = TRACKED_FIELDS[entityType]
  if (direction === "created") return diffFields({}, row, fields)
  return diffFields(row, Object.fromEntries(fields.map((f) => [f, null])), fields)
}

/** "create" with the new row's tracked fields. Never throws. */
export function logCreate(tx: Db, ref: EntityRef & { row: Row }): Promise<void> {
  return logActivity(tx, {
    ...ref,
    action: "create",
    diff: { changes: snapshotChanges(ref.entityType, ref.row, "created"), label: labelOf(ref.entityType, ref.row), meta: ref.meta },
  })
}

/** "delete" with the removed row's label (and tracked fields when known). Never throws. */
export function logDelete(tx: Db, ref: EntityRef & { row: Row | null }): Promise<void> {
  return logActivity(tx, {
    ...ref,
    action: "delete",
    diff: {
      changes: ref.row ? snapshotChanges(ref.entityType, ref.row, "deleted") : undefined,
      label: labelOf(ref.entityType, ref.row),
      meta: ref.meta,
    },
  })
}

/**
 * Diff `before` → `after` over the tracked fields and record update /
 * status_change / assign. Nothing is recorded when a known `before` shows no
 * change; an unknown `before` (snapshot failed) records a bare "update".
 * Returns the changes (empty when unknown / unchanged). Never throws.
 */
export async function logUpdate(tx: Db, ref: EntityRef & { before: Row | null; after: Row }): Promise<ActivityChanges> {
  const label = labelOf(ref.entityType, ref.after)
  if (!ref.before) {
    await logActivity(tx, { ...ref, action: "update", diff: { label, meta: ref.meta } })
    return {}
  }
  const changes = diffFields(ref.before, ref.after, TRACKED_FIELDS[ref.entityType])
  if (Object.keys(changes).length === 0) return changes
  await logActivity(tx, { ...ref, action: classifyUpdate(changes), diff: { changes, label, meta: ref.meta } })
  return changes
}

/**
 * Current row of an entity (by primary key) for a before/after diff, or null
 * when it cannot be read. Never throws.
 */
export async function loadSnapshot(tx: Db, entityType: ActivityEntityType, id: string): Promise<Row | null> {
  try {
    const where = { where: { id } }
    switch (entityType) {
      case "pbi":
        return await tx.productBacklogItem.findUnique(where)
      case "sprint_task":
        return await tx.sprintBacklogItem.findUnique(where)
      case "sprint":
        return await tx.sprint.findUnique(where)
      case "icebox":
        return await tx.iceboxItem.findUnique(where)
      case "goal":
        return await tx.productGoal.findUnique(where)
      case "release":
        return await tx.releaseBacklogItem.findUnique(where)
      case "plan_item":
        return await tx.planItem.findUnique(where)
      case "member":
        return await tx.projectMember.findUnique(where)
      case "project":
        return await tx.project.findUnique(where)
    }
  } catch (err) {
    log.warn("activity snapshot read failed", { entityType, id, error: errorMessage(err) })
    return null
  }
}
