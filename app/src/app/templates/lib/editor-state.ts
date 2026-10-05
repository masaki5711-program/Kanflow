/**
 * Template editor form state ⇄ template content. Pure.
 * Editor nodes carry a stable `key` (React keys, focus after a move) and keep
 * number / list fields as the raw input text until saving.
 */
import { countNodes, TEMPLATE_DURATION_MAX, TEMPLATE_MAX_NODES, type PlanTemplateContent, type TemplateNode } from "@/lib/plan-templates/schema"

export interface EditorNode {
  key: string
  name: string
  description: string
  isMilestone: boolean
  /** Raw 目安期間 input ("" = none). */
  durationDays: string
  /** 完了条件, one per line. */
  checklistText: string
  children: EditorNode[]
}

export interface EditorCheck {
  key: string
  name: string
  criterion: string
}

export interface EditorDocument {
  key: string
  name: string
}

export interface TemplateForm {
  name: string
  description: string
  visibility: "public" | "private"
  stages: EditorNode[]
  checkLabel: string
  checks: EditorCheck[]
  documents: EditorDocument[]
  budgetEnabled: boolean
}

let seq = 0
/** Unique editor key (per page load). */
export function newKey(): string {
  seq += 1
  return `k${seq}`
}

export function emptyStage(name = "", key: string = newKey()): EditorNode {
  return { key, name, description: "", isMilestone: false, durationDays: "", checklistText: "", children: [] }
}

function toEditorNode(n: TemplateNode): EditorNode {
  return {
    key: newKey(),
    name: n.name,
    description: n.description ?? "",
    isMilestone: n.isMilestone ?? false,
    durationDays: n.durationDays !== undefined ? String(n.durationDays) : "",
    checklistText: (n.checklist ?? []).join("\n"),
    children: (n.children ?? []).map(toEditorNode),
  }
}

export function formFromTemplate(t: { name: string; description: string | null; visibility: "public" | "private"; content: PlanTemplateContent }): TemplateForm {
  return {
    name: t.name,
    description: t.description ?? "",
    visibility: t.visibility,
    stages: t.content.stages.map(toEditorNode),
    checkLabel: t.content.checkLabel ?? "",
    checks: (t.content.checks ?? []).map((c) => ({ key: newKey(), name: c.name, criterion: c.criterion ?? "" })),
    documents: (t.content.documents ?? []).map((d) => ({ key: newKey(), name: d })),
    budgetEnabled: t.content.budgetEnabled ?? false,
  }
}

/** A blank template; its first stage has a fixed key so the server and client render the same markup. */
export function emptyForm(): TemplateForm {
  return { name: "", description: "", visibility: "public", stages: [emptyStage("", "initial")], checkLabel: "", checks: [], documents: [], budgetEnabled: false }
}

/** 目安期間 input → days (1–3650), or undefined when empty / invalid. */
export function parseDuration(raw: string): number | undefined {
  const n = Number(raw.trim())
  return raw.trim() && Number.isInteger(n) && n >= 1 && n <= TEMPLATE_DURATION_MAX ? n : undefined
}

function toTemplateNode(n: EditorNode): TemplateNode {
  const children = n.children.map(toTemplateNode)
  const checklist = n.checklistText.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
  const durationDays = parseDuration(n.durationDays)
  return {
    name: n.name.trim(),
    ...(n.description.trim() && { description: n.description.trim() }),
    ...(n.isMilestone && children.length === 0 && { isMilestone: true }),
    ...(durationDays !== undefined && { durationDays }),
    ...(checklist.length > 0 && { checklist }),
    ...(children.length > 0 && { children }),
  }
}

/** The content to save (blank checks / documents dropped). */
export function contentFromForm(f: TemplateForm): PlanTemplateContent {
  const checks = f.checks.filter((c) => c.name.trim()).map((c) => ({ name: c.name.trim(), ...(c.criterion.trim() && { criterion: c.criterion.trim() }) }))
  const documents = f.documents.map((d) => d.name.trim()).filter(Boolean)
  return {
    stages: f.stages.map(toTemplateNode),
    ...(f.checkLabel.trim() && { checkLabel: f.checkLabel.trim() }),
    ...(checks.length > 0 && { checks }),
    ...(documents.length > 0 && { documents }),
    ...(f.budgetEnabled && { budgetEnabled: true }),
  }
}

export type FormError = "name" | "stagesRequired" | "stageName" | "tooMany"

function hasBlankName(nodes: readonly EditorNode[]): boolean {
  return nodes.some((n) => !n.name.trim() || hasBlankName(n.children))
}

/** First problem that blocks saving, or null. */
export function validateTemplateForm(f: TemplateForm): FormError | null {
  if (!f.name.trim()) return "name"
  if (f.stages.length === 0) return "stagesRequired"
  if (hasBlankName(f.stages)) return "stageName"
  if (countNodes(contentFromForm(f).stages) > TEMPLATE_MAX_NODES) return "tooMany"
  return null
}

/** Stages at every level (editor nodes). */
export function countEditorNodes(nodes: readonly EditorNode[]): number {
  return nodes.reduce((s, n) => s + 1 + countEditorNodes(n.children), 0)
}
