/**
 * Editor form state of a plan item (existing item or unsaved draft) and the
 * request bodies. Values the server derives are never sent:
 *   - progress: always (parents roll up children, linked leaves use their
 *     PBIs, manual leaves follow their status)
 *   - parent (summary) items: dates and status
 *   - linked leaves: status
 */
import { diffDays, isYmd } from "./date"
import type { PlanDraft, PlanItem, PlanItemInput, PlanItemPatch, PlanStatus, ProgressMode } from "./plan-types"

export interface PlanForm {
  name: string
  description: string
  /** "" on both = 日程未定 (undated). */
  plannedStart: string
  plannedEnd: string
  actualStart: string
  actualEnd: string
  status: PlanStatus
  parentId: string
  isMilestone: boolean
  notes: string
  ownerId: string
  progressMode: ProgressMode
}

export interface DerivedFlags {
  /** Summary row: dates come from children. */
  datesDerived: boolean
  statusDerived: boolean
  /** "From PBIs" chosen but no PBI linked yet: the status stays manual until one is. */
  statusManualUntilLinked: boolean
}

/**
 * Which fields the server derives. A linked leaf only derives its status once
 * it has PBIs (plan-progress: a linked leaf without PBIs behaves as manual);
 * `linkedCount` overrides the saved count while the editor changes the links.
 */
export function derivedFlags(
  item: (Pick<PlanItem, "hasChildren"> & Partial<Pick<PlanItem, "linked">>) | null,
  form: Pick<PlanForm, "progressMode">,
  linkedCount: number = item?.linked?.pbiCount ?? 0,
): DerivedFlags {
  const isParent = !!item?.hasChildren
  const linked = !isParent && form.progressMode === "linked"
  return { datesDerived: isParent, statusDerived: isParent || (linked && linkedCount > 0), statusManualUntilLinked: linked && linkedCount === 0 }
}

export function formFromItem(item: PlanItem): PlanForm {
  return {
    name: item.name,
    description: item.description ?? "",
    plannedStart: item.plannedStart ?? "",
    plannedEnd: item.plannedEnd ?? "",
    actualStart: item.actualStart ?? "",
    actualEnd: item.actualEnd ?? "",
    status: item.status,
    parentId: item.parentId ?? "",
    isMilestone: item.isMilestone,
    notes: item.notes ?? "",
    ownerId: item.owner?.id ?? "",
    progressMode: item.progressMode,
  }
}

export function formFromDraft(draft: PlanDraft): PlanForm {
  return {
    name: "",
    description: "",
    plannedStart: draft.plannedStart,
    plannedEnd: draft.plannedEnd,
    actualStart: "",
    actualEnd: "",
    status: "not_started",
    parentId: draft.parentId ?? "",
    isMilestone: draft.isMilestone,
    notes: "",
    ownerId: "",
    progressMode: "manual",
  }
}

export function isSameForm(a: PlanForm, b: PlanForm): boolean {
  return (Object.keys(a) as (keyof PlanForm)[]).every((k) => a[k] === b[k])
}

/** A milestone has one date: the end mirrors the start. */
export function effectiveEnd(form: PlanForm): string {
  return form.isMilestone ? form.plannedStart : form.plannedEnd
}

/** plannedEndRequired: a start without an end (an item has both dates or neither = 日程未定). */
export type FormErrorKey = "name" | "plannedStart" | "plannedEnd" | "plannedEndRequired" | "actualEnd"

function plannedErrors(form: PlanForm): Partial<Record<FormErrorKey, true>> {
  const start = form.plannedStart.trim()
  const end = effectiveEnd(form).trim()
  if (!start && !end) return {}
  if (!isYmd(start)) return { plannedStart: true }
  if (!end) return { plannedEndRequired: true }
  if (!isYmd(end) || diffDays(start, end) < 0) return { plannedEnd: true }
  return {}
}

/** Error keys → true (the component maps them to localized messages). Empty planned dates = 日程未定 (valid). */
export function validateForm(form: PlanForm, flags: DerivedFlags): Partial<Record<FormErrorKey, true>> {
  const errors: Partial<Record<FormErrorKey, true>> = flags.datesDerived ? {} : plannedErrors(form)
  if (!form.name.trim()) errors.name = true
  if (isYmd(form.actualStart) && isYmd(form.actualEnd) && diffDays(form.actualStart, form.actualEnd) < 0) errors.actualEnd = true
  return errors
}

const orNull = (v: string) => (v.trim() ? v : null)

/** Everything the form can send, before dropping derived / unchanged fields. */
function fullBody(form: PlanForm): Required<Omit<PlanItemInput, "color">> {
  return {
    name: form.name.trim(),
    description: orNull(form.description),
    plannedStart: orNull(form.plannedStart),
    plannedEnd: orNull(effectiveEnd(form)),
    actualStart: orNull(form.actualStart),
    actualEnd: orNull(form.actualEnd),
    status: form.status,
    parentId: form.parentId || null,
    isMilestone: form.isMilestone,
    notes: orNull(form.notes),
    ownerId: form.ownerId || null,
    progressMode: form.isMilestone ? "manual" : form.progressMode,
  }
}

function dropDerived<T extends PlanItemPatch>(body: T, flags: DerivedFlags): T {
  const out: PlanItemPatch = { ...body }
  if (flags.datesDerived) {
    delete out.plannedStart
    delete out.plannedEnd
  }
  if (flags.statusDerived) delete out.status
  if (flags.datesDerived) delete out.progressMode
  return out as T
}

/** PATCH body: changed, non-derived fields only. */
export function buildPatch(item: PlanItem, form: PlanForm, linkedCount?: number): PlanItemPatch {
  const flags = derivedFlags(item, form, linkedCount)
  const before = dropDerived(fullBody(formFromItem(item)), flags) as Record<string, unknown>
  const after = dropDerived(fullBody(form), flags) as Record<string, unknown>
  const patch: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(after)) if (before[k] !== v) patch[k] = v
  return patch as PlanItemPatch
}

/** POST body for a draft (no children yet; actual dates are entered once work starts). */
export function buildCreateInput(form: PlanForm): PlanItemInput {
  const body: PlanItemPatch = dropDerived(fullBody(form), derivedFlags(null, form))
  delete body.actualStart
  delete body.actualEnd
  return { ...body, name: form.name.trim(), plannedStart: orNull(form.plannedStart), plannedEnd: orNull(effectiveEnd(form)) }
}
