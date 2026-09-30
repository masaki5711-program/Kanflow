import { z } from "zod"

export const moveAttachmentSchema = z.object({
  folderId: z.string().nullable().optional(),
  sortOrder: z.number().int().optional(),
})

export const createFolderSchema = z.object({
  name: z.string().min(1).max(100),
  parentId: z.string().nullable().optional(),
})

export const updateFolderSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  sortOrder: z.number().int().optional(),
  /** Reparent. null = move to root. */
  parentId: z.string().nullable().optional(),
})

export type MoveAttachmentInput = z.infer<typeof moveAttachmentSchema>
export type CreateFolderInput = z.infer<typeof createFolderSchema>
export type UpdateFolderInput = z.infer<typeof updateFolderSchema>
