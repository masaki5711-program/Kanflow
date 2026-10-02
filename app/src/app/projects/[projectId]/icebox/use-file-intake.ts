"use client"

import { uploadFilesTo, type UploadFailure } from "@/components/file-intake/upload-files"
import type { IceboxAttachment } from "./types"

export { namePastedFile, useFileIntake } from "@/components/file-intake/use-file-intake"

/** Uploads files to an IceBox item one by one (images compressed first). */
export function uploadIceboxFiles(
  projectId: string,
  itemId: string,
  files: readonly File[],
): Promise<{ saved: IceboxAttachment[]; failed: UploadFailure[] }> {
  return uploadFilesTo<IceboxAttachment>(`/api/projects/${projectId}/icebox/${itemId}/attachments`, files)
}
