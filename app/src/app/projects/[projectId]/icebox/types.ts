import type { IceboxAttachmentDto, IceboxItemDto } from "@/types/api"

export type IceboxAttachment = IceboxAttachmentDto
export type IceboxItem = IceboxItemDto

export const ICEBOX_STATUSES = ["unreviewed", "reviewed", "completed", "frozen"] as const
export type IceboxStatus = (typeof ICEBOX_STATUSES)[number]

export type IceboxLists = Record<IceboxStatus, IceboxItem[]>

export interface IceboxEditForm {
  author: string
  request: string
  background: string
  status: string
  poHearingMemo: string
  poReviewMemo: string
  freezeReason: string
}

export const MAX_ATTACHMENTS = 10

export const ATTACHMENT_ACCEPT =
  "image/*,video/*,audio/*,application/pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv"

export function editFormFromItem(item: IceboxItem): IceboxEditForm {
  return {
    author: item.author,
    request: item.request,
    background: item.background ?? "",
    status: item.status,
    poHearingMemo: item.poHearingMemo ?? "",
    poReviewMemo: item.poReviewMemo ?? "",
    freezeReason: item.freezeReason ?? "",
  }
}

export { formatFileSize, isImageType, isPreviewable } from "@/lib/file-display"

export function attachmentUrl(projectId: string, itemId: string, attachmentId: string): string {
  return `/api/projects/${projectId}/icebox/${itemId}/attachments/${attachmentId}`
}

export function matchesQuery(item: IceboxItem, q: string): boolean {
  if (!q) return true
  return (
    item.request.toLowerCase().includes(q) ||
    (item.background ?? "").toLowerCase().includes(q) ||
    item.author.toLowerCase().includes(q) ||
    (item.poHearingMemo ?? "").toLowerCase().includes(q) ||
    (item.poReviewMemo ?? "").toLowerCase().includes(q) ||
    String(item.displayId).includes(q)
  )
}
