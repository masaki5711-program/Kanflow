import { z } from "zod"

const localeEnum = z.enum(["ja", "id"])

export const listGlossarySchema = z.object({
  q: z.string().max(200).optional(),
  source: localeEnum.optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
})

export const createGlossarySchema = z.object({
  sourceLocale: localeEnum,
  targetLocale: localeEnum,
  term: z.string().min(1).max(255),
  translation: z.string().min(1).max(500),
  note: z.string().max(2000).nullable().optional(),
})

export const updateGlossarySchema = z.object({
  term: z.string().min(1).max(255).optional(),
  translation: z.string().min(1).max(500).optional(),
  note: z.string().max(2000).nullable().optional(),
})

export const retranslateGlossarySchema = z.object({
  ids: z.array(z.string()).max(500).optional(),
})

export type ListGlossaryInput = z.infer<typeof listGlossarySchema>
export type CreateGlossaryInput = z.infer<typeof createGlossarySchema>
export type UpdateGlossaryInput = z.infer<typeof updateGlossarySchema>
