/**
 * Plan template content (計画テンプレート): the rough plan (大枠の計画) a
 * project loads into its 全体計画 as undated stages, plus the check items /
 * hand-over documents / budget flag the マイルストーン・検収ボード reads.
 *
 * Stored as JSON text (PlanTemplate.content, PlanTemplateApplication.content).
 * Template text is user content (written in whatever language the author
 * uses), never i18n. Pure and client-safe (zod only).
 */
import { z } from "zod"

/** Stage nesting: top level = depth 1. */
export const TEMPLATE_MAX_DEPTH = 3
/** Stages (all levels) per template. */
export const TEMPLATE_MAX_NODES = 200
/** Serialized content limit (bytes of JSON text, checked server side). */
export const TEMPLATE_MAX_JSON_CHARS = 200_000
export const TEMPLATE_DURATION_MAX = 3650
export const TEMPLATE_NAME_MAX = 255
const LIST_MAX = 50
const CHECKLIST_MAX = 30
const DESCRIPTION_MAX = 2000

export interface TemplateNode {
  name: string
  description?: string
  isMilestone?: boolean
  /** 目安期間 (calendar days); 「日程を仮置き」 uses it. */
  durationDays?: number
  /** 完了条件 (done criteria), copied into the plan item's notes as bullets. */
  checklist?: string[]
  children?: TemplateNode[]
}

export interface TemplateCheck {
  name: string
  criterion?: string
}

export interface PlanTemplateContent {
  stages: TemplateNode[]
  /** 呼び名 of the check items (検収 / テスト / 評価 / 竣工検査 …). */
  checkLabel?: string
  checks?: TemplateCheck[]
  /** 引き渡し資料 (documents handed over at the end). */
  documents?: string[]
  budgetEnabled?: boolean
}

const text = (max: number) => z.string().trim().max(max)
const name = z.string().trim().min(1).max(TEMPLATE_NAME_MAX)

export const templateNodeSchema: z.ZodType<TemplateNode> = z.lazy(() =>
  z.object({
    name,
    description: text(DESCRIPTION_MAX).optional(),
    isMilestone: z.boolean().optional(),
    durationDays: z.number().int().min(1).max(TEMPLATE_DURATION_MAX).optional(),
    checklist: z.array(text(TEMPLATE_NAME_MAX).min(1)).max(CHECKLIST_MAX).optional(),
    children: z.array(templateNodeSchema).max(TEMPLATE_MAX_NODES).optional(),
  }),
)

/** Depth of the deepest stage (top level = 1; 0 for no stages). */
export function treeDepth(nodes: readonly TemplateNode[]): number {
  return nodes.reduce((max, n) => Math.max(max, 1 + treeDepth(n.children ?? [])), 0)
}

/** Stages at every level. */
export function countNodes(nodes: readonly TemplateNode[]): number {
  return nodes.reduce((sum, n) => sum + 1 + countNodes(n.children ?? []), 0)
}

export const templateContentSchema = z
  .object({
    stages: z.array(templateNodeSchema).max(TEMPLATE_MAX_NODES),
    checkLabel: text(40).optional(),
    checks: z.array(z.object({ name, criterion: text(1000).optional() })).max(LIST_MAX).optional(),
    documents: z.array(name).max(LIST_MAX).optional(),
    budgetEnabled: z.boolean().optional(),
  })
  .superRefine((c, ctx) => {
    if (treeDepth(c.stages) > TEMPLATE_MAX_DEPTH) {
      ctx.addIssue({ code: "custom", path: ["stages"], message: `Stages nest at most ${TEMPLATE_MAX_DEPTH} levels` })
    }
    if (countNodes(c.stages) > TEMPLATE_MAX_NODES) {
      ctx.addIssue({ code: "custom", path: ["stages"], message: `At most ${TEMPLATE_MAX_NODES} stages` })
    }
  })

/** Parse stored JSON text; invalid / legacy content reads as an empty template (never throws). */
export function parseTemplateContent(json: string): PlanTemplateContent {
  try {
    const parsed = templateContentSchema.safeParse(JSON.parse(json))
    return parsed.success ? parsed.data : { stages: [] }
  } catch {
    return { stages: [] }
  }
}

/** Canonical JSON text of validated content. */
export function serializeTemplateContent(content: PlanTemplateContent): string {
  return JSON.stringify(content)
}
