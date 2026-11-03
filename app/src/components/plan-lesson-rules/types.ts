import type { LessonRuleKind, LessonRuleState } from "@/lib/plan-lesson-rules/rules"

/** The rule as the lesson-rule routes return it (LessonRuleDto, JSON). */
export interface LessonRuleView {
  id: string
  kind: LessonRuleKind | string
  params: Record<string, unknown>
  scope: "project" | "shared"
  lineage: string | null
  projectType: string | null
  state: LessonRuleState
  quote: string | null
  fromRetrospective: boolean
  createdByKind: string
  confirmedAt: string | null
  promotionRequest: { lineage: string | null; projectType: string | null; requestedAt: string | null } | null
  version: number
  sourceConfidential: boolean
  suspended: boolean
}

export interface AdminLessonRuleView extends LessonRuleView {
  sourceProjectId: string
  sourceProjectName: string
}

export interface ProjectLessonRulesResponse {
  rules: LessonRuleView[]
  permissions: { draft: boolean; confirm: boolean; requestPromotion: boolean }
  projectType: string
  lineages: string[]
  sprints: { id: string; name: string }[]
}
