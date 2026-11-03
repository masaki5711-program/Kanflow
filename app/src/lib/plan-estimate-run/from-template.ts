/**
 * A Kanflow plan template (PlanTemplateContent: stages, links) as a base schedule (plan 12 E5: 「計画を作る」 starts from
 * a template). Pure.
 *
 * - A stage keeps its own `key` when it has a valid one; every other stage gets `s<n>` in document order (n counts
 *   all stages, so the same template version always gives the same keys — what the actuals are matched by).
 * - A link { from, to } becomes `dependsOn` on the `to` stage. Durations and milestones are copied; descriptions and
 *   check lists stay with the template (they are not part of the schedule).
 */
import type { BaseSchedule, BaseScheduleItem } from "@/lib/plan-schedule/base-schedule"
import type { PlanTemplateContent, TemplateNode } from "@/lib/plan-templates/schema"

const KEY = /^[A-Za-z0-9_-]{1,40}$/

export function scheduleFromTemplate(content: PlanTemplateContent, options: { skipWeekends?: boolean } = {}): BaseSchedule {
  const own = new Set<string>()
  const visit = (nodes: readonly TemplateNode[]) => {
    for (const n of nodes) {
      if (n.key && KEY.test(n.key)) own.add(n.key)
      visit(n.children ?? [])
    }
  }
  visit(content.stages)

  let counter = 0
  const taken = new Set(own)
  const nextKey = (): string => {
    let k: string
    do {
      counter += 1
      k = `s${counter}`
    } while (taken.has(k))
    taken.add(k)
    return k
  }
  const dependsOn = new Map<string, string[]>()
  for (const l of content.links ?? []) dependsOn.set(l.to, [...(dependsOn.get(l.to) ?? []), l.from])

  const convert = (nodes: readonly TemplateNode[]): BaseScheduleItem[] =>
    nodes.map((n) => {
      const key = n.key && KEY.test(n.key) ? n.key : nextKey()
      const kids = n.children ?? []
      const deps = n.key ? (dependsOn.get(n.key) ?? []).filter((d) => own.has(d)) : []
      return {
        key,
        name: n.name,
        ...(n.durationDays !== undefined && kids.length === 0 ? { durationDays: n.durationDays } : {}),
        ...(n.isMilestone && kids.length === 0 ? { milestone: true } : {}),
        ...(deps.length > 0 ? { dependsOn: deps } : {}),
        ...(kids.length > 0 ? { children: convert(kids) } : {}),
      }
    })
  return { items: convert(content.stages), ...(options.skipWeekends ? { skipWeekends: true } : {}) }
}
