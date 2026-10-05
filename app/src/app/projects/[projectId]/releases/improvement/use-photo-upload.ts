"use client"

import { useCallback, useState } from "react"
import type { Translations } from "@/lib/i18n"
import { compressImageFile } from "@/lib/image-compress"
import { IMPROVEMENT_MAX_PHOTOS_PER_PHASE, type PhotoPhase } from "@/lib/improvement/constants"
import { PBI_MAX_ATTACHMENT_BYTES } from "@/lib/pbi-attachments"
import { useLanguage } from "@/lib/language-context"
import type { Announce } from "./section-frame"
import type { BoardWriter } from "./use-improvement-board"

/**
 * Pure: keep image files within the size cap and the phase's remaining
 * room; one message per refused file plus one for the overflow.
 */
export function screenPhotos(incoming: readonly File[], currentCount: number, t: Translations): { accepted: File[]; errors: string[] } {
  const errors: string[] = []
  const images = incoming.filter((f) => {
    if (!f.type.startsWith("image/")) {
      errors.push(t.kzPhotoNotImage.replace("{name}", f.name))
      return false
    }
    if (f.size > PBI_MAX_ATTACHMENT_BYTES) {
      errors.push(t.kzPhotoUploadFailed.replace("{name}", f.name).replace("{message}", t.pbiAttachTooLarge))
      return false
    }
    return true
  })
  const room = Math.max(0, IMPROVEMENT_MAX_PHOTOS_PER_PHASE - currentCount)
  if (images.length > room) errors.push(t.kzPhotoTooMany.replace("{max}", String(IMPROVEMENT_MAX_PHOTOS_PER_PHASE)))
  return { accepted: images.slice(0, room), errors }
}

/** Upload photos of one phase one by one (compressed first); results are announced. */
export function usePhotoUpload(itemId: string, phase: PhotoPhase, currentCount: number, write: BoardWriter, announce: Announce) {
  const { t } = useLanguage()
  const [busy, setBusy] = useState(false)
  const [errors, setErrors] = useState<readonly string[]>([])

  const add = useCallback(
    async (incoming: File[]) => {
      if (busy) return
      const { accepted, errors: refused } = screenPhotos(incoming, currentCount, t)
      setErrors(refused)
      if (accepted.length === 0) return
      setBusy(true)
      announce(t.kzPhotoUploading)
      const failed: string[] = []
      for (const raw of accepted) {
        const body = new FormData()
        body.append("phase", phase)
        body.append("file", await compressImageFile(raw))
        const result = await write(itemId, "/photos", { method: "POST", body })
        if (!result.ok) failed.push(t.kzPhotoUploadFailed.replace("{name}", raw.name).replace("{message}", result.message))
      }
      setBusy(false)
      setErrors([...refused, ...failed])
      announce(failed.length > 0 ? failed.join(" / ") : t.kzPhotoUploaded, failed.length > 0 ? "error" : "success")
    },
    [announce, busy, currentCount, itemId, phase, t, write],
  )

  return { add: (files: File[]) => void add(files), busy, errors, clearErrors: () => setErrors([]) }
}
