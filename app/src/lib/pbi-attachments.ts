/**
 * PBI 参考資料 (reference material) attachments: limits and URLs shared by
 * the API service and the UI (no server-only imports here).
 */

/** Attachments per PBI (the service enforces it; the UI shows it). */
export const PBI_MAX_ATTACHMENTS = 20

/** Same per-file cap as every other upload (MAX_UPLOAD_SIZE in lib/api-helpers). */
export const PBI_MAX_ATTACHMENT_BYTES = 200 * 1024 * 1024

/** File types offered by the picker (the server still checks the MIME type and content). */
export const PBI_ATTACHMENT_ACCEPT =
  "image/*,video/*,audio/*,application/pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.md,.zip"

export function pbiAttachmentsUrl(projectId: string, itemId: string): string {
  return `/api/projects/${projectId}/backlog/${itemId}/attachments`
}

export function pbiAttachmentUrl(projectId: string, itemId: string, attachmentId: string): string {
  return `${pbiAttachmentsUrl(projectId, itemId)}/${attachmentId}`
}
