"use client"

import { apiFetch } from "@/hooks"
import { compressImageFile } from "@/lib/image-compress"
import type { IceboxAttachment } from "./types"

export { namePastedFile, useFileIntake } from "@/components/file-intake/use-file-intake"

/** Uploads files to an IceBox item one by one (images compressed first). */
export async function uploadIceboxFiles(
  projectId: string,
  itemId: string,
  files: readonly File[],
): Promise<{ saved: IceboxAttachment[]; failed: { name: string; message: string }[] }> {
  const saved: IceboxAttachment[] = []
  const failed: { name: string; message: string }[] = []
  for (const raw of files) {
    try {
      const file = raw.type.startsWith("image/") ? await compressImageFile(raw) : raw
      const formData = new FormData()
      formData.append("file", file)
      saved.push(await apiFetch<IceboxAttachment>(`/api/projects/${projectId}/icebox/${itemId}/attachments`, { method: "POST", body: formData }))
    } catch (err) {
      failed.push({ name: raw.name, message: err instanceof Error ? err.message : String(err) })
    }
  }
  return { saved, failed }
}
