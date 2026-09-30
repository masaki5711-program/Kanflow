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
}

export function derivedFlags(item: Pick<PlanItem, "hasChildren"> | null, form: Pick<PlanForm, "progressMode">): DerivedFlags {
  const isParent = !!item?.hasChildren
  const linked = !isParent && form.progressMode === "linked"
  return { datesDerived: isParent, statusDerived: isParent || linked }
}

export function formFromItem(item: PlanItem): PlanForm {
  return {
    name: item.name,
    description: item.description ?? "",
    plannedStart: item.plannedStart,
    plannedEnd: item.plannedEnd,
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

export type FormErrorKey = "name" | "plannedStart" | "plannedEnd" | "actualEnd"

/** Error keys → true (the component maps them to localized messages). */
export function validateForm(form: PlanForm, flags: DerivedFlags): Partial<Record<FormErrorKey, true>> {
  const errors: Partial<Record<FormErrorKey, true>> = {}
  if (!form.name.trim()) errors.name = true
  if (!flags.datesDerived) {
    if (!isYmd(form.plannedStart)) errors.plannedStart = true
    else if (!isYmd(effectiveEnd(form)) || diffDays(form.plannedStart, effectiveEnd(form)) < 0) errors.plannedEnd = true
  }
  if (isYmd(form.actualStart) && isYmd(form.actualEnd) && diffDays(form.actualStart, form.actualEnd) < 0) errors.actualEnd = true
  return errors
}

const orNull = (v: string) => (v.trim() ? v : null)

/** Everything the form can send, before dropping derived / unchanged fields. */
function fullBody(form: PlanForm): Required<Omit<PlanItemInput, "color">> {
  return {
    name: form.name.trim(),
    description: orNull(form.description),
    plannedStart: form.plannedStart,
    plannedEnd: effectiveEnd(form),
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
export function buildPatch(item: PlanItem, form: PlanForm): PlanItemPatch {
  const flags = derivedFlags(item, form)
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
  return { ...body, name: form.name.trim(), plannedStart: form.plannedStart, plannedEnd: effectiveEnd(form) }
}
