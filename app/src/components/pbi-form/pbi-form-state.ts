/**
 * Form state of a PBI, shared by the detail modal (edit mode) and the create
 * modal. Pure helpers: mapping from the API row, dirty check, and the request
 * bodies (PATCH = changed fields only, POST = non-empty fields).
 */
import type { BacklogItemDetailDto } from "@/types/api"

export type PbiStatusValue = "ready" | "not_ready" | "completed"

export interface PbiForm {
  initiative: string
  epic: string
  userStory: string
  acceptanceCriteria: string
  /** Kept as typed so the number input can be cleared while editing. */
  workloadScore: string
  status: PbiStatusValue
  iceboxItemId: string
  productGoalId: string
  assignedPo: string
  poNote: string
  notReadyReason: string
  referenceDoc: string
  /** Master-plan leaf item ("" = none). Edit only: the create API does not take it. */
  planItemId: string
}

/** Fields of a PBI the form reads (the list row lacks the PO-only texts, the detail has them). */
export type PbiFormSource = Pick<BacklogItemDetailDto, "initiative" | "epic" | "userStory" | "acceptanceCriteria" | "workloadScore" | "status"> &
  Partial<
    Pick<
      BacklogItemDetailDto,
      "referenceDoc" | "notReadyReason" | "poNote" | "assignedPo" | "productGoalId" | "iceboxItemId" | "productGoal" | "iceboxItem"
    >
  > & {
    planItemId?: string | null
    planItem?: { id: string; name: string } | null
  }

export const EMPTY_PBI_FORM: PbiForm = Object.freeze({
  initiative: "",
  epic: "",
  userStory: "",
  acceptanceCriteria: "",
  workloadScore: "0",
  status: "not_ready",
  iceboxItemId: "",
  productGoalId: "",
  assignedPo: "",
  poNote: "",
  notReadyReason: "",
  referenceDoc: "",
  planItemId: "",
}) as PbiForm

/** Plain text fields: cleared → "" (the update schema takes strings, not null). */
const TEXT_FIELDS = [
  "initiative",
  "epic",
  "userStory",
  "acceptanceCriteria",
  "assignedPo",
  "poNote",
  "notReadyReason",
  "referenceDoc",
] as const

/** Link fields: cleared → null (unlink). */
const LINK_FIELDS = ["productGoalId", "iceboxItemId", "planItemId"] as const

export function toPbiForm(p: PbiFormSource): PbiForm {
  return {
    initiative: p.initiative ?? "",
    epic: p.epic ?? "",
    userStory: p.userStory ?? "",
    acceptanceCriteria: p.acceptanceCriteria ?? "",
    workloadScore: String(p.workloadScore ?? 0),
    status: (p.status as PbiStatusValue) ?? "not_ready",
    iceboxItemId: p.iceboxItemId ?? p.iceboxItem?.id ?? "",
    productGoalId: p.productGoalId ?? p.productGoal?.id ?? "",
    assignedPo: p.assignedPo ?? "",
    poNote: p.poNote ?? "",
    notReadyReason: p.notReadyReason ?? "",
    referenceDoc: p.referenceDoc ?? "",
    planItemId: p.planItemId ?? p.planItem?.id ?? "",
  }
}

export function isSamePbiForm(a: PbiForm, b: PbiForm): boolean {
  return (Object.keys(a) as (keyof PbiForm)[]).every((k) => a[k] === b[k])
}

/** Non-negative integer from the workload input ("" / invalid → 0). */
export function parseWorkload(raw: string): number {
  const n = parseInt(raw.trim(), 10)
  return Number.isFinite(n) && n > 0 ? n : 0
}

/** PATCH body: only the fields that differ from the loaded PBI. */
export function buildPbiPatch(item: PbiFormSource, form: PbiForm): Record<string, unknown> {
  const base = toPbiForm(item)
  const patch: Record<string, unknown> = {}
  for (const key of TEXT_FIELDS) {
    if (form[key] !== base[key]) patch[key] = form[key]
  }
  const ws = parseWorkload(form.workloadScore)
  if (ws !== (item.workloadScore ?? 0)) patch.workloadScore = ws
  if (form.status !== base.status) patch.status = form.status
  for (const key of LINK_FIELDS) {
    if (form[key] !== base[key]) patch[key] = form[key] || null
  }
  return patch
}

/** POST body: empty texts / links are left out (goal is sent as null = none). */
export function buildPbiCreateBody(form: PbiForm): Record<string, unknown> {
  const body: Record<string, unknown> = {}
  for (const key of TEXT_FIELDS) {
    if (form[key].trim()) body[key] = form[key]
  }
  if (form.iceboxItemId) body.iceboxItemId = form.iceboxItemId
  body.productGoalId = form.productGoalId || null
  body.workloadScore = parseWorkload(form.workloadScore)
  body.status = form.status
  return body
}
