import { z } from "zod"

export const updateReleaseItemSchema = z.object({
  planVersion: z.string().max(100).nullable().optional(),
  releaseVersion: z.string().max(100).nullable().optional(),
  releaseDate: z.string().nullable().optional(),
  releaseNote: z.string().max(20000).nullable().optional(),
  manualLink: z.string().max(2000).nullable().optional(),
  poNote: z.string().max(10000).nullable().optional(),
  assignedPo: z.string().max(200).nullable().optional(),
  initiative: z.string().max(500).nullable().optional(),
  epic: z.string().max(500).nullable().optional(),
  userStory: z.string().nullable().optional(),
  status: z.enum(["staged", "ready", "released", "deferred"]).optional(),
})

export const importReleaseItemsSchema = z.object({
  pbItemIds: z.array(z.string()).min(1),
  planVersion: z.string().max(100).optional(),
})

export type UpdateReleaseItemInput = z.infer<typeof updateReleaseItemSchema>
export type ImportReleaseItemsInput = z.infer<typeof importReleaseItemsSchema>
