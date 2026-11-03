/**
 * Where a stored lesson rule (`plan_lesson_rule`, plan 12 §2.3) may change a plan — decided at USE time, never
 * frozen. Pure; the service resolves the facts (the rule row, the target project, and whether any cited source is
 * confidential NOW) and asks here.
 *
 * - Only `confirmed` rules change a plan.
 * - `project` scope: only in the source project.
 * - `shared` scope (widened by an admin): in its source project always, elsewhere wherever every filter it carries
 *   (lineage, project type) matches. A shared rule with no filter is never used outside its source project (fail
 *   closed; the table also refuses it with a CHECK).
 * - A cited lesson / PBI that is confidential now (or gone — the caller treats a missing or trashed source as
 *   confidential) stops a shared rule everywhere except its source project ("出典が機密になったため停止中").
 */
import type { LessonRuleState } from "./rules"

export const RULE_SCOPES = ["project", "shared"] as const
export type LessonRuleScope = (typeof RULE_SCOPES)[number]

export interface RuleScopeFacts {
  state: LessonRuleState
  scope: LessonRuleScope
  sourceProjectId: string
  /** `shared` filters (null = not filtered on). Ignored for `project` rules. */
  lineage: string | null
  projectType: string | null
  /** Drafted from a sprint retrospective (振り返り): project-internal text, so `project` scope only. */
  fromRetrospective: boolean
}

export interface RuleTarget {
  projectId: string
  /** Lineage of the schedule being planned (null = not from a known template family). */
  lineage: string | null
  projectType: string | null
}

export type RuleSkipReason = "draft" | "retired" | "other_project" | "scope_mismatch" | "source_confidential"
export type RuleUse = { use: true } | { use: false; reason: RuleSkipReason }

export function decideRuleUse(rule: Readonly<RuleScopeFacts>, target: Readonly<RuleTarget>, sourceConfidential: boolean): RuleUse {
  if (rule.state === "draft") return { use: false, reason: "draft" }
  if (rule.state !== "confirmed") return { use: false, reason: "retired" }
  const inSource = rule.sourceProjectId === target.projectId
  if (rule.scope === "project") return inSource ? { use: true } : { use: false, reason: "other_project" }
  // Sharing widens a rule; it never takes it away from the project that wrote it, whatever filters were chosen.
  if (inSource) return { use: true }
  if (rule.lineage === null && rule.projectType === null) return { use: false, reason: "scope_mismatch" }
  if (rule.lineage !== null && rule.lineage !== target.lineage) return { use: false, reason: "scope_mismatch" }
  if (rule.projectType !== null && rule.projectType !== target.projectType) return { use: false, reason: "scope_mismatch" }
  if (sourceConfidential && !inSource) return { use: false, reason: "source_confidential" }
  return { use: true }
}

export type PromotionBlock = "not_confirmed" | "already_shared" | "retrospective_source" | "source_confidential"

/** Why a rule may not be widened to a lineage / project type (checked when requested AND when confirmed), or null. */
export function promotionBlock(rule: Readonly<RuleScopeFacts>, sourceConfidential: boolean): PromotionBlock | null {
  if (rule.state !== "confirmed") return "not_confirmed"
  if (rule.scope !== "project") return "already_shared"
  if (rule.fromRetrospective) return "retrospective_source"
  if (sourceConfidential) return "source_confidential"
  return null
}

/** JSON with object keys sorted, so two param objects compare by content. */
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`
  if (value !== null && typeof value === "object") {
    const entries = Object.keys(value as Record<string, unknown>)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canonical((value as Record<string, unknown>)[k])}`)
    return `{${entries.join(",")}}`
  }
  return JSON.stringify(value) ?? "null"
}

/**
 * A confirm request repeats the kind and numbers the confirmer saw (plan 12 §2.3: one rule at a time, numbers on
 * screen). The stored rule is confirmed only when they are the same — a draft edited in between is refused.
 */
export function sameRuleContent(stored: { kind: string; params: unknown }, shown: { kind: string; params: unknown }): boolean {
  return stored.kind === shown.kind && canonical(stored.params) === canonical(shown.params)
}
