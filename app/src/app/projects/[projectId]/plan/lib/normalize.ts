/**
 * Normalise GET /plan responses into PlanData. Tolerates the pre-contract
 * shape (a bare item array with ISO timestamps and a stored "delayed"
 * status) so the page keeps working while the backend rolls out.
 */
import { localTodayYmd, toYmd } from "./date"
import {
  PLAN_STATUSES,
  SCHEDULE_STATES,
  type PlanData,
  type PlanDependency,
  type PlanItem,
  type PlanStatus,
  type ScheduleState,
} from "./plan-types"

type Raw = Record<string, unknown>

const str = (v: unknown): string | null => (typeof v === "string" ? v : null)
const num = (v: unknown, fallback: number): number => (typeof v === "number" && Number.isFinite(v) ? v : fallback)

function statusOf(raw: unknown): { status: PlanStatus; legacyDelayed: boolean } {
  if (raw === "delayed") return { status: "in_progress", legacyDelayed: true }
  return { status: (PLAN_STATUSES as readonly unknown[]).includes(raw) ? (raw as PlanStatus) : "not_started", legacyDelayed: false }
}

function scheduleOf(raw: unknown, status: PlanStatus, legacyDelayed: boolean): ScheduleState {
  if ((SCHEDULE_STATES as readonly unknown[]).includes(raw)) return raw as ScheduleState
  if (legacyDelayed) return "delayed"
  if (status === "done") return "done"
  if (status === "on_hold") return "on_hold"
  if (status === "not_started") return "not_started"
  return "on_track"
}

export function normalizeItem(r: Raw, fallbackDate: string): PlanItem {
  const { status, legacyDelayed } = statusOf(r.status)
  const plannedStart = toYmd(str(r.plannedStart)) ?? fallbackDate
  const plannedEnd = toYmd(str(r.plannedEnd)) ?? plannedStart
  const owner = r.owner && typeof r.owner === "object" ? (r.owner as { id: string; name: string }) : null
  return {
    id: String(r.id),
    projectId: String(r.projectId ?? ""),
    parentId: str(r.parentId),
    name: str(r.name) ?? "",
    description: str(r.description),
    notes: str(r.notes),
    plannedStart,
    plannedEnd: plannedEnd < plannedStart ? plannedStart : plannedEnd,
    actualStart: toYmd(str(r.actualStart)),
    actualEnd: toYmd(str(r.actualEnd)),
    baselineStart: toYmd(str(r.baselineStart)),
    baselineEnd: toYmd(str(r.baselineEnd)),
    baselineVarianceDays: typeof r.baselineVarianceDays === "number" ? r.baselineVarianceDays : null,
    progressPct: Math.min(100, Math.max(0, Math.round(num(r.progressPct, 0)))),
    progressMode: r.progressMode === "linked" ? "linked" : "manual",
    status,
    scheduleState: scheduleOf(r.scheduleState, status, legacyDelayed),
    isMilestone: r.isMilestone === true,
    color: str(r.color),
    sortOrder: num(r.sortOrder, 0),
    version: typeof r.version === "number" ? r.version : undefined,
    owner,
    hasChildren: r.hasChildren === true,
    linked: r.linked && typeof r.linked === "object" ? (r.linked as PlanItem["linked"]) : null,
    i18n: r.i18n as PlanItem["i18n"],
  }
}

export function normalizePlanData(raw: unknown, now: Date = new Date()): PlanData {
  const obj = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Raw) : null
  const today = toYmd(str(obj?.today)) ?? localTodayYmd(now)
  const rawItems = Array.isArray(raw) ? raw : Array.isArray(obj?.items) ? (obj.items as unknown[]) : []
  const items = rawItems.filter((r): r is Raw => !!r && typeof r === "object").map((r) => normalizeItem(r, today))
  const ids = new Set(items.map((i) => i.id))
  // hasChildren is derived locally so optimistic moves stay consistent.
  const parents = new Set(items.flatMap((i) => (i.parentId && ids.has(i.parentId) ? [i.parentId] : [])))
  const withChildren = items.map((i) => (i.hasChildren === parents.has(i.id) ? i : { ...i, hasChildren: parents.has(i.id) }))
  const deps = Array.isArray(obj?.dependencies) ? (obj.dependencies as PlanDependency[]) : []
  return {
    items: withChildren,
    dependencies: deps.filter((d) => ids.has(d.predecessorId) && ids.has(d.successorId)),
    today,
  }
}
