"use client"

import { apiFetch } from "@/hooks"
import { compressImageFile } from "@/lib/image-compress"

export interface UploadFailure {
  name: string
  message: string
}

/**
 * Uploads files one by one as multipart `file` to `url` (images compressed
 * first). A failed file does not stop the others: every outcome is reported.
 */
export async function uploadFilesTo<T>(url: string, files: readonly File[]): Promise<{ saved: T[]; failed: UploadFailure[] }> {
  const saved: T[] = []
  const failed: UploadFailure[] = []
  for (const raw of files) {
    try {
      const file = raw.type.startsWith("image/") ? await compressImageFile(raw) : raw
      const formData = new FormData()
      formData.append("file", file)
      saved.push(await apiFetch<T>(url, { method: "POST", body: formData }))
    } catch (err) {
      failed.push({ name: raw.name, message: err instanceof Error ? err.message : String(err) })
    }
  }
  return { saved, failed }
}
