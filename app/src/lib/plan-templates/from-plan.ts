/**
 * 「この計画をテンプレートとして保存」: a project's live plan tree → template
 * stages. Pure. 目安期間 comes from the item's planned dates (inclusive days)
 * when it has them, else from the durationDays it was loaded with; 完了条件
 * are read back from notes written by a previous template load.
 */
import { dateFromKey, inclusiveDays } from "@/lib/plan-progress"
import { linkBlock, type TemplateLink } from "./links"
import { TEMPLATE_DURATION_MAX, TEMPLATE_MAX_DEPTH, TEMPLATE_MAX_LINKS, TEMPLATE_MAX_NODES, TEMPLATE_NAME_MAX, type TemplateNode } from "./schema"
import { notesToChecklist } from "./tree"

export interface PlanSourceItem {
  id: string
  parentId: string | null
  name: string
  description: string | null
  notes: string | null
  isMilestone: boolean
  sortOrder: number
  /** "YYYY-MM-DD" or null. */
  plannedStart: string | null
  plannedEnd: string | null
  durationDays: number | null
}

export interface PlanSourceDependency {
  predecessorId: string
  successorId: string
}

export type PlanToStagesResult = { ok: true; stages: TemplateNode[]; links: TemplateLink[] } | { ok: false; reason: "empty" | "too_large" }

function durationOf(item: PlanSourceItem): number | undefined {
  const s = item.plannedStart ? dateFromKey(item.plannedStart) : null
  const e = item.plannedEnd ? dateFromKey(item.plannedEnd) : null
  const days = s && e && !item.isMilestone ? inclusiveDays(s, e) : item.durationDays
  return days && days >= 1 ? Math.min(TEMPLATE_DURATION_MAX, days) : undefined
}

function toNode(item: PlanSourceItem, children: TemplateNode[], key: string | undefined): TemplateNode {
  const checklist = notesToChecklist(item.notes).map((c) => c.slice(0, TEMPLATE_NAME_MAX))
  const durationDays = durationOf(item)
  return {
    ...(key && { key }),
    name: item.name.slice(0, TEMPLATE_NAME_MAX),
    ...(item.description?.trim() && { description: item.description.trim().slice(0, 2000) }),
    ...(item.isMilestone && children.length === 0 && { isMilestone: true }),
    ...(durationDays !== undefined && { durationDays }),
    ...(checklist.length > 0 && { checklist }),
    ...(children.length > 0 && { children }),
  }
}

/**
 * Pure: the plan tree (live items of one project; orphans count as top
 * level) as template stages, siblings by sortOrder. Fails when the plan is
 * empty or deeper / larger than a template allows.
 */
export function planToStages(items: readonly PlanSourceItem[], dependencies: readonly PlanSourceDependency[] = []): PlanToStagesResult {
  if (items.length === 0) return { ok: false, reason: "empty" }
  if (items.length > TEMPLATE_MAX_NODES) return { ok: false, reason: "too_large" }
  const ids = new Set(items.map((i) => i.id))
  // Dependencies between kept items become links; each stage they touch gets a key (s1, s2 …).
  const keys = new Map<string, string>()
  const keyOf = (id: string) => keys.get(id) ?? keys.set(id, `s${keys.size + 1}`).get(id)!
  const links: TemplateLink[] = dependencies
    .filter((d) => d.predecessorId !== d.successorId && ids.has(d.predecessorId) && ids.has(d.successorId))
    .slice(0, TEMPLATE_MAX_LINKS)
    .map((d) => ({ from: keyOf(d.predecessorId), to: keyOf(d.successorId) }))
  const kids = new Map<string | null, PlanSourceItem[]>()
  for (const it of items) {
    const parent = it.parentId && ids.has(it.parentId) ? it.parentId : null
    kids.set(parent, [...(kids.get(parent) ?? []), it])
  }
  let tooDeep = false
  const seen = new Set<string>()
  const build = (parentId: string | null, depth: number): TemplateNode[] =>
    (kids.get(parentId) ?? [])
      .toSorted((a, b) => a.sortOrder - b.sortOrder)
      .filter((it) => !seen.has(it.id) && seen.add(it.id))
      .map((it) => {
        if (depth > TEMPLATE_MAX_DEPTH) tooDeep = true
        return toNode(it, build(it.id, depth + 1), keys.get(it.id))
      })
  const stages = build(null, 1)
  if (tooDeep) return { ok: false, reason: "too_large" }
  // A plan can hold a stale dependency (an item moved under its own predecessor); a template may not.
  const kept: TemplateLink[] = []
  for (const l of links) if (linkBlock(stages, kept, l.from, l.to) === null) kept.push(l)
  return { ok: true, stages, links: kept }
}
