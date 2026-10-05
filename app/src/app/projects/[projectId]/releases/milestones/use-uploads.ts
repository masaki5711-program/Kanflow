"use client"

import { useCallback, useState } from "react"
import type { Translations } from "@/lib/i18n"
import { fillTemplate } from "@/lib/fill-template"
import { compressImageFile } from "@/lib/image-compress"
import { PBI_MAX_ATTACHMENT_BYTES } from "@/lib/pbi-attachments"
import { useLanguage } from "@/lib/language-context"
import type { Announce } from "../improvement/section-frame"
import type { BoardWriter } from "./use-milestone-board"

/**
 * Pure: keep files within the size cap (images only when `imageOnly`) and
 * the remaining room; one message per refused file plus one for the overflow.
 */
export function screenUploads(incoming: readonly File[], room: number, imageOnly: boolean, t: Translations): { accepted: File[]; errors: string[] } {
  const errors: string[] = []
  const ok = incoming.filter((f) => {
    if (imageOnly && !f.type.startsWith("image/")) {
      errors.push(fillTemplate(t.msPhotoNotImage, { name: f.name }))
      return false
    }
    if (f.size > PBI_MAX_ATTACHMENT_BYTES) {
      errors.push(fillTemplate(t.msUploadFailed, { name: f.name, message: t.pbiAttachTooLarge }))
      return false
    }
    return true
  })
  const free = Math.max(0, room)
  if (ok.length > free) errors.push(fillTemplate(t.msPhotoTooMany, { max: free }))
  return { accepted: ok.slice(0, free), errors }
}

interface Options {
  /** POST target relative to /milestones (multipart, one `file` per request). */
  path: string
  room: number
  imageOnly: boolean
  write: BoardWriter
  announce: Announce
  doneMessage: string
}

/** Upload files one by one (images compressed first); refusals and failures are listed and announced. */
export function useUploads({ path, room, imageOnly, write, announce, doneMessage }: Options) {
  const { t } = useLanguage()
  const [busy, setBusy] = useState(false)
  const [errors, setErrors] = useState<readonly string[]>([])

  const add = useCallback(
    async (incoming: File[]) => {
      if (busy) return
      const { accepted, errors: refused } = screenUploads(incoming, room, imageOnly, t)
      setErrors(refused)
      if (accepted.length === 0) return
      setBusy(true)
      announce(t.msPhotoUploading)
      const failed: string[] = []
      for (const raw of accepted) {
        const body = new FormData()
        body.append("file", raw.type.startsWith("image/") ? await compressImageFile(raw) : raw)
        const result = await write(path, { method: "POST", body })
        if (!result.ok) failed.push(fillTemplate(t.msUploadFailed, { name: raw.name, message: result.message }))
      }
      setBusy(false)
      setErrors([...refused, ...failed])
      announce(failed.length > 0 ? failed.join(" / ") : doneMessage, failed.length > 0 ? "error" : "success")
    },
    [announce, busy, doneMessage, imageOnly, path, room, t, write],
  )

  return { add: (files: File[]) => void add(files), busy, errors }
}
