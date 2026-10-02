import path from "path"
import fs from "fs/promises"

/**
 * Paths of stored upload files, without the request / auth helpers of
 * lib/api-helpers (which re-exports these), so services can clean up files
 * without pulling next-auth into their import graph.
 */

/** Absolute root of all project uploads: `<cwd>/private/uploads`. */
export function uploadsRoot(): string {
  return path.join(process.cwd(), "private", "uploads")
}

/**
 * Verify that a resolved file path stays within the uploads directory.
 * Prevents path traversal attacks.
 */
export function safeFilePath(projectId: string, fileName: string): string | null {
  const uploadDir = uploadsRoot()
  const resolved = path.resolve(uploadDir, projectId, fileName)
  if (!resolved.startsWith(uploadDir + path.sep)) {
    return null
  }
  return resolved
}

/** Removes a stored file (a missing file or an unsafe path is ignored). */
export async function deleteUploadedFile(projectId: string, fileName: string): Promise<void> {
  const full = safeFilePath(projectId, fileName)
  if (!full) return
  try {
    await fs.unlink(full)
  } catch {
    // Ignore missing file
  }
}
