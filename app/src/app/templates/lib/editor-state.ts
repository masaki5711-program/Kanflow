/**
 * Template editor form state ⇄ template content. Pure.
 * Editor nodes carry a stable `key` (React keys, focus after a move) and keep
 * number / list fields as the raw input text until saving.
 */
import { linkBlock, type RefusedLink, type TemplateLink } from "@/lib/plan-templates/links"
import { countNodes, TEMPLATE_DURATION_MAX, TEMPLATE_MAX_LINKS, TEMPLATE_MAX_NODES, type PlanTemplateContent, type TemplateNode } from "@/lib/plan-templates/schema"

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
  /** 依存関係 between stages by editor key (see effectiveLinks for the ones that still hold). */
  links: TemplateLink[]
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

/** Editor node of a template stage; `keyMap` collects stored dependency key → editor key. */
function toEditorNode(n: TemplateNode, keyMap: Map<string, string>): EditorNode {
  const key = newKey()
  if (n.key) keyMap.set(n.key, key)
  return {
    key,
    name: n.name,
    description: n.description ?? "",
    isMilestone: n.isMilestone ?? false,
    durationDays: n.durationDays !== undefined ? String(n.durationDays) : "",
    checklistText: (n.checklist ?? []).join("\n"),
    children: (n.children ?? []).map((c) => toEditorNode(c, keyMap)),
  }
}

export function formFromTemplate(t: { name: string; description: string | null; visibility: "public" | "private"; content: PlanTemplateContent }): TemplateForm {
  // Editor keys are fresh per load (stored dependency keys may clash with them), so links are remapped.
  const keyMap = new Map<string, string>()
  const stages = t.content.stages.map((n) => toEditorNode(n, keyMap))
  const links = (t.content.links ?? []).flatMap((l) => {
    const from = keyMap.get(l.from)
    const to = keyMap.get(l.to)
    return from && to ? [{ from, to }] : []
  })
  return {
    name: t.name,
    description: t.description ?? "",
    visibility: t.visibility,
    stages,
    links,
    checkLabel: t.content.checkLabel ?? "",
    checks: (t.content.checks ?? []).map((c) => ({ key: newKey(), name: c.name, criterion: c.criterion ?? "" })),
    documents: (t.content.documents ?? []).map((d) => ({ key: newKey(), name: d })),
    budgetEnabled: t.content.budgetEnabled ?? false,
  }
}

/** A blank template; its first stage has a fixed key so the server and client render the same markup. */
export function emptyForm(): TemplateForm {
  return { name: "", description: "", visibility: "public", stages: [emptyStage("", "initial")], links: [], checkLabel: "", checks: [], documents: [], budgetEnabled: false }
}

/** The links that still hold for the current tree (a stage removed, or indented under its predecessor, drops its links). */
export function effectiveLinks(stages: readonly EditorNode[], links: readonly TemplateLink[]): TemplateLink[] {
  const kept: TemplateLink[] = []
  for (const l of links) {
    if (kept.length >= TEMPLATE_MAX_LINKS) break
    if (linkBlock(stages, kept, l.from, l.to) === null) kept.push(l)
  }
  return kept
}

/** 目安期間 input → days (1–3650), or undefined when empty / invalid. */
export function parseDuration(raw: string): number | undefined {
  const n = Number(raw.trim())
  return raw.trim() && Number.isInteger(n) && n >= 1 && n <= TEMPLATE_DURATION_MAX ? n : undefined
}

export interface PredecessorOption {
  key: string
  name: string
  /** `to` already follows this stage. */
  checked: boolean
  /** Why this stage cannot be a predecessor (null = it can, or it already is). */
  block: RefusedLink | null
}

/** Every other stage as a candidate predecessor of `toKey` (display order). */
export function predecessorOptions(stages: readonly EditorNode[], links: readonly TemplateLink[], toKey: string): PredecessorOption[] {
  const all: EditorNode[] = []
  const walk = (list: readonly EditorNode[]) => list.forEach((n) => { all.push(n); walk(n.children) })
  walk(stages)
  const effective = effectiveLinks(stages, links)
  return all
    .filter((n) => n.key !== toKey)
    .map((n) => {
      const checked = effective.some((l) => l.from === n.key && l.to === toKey)
      const block = checked ? null : linkBlock(stages, effective, n.key, toKey)
      return { key: n.key, name: n.name, checked, block: block === "self" || block === "unknown" ? null : block }
    })
}

/** The links with from → to added, or removed when it was already there (the original list is kept for the rest). */
export function toggleLink(links: readonly TemplateLink[], from: string, to: string): TemplateLink[] {
  return links.some((l) => l.from === from && l.to === to) ? links.filter((l) => !(l.from === from && l.to === to)) : [...links, { from, to }]
}

function toTemplateNode(n: EditorNode, storedKeys: ReadonlyMap<string, string>): TemplateNode {
  const children = n.children.map((c) => toTemplateNode(c, storedKeys))
  const checklist = n.checklistText.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
  const durationDays = parseDuration(n.durationDays)
  const key = storedKeys.get(n.key)
  return {
    ...(key && { key }),
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
  // Stored keys (s1, s2 …) in order of first use, only for stages that take part in a dependency.
  const links = effectiveLinks(f.stages, f.links)
  const storedKeys = new Map<string, string>()
  const storedKey = (editorKey: string) => storedKeys.get(editorKey) ?? storedKeys.set(editorKey, `s${storedKeys.size + 1}`).get(editorKey)!
  const storedLinks = links.map((l) => ({ from: storedKey(l.from), to: storedKey(l.to) }))
  return {
    stages: f.stages.map((n) => toTemplateNode(n, storedKeys)),
    ...(storedLinks.length > 0 && { links: storedLinks }),
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
