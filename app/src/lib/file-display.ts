/** Display helpers for uploaded files (attachment lists, previews). */

export function isImageType(mimeType: string): boolean {
  return mimeType.startsWith("image/")
}

/** Types the full-screen media viewer can show (components/media-preview-modal). */
export function isPreviewable(mimeType: string): boolean {
  return mimeType.startsWith("image/") || mimeType.startsWith("video/") || mimeType.startsWith("audio/")
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
