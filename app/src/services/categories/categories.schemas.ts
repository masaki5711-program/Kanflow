import { z } from "zod"

export const createAdminCategorySchema = z.object({
  name: z.string().min(1).max(100),
  color: z.string().max(50).optional(),
  sortOrder: z.number().int().optional(),
  /** Null = global category visible to everyone. */
  sectionId: z.string().nullable().optional(),
})

export const updateAdminCategorySchema = z.object({
  name: z.string().min(1).max(100).optional(),
  color: z.string().max(50).optional(),
  sortOrder: z.number().int().optional(),
  sectionId: z.string().nullable().optional(),
})

export type CreateAdminCategoryInput = z.infer<typeof createAdminCategorySchema>
export type UpdateAdminCategoryInput = z.infer<typeof updateAdminCategorySchema>

/**
 * `?sectionId` filter: absent → all categories, "" → global only,
 * otherwise → that section's categories.
 */
export type SectionFilter = { kind: "all" } | { kind: "global" } | { kind: "section"; sectionId: string }

export function parseSectionFilter(raw: string | null): SectionFilter {
  if (raw === null) return { kind: "all" }
  return raw === "" ? { kind: "global" } : { kind: "section", sectionId: raw }
}
