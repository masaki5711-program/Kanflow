import { z } from "zod"
import { TEMPLATE_NAME_MAX, templateContentSchema } from "@/lib/plan-templates/schema"
import { versionField } from "@/services/_shared/versioning"

export const TEMPLATE_VISIBILITIES = ["public", "private"] as const
export type TemplateVisibility = (typeof TEMPLATE_VISIBILITIES)[number]

const id = z.string().min(1).max(64)
const name = z.string().trim().min(1).max(TEMPLATE_NAME_MAX)
const description = z.string().max(2000).nullable().optional()
const visibility = z.enum(TEMPLATE_VISIBILITIES)

/** POST /api/plan-templates. New templates are shared with everyone unless "private" (自分だけ). */
export const createTemplateSchema = z.object({
  name,
  description,
  visibility: visibility.default("public"),
  content: templateContentSchema,
})

/** PUT /api/plan-templates/:id (full replace; `version` = the one the editor loaded). */
export const updateTemplateSchema = z.object({
  name,
  description,
  /** Only the owner / an admin may change it; built-ins stay public. Omitted = unchanged. */
  visibility: visibility.optional(),
  content: templateContentSchema,
  version: versionField,
})

/** POST /api/plan-templates/:id/duplicate. Omitted name = "<name>（コピー）". */
export const duplicateTemplateSchema = z.object({
  name: name.optional(),
  visibility: visibility.default("public"),
})

/** POST /api/plan-templates/:id/reset (built-ins). */
export const resetTemplateSchema = z.object({ version: versionField })

/** Stage paths ("0", "0.2", "0.2.1") unchecked in the load preview. */
const stagePath = z.string().regex(/^\d{1,3}(\.\d{1,3}){0,4}$/)

/** POST /api/projects/:id/plan/templates/apply */
export const applyTemplateSchema = z.object({
  templateId: id,
  excludePaths: z.array(stagePath).max(400).optional(),
  /** Insert under this live plan item; null / omitted = top level. */
  parentId: id.nullable().optional(),
})

/** POST /api/projects/:id/plan/templates/save */
export const savePlanAsTemplateSchema = z.object({
  name,
  description,
  visibility: visibility.default("public"),
})

/** POST /api/projects/:id/plan/schedule-from */
export const scheduleFromSchema = z.object({
  /** Subtrees to place (e.g. a load's createdRootIds); omitted = the whole plan. */
  rootIds: z.array(id).min(1).max(400).optional(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
})

export type CreateTemplateInput = z.infer<typeof createTemplateSchema>
export type UpdateTemplateInput = z.infer<typeof updateTemplateSchema>
export type DuplicateTemplateInput = z.infer<typeof duplicateTemplateSchema>
export type ApplyTemplateInput = z.infer<typeof applyTemplateSchema>
export type SavePlanAsTemplateInput = z.infer<typeof savePlanAsTemplateSchema>
export type ScheduleFromInput = z.infer<typeof scheduleFromSchema>

/** Per-user writes per minute on the template endpoints (create / edit / apply / save). */
export const TEMPLATE_WRITE_RATE_LIMIT = { limit: 60, windowMs: 60_000 } as const
