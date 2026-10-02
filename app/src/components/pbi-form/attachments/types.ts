import { PBI_MAX_ATTACHMENTS, PBI_MAX_ATTACHMENT_BYTES } from "@/lib/pbi-attachments"

/** One row of the 参考資料 attachment list: an uploaded file or one queued for upload. */
export interface PbiAttachmentItem {
  id: string
  name: string
  size: number
  mimeType: string
  /** API URL (uploaded) or object URL (queued, previewable types only); null = nothing to open. */
  url: string | null
  /** Queued until the PBI exists (create modals). */
  pending: boolean
}

/**
 * What the 参考資料 attachment area needs, whichever way files are kept:
 * uploaded immediately (existing PBI) or queued (create modals).
 */
export interface PbiAttachmentsController {
  items: readonly PbiAttachmentItem[]
  /** Picker, drop or paste: checked against the limits, then uploaded / queued. */
  add: (files: File[]) => void
  remove: (id: string) => void
  /** An upload / delete is running. */
  busy: boolean
  /** Per-file messages of the last rejected or failed files (announced via aria-live). */
  errors: readonly string[]
  clearErrors: () => void
}

/** The localized texts screenFiles needs (subset of the translations). */
export interface ScreenTexts {
  pbiAttachTooMany: string
  pbiAttachTooLarge: string
  pbiAttachFileError: string
}

export function fileError(t: Pick<ScreenTexts, "pbiAttachFileError">, name: string, message: string): string {
  return t.pbiAttachFileError.replace("{name}", name).replace("{message}", message)
}

/**
 * Splits incoming files into the ones to keep and per-file messages: files
 * over the size cap are refused one by one, and anything beyond the per-PBI
 * count is dropped with one message. Same limits the API enforces.
 */
export function screenFiles(incoming: readonly File[], currentCount: number, t: ScreenTexts): { accepted: File[]; errors: string[] } {
  const errors: string[] = []
  const sized = incoming.filter((f) => {
    if (f.size <= PBI_MAX_ATTACHMENT_BYTES) return true
    errors.push(fileError(t, f.name, t.pbiAttachTooLarge))
    return false
  })
  const room = Math.max(0, PBI_MAX_ATTACHMENTS - currentCount)
  if (sized.length > room) errors.push(t.pbiAttachTooMany.replace("{max}", String(PBI_MAX_ATTACHMENTS)))
  return { accepted: sized.slice(0, room), errors }
}
