/**
 * In-memory stand-in for the parts of Prisma that the confidential-PBI rule (D-5) touches, with a tiny
 * `where` evaluator, so the REAL repository filters and the REAL masking helpers run against data
 * (the repo has no MariaDB harness for vitest). Synthetic data only.
 *
 * Project p1 holds a normal PBI (pbA, PBI-1) and a confidential one (pbC, PBI-2) with a task, a claim,
 * a release copy and activity rows each. Everything about pbC carries the word SECRET: no answer to a
 * token surface may contain it.
 */
import { vi } from "vitest"

type Row = Record<string, unknown>

const OPERATORS = ["in", "not", "gte", "gt", "some", "equals"]

function fieldMatches(value: unknown, cond: unknown): boolean {
  if (cond === null || typeof cond !== "object" || cond instanceof Date) return (value ?? null) === (cond ?? null)
  const c = cond as Row
  if (Object.keys(c).some((k) => OPERATORS.includes(k))) {
    if ("in" in c) return (c.in as unknown[]).includes(value)
    if ("not" in c) return (value ?? null) !== (c.not ?? null)
    if ("some" in c) return Array.isArray(value) && value.some((v) => matches(v as Row, c.some as Row))
    if ("equals" in c) return value === c.equals
    const num = (v: unknown) => (v instanceof Date ? v.getTime() : Number(v))
    if ("gte" in c) return num(value) >= num(c.gte)
    if ("gt" in c) return num(value) > num(c.gt)
  }
  // A nested object is a relation filter.
  return value !== null && typeof value === "object" && matches(value as Row, c)
}

/** Evaluates the subset of Prisma `where` used by the token-facing queries. */
export function matches(row: Row, where: Row | undefined): boolean {
  if (!where) return true
  return Object.entries(where).every(([key, cond]) => {
    if (key === "AND") return (cond as Row[]).every((c) => matches(row, c))
    if (key === "OR") return (cond as Row[]).some((c) => matches(row, c))
    if (key === "NOT") return !(Array.isArray(cond) ? (cond as Row[]) : [cond as Row]).some((c) => matches(row, c))
    return fieldMatches(row[key], cond)
  })
}

interface FindArgs {
  where?: Row
  take?: number
}

function table(rows: () => Row[]) {
  return {
    findMany: vi.fn(async (args?: FindArgs) => rows().filter((r) => matches(r, args?.where)).slice(0, args?.take ?? Number.POSITIVE_INFINITY)),
    findFirst: vi.fn(async (args?: FindArgs) => rows().find((r) => matches(r, args?.where)) ?? null),
  }
}

const NOW = new Date("2026-11-01T00:00:00.000Z")

function pbiRow(id: string, displayId: number, confidential: boolean, text: string): Row {
  return {
    id, projectId: "p1", displayId, confidential, deletedAt: null, status: "ready",
    initiative: text, epic: null, userStory: text, acceptanceCriteria: null, referenceDoc: null,
    workloadScore: 3, assignedPo: null, poNote: null, notReadyReason: null, sortOrder: displayId,
    productGoalId: null, planItemId: null, iceboxItemId: null, completedAt: null, version: 0,
    createdAt: NOW, updatedAt: NOW, criteria: [], sprintItems: [],
  }
}

export const PBI_PUBLIC = pbiRow("pbA", 1, false, "public story")
export const PBI_SECRET = pbiRow("pbC", 2, true, "SECRET story")

function taskRow(id: string, pbi: Row, name: string): Row {
  return {
    id, sprintId: "s1", pbItemId: pbi.id, pbItem: pbi, taskName: name, status: "todo",
    estimatedHours: 1, actualHours: 0, completedAt: null, version: 0, createdAt: NOW, updatedAt: NOW,
    assignees: [{ userId: "u1", user: { id: "u1", name: "Dev One" } }],
    sprint: { id: "s1", sprintName: "S1", status: "active", projectId: "p1", project: { deletedAt: null, status: "active" } },
  }
}

export const TASK_PUBLIC = taskRow("tA", PBI_PUBLIC, "public task")
export const TASK_SECRET = taskRow("tC", PBI_SECRET, "SECRET task")

const CLAIM_PUBLIC: Row = { id: "clA", projectId: "p1", backlogItemId: "pbA", backlogItem: PBI_PUBLIC }
const CLAIM_SECRET: Row = { id: "clC", projectId: "p1", backlogItemId: "pbC", backlogItem: PBI_SECRET }

function releaseRow(id: string, pbi: Row | null, text: string): Row {
  return {
    id, projectId: "p1", planVersion: "v1", releaseVersion: null, releaseDate: null, status: "staged",
    initiative: text, epic: null, userStory: text, createdAt: NOW, updatedAt: NOW,
    pbItemId: pbi ? pbi.id : null, pbItem: pbi,
  }
}

export const RELEASE_PUBLIC = releaseRow("rA", PBI_PUBLIC, "public story")
export const RELEASE_SECRET = releaseRow("rC", PBI_SECRET, "SECRET story")
export const RELEASE_UNLINKED = releaseRow("rN", null, "kept copy")

function activityRow(id: string, entityType: string, entityId: string, label: string): Row {
  return {
    id, projectId: "p1", entityType, entityId, action: "update", actorId: "u1", actorName: "Dev One",
    diff: JSON.stringify({ label }), createdAt: NOW, actor: { id: "u1", name: "Dev One" },
  }
}

function withMeta(row: Row, meta: Record<string, unknown>): Row {
  return { ...row, diff: JSON.stringify({ label: (JSON.parse(row.diff as string) as { label: string }).label, meta }) }
}

export const ACTIVITY = [
  activityRow("a1", "pbi", "pbA", "public story"),
  activityRow("a2", "pbi", "pbC", "SECRET story"),
  activityRow("a3", "sprint_task", "tA", "public task"),
  activityRow("a4", "sprint_task", "tC", "SECRET task"),
  activityRow("a5", "release", "rA", "public story"),
  activityRow("a6", "release", "rC", "SECRET story"),
  activityRow("a7", "sprint", "s1", "S1"),
  // Rows whose entity is gone. The task / release name is the label; the parent is only in meta.pbItemId.
  withMeta(activityRow("a8", "sprint_task", "tGone1", "SECRET deleted task"), { pbItemId: "pbC" }),
  withMeta(activityRow("a9", "sprint_task", "tGone2", "public deleted task"), { pbItemId: "pbA" }),
  activityRow("a10", "sprint_task", "tGone3", "SECRET legacy deleted task"), // predates the record, entity missing
  activityRow("a11", "pbi", "pbPurged", "SECRET purged story"), // PBI no longer exists
  withMeta(activityRow("a12", "release", "rGone", "kept unlinked copy"), { pbItemId: null }),
  withMeta(activityRow("a13", "release", "rGone2", "SECRET deleted copy"), { pbItemId: "pbC" }),
]

/** The Prisma stand-in; add the auth tables (project, projectMember, ...) where a test needs them. */
export const confidentialDb = {
  productBacklogItem: table(() => [PBI_PUBLIC, PBI_SECRET]),
  sprintBacklogItem: table(() => [TASK_PUBLIC, TASK_SECRET]),
  sprint: table(() => [{ id: "s1", projectId: "p1" }]),
  workClaim: table(() => [CLAIM_PUBLIC, CLAIM_SECRET]),
  releaseBacklogItem: table(() => [RELEASE_PUBLIC, RELEASE_SECRET, RELEASE_UNLINKED]),
  activityLog: table(() => ACTIVITY),
}

/** True when no word of `value` (any JSON-serializable answer) names the confidential PBI. */
export function leaksSecret(value: unknown): boolean {
  return JSON.stringify(value).includes("SECRET")
}
