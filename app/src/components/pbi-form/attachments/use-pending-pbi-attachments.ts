"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { uploadFilesTo, type UploadFailure } from "@/components/file-intake/upload-files"
import { isPreviewable } from "@/lib/file-display"
import { useLanguage } from "@/lib/language-context"
import { PBI_MAX_ATTACHMENTS, pbiAttachmentsUrl } from "@/lib/pbi-attachments"
import { screenFiles, type PbiAttachmentItem, type PbiAttachmentsController } from "./types"

interface Queued {
  id: string
  file: File
}

/**
 * 参考資料 files chosen while creating a PBI: kept in memory (images / media
 * get an object URL for the thumbnail and preview) and uploaded with
 * `uploadAll` once the PBI exists.
 */
export function usePendingPbiAttachments() {
  const { t } = useLanguage()
  const [queued, setQueued] = useState<readonly Queued[]>([])
  const [errors, setErrors] = useState<readonly string[]>([])
  const nextId = useRef(0)
  const urls = useObjectUrls(queued)

  const add = useCallback(
    (incoming: File[]) => {
      const { accepted, errors: rejected } = screenFiles(incoming, queued.length, t)
      setErrors(rejected)
      const added = accepted.map((file) => ({ id: `pending-${(nextId.current += 1)}`, file }))
      // Capped again in the updater: two adds in one tick both saw the old length.
      if (added.length > 0) setQueued((prev) => [...prev, ...added].slice(0, PBI_MAX_ATTACHMENTS))
    },
    [queued.length, t],
  )
  const remove = useCallback((id: string) => setQueued((prev) => prev.filter((q) => q.id !== id)), [])
  const clearErrors = useCallback(() => setErrors([]), [])

  const items: PbiAttachmentItem[] = useMemo(
    () => queued.map((q) => ({ id: q.id, name: q.file.name, size: q.file.size, mimeType: q.file.type, url: urls.get(q.id) ?? null, pending: true })),
    [queued, urls],
  )
  const controller: PbiAttachmentsController = { items, add, remove, busy: false, errors, clearErrors }

  /** Uploads every queued file to the new PBI; the failures (name + message) are returned. */
  const uploadAll = useCallback(
    async (projectId: string, itemId: string): Promise<UploadFailure[]> => {
      if (queued.length === 0) return []
      const { failed } = await uploadFilesTo(pbiAttachmentsUrl(projectId, itemId), queued.map((q) => q.file))
      return failed
    },
    [queued],
  )

  return { controller, count: queued.length, uploadAll }
}

/** Object URLs of the previewable queued files, revoked when the queue changes or on unmount. */
function useObjectUrls(queued: readonly Queued[]): ReadonlyMap<string, string> {
  const urls = useMemo(
    () => new Map(queued.filter((q) => isPreviewable(q.file.type)).map((q) => [q.id, URL.createObjectURL(q.file)] as const)),
    [queued],
  )
  useEffect(() => () => urls.forEach((u) => URL.revokeObjectURL(u)), [urls])
  return urls
}
