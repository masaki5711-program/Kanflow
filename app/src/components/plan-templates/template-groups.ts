/**
 * Client-side types and grouping of the plan template list (the load dialog
 * and the /templates library share them). Pure.
 */
import type { PlanTemplateDto, PlanTemplateSummaryDto, TemplateRevisionDto } from "@/services/plan-templates/plan-templates.dto"

export type { PlanTemplateDto, PlanTemplateSummaryDto, TemplateRevisionDto }

export interface TemplateGroups {
  builtin: PlanTemplateSummaryDto[]
  mine: PlanTemplateSummaryDto[]
  shared: PlanTemplateSummaryDto[]
}

/** Case-insensitive match on name / description (empty query = everything). */
export function matchesTemplate(t: Pick<PlanTemplateSummaryDto, "name" | "description">, query: string): boolean {
  const q = query.trim().toLowerCase()
  if (!q) return true
  return t.name.toLowerCase().includes(q) || (t.description ?? "").toLowerCase().includes(q)
}

/** 共通 (built-in) / 自分 (owned by the viewer) / みんな (the rest the viewer can see), list order kept. */
export function groupTemplates(list: readonly PlanTemplateSummaryDto[], query = ""): TemplateGroups {
  const shown = list.filter((t) => matchesTemplate(t, query))
  return {
    builtin: shown.filter((t) => t.isBuiltin),
    mine: shown.filter((t) => !t.isBuiltin && t.isMine),
    shared: shown.filter((t) => !t.isBuiltin && !t.isMine),
  }
}

export const TEMPLATES_API = "/api/plan-templates"
