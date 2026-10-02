"use client"

import { useCallback, useMemo, useState } from "react"
import { useConfirm } from "@/components/ui"
import { uploadFilesTo } from "@/components/file-intake/upload-files"
import { apiFetch } from "@/hooks"
import { useLanguage } from "@/lib/language-context"
import { pbiAttachmentUrl, pbiAttachmentsUrl } from "@/lib/pbi-attachments"
import type { PbiAttachmentDto } from "@/types/api"
import { fileError, screenFiles, type PbiAttachmentItem, type PbiAttachmentsController } from "./types"

type Update = (prev: readonly PbiAttachmentDto[]) => PbiAttachmentDto[]

interface Options {
  projectId: string
  itemId: string
  attachments: readonly PbiAttachmentDto[]
  /** Applies a change to the caller's copy (e.g. the loaded PBI) after a server write. */
  onChange: (update: Update) => void
}

/** Rows of uploaded attachments as the list shows them. */
export function toAttachmentItems(projectId: string, itemId: string, attachments: readonly PbiAttachmentDto[]): PbiAttachmentItem[] {
  return attachments.map((a) => ({
    id: a.id,
    name: a.originalName,
    size: a.fileSize,
    mimeType: a.mimeType,
    url: pbiAttachmentUrl(projectId, itemId, a.id),
    pending: false,
  }))
}

/**
 * 参考資料 attachments of an existing PBI: added files are uploaded right
 * away (like the IceBox edit dialog), removal asks first. Writes do not touch
 * the PBI's version, so they never conflict with the open edit form.
 */
export function useSavedPbiAttachments({ projectId, itemId, attachments, onChange }: Options): PbiAttachmentsController {
  const { t } = useLanguage()
  const confirm = useConfirm()
  const [busy, setBusy] = useState(false)
  const [errors, setErrors] = useState<readonly string[]>([])

  const add = useCallback(
    async (incoming: File[]) => {
      if (busy) return
      const { accepted, errors: rejected } = screenFiles(incoming, attachments.length, t)
      setErrors(rejected)
      if (accepted.length === 0) return
      setBusy(true)
      try {
        const { saved, failed } = await uploadFilesTo<PbiAttachmentDto>(pbiAttachmentsUrl(projectId, itemId), accepted)
        if (saved.length > 0) onChange((prev) => [...prev, ...saved])
        if (failed.length > 0) setErrors([...rejected, ...failed.map((f) => fileError(t, f.name, f.message))])
      } finally {
        setBusy(false)
      }
    },
    [attachments.length, busy, itemId, onChange, projectId, t],
  )

  const remove = useCallback(
    async (id: string) => {
      const target = attachments.find((a) => a.id === id)
      if (!target || busy) return
      const ok = await confirm({
        message: t.pbiAttachDeleteConfirm.replace("{name}", target.originalName),
        confirmLabel: t.delete,
        cancelLabel: t.cancel,
        variant: "danger",
      })
      if (!ok) return
      setBusy(true)
      try {
        await apiFetch(pbiAttachmentUrl(projectId, itemId, id), { method: "DELETE" })
        onChange((prev) => prev.filter((a) => a.id !== id))
        setErrors([])
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        setErrors([fileError(t, target.originalName, `${t.pbiAttachDeleteFailed} (${message})`)])
      } finally {
        setBusy(false)
      }
    },
    [attachments, busy, confirm, itemId, onChange, projectId, t],
  )

  const items = useMemo(() => toAttachmentItems(projectId, itemId, attachments), [attachments, itemId, projectId])
  const clearErrors = useCallback(() => setErrors([]), [])
  return { items, add: (files) => void add(files), remove: (id) => void remove(id), busy, errors, clearErrors }
}
