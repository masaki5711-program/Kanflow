import type { EntityI18n } from "@/lib/translation/types"

/** File attached to an IceBox item. */
export interface IceboxAttachmentDto {
  id: string
  fileName: string
  originalName: string
  fileSize: number
  mimeType: string
}

/** One IceBox item of GET /api/projects/:id/icebox (dates are ISO strings). */
export interface IceboxItemDto {
  id: string
  displayId: number
  author: string
  request: string
  background: string | null
  status: string
  assignedPo: string | null
  poHearingMemo: string | null
  poReviewMemo: string | null
  rejectionReason: string | null
  freezeReason: string | null
  createdAt: string
  attachments: IceboxAttachmentDto[]
  /** Optimistic-lock version (send it back on PATCH / DELETE; stale → 409 VERSION_CONFLICT). */
  version?: number
  i18n?: EntityI18n
}
