import { z } from "zod"
import { LINK_NAME_MAX, LINK_URL_MAX } from "@/lib/attachment-links"

export const moveAttachmentSchema = z.object({
  folderId: z.string().nullable().optional(),
  sortOrder: z.number().int().optional(),
  /** Link entries only: new display name / URL. */
  name: z.string().trim().min(1).max(LINK_NAME_MAX).optional(),
  url: z.string().trim().min(1).max(LINK_URL_MAX).optional(),
})

/** POST /attachments/links: a link entry (e.g. a GitLab repository). Empty name = derived from the URL. */
export const createLinkSchema = z.object({
  url: z.string().trim().min(1).max(LINK_URL_MAX),
  name: z.string().trim().max(LINK_NAME_MAX).optional(),
  folderId: z.string().nullable().optional(),
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
export type CreateLinkInput = z.infer<typeof createLinkSchema>
export type CreateFolderInput = z.infer<typeof createFolderSchema>
export type UpdateFolderInput = z.infer<typeof updateFolderSchema>
